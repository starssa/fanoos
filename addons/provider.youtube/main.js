// Fanoos provider: YouTube through official, ToS-compliant endpoints only.
//  - Home without a key: public channel RSS feeds (youtube.com/feeds/videos.xml)
//  - Details without a key: oEmbed
//  - Trending / search / rich details: YouTube Data API v3 with the user's own key
//  - Playback: returns kind "youtube"; Fanoos plays it in YouTube's embedded player.
var API = 'https://www.googleapis.com/youtube/v3/';

function setting(id) { return fanoos.settings.get(id).then(function (v) { return String(v || '').trim(); }); }
function thumb(id) { return 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'; }
function item(id, title, year) { return { id: id, title: title, poster: thumb(id), type: 'other', year: year }; }
function yearOf(iso) { return parseInt(String(iso || '').slice(0, 4), 10) || undefined; }

function decode(s) {
  return String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Atom feed → { title, items }. Regex is enough for this fixed, machine-generated format.
function parseFeed(xml) {
  var feedTitle = (/<title>([^<]*)<\/title>/.exec(xml) || [])[1] || 'Channel';
  var items = [], re = /<entry>([\s\S]*?)<\/entry>/g, m;
  while ((m = re.exec(xml))) {
    var e = m[1];
    var id = (/<yt:videoId>([^<]+)<\/yt:videoId>/.exec(e) || [])[1];
    var title = (/<title>([^<]*)<\/title>/.exec(e) || [])[1];
    if (id) items.push(item(id, decode(title || id), yearOf((/<published>([^<]+)</.exec(e) || [])[1])));
  }
  return { title: decode(feedTitle), items: items };
}

function api(path, params, key) {
  params.key = key;
  return fanoos.http.get(API + path + '?' + fanoos.util.qs(params)).then(function (r) {
    var j = r.json();
    if (j.error) throw new Error('YouTube API: ' + (j.error.message || j.error.code));
    if (!j.items) j.items = [];
    return j;
  });
}

// Accepts what people paste: UC… ids, any URL containing /channel/UC…, @handles or youtube.com/@handle links.
function parseChannels(list) {
  var out = [];
  String(list).split(/[\s,]+/).forEach(function (t) {
    var id = /(UC[\w-]{22})/.exec(t), handle = /(?:^|\/)(@[\w.\-]{3,})/.exec(t);
    if (id) out.push({ id: id[1] }); else if (handle) out.push({ handle: handle[1] });
  });
  return out;
}

// @handle → channel id needs the Data API; cached so it costs one lookup per handle, ever.
function resolveChannel(c, key) {
  if (c.id) return Promise.resolve(c.id);
  if (!key) return Promise.resolve(null);
  return fanoos.storage.get('handle:' + c.handle).then(function (cached) {
    if (cached) return cached;
    return api('channels', { part: 'id', forHandle: c.handle }, key).then(function (j) {
      var id = j.items.length ? j.items[0].id : null;
      return id ? fanoos.storage.set('handle:' + c.handle, id).then(function () { return id; }) : null;
    }, function () { return null; });
  });
}

// One page of Trending ('trending') or Search ('search') → { items, more }; more = next page token + same query.
function listPage(kind, params) {
  return setting('apiKey').then(function (key) {
    return api(kind === 'search' ? 'search' : 'videos', params, key).then(function (j) {
      var items = j.items.map(function (v) {
        return item(kind === 'search' ? v.id.videoId : v.id, decode(v.snippet.title), yearOf(v.snippet.publishedAt));
      });
      var next = {}; for (var k in params) if (k !== 'key') next[k] = params[k];
      next.pageToken = j.nextPageToken;
      return { items: items, more: j.nextPageToken ? JSON.stringify({ kind: kind, params: next }) : undefined };
    });
  });
}

function channelRows() {
  return Promise.all([setting('channels'), setting('apiKey')]).then(function (s) {
    return Promise.all(parseChannels(s[0]).map(function (c) { return resolveChannel(c, s[1]); }));
  }).then(function (ids) {
    return Promise.all(ids.filter(Boolean).map(function (cid) {
      return fanoos.http.get('https://www.youtube.com/feeds/videos.xml?channel_id=' + cid).then(
        function (r) { return r.ok ? parseFeed(r.text) : null; },
        function () { return null; });
    }));
  }).then(function (rows) { return rows.filter(function (r) { return r && r.items.length; }); });
}

fanoos.register({
  getHome: function () {
    return Promise.all([setting('apiKey'), setting('region')]).then(function (s) {
      var key = s[0], region = s[1] || 'US';
      var trending = key
        ? listPage('trending', { part: 'snippet', chart: 'mostPopular', regionCode: region, maxResults: 24 }).then(function (p) {
            return { title: 'Trending', items: p.items, more: p.more };
          })
        : Promise.resolve(null);
      return Promise.all([trending, channelRows()]).then(function (r) {
        return (r[0] && r[0].items.length ? [r[0]] : []).concat(r[1]);
      });
    });
  },

  search: function (q) {
    return setting('apiKey').then(function (key) {
      if (!key) throw new Error('Add a YouTube API key in Addons → YouTube → Settings to search');
      return listPage('search', { part: 'snippet', type: 'video', maxResults: 30, q: q });
    });
  },

  load: function (id) {
    return setting('apiKey').then(function (key) {
      if (key) {
        return api('videos', { part: 'snippet', id: id }, key).then(function (j) {
          if (!j.items.length) throw new Error('Video not found');
          var s = j.items[0].snippet;
          return { id: id, title: s.title, poster: thumb(id), backdrop: 'https://i.ytimg.com/vi/' + id + '/maxresdefault.jpg',
            type: 'other', year: yearOf(s.publishedAt), plot: s.description, tags: [s.channelTitle].concat((s.tags || []).slice(0, 5)) };
        });
      }
      var url = 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id);
      return fanoos.http.get(url).then(function (r) {
        if (!r.ok) throw new Error('Video unavailable (HTTP ' + r.status + ')');
        var o = r.json();
        return { id: id, title: o.title, poster: thumb(id), type: 'other', tags: [o.author_name] };
      });
    });
  },

  getMore: function (token) {
    var t = JSON.parse(token);
    return listPage(t.kind, t.params);
  },

  loadLinks: function (id) {
    return { links: [{ name: 'YouTube', url: id, kind: 'youtube' }] };
  },

  _parseFeed: parseFeed, // exposed for tests
  _parseChannels: parseChannels
});
