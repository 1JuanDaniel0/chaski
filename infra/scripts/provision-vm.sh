#!/usr/bin/env bash
# Prepara una VM Ubuntu (ARM) de Oracle Cloud para correr Chasqui.
# Uso: sudo ./provision-vm.sh
#
# DOS FIREWALLS (hay que abrir los dos o nada llega):
#  1) VCN Security List / NSG de Oracle (en la consola web): se configura a mano,
#     ver docs/despliegue.md.
#  2) Firewall del sistema operativo: las imágenes de Oracle traen reglas iptables
#     persistentes en /etc/iptables/rules.v4 que rechazan casi todo. Este script
#     inserta las reglas necesarias ANTES de la regla REJECT y las guarda con
#     netfilter-persistent.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Ejecuta como root: sudo $0" >&2
  exit 1
fi

CF_V4_URL="https://www.cloudflare.com/ips-v4"
CF_V6_URL="https://www.cloudflare.com/ips-v6"
TURN_MIN_PORT=49160
TURN_MAX_PORT=49360

echo "==> Instalando Docker y el plugin de Compose"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg iptables iptables-persistent netfilter-persistent
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

# Usuario que ejecutará deploy.sh (el que invocó sudo, si existe)
if [[ -n "${SUDO_USER:-}" ]]; then
  usermod -aG docker "$SUDO_USER"
fi

echo "==> Descargando rangos de IP de Cloudflare"
CF_V4=$(curl -fsS "$CF_V4_URL")
CF_V6=$(curl -fsS "$CF_V6_URL")
[[ -n "$CF_V4" && -n "$CF_V6" ]] || { echo "No se pudieron obtener los rangos de Cloudflare" >&2; exit 1; }

# Inserta una regla solo si no existe (idempotente). Uso: add_rule <iptables|ip6tables> <args...>
add_rule() {
  local ipt="$1"; shift
  if ! "$ipt" -C INPUT "$@" 2>/dev/null; then
    # -I 1 las pone al principio, antes del REJECT final de las imágenes de Oracle
    "$ipt" -I INPUT 1 "$@"
  fi
}

echo "==> Reglas de firewall del sistema operativo"
for ipt in iptables ip6tables; do
  # TURN: público (los clientes pueden venir de cualquier IP, sin proxy)
  add_rule "$ipt" -p udp --dport 3478 -m comment --comment "chasqui turn udp" -j ACCEPT
  add_rule "$ipt" -p tcp --dport 3478 -m comment --comment "chasqui turn tcp" -j ACCEPT
  add_rule "$ipt" -p tcp --dport 443  -m comment --comment "chasqui turns"    -j ACCEPT
  add_rule "$ipt" -p udp --dport "${TURN_MIN_PORT}:${TURN_MAX_PORT}" -m comment --comment "chasqui turn relay" -j ACCEPT
done

# Señalización (8443): solo desde Cloudflare, para que nadie se salte el proxy.
for cidr in $CF_V4; do
  add_rule iptables -p tcp -s "$cidr" --dport 8443 -m comment --comment "chasqui signal cloudflare" -j ACCEPT
done
for cidr in $CF_V6; do
  add_rule ip6tables -p tcp -s "$cidr" --dport 8443 -m comment --comment "chasqui signal cloudflare" -j ACCEPT
done
# El puerto 8443 NO se abre a nadie más: cae en el REJECT/DROP por defecto.
# Nota: si se renuevan los rangos de Cloudflare, vuelve a ejecutar este script
# (las reglas viejas no se borran; para limpiar usa: iptables -S | grep "signal cloudflare").

echo "==> Guardando reglas (netfilter-persistent -> /etc/iptables/rules.v4)"
netfilter-persistent save

echo
echo "Listo. Recuerda abrir también en la VCN Security List de Oracle:"
echo "  3478 TCP/UDP, 443 TCP, 49160-49360 UDP (desde 0.0.0.0/0) y 8443 TCP (desde los rangos de Cloudflare)."
echo "Cierra sesión y vuelve a entrar para que el grupo 'docker' tenga efecto."
