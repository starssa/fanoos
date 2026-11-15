#!/bin/sh
# Builds a sideloadable test APK (phones, tablets, Android TV) without the Android SDK:
# apktool assembles the smali shell + manifest + resources, the JDK's jarsigner signs it.
#   APKTOOL_JAR=/path/to/apktool.jar sh tools/build-apk.sh
# For a Play Store build use Capacitor + Gradle instead (see README).
set -eu
cd "$(dirname "$0")/.."
: "${APKTOOL_JAR:?set APKTOOL_JAR to an apktool .jar}"
VERSION=$(node -p "require('./package.json').version")
[ -f dist/index.html ] || { echo "Run npm run build first" >&2; exit 1; }

SRC=build/android-src
OUT=dist-packages
KEYSTORE=${KEYSTORE:-platforms/android/test.keystore} # kept in the project: updates must be signed with the same key
rm -rf "$SRC" && mkdir -p "$SRC/assets" "$OUT"
cp -r platforms/android/AndroidManifest.xml platforms/android/apktool.yml platforms/android/smali platforms/android/res "$SRC/"
cp -r dist "$SRC/assets/www"

java -jar "$APKTOOL_JAR" b "$SRC" -o build/fanoos-unsigned.apk

if [ ! -f "$KEYSTORE" ]; then
  # Test-only key, created once and reused for every build.
  keytool -genkeypair -keystore "$KEYSTORE" -storepass fanoos-test -keypass fanoos-test -alias fanoos \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Fanoos Test" >/dev/null
fi
cp build/fanoos-unsigned.apk "$OUT/fanoos-$VERSION.apk"
jarsigner -keystore "$KEYSTORE" -storepass fanoos-test -sigalg SHA256withRSA -digestalg SHA-256 \
  "$OUT/fanoos-$VERSION.apk" fanoos >/dev/null
jarsigner -verify "$OUT/fanoos-$VERSION.apk" >/dev/null && echo "built $OUT/fanoos-$VERSION.apk"
