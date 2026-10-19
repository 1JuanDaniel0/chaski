#!/usr/bin/env bash
# Despliegue automático desde la VM: trae main y, si cambió la señalización o infra/, despliega la imagen de ese
# commit en cuanto el workflow `signal` la publica en GHCR. Así GitHub no necesita entrar por SSH a la VM.
# deploy.sh lo pone en cron (cada 5 minutos). Registro en infra/auto-deploy.log.
# Uso: ./auto-deploy.sh
set -euo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(cd "$INFRA_DIR/.." && pwd)"
IMAGE=ghcr.io/1juandaniel0/chasqui-signal
# Las mismas rutas que disparan el workflow `signal` en main: un commit de main que las toca tiene imagen con su SHA.
# --first-parent porque la imagen lleva el SHA del merge del PR, no el de los commits de la rama.
IMAGE_PATHS=(apps/signal .github/workflows/signal.yml infra)

# Si la pasada anterior sigue (por ejemplo, un docker pull lento), no se cruza con ella.
exec 9>"$INFRA_DIR/.auto-deploy.lock"
flock -n 9 || exit 0

cd "$REPO_DIR"
git fetch -q origin main
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] && exit 0

TAG="$(git log -1 --first-parent --format=%H origin/main -- "${IMAGE_PATHS[@]}")"
CURRENT="$(sed -n 's/^SIGNAL_TAG=//p' "$INFRA_DIR/.env")"

if [[ "$TAG" == "$CURRENT" ]]; then
  # Solo cambiaron cosas que no van en la VM (web, docs): basta con avanzar el repo.
  git merge -q --ff-only origin/main
  exit 0
fi

# La imagen tarda unos minutos en publicarse; mientras no exista, se reintenta en la próxima pasada.
if ! docker manifest inspect "$IMAGE:$TAG" >/dev/null 2>&1; then
  echo "$(date -Is) esperando la imagen ${TAG:0:7} en GHCR"
  exit 0
fi

echo "$(date -Is) desplegando ${TAG:0:7}"
git merge -q --ff-only origin/main
SIGNAL_TAG="$TAG" "$INFRA_DIR/scripts/deploy.sh"
