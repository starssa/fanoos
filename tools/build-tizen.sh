#!/bin/sh
# Builds the Samsung TV app (Tizen .wgt).
#   sh tools/build-tizen.sh                         -> dist-packages/Fanoos-unsigned.wgt (inspect / emulator testing)
#   TIZEN_PROFILE=myprofile sh tools/build-tizen.sh -> signed dist-packages/Fanoos.wgt (needs Tizen Studio CLI)
#   ... TIZEN_DEVICE=192.168.1.50:26101             -> also installs and launches it on that TV
# Real TVs only accept packages signed with a Samsung certificate for that TV's DUID
# (Tizen Studio → Certificate Manager → Samsung). See README → Samsung TV.
set -eu
cd "$(dirname "$0")/.."
[ -f dist/index.html ] || { echo "Run npm run build first" >&2; exit 1; }
node tools/prepare-platform.mjs tizen >/dev/null
mkdir -p dist-packages
rm -f dist-packages/Fanoos-unsigned.wgt
(cd build/tizen && zip -qr ../../dist-packages/Fanoos-unsigned.wgt .)
echo "built dist-packages/Fanoos-unsigned.wgt"

[ -n "${TIZEN_PROFILE:-}" ] || exit 0
TIZEN=${TIZEN:-$(command -v tizen || echo "$HOME/tizen-studio/tools/ide/bin/tizen")}
[ -x "$TIZEN" ] || { echo "tizen CLI not found; install Tizen Studio or set TIZEN=/path/to/tizen" >&2; exit 1; }
"$TIZEN" package -t wgt -s "$TIZEN_PROFILE" -- build/tizen
mv build/tizen/Fanoos.wgt dist-packages/Fanoos.wgt
echo "signed dist-packages/Fanoos.wgt"

[ -n "${TIZEN_DEVICE:-}" ] || exit 0
SDB=${SDB:-$(command -v sdb || echo "$HOME/tizen-studio/tools/sdb")}
"$SDB" connect "$TIZEN_DEVICE"
SERIAL=$("$SDB" devices | awk 'NR>1 && $1 ~ /:/ {print $3; exit}')
"$TIZEN" install -n Fanoos.wgt -t "$SERIAL" -- dist-packages
"$TIZEN" run -p FanoosMC01.Fanoos -t "$SERIAL"
