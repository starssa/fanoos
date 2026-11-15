# Fanoos Media Center

A media center with a CloudStream-style interface and a Kodi-style addon system: zip
addons, repositories, auto-updates and per-addon settings. One TypeScript codebase runs
on Android, iOS, Windows, Linux, macOS, Samsung Tizen, LG webOS and the browser.

Fanoos ships with no content. Two example addons are included:

- **Internet Archive Films**: public-domain movies and cartoons.
- **M3U Playlist**: plays your own playlist URL.

## Download

Ready-made packages are on the [Releases](https://github.com/starssa/fanoos/releases) page:
`.apk` (Android / TV box), `.wgt` (Samsung Tizen: install it with [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung), which signs it for your TV), `.AppImage` / `.deb` (Linux), `-windows-setup.exe` / `-windows-portable.exe` (Windows), `-webos.ipk` (LG webOS),
`fanoos-scraper-*.xpi` (browser extension) and Fanoos Studio for Windows, Linux, macOS or the web (`-web.zip`).
The release page explains which file fits which device. GitHub Actions rebuilds them on
every push to `main` and publishes them as release `v<version in package.json>`.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173 (then Addons → Install)
npm test           # addon unit tests
npm run build      # → dist/ (single classic-script bundle, ES2015, works from file://)
```

## Platforms

| Target | Wrapper | Steps |
|---|---|---|
| Windows / Linux / macOS | Electron (`platforms/electron`) | `npm run build && npm run prepare:electron && cd platforms/electron && npm install && npm start`. Use `npm run dist` for installers (NSIS, AppImage, deb). |
| Android / Android TV | Capacitor | `npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/app && npx cap add android && npm run build && npx cap sync && npx cap open android` |
| iOS / iPadOS | Capacitor | same as Android, with `@capacitor/ios`, then `npx cap add ios`. Needs a Mac with Xcode. |
| Samsung TV (Tizen) | `platforms/tizen/config.xml` | `npm run build && npm run prepare:tizen`, then `tizen package -t wgt -s <profile> -- build/tizen` (Tizen Studio CLI) |
| LG TV (webOS) | `platforms/webos/appinfo.json` | `npm run build && npm run prepare:webos && ares-package build/webos && ares-install --device <tv> *.ipk` |
| Browser | none | serve `dist/` from any static host |

**Remote control.** Arrows, OK and Back work everywhere. Media keys (play/pause, FF/RW,
stop) are mapped on Tizen and webOS. Back from Home asks you to press it twice to exit.

## Addon Studio (repository and addon editor)

**Fanoos Addon Studio** is an installable web app (PWA) for writing addons with a live preview.

- **Live preview:** your addon runs in the same sandbox Fanoos uses, showing Home rows, More
  paging, search, details, sources with a test player, settings and a console. It reruns on
  every edit.
- **Starters:** the documented Example addon, a blank addon, and an example `repo.json`.
- **Export:** one addon `.zip`, or the whole repository. The `repo.json` addon list is rebuilt
  with SHA-256 checksums.
- **Import:** addon zips and repository zips.
- **Offline:** works without a connection after the first visit.

```bash
npm run editor          # develop it at http://localhost:5173
npm run build:editor    # -> dist-editor/: upload to any https host (GitHub Pages, Netlify…)
```

Browsers only install PWAs from `https://` or `localhost`. In the preview, addons that call
websites without CORS headers fail with a network error; the Fanoos apps (Android, desktop, TV)
don't have that limit.

### Fanoos Scraper (browser extension)

The **Scraper extension** button in the Studio downloads `fanoos-scraper.xpi`, a Firefox extension
(it also works in Chrome) that writes addons for you, like Web Scraper:

1. **List:** on a list page, click one poster card. All similar cards are found, and the title,
   link and poster (including lazy-loaded images) are guessed. Put `{page}` in the row URL to get
   "More".
2. **Search:** on a results page, type the word you searched; the search URL template is
   detected.
3. **Details:** click the title, plot and poster. For series, click one **season** (a tab, a link
   to a season page, or a season drop-down) and then one **episode**; Fanoos lists episodes per
   season.
4. **Video:** lists every video source on the watch page, or says there are none: `<video>` tags,
   streams in the page source, embedded players, and server buttons or drop-downs that hold a video
   link (`data-src`, `data-url`, `data-embed`, base64…). Sources that appear only after the site's
   JavaScript runs are marked ✗, because addons can't see them.
5. **Export:** download the addon `.zip`, then use **Import zip** in the Studio to test it live.

The generated `main.js` is readable: a `CONFIG` block of CSS selectors plus a small engine.

**Installing it in Firefox:** `about:debugging` → *Load Temporary Add-on*. To keep it after a
restart, use Firefox Developer Edition/Nightly with `xpinstall.signatures.required=false`, or sign
it on addons.mozilla.org. Build it with `npm run scraper`.

## Player and appearance

- **Settings → Player:**
  - **Fanoos player:** resume, addon subtitles, remote keys.
  - **External player:** VLC or mpv (Settings → External player app), which play every format,
    including MKV, HEVC and cloud links. If the app is missing, Fanoos offers to install it. Not available on Samsung or LG TVs, which can't hand videos to other
    apps.
  - **Ask every time.**
  - The Fanoos player also has an "Open in external player" button.
- **Settings → Appearance:**
  - Themes: Dark, Black (OLED), Midnight, Light.
  - Six accent colours.
  - Four text and poster sizes.
  - 2017 TVs keep the default dark theme, because their browser can't change it.

## Testing on a Samsung TV (Tizen)

`npm run build && sh tools/build-tizen.sh` writes `dist-packages/Fanoos-unsigned.wgt`.
TVs only install packages signed for them, so do this once:

1. **Install Tizen Studio** with the *TV Addons* and *Samsung Certificate Addon* packages
   (Package Manager → Addon SDK).
2. **Enable developer mode on the TV.** Open Apps, type `1 2 3 4 5` on the remote, switch
   Developer mode **On**, enter your PC's IP address, then restart the TV.
3. **Create a certificate.** Tizen Studio → Tools → Certificate Manager → **+** → **Samsung** →
   TV. Sign in with your Samsung account and add the TV's **DUID**; Device Manager shows it once
   the TV is connected.
4. **Sign and install:**
   ```bash
   TIZEN_PROFILE=<certificate profile name> TIZEN_DEVICE=<tv-ip>:26101 sh tools/build-tizen.sh
   ```
   This writes a signed `dist-packages/Fanoos.wgt`, installs it, and launches it.

**No TV?** Tizen Studio → Emulator Manager → create a TV emulator. It accepts packages signed
with the default *Tizen* certificate profile.

## Test packages without any SDK

```bash
npm run package:deb                               # dist-packages/fanoos_<ver>_all.deb
APKTOOL_JAR=/path/apktool.jar npm run package:apk  # dist-packages/fanoos-<ver>.apk
```

- **.deb** (`platforms/linux`): a Python launcher (standard library only). It serves the app on
  127.0.0.1 and opens a WebKitGTK window, falling back to Chromium/Chrome `--app` mode, then to
  your browser. `fanoos --server` runs it headless. Addon HTTP goes through the launcher, so
  there are no CORS limits.
- **.apk** (`platforms/android`): a ~10-method native shell in smali. It is a fullscreen
  WebView serving `assets/www` from `https://appassets.androidplatform.net` and does addon
  HTTP natively. It works on phones and Android TV, and is v1-signed with a generated test key
  (`build/fanoos-test.keystore`). Keep that key, because updates must use the same one.

Both shells use one bridge protocol: `./__proxy?r=<json>[&bin=1]` and `./__exit`.

## Project layout

```
src/core/       engine: addon manager, worker sandbox, repositories, storage, player, platform adapters
src/ui/         CloudStream-style views + spatial focus navigation, themes
editor/         Fanoos Addon Studio (PWA): editor + live preview + export
addons/         source of the bundled addons (one folder per id)
tools/          build-addons (zips + repo.json), test-addons, prepare-platform
platforms/      Android (smali), Linux (.deb launcher), Electron, Tizen and webOS wrappers
docs/           ARCHITECTURE.md (how Kodi & CloudStream work, design choices), ADDONS.md (addon API)
```

## Writing addons

See [docs/ADDONS.md](docs/ADDONS.md). In short: a zip containing `manifest.json` and `main.js`,
where `main.js` calls `fanoos.register({ getHome, search, load, loadLinks })`.
