#!/bin/sh
# Renderiza las pantallas: sh render.sh (desde esta carpeta).
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"
DIR="$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)"
for p in actual a b; do for s in inicio calendario; do
  H=844; [ "$s" = calendario ] && H=1030
  "$CH" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=2 \
    --window-size=390,$H --screenshot="$DIR/$p-$s.png" "file:///$DIR/maqueta.html?p=$p&s=$s" >/dev/null 2>&1
done; done
