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
docker image prune -f >/dev/null
docker compose ps
