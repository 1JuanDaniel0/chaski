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
#  3) El 8443 de la señalización lo publica Docker con NAT, que se salta INPUT: su filtro va en la cadena
#     DOCKER-USER (infra/scripts/firewall-8443.sh), instalado aquí como servicio systemd.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Ejecuta como root: sudo $0" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

# Versiones anteriores de este script ponían el filtro del 8443 en INPUT, donde no sirve (Docker usa NAT):
# se borran esas reglas, si existen.
for ipt in iptables ip6tables; do
  { "$ipt" -S INPUT | grep -- '--comment "chasqui signal cloudflare"' || true; } | sed 's/^-A /-D /' | while read -r rule; do
    eval "$ipt $rule"
  done
done

echo "==> Guardando reglas (netfilter-persistent -> /etc/iptables/rules.v4)"
netfilter-persistent save

echo "==> Filtro del 8443 en DOCKER-USER (solo Cloudflare)"
install -m 755 "$SCRIPT_DIR/firewall-8443.sh" /usr/local/sbin/chaski-firewall-8443
install -m 644 "$SCRIPT_DIR/../systemd/chaski-firewall.service" "$SCRIPT_DIR/../systemd/chaski-firewall.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable chaski-firewall.service
systemctl enable --now chaski-firewall.timer
systemctl restart chaski-firewall.service
/usr/local/sbin/chaski-firewall-8443 --status

echo
echo "Listo. Recuerda abrir también en la VCN Security List de Oracle:"
echo "  3478 TCP/UDP, 443 TCP, 49160-49360 UDP (desde 0.0.0.0/0) y 8443 TCP (desde los rangos de Cloudflare)."
echo "Cierra sesión y vuelve a entrar para que el grupo 'docker' tenga efecto."
