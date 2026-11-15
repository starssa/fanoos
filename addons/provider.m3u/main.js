// Fanoos provider: channels from a user-supplied M3U playlist (set in Addons → Settings).
var cache = null;

function attr(line, name) {
  var m = new RegExp(name + '="([^"]*)"').exec(line);
  return m ? m[1] : undefined;
}

function parseM3U(text) {
  var lines = String(text).split(/\r?\n/), out = [], cur = null;
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i].trim();
    if (!l) continue;
    if (l.indexOf('#EXTINF') === 0) {
      cur = { name: l.substring(l.lastIndexOf(',') + 1).trim(), logo: attr(l, 'tvg-logo'), group: attr(l, 'group-title') || 'Channels' };
    } else if (l.charAt(0) !== '#') {
      var e = cur || { name: l, group: 'Channels' };
      e.url = l;
      out.push(e);
      cur = null;
    }
  }
  return out;
}

function channels() {
  return fanoos.settings.get('playlist').then(function (url) {
    if (!url) return [];
    if (cache && cache.url === url) return cache.items;
    return fanoos.http.get(url).then(function (r) {
      if (!r.ok) throw new Error('Playlist HTTP ' + r.status);
      cache = { url: url, items: parseM3U(r.text) };
      return cache.items;
    });
  });
}

function item(c, i) { return { id: 'ch:' + i, title: c.name, poster: c.logo, type: 'live' }; }
function byId(id) {
  return channels().then(function (list) {
    var c = list[+String(id).split(':')[1]];
    if (!c) throw new Error('Channel not found');
    return c;
  });
}
function kindOf(url) { return /\.m3u8(\?|$)/i.test(url) ? 'hls' : /\.mpd(\?|$)/i.test(url) ? 'dash' : 'file'; }

fanoos.register({
  getHome: function () {
    return channels().then(function (list) {
      var groups = {}, order = [];
      list.forEach(function (c, i) {
        if (!groups[c.group]) { groups[c.group] = []; order.push(c.group); }
        groups[c.group].push(item(c, i));
      });
      return order.map(function (g) { return { title: g, items: groups[g] }; });
    });
  },
  search: function (q) {
    q = String(q).toLowerCase();
    return channels().then(function (list) {
      return list.map(item).filter(function (it) { return it.title.toLowerCase().indexOf(q) >= 0; });
    });
  },
  load: function (id) {
    return byId(id).then(function (c) { return { id: id, title: c.name, poster: c.logo, type: 'live', plot: c.group }; });
  },
  loadLinks: function (id) {
    return byId(id).then(function (c) { return { links: [{ name: c.name, url: c.url, kind: kindOf(c.url) }] }; });
  },
  _parse: parseM3U // exposed for tests
});
