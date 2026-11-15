#!/bin/sh
# Builds dist/ into an architecture-independent .deb (Debian 12+, Ubuntu 22.04+, Mint, Pop!_OS…).
set -eu
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
ROOT=build/deb/fanoos_${VERSION}_all
[ -f dist/index.html ] || { echo "Run npm run build first" >&2; exit 1; }

rm -rf "$ROOT"
mkdir -p "$ROOT/DEBIAN" "$ROOT/usr/bin" "$ROOT/usr/share/fanoos" "$ROOT/usr/share/applications" "$ROOT/usr/share/icons/hicolor/512x512/apps"
cp -r dist "$ROOT/usr/share/fanoos/app"
install -m 0755 platforms/linux/fanoos "$ROOT/usr/bin/fanoos"
install -m 0644 platforms/linux/fanoos.desktop "$ROOT/usr/share/applications/fanoos.desktop"
install -m 0644 public/icon.png "$ROOT/usr/share/icons/hicolor/512x512/apps/fanoos.png"
mkdir -p "$ROOT/usr/share/icons/hicolor/scalable/apps"
install -m 0644 public/icon.svg "$ROOT/usr/share/icons/hicolor/scalable/apps/fanoos.svg"

cat > "$ROOT/DEBIAN/control" <<EOF
Package: fanoos
Version: $VERSION
Architecture: all
Maintainer: Fanoos <fanoos@localhost>
Section: video
Priority: optional
Depends: python3 (>= 3.8)
Recommends: python3-gi, gir1.2-webkit2-4.1 | gir1.2-webkit2-4.0, gstreamer1.0-plugins-good, gstreamer1.0-libav
Suggests: chromium
Installed-Size: $(du -sk "$ROOT/usr" | cut -f1)
Description: Media center with installable extensions
 CloudStream-style interface with Kodi-style zip extensions and repositories.
 Ships no content: browse what your installed extensions provide.
EOF

mkdir -p dist-packages
dpkg-deb --root-owner-group --build "$ROOT" "dist-packages/fanoos_${VERSION}_all.deb"
