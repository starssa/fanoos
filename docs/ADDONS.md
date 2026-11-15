# Writing Fanoos addons

An addon is a zip file containing:

```
provider.example/         ← optional top folder (Kodi style); flat zips also work
  manifest.json
  main.js
  icon.png                ← optional
```

## manifest.json

```json
{
  "id": "provider.example",
  "name": "Example",
  "version": "1.0.0",
  "apiVersion": 1,
  "type": "provider",
  "main": "main.js",
  "description": "Shown in the Addons screen",
  "icon": "icon.png",
  "tvTypes": ["movie", "series"],
  "permissions": { "hosts": ["example.com", "*.example-cdn.net"] },
  "settings": [
    { "id": "quality", "label": "Preferred quality", "type": "select", "options": ["1080p", "720p"], "default": "1080p" },
    { "id": "apiKey", "label": "API key", "type": "text" },
    { "id": "adult", "label": "Show adult titles", "type": "bool", "default": false }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Lowercase, dotted (`provider.x`, `extractor.y`). The folder name in `/addons` must match. |
| `version` | yes | Semver. Repositories update installs when it increases. |
| `apiVersion` | | Host API level. Fanoos refuses addons that need a newer one. |
| `type` | yes | `provider` (content) or `extractor` (turns embed URLs into streams). |
| `domains` | extractors | Hostnames it handles, e.g. `["*.somehost.com"]`. |
| `permissions.hosts` | for HTTP | Every request is checked against this. Use `["*"]` only for user-supplied URLs. |
| `settings` | | Rendered automatically under Addons → Settings. |

## The `fanoos` API (available in main.js)

| Call | Returns | Notes |
|---|---|---|
| `fanoos.register(impl)` | | Call once with your implementation. |
| `fanoos.http.get(url, {headers})` | `Promise<Res>` | No CORS limits inside the apps. |
| `fanoos.http.post(url, body, {headers})` | `Promise<Res>` | Objects are sent as JSON. |
| `fanoos.http.request({url, method, headers, body})` | `Promise<Res>` | |
| `fanoos.html.select(html, cssSelector)` | `Promise<[{text, html, attrs}]>` | Jsoup equivalent. |
| `fanoos.settings.get(id)` | `Promise<value>` | The user's value or the manifest default. |
| `fanoos.storage.get(key)` / `set(key, value)` | `Promise` | Private to your addon, persisted. |
| `fanoos.log(...)` | | Goes to the developer console. |
| `fanoos.util.absUrl(rel, base)`, `fanoos.util.qs(obj)` | `string` | Helpers. |

`Res` is `{ status, ok, headers, url, text, json() }`.

## Provider methods

All methods may return a value or a Promise.

```js
fanoos.register({
  // Home rows
  getHome: function (page) {
    return [{ title: 'Popular', items: [/* MediaItem */] }];
  },

  // Search results
  search: function (query) {
    return [/* MediaItem */];
  },

  // Details page: add `episodes` for series
  load: function (id) {
    return {
      id, title, poster, backdrop, plot, year, tags, type: 'series',
      episodes: [{ id: 'ep-1', title: 'Pilot', season: 1, episode: 1 }],
    };
  },

  // Links for a movie id or an episode id
  loadLinks: function (id) {
    return {
      links: [
        { name: 'Server 1', url: 'https://…/master.m3u8', kind: 'hls', quality: '1080p', headers: { Referer: 'https://…' } },
        { name: 'Mirror', url: 'https://somehost.com/embed/abc', kind: 'embed' },
      ],
      subtitles: [{ lang: 'en', label: 'English', url: 'https://…/en.srt' }],
    };
  },
});
```

The fields are:

- **`MediaItem`**: `{ id, title, poster?, type: 'movie'|'series'|'anime'|'live'|'other', year? }`.
  `id` is any string your addon understands; Fanoos hands it back to `load()` unchanged.
- **`kind`**: `hls`, `dash`, `file` (mp4/webm), `embed` or `youtube`.
  - `embed`: the address of an embedded player page (an iframe's `src`). Fanoos plays it like this:
    1. YouTube and Dailymotion embeds play in their official players;
    2. otherwise, an installed extractor addon whose `domains` match turns it into direct videos;
    3. otherwise, the player page itself is shown in a locked-down frame (no pop-ups, can't
       leave Fanoos). TV remotes can only close it.
  - `youtube`: `url` is an 11-character video id, played in YouTube's official embedded player.
  - `web`: an embedded player page to show as-is (what `embed` falls back to).
  - `dailymotion`: `url` is a Dailymotion video id (`x…`), played in Dailymotion's official embed.
    That embed has no remote-control API, so on TVs only Return (close) works.
- **`mime`** (optional, e.g. `video/webm`): lets the player skip, instantly, files the device
  can't decode, instead of waiting for them to fail.
- **Subtitles**: `.srt` files are converted to WebVTT automatically.

## Paging: "More" at the end of a row

A Home row may include a `more` value, which can be any string you choose: a page number, a URL,
or some JSON. Fanoos then shows a **More** card at the end of that row. When the user reaches it,
Fanoos calls `getMore(more)`:

```js
getHome: function () {
  return [{ title: 'Popular', items: firstPage, more: 'popular:2' }];
},
getMore: function (token) {          // token = the `more` you returned
  var page = +token.split(':')[1];
  return fetchPage(page).then(function (items) {
    return { items: items, more: items.length ? 'popular:' + (page + 1) : undefined };
  });
},
```

- Return a new `more` to offer yet another page.
- Leave `more` out on the last page, and the More card disappears.
- `search(query)` may also return `{ items, more }` instead of a plain array; its result row pages
  the same way.

On a TV, moving onto More loads it automatically and focus lands on the first new poster.

## Extractor methods

```js
fanoos.register({
  extract: function (embedUrl) {
    return { links: [{ name: 'HD', url: '…', kind: 'hls' }] };
  },
});
```

## Compatibility rules

- **Use ES5 or ES2015 syntax** if you want 2017-era Samsung and LG TVs. For example, avoid
  optional chaining (`?.`) and `async`/`await`, or bundle your code with esbuild
  `--target=es2015`.
- **There is no DOM and no `fetch` in the worker.** Use `fanoos.http` and `fanoos.html`.

## Publishing a repository (repo.json)

1. Put your addon folders in `/addons` (folder name = id).
2. Run `npm run addons`. It writes zips, icons and `repo.json` (with SHA-256 hashes) into
   `public/repo/`.
3. Upload that folder to any static host (GitHub Pages, Netlify, an S3 bucket).
4. In the app: Addons → paste `https://you.github.io/repo/repo.json` → Add.

`repo.json` format:

```json
{
  "name": "My Repo",
  "apiVersion": 1,
  "addons": [
    {
      "id": "provider.example",
      "name": "Example",
      "version": "1.0.0",
      "type": "provider",
      "description": "…",
      "icon": "provider.example.png",
      "url": "provider.example-1.0.0.zip",
      "sha256": "…"
    }
  ]
}
```

URLs may be relative to `repo.json`.

## Testing

`npm test` runs `tools/test-addons.mjs`, which loads each sample addon against a mocked
`fanoos` API. Copy the pattern for your own addon.
