#!/usr/bin/env bash
# Despliega la señalización y coturn en la VM.
# Uso: SIGNAL_TAG=<sha> ./deploy.sh      (si no se da, usa el de infra/.env)
# Rollback: vuelve a ejecutarlo con la etiqueta del commit anterior.
set -euo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$INFRA_DIR"

[[ -f .env ]] || { echo "Falta $INFRA_DIR/.env (copia .env.example)" >&2; exit 1; }

# Si SIGNAL_TAG viene del entorno, tiene prioridad sobre .env
if [[ -n "${SIGNAL_TAG:-}" ]]; then
  export SIGNAL_TAG
  if grep -q '^SIGNAL_TAG=' .env; then
    sed -i "s|^SIGNAL_TAG=.*|SIGNAL_TAG=${SIGNAL_TAG}|" .env
  else
    echo "SIGNAL_TAG=${SIGNAL_TAG}" >> .env
  fi
fi

docker compose pull
docker compose up -d --remove-orphans
# `up -d` no ve cambios en coturn/turnserver.conf: git pull lo reemplaza por un archivo nuevo y el
# contenedor sigue montando el viejo. Si no coinciden, recrea coturn para que cargue el actual.
if ! docker compose exec -T coturn cat /etc/coturn/turnserver.conf 2>/dev/null | cmp -s - coturn/turnserver.conf; then
  echo "La configuración de coturn cambió: recreando coturn"
  docker compose up -d --force-recreate coturn
fi
# Tope de gasto del relevo: se revisa cada minuto y ahora mismo (por si este despliegue encendió un coturn
# apagado por el tope). Ver scripts/turn-budget.sh.
if command -v crontab >/dev/null 2>&1; then
  CRON_LINE="* * * * * $INFRA_DIR/scripts/turn-budget.sh >> $INFRA_DIR/turn-budget.log 2>&1"
  { crontab -l 2>/dev/null | grep -vF 'scripts/turn-budget.sh' || true; echo "$CRON_LINE"; } | crontab -
else
  echo "AVISO: no hay cron; el tope de gasto del relevo no se revisará solo" >&2
fi
"$INFRA_DIR/scripts/turn-budget.sh" --status
docker image prune -f >/dev/null
docker compose ps
