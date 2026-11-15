/*
 * ============================================================================
 *  Fanoos example addon — read this file top to bottom to learn the API.
 * ============================================================================
 *
 *  An addon is a .zip containing:
 *    manifest.json   who you are, what you may access, which settings you have
 *    main.js         this file
 *    icon.svg/png    optional
 *
 *  Fanoos runs main.js in its own sandbox (a Web Worker). You get ONE global,
 *  `fanoos`, and you call `fanoos.register({...})` once with your functions.
 *  There is no DOM, no window, and no fetch() — use the `fanoos` helpers below.
 *
 *  Fanoos calls your functions when the user does something:
 *
 *    getHome(page)   user opens Home with your addon selected   -> rows
 *    search(query)   user searches                                  -> items
 *    load(id)        user opens a title                             -> details
 *    loadLinks(id)   user presses Play (movie id or episode id)     -> streams
 *    getMore(token)  user reaches "More" at the end of a row        -> next items
 *
 *  Every function may return a value directly or a Promise.
 *  Throwing an Error (or rejecting) shows its message to the user.
 *
 *  Write ES5 (var, function) if you want 2017 Samsung/LG TVs to run it.
 *  Content here: Blender Foundation open movies, Creative Commons licensed.
 */

// ---------------------------------------------------------------------------
// 1. Your catalogue. Real addons usually fetch this from a website/API
//    (see section 5); here it's inline so the example works offline.
// ---------------------------------------------------------------------------
var BASE = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/';

var MOVIES = [
  { id: 'bbb',    title: 'Big Buck Bunny',  year: 2008, file: 'BigBuckBunny.mp4',  image: 'BigBuckBunny.jpg',
    plot: 'A giant rabbit takes revenge on three bullying rodents.', tags: ['Animation', 'Comedy'],
    hls: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
  { id: 'ed',     title: 'Elephants Dream', year: 2006, file: 'ElephantsDream.mp4', image: 'ElephantsDream.jpg',
    plot: 'Two characters explore a strange mechanical world.', tags: ['Animation', 'Sci-fi'] },
  { id: 'sintel', title: 'Sintel',          year: 2010, file: 'Sintel.mp4',         image: 'Sintel.jpg',
    plot: 'A girl searches for the baby dragon she raised.', tags: ['Animation', 'Fantasy'] },
  { id: 'tos',    title: 'Tears of Steel',  year: 2012, file: 'TearsOfSteel.mp4',   image: 'TearsOfSteel.jpg',
    plot: 'Scientists try to save the world in a future Amsterdam.', tags: ['Live action', 'Sci-fi'] }
];

// Extra titles served as the second page of the first row (see getMore below).
var CLIPS = [
  { id: 'blazes',   title: 'For Bigger Blazes',   year: 2013, file: 'ForBiggerBlazes.mp4',   image: 'ForBiggerBlazes.jpg',
    plot: 'A short clip.', tags: ['Short'] },
  { id: 'escapes',  title: 'For Bigger Escapes',  year: 2013, file: 'ForBiggerEscapes.mp4',  image: 'ForBiggerEscapes.jpg',
    plot: 'A short clip.', tags: ['Short'] },
  { id: 'fun',      title: 'For Bigger Fun',      year: 2013, file: 'ForBiggerFun.mp4',      image: 'ForBiggerFun.jpg',
    plot: 'A short clip.', tags: ['Short'] },
  { id: 'joyrides', title: 'For Bigger Joyrides', year: 2013, file: 'ForBiggerJoyrides.mp4', image: 'ForBiggerJoyrides.jpg',
    plot: 'A short clip.', tags: ['Short'] }
];

// A "series" is just an item whose details contain `episodes`.
// Each episode needs its own id; loadLinks() receives that id when it's played.
var SERIES = {
  id: 'shorts', title: 'Blender Shorts (series demo)', year: 2010, image: 'ForBiggerBlazes.jpg',
  plot: 'Short clips grouped as a series, to show seasons and episodes.',
  episodes: [
    { id: 'shorts:1:1', season: 1, episode: 1, title: 'For Bigger Blazes',  file: 'ForBiggerBlazes.mp4' },
    { id: 'shorts:1:2', season: 1, episode: 2, title: 'For Bigger Escapes', file: 'ForBiggerEscapes.mp4' },
    { id: 'shorts:2:1', season: 2, episode: 1, title: 'For Bigger Fun',     file: 'ForBiggerFun.mp4' },
    { id: 'shorts:2:2', season: 2, episode: 2, title: 'For Bigger Joyrides', file: 'ForBiggerJoyrides.mp4' }
  ]
};

// ---------------------------------------------------------------------------
// 2. Small helpers. A "MediaItem" is what a poster card shows:
//    { id, title, poster?, type: 'movie'|'series'|'anime'|'live'|'other', year? }
//    `id` is any string YOU understand — Fanoos hands it back to load() as is.
// ---------------------------------------------------------------------------
function poster(image) { return BASE + 'images/' + image; }

function movieItem(m) { return { id: m.id, title: m.title, poster: poster(m.image), type: 'movie', year: m.year }; }
function seriesItem() { return { id: SERIES.id, title: SERIES.title, poster: poster(SERIES.image), type: 'series', year: SERIES.year }; }

function findMovie(id) {
  var all = MOVIES.concat(CLIPS);
  for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
  return null;
}
function findEpisode(id) {
  for (var i = 0; i < SERIES.episodes.length; i++) if (SERIES.episodes[i].id === id) return SERIES.episodes[i];
  return null;
}

// ---------------------------------------------------------------------------
// 3. Register your functions.
// ---------------------------------------------------------------------------
fanoos.register({

  /*
   * Home screen: return an array of rows { title, items: MediaItem[], more? }.
   * `more` is optional: any string you choose (a page number, a URL, JSON…).
   * When present, Fanoos shows a "More" card at the end of the row and calls
   * getMore(more) when the user reaches it.
   * Settings are read with fanoos.settings.get(id) — they're declared in
   * manifest.json and Fanoos draws the settings form for you.
   */
  getHome: function (page) {
    return fanoos.settings.get('greeting').then(function (greeting) {
      return [
        { title: greeting || 'Blender open movies', items: MOVIES.map(movieItem), more: 'movies:2' },
        { title: 'Series', items: [seriesItem()] }
      ];
    });
  },

  /*
   * Next items of a row: receives the `more` string you returned.
   * Return { items, more? } — give a new `more` for yet another page, or
   * leave it out when there's nothing left (the More card disappears).
   * search() may also return { items, more } instead of a plain array.
   */
  getMore: function (token) {
    if (token === 'movies:2') return { items: CLIPS.map(movieItem) }; // last page: no `more`
    return { items: [] };
  },

  /*
   * Search: return MediaItem[] matching the query.
   * fanoos.storage is a small private key/value store that survives restarts —
   * here we remember the last search just to show how it works.
   */
  search: function (query) {
    var q = String(query).toLowerCase();
    var all = MOVIES.concat(CLIPS).map(movieItem).concat([seriesItem()]);
    return fanoos.storage.set('lastSearch', query).then(function () {
      return all.filter(function (it) { return it.title.toLowerCase().indexOf(q) >= 0; });
    });
  },

  /*
   * Details page: return MediaItem fields plus optional
   *   plot, backdrop, tags[], episodes[{ id, title, season?, episode?, poster? }]
   * If `episodes` is present Fanoos shows seasons and an episode list.
   */
  load: function (id) {
    if (id === SERIES.id) {
      return {
        id: SERIES.id, title: SERIES.title, type: 'series', year: SERIES.year,
        poster: poster(SERIES.image), plot: SERIES.plot, tags: ['Demo'],
        episodes: SERIES.episodes.map(function (e) {
          return { id: e.id, title: e.title, season: e.season, episode: e.episode };
        })
      };
    }
    var m = findMovie(id);
    if (!m) throw new Error('Not found: ' + id); // the message is shown to the user
    return { id: m.id, title: m.title, type: 'movie', year: m.year, poster: poster(m.image),
      backdrop: poster(m.image), plot: m.plot, tags: m.tags };
  },

  /*
   * Play: return { links: StreamLink[], subtitles?: Subtitle[] }.
   *   StreamLink = { name, url, kind, quality?, mime?, headers? }
   *     kind: 'file' (mp4/webm), 'hls' (.m3u8), 'dash' (.mpd),
   *           'youtube' / 'dailymotion' (url = video id, official embed),
   *           'embed' (a hoster page; an installed extractor addon resolves it)
   *     mime: lets Fanoos skip formats the device can't decode, instantly
   *     headers: e.g. { Referer: '...' } for HLS servers that require it
   *   Subtitle = { lang: 'en', label: 'English', url: '.../file.vtt or .srt' }
   * Fanoos tries the links in order and falls back to the next on failure,
   * so put the most reliable one first.
   */
  loadLinks: function (id) {
    var ep = findEpisode(id);
    if (ep) return { links: [{ name: 'MP4', url: BASE + ep.file, kind: 'file', mime: 'video/mp4', quality: '720p' }] };

    var m = findMovie(id);
    if (!m) throw new Error('Not found: ' + id);
    var links = [{ name: 'MP4', url: BASE + m.file, kind: 'file', mime: 'video/mp4', quality: '720p' }];
    return fanoos.settings.get('showHls').then(function (showHls) {
      if (showHls && m.hls) links.push({ name: 'HLS adaptive', url: m.hls, kind: 'hls' });
      return { links: links, subtitles: [] };
    });
  }
});

/* ---------------------------------------------------------------------------
 * 4. Logging: fanoos.log('anything') prints to the developer console
 *    (Android: chrome://inspect, desktop: devtools, Tizen: Tizen Studio).
 *
 * 5. Fetching a real website or API — not used above so the example works
 *    without permissions. First allow the host in manifest.json:
 *        "permissions": { "hosts": ["api.example.com", "*.example-cdn.net"] }
 *    then:
 *
 *    fanoos.http.get('https://api.example.com/list?' + fanoos.util.qs({ page: 1 }))
 *      .then(function (r) {          // r = { status, ok, headers, url, text, json() }
 *        if (!r.ok) throw new Error('HTTP ' + r.status);
 *        return r.json().items;
 *      });
 *
 *    fanoos.http.post(url, { any: 'json' }, { headers: { Referer: '...' } })
 *
 *    Parsing HTML (like Jsoup in CloudStream):
 *    fanoos.html.select(r.text, '.movie a').then(function (els) {
 *      // els = [{ text, html, attrs: { href: '...' } }, ...]
 *    });
 *
 *    Turning a relative link into an absolute one:
 *    fanoos.util.absUrl('/watch/1', 'https://example.com/list')
 *
 * 6. Publishing: put your folder (named exactly like the "id") in /addons,
 *    run `npm run addons`, upload public/repo/ to any static host, then in
 *    Fanoos: Addons → paste https://<host>/repo/repo.json → Add.
 *    Bump "version" in manifest.json and users get an Update button.
 *
 *  Only build addons for content you're allowed to distribute.
 * ------------------------------------------------------------------------- */
