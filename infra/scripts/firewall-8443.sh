#!/usr/bin/env bash
# Deja el puerto 8443 de la señalización abierto solo a los rangos de Cloudflare, dentro de la VM.
#
# Docker publica el 8443 con NAT: el tráfico pasa por FORWARD y no por INPUT, así que las reglas de INPUT no lo
# filtran. La única cadena que Docker respeta es DOCKER-USER: aquí se salta a una cadena propia, CHASKI-8443,
# que acepta los rangos de Cloudflare y descarta el resto. Es una segunda barrera además de la Security List.
#
# provision-vm.sh lo instala como /usr/local/sbin/chaski-firewall-8443 con un servicio systemd que lo corre al
# arrancar Docker y una vez por semana (para traer rangos nuevos de Cloudflare).
#
# Uso: sudo ./firewall-8443.sh [--dry-run | --status | --remove]
#   (sin opción)  baja los rangos, rehace CHASKI-8443 de una sola vez y asegura el salto desde DOCKER-USER
#   --dry-run     muestra las reglas sin aplicarlas
#   --status      muestra las reglas con sus contadores
#   --remove      quita el salto y la cadena (vuelta atrás)
set -euo pipefail

PORT=8443
CHAIN=CHASKI-8443
CACHE_DIR=/etc/chaski
MODE="${1:-apply}"

if [[ $EUID -ne 0 ]]; then
  echo "Ejecuta como root: sudo $0 $*" >&2
  exit 1
fi

# Interfaz pública: la de la ruta por defecto (o CHASKI_IFACE). Así el tráfico entre contenedores no pasa por el filtro.
IFACE="${CHASKI_IFACE:-$(ip -4 route show default | awk '{print $5; exit}')}"
[[ -n "$IFACE" ]] || { echo "No se encontró la interfaz de la ruta por defecto" >&2; exit 1; }

jump_args() {
  echo "-i $IFACE -p tcp -m conntrack --ctorigdstport $PORT --ctdir ORIGINAL -m comment --comment chaski-8443 -j $CHAIN"
}

# Las familias que se filtran: IPv6 solo si Docker creó DOCKER-USER también en ip6tables.
families() {
  echo 4
  if ip6tables -n -L DOCKER-USER >/dev/null 2>&1; then echo 6; fi
}

ipt() { if [[ "$1" == 4 ]]; then echo iptables; else echo ip6tables; fi; }

case "$MODE" in
  --status)
    for f in $(families); do
      echo "== $(ipt "$f")"
      "$(ipt "$f")" -n -v -L DOCKER-USER --line-numbers | grep -E "Chain|$CHAIN" || true
      "$(ipt "$f")" -n -v -L "$CHAIN" 2>/dev/null || echo "(no existe $CHAIN)"
    done
    exit 0
    ;;
  --remove)
    for f in $(families); do
      t="$(ipt "$f")"
      # shellcheck disable=SC2046
      while "$t" -C DOCKER-USER $(jump_args) 2>/dev/null; do "$t" -D DOCKER-USER $(jump_args); done
      "$t" -F "$CHAIN" 2>/dev/null || true
      "$t" -X "$CHAIN" 2>/dev/null || true
    done
    echo "Filtro quitado: el 8443 queda protegido solo por la Security List."
    exit 0
    ;;
  apply | --dry-run) ;;
  *)
    echo "Opción desconocida: $MODE (usa --dry-run, --status o --remove)" >&2
    exit 2
    ;;
esac

# Baja una lista de rangos y la valida. Si falla, usa la última que funcionó: nunca se aplica una lista vacía,
# porque eso dejaría fuera a Cloudflare y tumbaría la señalización.
ranges() {
  local f="$1" url cache tmp re
  url="https://www.cloudflare.com/ips-v$f"
  cache="$CACHE_DIR/cloudflare-ips-v$f"
  if [[ "$f" == 4 ]]; then re='^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$'; else re='^[0-9a-f:]+/[0-9]{1,3}$'; fi
  tmp="$(mktemp)"
  if curl -fs --max-time 20 "$url" | tr -d '\r' | grep -v '^$' >"$tmp" \
      && [[ "$(wc -l <"$tmp")" -ge 3 ]] && ! grep -Evq "$re" "$tmp"; then
    if [[ "$MODE" == apply ]]; then
      install -d -m 755 "$CACHE_DIR"
      install -m 644 "$tmp" "$cache"
    fi
    cat "$tmp"
  elif [[ -s "$cache" ]]; then
    echo "AVISO: no se pudo bajar $url; se usa la copia de $cache" >&2
    cat "$cache"
  else
    rm -f "$tmp"
    echo "No se pudo bajar $url y no hay copia guardada; no se cambia nada" >&2
    return 1
  fi
  rm -f "$tmp"
}

for f in $(families); do
  t="$(ipt "$f")"
  if ! cidrs="$(ranges "$f")"; then
    # Sin rangos de IPv4 no se sigue; sin los de IPv6 se avisa y se sigue (Oracle no usa IPv6 por defecto).
    [[ "$f" == 6 ]] && continue
    exit 1
  fi
  # iptables-restore --noflush cambia la cadena entera en una sola transacción: no hay un momento con la cadena
  # vacía (declararla con ":" la vacía antes de rellenarla) y no toca las reglas de Docker ni de INPUT.
  rules="*filter
:$CHAIN - [0:0]
$(for c in $cidrs; do echo "-A $CHAIN -s $c -j RETURN"; done)
-A $CHAIN -j DROP
COMMIT"
  if [[ "$MODE" == --dry-run ]]; then
    echo "== ${t}-restore --noflush"
    echo "$rules"
    echo "== $t -I DOCKER-USER 1 $(jump_args)"
    continue
  fi
  if ! "$t" -n -L DOCKER-USER >/dev/null 2>&1; then
    echo "No existe la cadena DOCKER-USER en $t: ¿está corriendo Docker?" >&2
    exit 1
  fi
  echo "$rules" | "${t}-restore" --noflush
  # shellcheck disable=SC2046
  "$t" -C DOCKER-USER $(jump_args) 2>/dev/null || "$t" -I DOCKER-USER 1 $(jump_args)
  echo "$t: $CHAIN con $(wc -w <<<"$cidrs") rangos de Cloudflare; el resto del tráfico al $PORT se descarta"
done
