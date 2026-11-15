// Fanoos provider: Dailymotion via its public Data API (no key) and official embed player.
var API = 'https://api.dailymotion.com/';
var LIST_FIELDS = 'id,title,thumbnail_480_url,created_time';

function setting(id) { return fanoos.settings.get(id); }
function yearOf(unix) { return unix ? new Date(unix * 1000).getFullYear() : undefined; }
function toItem(v) { return { id: v.id, title: v.title, poster: v.thumbnail_480_url, type: 'other', year: yearOf(v.created_time) }; }
function label(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function get(path, params) {
  return fanoos.http.get(API + path + '?' + fanoos.util.qs(params)).then(function (r) {
    var j = r.json();
    if (j.error) throw new Error('Dailymotion: ' + (j.error.message || j.error.code));
    return j;
  });
}

// Returns { items, more }: `more` re-runs the same query on the next page when Dailymotion says has_more.
function videos(params, path) {
  return setting('family').then(function (family) {
    params.fields = LIST_FIELDS;
    params.family_filter = family === false ? 'false' : 'true';
    params.page = params.page || 1;
    return get(path || 'videos', params).then(function (j) {
      var next = {}; for (var k in params) next[k] = params[k];
      next.page = params.page + 1;
      return { items: (j.list || []).map(toItem), more: j.has_more ? JSON.stringify({ path: path || 'videos', params: next }) : undefined };
    });
  });
}

function row(title, params, path) {
  return videos(params, path).then(function (p) { return { title: title, items: p.items, more: p.more }; }, function () { return null; });
}

// Accepts usernames or links like https://www.dailymotion.com/<user> (video links are ignored).
function parseCreators(list) {
  var out = [];
  String(list).split(/[\s,]+/).forEach(function (t) {
    var m = /dailymotion\.com\/([\w.\-]+)\/?$/i.exec(t) || /^([\w.\-]+)$/.exec(t);
    if (m && m[1] !== 'video' && out.indexOf(m[1]) < 0) out.push(m[1]);
  });
  return out;
}

// One row per creator, titled with their display name.
function creatorRow(user) {
  var u = encodeURIComponent(user);
  return Promise.all([
    get('user/' + u, { fields: 'screenname' }).then(function (j) { return j.screenname || user; }, function () { return user; }),
    row('', { sort: 'recent', limit: 24 }, 'user/' + u + '/videos')
  ]).then(function (r) { return r[1] && { title: r[0], items: r[1].items, more: r[1].more }; });
}

fanoos.register({
  getHome: function () {
    return Promise.all([setting('channels'), setting('country'), setting('creators')]).then(function (s) {
      var trending = { sort: 'trending', limit: 24 };
      var country = String(s[1] || '').trim();
      if (/^[a-z]{2}$/i.test(country)) trending.country = country.toLowerCase();
      var channels = String(s[0] || '').split(/[\s,]+/).filter(function (c) { return /^[a-z]+$/.test(c); });
      return Promise.all([row('Trending', trending)]
        .concat(parseCreators(s[2] || '').map(creatorRow))
        .concat(channels.map(function (c) { return row(label(c), { channel: c, sort: 'trending', limit: 24 }); })));
    }).then(function (rows) { return rows.filter(function (r) { return r && r.items.length; }); });
  },

  search: function (q) {
    return videos({ search: q, sort: 'relevance', limit: 30 });
  },

  getMore: function (token) {
    var t = JSON.parse(token);
    return videos(t.params, t.path);
  },

  load: function (id) {
    return get('video/' + encodeURIComponent(id), { fields: 'id,title,description,thumbnail_720_url,created_time,duration,owner.screenname,channel' })
      .then(function (v) {
        return { id: v.id, title: v.title, poster: v.thumbnail_720_url, backdrop: v.thumbnail_720_url, type: 'other',
          year: yearOf(v.created_time), plot: v.description, tags: [v['owner.screenname'], v.channel].filter(Boolean) };
      });
  },

  loadLinks: function (id) {
    return get('video/' + encodeURIComponent(id), { fields: 'allow_embed' }).then(function (v) {
      if (v.allow_embed === false) throw new Error('The owner does not allow this video to be played in other apps');
      return setting('playerId').then(function (playerId) {
        playerId = String(playerId || '').trim();
        return { links: [{ name: 'Dailymotion', url: id, kind: 'dailymotion', player: playerId || undefined }] };
      });
    });
  },

  _parseCreators: parseCreators // exposed for tests
});
