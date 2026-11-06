#!/bin/zsh
# assets/icon.svg → assets/icon.iconset (+ assets/icon.icns). rsvg-convert(librsvg) 필요.
set -e
cd "${0:A:h}/.."
rm -rf assets/icon.iconset && mkdir assets/icon.iconset
for s in 16 32 128 256 512; do
  rsvg-convert -w $s -h $s assets/icon.svg -o assets/icon.iconset/icon_${s}x${s}.png
  rsvg-convert -w $((s*2)) -h $((s*2)) assets/icon.svg -o assets/icon.iconset/icon_${s}x${s}@2x.png
done
iconutil -c icns assets/icon.iconset -o assets/icon.icns
echo "icon ok"
