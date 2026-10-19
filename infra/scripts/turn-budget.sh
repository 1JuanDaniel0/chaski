#!/usr/bin/env bash
# Tope duro de gasto del relevo (ADR 0006). Suma lo que sale por la red de la VM en el mes (UTC, como la factura
# de la nube) y, al pasar TURN_MONTHLY_GB, apaga coturn hasta el mes siguiente. Las conexiones directas siguen
# funcionando; solo las que necesitan relevo dejan de conectarse.
# deploy.sh lo pone en cron (cada minuto) y lo ejecuta al final de cada despliegue.
# Uso: ./turn-budget.sh            revisa y aplica el tope
#      ./turn-budget.sh --status   muestra lo gastado en el mes
set -euo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$INFRA_DIR"
STATE="$INFRA_DIR/.turn-budget"

env_value() { [[ -f .env ]] && sed -n "s/^$1=//p" .env | tail -1; }
LIMIT_GB="${TURN_MONTHLY_GB:-$(env_value TURN_MONTHLY_GB)}"
LIMIT_GB="${LIMIT_GB:-50}"
IFACE="${TURN_BUDGET_IFACE:-$(ip route show default | awk '{print $5; exit}')}"
TX="$(cat "/sys/class/net/$IFACE/statistics/tx_bytes")"
NOW_MONTH="$(date -u +%Y-%m)"
LIMIT=$((LIMIT_GB * 1000 * 1000 * 1000))

month="" used=0 last="" stopped=0
if [[ -f "$STATE" ]]; then
  while IFS='=' read -r k v; do
    case "$k" in
      month) month="$v" ;;
      used) [[ "$v" =~ ^[0-9]+$ ]] && used="$v" ;;
      last) [[ "$v" =~ ^[0-9]+$ ]] && last="$v" ;;
      stopped) [[ "$v" == 1 ]] && stopped=1 ;;
    esac
  done < "$STATE"
fi

log() { echo "$(date -u +%FT%TZ) $*"; }

if [[ "$month" != "$NOW_MONTH" ]]; then
  month="$NOW_MONTH"
  used=0
  if [[ $stopped == 1 ]]; then
    log "mes nuevo: se vuelve a encender coturn"
    docker compose start coturn >/dev/null
    stopped=0
  fi
fi

# El contador de la interfaz vuelve a 0 al reiniciar la VM.
if [[ -n "$last" ]]; then
  if (( TX >= last )); then used=$((used + TX - last)); else used=$((used + TX)); fi
fi
last="$TX"

if [[ "${1:-}" == "--status" ]]; then
  awk -v u="$used" -v l="$LIMIT_GB" -v s="$stopped" 'BEGIN {
    printf "Salida de la VM este mes: %.2f GB de %d GB%s\n", u / 1e9, l, s == 1 ? " (tope alcanzado: coturn apagado)" : ""
  }'
fi

if (( used >= LIMIT )) && [[ $stopped == 0 ]]; then
  log "tope de ${LIMIT_GB} GB alcanzado: se apaga coturn hasta el mes siguiente"
  stopped=1
fi
# También si un despliegue lo volvió a encender.
if [[ $stopped == 1 ]] && [[ -n "$(docker compose ps -q --status running coturn 2>/dev/null)" ]]; then
  docker compose stop coturn >/dev/null
fi

printf 'month=%s\nused=%s\nlast=%s\nstopped=%s\n' "$month" "$used" "$last" "$stopped" > "$STATE.tmp"
mv "$STATE.tmp" "$STATE"
