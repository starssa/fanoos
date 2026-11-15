## Which file?

| Device | File |
|---|---|
| iPhone / iPad | `Fanoos-<version>-ios-unsigned.ipa`, installed with **AltStore**, **SideStore** or **Sideloadly** (they sign it with your Apple ID) |
| Android phone / Android TV box | `fanoos-<version>.apk` (`-unsigned.apk` only to sign with your own key) |
| Samsung TV (Tizen) | `Fanoos-<version>-unsigned.wgt`, installed with **[Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung)** (below) |
| LG TV (webOS) | `Fanoos-<version>-webos.ipk` (Developer Mode app + `ares-install`) |
| Windows | `Fanoos-<version>-windows-setup.exe` or `-windows-portable.exe` |
| Linux | `Fanoos-<version>-linux.AppImage` (any distro) or `fanoos_<version>_all.deb` (Debian/Ubuntu) |
| Addon Studio | `Fanoos-Studio-<version>-windows-setup.exe` / `-windows-portable.exe`, `-linux.AppImage`, `-mac-arm64.dmg` (Apple Silicon) / `-mac-x64.dmg` (Intel), or `-web.zip` (open `index.html` in a browser) |
| Scraper extension | Firefox: `fanoos-scraper-<version>.xpi`. Chrome / Edge / Brave: `fanoos-scraper-<version>-chrome.zip`: unzip it, open `chrome://extensions`, turn on **Developer mode**, **Load unpacked** → the unzipped folder |

### Samsung TV: easy install with Apps2Samsung
The `.wgt` is unsigned; Samsung TVs only install apps signed for that TV. **Apps2Samsung** (free, Windows / macOS / Linux / Android / iOS) signs and installs it for you:
1. On the TV: **Apps** → type **12345** on the remote → **Developer mode On**, enter your computer's IP → restart the TV.
2. In Apps2Samsung: choose **custom WGT**, pick `Fanoos-<version>-unsigned.wgt`, select your TV → Install. It creates the Samsung certificate and signs the app.

### Unsigned apps
Windows SmartScreen: **More info → Run anyway**. macOS: right-click the app → **Open** (or `xattr -cr "/Applications/Fanoos Studio.app"` if it says "damaged"). AppImage: `chmod +x` the file, then run it.

iOS: with a free Apple ID the app must be refreshed every 7 days (AltStore/SideStore do it automatically).
