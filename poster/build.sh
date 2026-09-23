#!/bin/sh
# สร้างไฟล์พิมพ์ PDF ขนาดจริง 3000×2400 มม. + ภาพพรีวิว PNG จาก poster/poster.html
set -e
cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
mkdir -p ../exports
"$CHROME" --headless=new --disable-gpu --allow-file-access-from-files --no-pdf-header-footer \
  --print-to-pdf=../exports/poster-3000x2400mm.pdf "file://$PWD/poster.html"
# 3000mm = 11339 CSS px ; scale 0.2 → พรีวิวกว้าง ~2268 px
"$CHROME" --headless=new --disable-gpu --allow-file-access-from-files --hide-scrollbars \
  --window-size=11339,9071 --force-device-scale-factor=0.2 \
  --screenshot=../exports/poster-preview.png "file://$PWD/poster.html"
