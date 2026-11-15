# How Kodi and CloudStream work, and how Fanoos combines them

## 1. Kodi (XBMC)

**Core.** A single C++ application. It owns the GUI engine, the player, the databases and an
embedded CPython interpreter. It is built natively for each OS: Windows, Linux, macOS, Android,
iOS/tvOS (sideload only) and some embedded Linux boxes. Samsung Tizen and LG webOS are not
supported.

**Add-on system.** Every add-on is a folder with an `addon.xml`. That file declares:

- an `id`, a version and dependencies, such as `<import addon="xbmc.python" version="3.0.1"/>`;
- one or more *extension points*, which say what the add-on is:
  - `xbmc.python.pluginsource`: content plugins (video, music, pictures);
  - `xbmc.python.script`: programs;
  - `xbmc.python.module`: shared libraries;
  - `xbmc.gui.skin`: skins;
  - `xbmc.addon.repository`: repositories;
  - `kodi.inputstream` and `xbmc.pvrclient`: native binary add-ons.

**How a Python plugin runs.** Kodi starts the plugin's `main.py` again for *every folder you
open*. It passes three values in `sys.argv`: the plugin URL (`plugin://plugin.video.foo/`), an
integer *handle*, and a query string such as `?action=list&id=42`. The script then:

1. calls `xbmcplugin.addDirectoryItem(handle, url, ListItem, isFolder)` for each entry;
2. calls `xbmcplugin.endOfDirectory(handle)`;
3. exits.

For something playable, it calls `xbmcplugin.setResolvedUrl(handle, True, ListItem(path=stream))`.
Navigation therefore has no state. All state lives in the URL, plus whatever the add-on saves
through `xbmcaddon`/`xbmcvfs` under `userdata/addon_data/<id>`. Since Kodi 19 "Matrix", add-ons
must be Python 3.

**Repositories.** A repository is itself an add-on that points to a static URL. That URL holds:

- `addons.xml`: every `addon.xml` concatenated;
- `addons.xml.md5`: a checksum;
- `<id>/<id>-<version>.zip`: one zip per version.

Kodi polls the repository and auto-updates installed add-ons. You can also choose
"Install from zip file".

**Other subsystems:**

- **Skins**: XML window definitions with includes; Estuary is the default.
- **VideoPlayer**: an FFmpeg-based player.
- **InputStream Adaptive**: handles DASH and HLS, plus Widevine DRM.
- **Scrapers**: metadata from TMDb and TVDb.
- **Storage**: SQLite databases (`MyVideos*.db`, `Addons*.db`, `Textures*.db`).
- **JSON-RPC**: an API for remote control apps.

## 2. CloudStream 3

**Core.** A Kotlin Android app (phone and Android TV). The UI is built with Android views.
Playback uses ExoPlayer/Media3, and HTTP goes through OkHttp via NiceHttp.

**Provider API.** Every source subclasses `MainAPI` and declares:

- `name`, `mainUrl` and `supportedTypes`;
- `mainPage`, a list of home rows.

It implements four functions:

| Function | Returns | Drives |
|---|---|---|
| `getMainPage(page, request)` | `HomePageResponse` | home screen rows |
| `search(query)` | `List<SearchResponse>` | search results, grouped per provider |
| `load(url)` | `LoadResponse` (movie or series with episodes) | details page |
| `loadLinks(data, isCasting, subtitleCallback, callback)` | `ExtractorLink`s + `SubtitleFile`s through callbacks | source picker / player |

`ExtractorApi` classes turn hoster embed pages into direct stream URLs. A provider can call
any registered extractor.

**Extensions.** A `.cs3` file is a zip containing compiled `classes.dex` and a `manifest.json`
(plugin class name, version). A class annotated `@CloudstreamPlugin` calls
`registerMainAPI(...)` and `registerExtractorAPI(...)` in its `load()` method. The app loads
the dex at runtime with Android's class loader. This is why extensions only work on Android.

**Repositories.** A `repo.json` lists `pluginLists`, which are URLs to `plugins.json` files.
Each entry has a URL, a version, an `apiVersion`, a language, `tvTypes` and an icon.

**UI pattern** (the part Fanoos copies):

- a provider selector on Home, with poster rows;
- a global search that shows results per provider;
- a details page with backdrop, plot, seasons and episodes;
- a source picker that auto-tries links;
- Library and "Continue watching";
- bottom navigation on phones and a side rail on TV.

## 3. Side by side

| | Kodi | CloudStream | **Fanoos** |
|---|---|---|---|
| App language | C++ | Kotlin | TypeScript (web runtime) |
| Add-on language | Python 3 | Kotlin → dex | JavaScript (ES5+) |
| Add-on package | zip + `addon.xml` | `.cs3` (zip + dex + `manifest.json`) | zip + `manifest.json` + `main.js` |
| Add-on model | re-run script per folder, URL = state | long-lived object with 4 methods | long-lived object with 4 methods (CloudStream model) |
| Isolation | none (same process) | none (same process) | **one Web Worker per add-on**, host-checked network allow-list |
| Repository | `addons.xml` + md5 + zips | `repo.json` → `plugins.json` | `repo.json` with zips + SHA-256 |
| Settings | `resources/settings.xml` | in-code | `settings[]` in manifest, UI generated |
| HTML parsing | BeautifulSoup etc. | Jsoup | `fanoos.html.select()` (DOMParser on main thread) |
| Platforms | desktop, Android, iOS (sideload) | Android only | Android, iOS, Windows, Linux, macOS, **Tizen, webOS**, browser |

## 4. Why not Python, and why JavaScript

The deciding constraint is **Samsung Tizen and LG webOS**. Their app stores only accept web apps
(HTML, CSS and JS running in the TV's Chromium). There is no Python on them and you cannot ship
native code. **iOS** adds a second rule: App Store guideline 2.5.2 forbids downloading executable
code that changes the app. Scripts run inside WebKit/JavaScriptCore are the tolerated exception.
That is the same reason Kodi is sideload-only on iOS.

| Option | Android | iOS | Windows/Linux | Tizen | webOS | Verdict |
|---|---|---|---|---|---|---|
| Python (embedded CPython) | yes (Kodi does it) | sideload only | yes | **no** | **no** | fails TVs |
| Python via Pyodide (WASM) | yes | yes-ish, ~10 MB | yes | needs WASM: Tizen ≥ 2018 | webOS ≥ 5 | possible add-on runtime later, too heavy as the only one |
| Kotlin/dex | yes | no | no | no | no | Android only |
| Flutter / Qt / .NET MAUI | yes | yes | yes | Flutter-Tizen is community-only | no | fails webOS |
| **JavaScript / TypeScript** | WebView | WKWebView | Electron | **native web app** | **native web app** | **runs everywhere** |

So Fanoos is one TypeScript web app plus thin native shells:

- **Capacitor** for Android and iOS;
- **Electron** for Windows, Linux and macOS;
- the TV's own packager for Tizen (`.wgt`) and webOS (`.ipk`).

Add-ons are plain JavaScript, interpreted by the engine every platform already has.

## 5. Fanoos architecture

```
┌──────────────────────────── UI (src/ui) ────────────────────────────┐
│ Home · Search · Details · Library · Extensions · Settings · Player  │
│ spatial focus navigation (remote/gamepad/keyboard) + touch + mouse  │
└───────────────┬─────────────────────────────────────┬───────────────┘
                │ call('getHome'|'search'|'load'|      │ Player: <video> + hls.js
                │      'loadLinks'|'extract')          │ (native HLS on iOS/Tizen/webOS)
┌───────────────▼──────────── Core (src/core) ─────────▼───────────────┐
│ AddonManager ── installs zips (JSZip), validates manifest, IndexedDB │
│ Repository  ── repo.json, SHA-256 check, update detection          │
│ AddonHost   ── one per add-on: worker RPC, permission-checked HTTP,  │
│                storage/settings scoped to the add-on, html.select    │
│ Library     ── continue watching, favorites                          │
│ Platform    ── the only device-specific code: HTTP bridge, keys, exit│
└───────────────┬──────────────────────────────────────────────────────┘
                │ postMessage
┌───────────────▼──────────── Web Worker (per add-on) ─────────────────┐
│ main.js  →  fanoos.register({ getHome, search, load, loadLinks })    │
│ fetch / XMLHttpRequest / importScripts / WebSocket removed           │
└──────────────────────────────────────────────────────────────────────┘
```

**HTTP without CORS.** Extensions scrape third-party sites, which browsers would normally block.
Each shell routes the request to a native stack:

| Shell | How extension HTTP is sent |
|---|---|
| Electron | main process `net.fetch` (`platforms/electron/main.cjs`) |
| Android / iOS | `CapacitorHttp` |
| Tizen | `<access origin="*">` in `config.xml` |
| webOS | packaged web apps are not CORS-restricted |
| Browser | needs CORS-enabled sources (archive.org works) |

## 6. Security model

- **Workers.** Each add-on runs in a worker, so a crash or an infinite loop cannot freeze the UI.
  Calls time out after 45 s.
- **Network allow-list.** Every HTTP request is checked against `permissions.hosts`. The worker's
  own `fetch`, `XMLHttpRequest`, `importScripts` and `WebSocket` are deleted before add-on code
  runs. This is defence-in-depth, not a hard sandbox: treat add-ons as trusted code from
  repositories you trust, exactly as Kodi and CloudStream do.
- **Repository integrity.** Zips installed from a repository are checked against their SHA-256
  hash. Signed repositories are on the roadmap.

## 7. Roadmap (deliberately not built yet)

- **DASH and DRM.** Add shaka-player; Widevine will only work where the platform's EME allows it.
- **Native players.** An ExoPlayer plugin on Android and AVPlay on Tizen, for formats `<video>`
  can't decode (MKV/HEVC on some devices).
- **Add-on dependencies.** Kodi's `xbmc.python.module` equivalent: shared extractor libraries.
- **Python add-ons.** An optional `"runtime": "python"` running Pyodide inside the worker, where
  WASM exists, plus an `xbmcplugin`-compatible shim to port simple Kodi plugins.
- **More services.** Trakt/AniList sync, a subtitle-provider add-on type, Chromecast, downloads.
