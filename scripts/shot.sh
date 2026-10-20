#!/usr/bin/env bash
# Capture headless de l'app. Usage : scripts/shot.sh <sortie.png> "<query>" [largeur] [hauteur]
set -u
OUT="${1:?usage: shot.sh sortie.png query [w] [h]}"
QUERY="${2:-}"
W="${3:-1400}"
H="${4:-900}"
PORT="${PORT:-5173}"
URL="http://127.0.0.1:${PORT}/${QUERY}"
PROFILE="$(mktemp -d /tmp/chrome-shot-XXXX)"
LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe /root/.local/chromium-125/chrome \
  --headless=new --no-sandbox --disable-gpu-sandbox --disable-dev-shm-usage \
  --use-angle=gl-egl --ignore-gpu-blocklist \
  --user-data-dir="$PROFILE" \
  --window-size="${W},${H}" --virtual-time-budget=12000 \
  --screenshot="$OUT" "$URL" >/dev/null 2>&1
rm -rf "$PROFILE" 2>/dev/null
ls -l "$OUT"
