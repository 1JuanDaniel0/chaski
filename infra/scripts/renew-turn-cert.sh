#!/usr/bin/env bash
# Obtiene/renueva el certificado Let's Encrypt de turn.chasqui.example con desafío DNS
# (plugin dns-cloudflare de certbot) y reinicia coturn.
# Requisitos: sudo, y un archivo con el token de la API de Cloudflare (permiso Zone:DNS:Edit):
#   /etc/letsencrypt/cloudflare.ini  ->  dns_cloudflare_api_token = XXXXXXXX   (chmod 600)
# Uso: sudo ./renew-turn-cert.sh   (ponlo en cron o en un timer de systemd, p. ej. semanal)
set -euo pipefail

DOMAIN="${TURN_DOMAIN:-turn.chasqui.example}"
CF_CREDS="${CF_CREDS:-/etc/letsencrypt/cloudflare.ini}"
INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="$INFRA_DIR/certs/turn"

if [[ $EUID -ne 0 ]]; then
  echo "Ejecuta como root: sudo $0" >&2
  exit 1
fi
[[ -f "$CF_CREDS" ]] || { echo "Falta $CF_CREDS" >&2; exit 1; }
chmod 600 "$CF_CREDS"

if ! command -v certbot >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y certbot python3-certbot-dns-cloudflare
fi

EMAIL_ARGS=(--register-unsafely-without-email)
[[ -n "${LE_EMAIL:-}" ]] && EMAIL_ARGS=(-m "$LE_EMAIL")

certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials "$CF_CREDS" \
  -d "$DOMAIN" \
  --non-interactive --agree-tos \
  --keep-until-expiring \
  "${EMAIL_ARGS[@]}"

# Copia los certificados a la carpeta que monta coturn (los symlinks de /etc/letsencrypt no funcionan dentro del contenedor)
install -d -m 0755 "$CERT_DIR"
install -m 0644 "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$CERT_DIR/fullchain.pem"
install -m 0640 "/etc/letsencrypt/live/$DOMAIN/privkey.pem"   "$CERT_DIR/privkey.pem"

echo "Reiniciando coturn..."
docker compose -f "$INFRA_DIR/docker-compose.yml" --env-file "$INFRA_DIR/.env" restart coturn
echo "Listo."
