// Fanoos provider: public-domain films from the Internet Archive.
// Written in ES5 so it runs on 2017 TVs without transpiling.
var BASE = 'https://archive.org';
var FILMS = 'collection:(feature_films) AND mediatype:(movies)';
var VIDEO_EXT = /\.(mp4|m4v|webm|ogv)$/i;
var SUB_EXT = /\.(srt|vtt)$/i;

var SECTIONS = [
  ['Most popular', FILMS, 'downloads desc'],
  ['Recently added', FILMS, 'addeddate desc'],
  ['Film noir', FILMS + ' AND subject:(noir)', 'downloads desc'],
  ['Sci-fi & horror', FILMS + ' AND subject:(horror OR "science fiction")', 'downloads desc'],
  ['Comedy', FILMS + ' AND subject:(comedy)', 'downloads desc'],
  ['Classic cartoons', 'collection:(classic_cartoons) AND mediatype:(movies)', 'downloads desc']
];

function first(v) { return Array.isArray(v) ? v[0] : v; }
function img(id) { return BASE + '/services/img/' + encodeURIComponent(id); }

function toItem(d) {
  return { id: d.identifier, title: first(d.title) || d.identifier, poster: img(d.identifier), type: 'movie',
    year: parseInt(first(d.year), 10) || undefined };
}

// Returns { items, more }: `more` is a token for the next page when archive.org has more results.
function advancedSearch(q, rows, sort, page) {
  page = page || 1;
  var url = BASE + '/advancedsearch.php?q=' + encodeURIComponent(q) +
    '&fl[]=identifier&fl[]=title&fl[]=year&rows=' + rows + '&page=' + page + '&output=json&sort[]=' + encodeURIComponent(sort);
  return fanoos.http.get(url).then(function (r) {
    var resp = r.json().response || {};
    var items = (resp.docs || []).map(toItem);
    var more = items.length && page * rows < (resp.numFound || 0) ? JSON.stringify({ q: q, rows: rows, sort: sort, page: page + 1 }) : undefined;
    return { items: items, more: more };
  });
}

function metadata(id) {
  return fanoos.http.get(BASE + '/metadata/' + encodeURIComponent(id)).then(function (r) {
    var j = r.json();
    if (!j || !j.metadata) throw new Error('Item not found: ' + id);
    return j;
  });
}

function stripHtml(s) {
  return String(first(s) || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
}

function fileUrl(id, name) {
  return BASE + '/download/' + encodeURIComponent(id) + '/' + name.split('/').map(encodeURIComponent).join('/');
}

function human(bytes) {
  var n = +bytes, u = ['B', 'KB', 'MB', 'GB'], i = 0;
  if (!n) return '';
  while (n >= 1024 && i < 3) { n /= 1024; i++; }
  return n.toFixed(i ? 1 : 0) + ' ' + u[i];
}

// Archive.org re-encodes uploads into streaming-friendly "derivative" files (H.264 MP4,
// moov atom at the start). Originals are often MPEG-4 Part 2/Xvid or not fast-start, which
// browsers can't play or only start after downloading most of the file. So: derivatives
// with a known web format first, originals last.
function rank(f) {
  var ext = (f.name.match(/\.(\w+)$/) || [])[1].toLowerCase();
  var r = { mp4: 30, m4v: 25, webm: 20, ogv: 10 }[ext] || 0;
  if (/h\.?264|512kb/i.test(f.format || '')) r += 20;
  if (f.source === 'derivative') r += 40;
  return r;
}

function cleanQuery(q) { return String(q).replace(/[+\-&|!(){}\[\]^"~*?:\\\/]/g, ' ').replace(/\s+/g, ' ').trim(); }

fanoos.register({
  getHome: function () {
    return Promise.all(SECTIONS.map(function (s) {
      return advancedSearch(s[1], 24, s[2]).then(
        function (p) { return { title: s[0], items: p.items, more: p.more }; },
        function () { return { title: s[0], items: [] }; });
    })).then(function (secs) { return secs.filter(function (s) { return s.items.length; }); });
  },

  search: function (query) {
    var q = cleanQuery(query);
    if (!q) return Promise.resolve([]);
    return advancedSearch('(' + q + ') AND ' + FILMS, 40, 'downloads desc');
  },

  // Next page of a Home row or of search results (the token came from advancedSearch).
  getMore: function (token) {
    var t = JSON.parse(token);
    return advancedSearch(t.q, t.rows, t.sort, t.page);
  },

  load: function (id) {
    return metadata(id).then(function (j) {
      var m = j.metadata;
      var subjects = m.subject ? (Array.isArray(m.subject) ? m.subject : String(m.subject).split(';')) : [];
      return {
        id: id,
        title: first(m.title) || id,
        poster: img(id),
        type: 'movie',
        year: parseInt(first(m.year) || first(m.date) || '', 10) || undefined,
        plot: stripHtml(m.description),
        tags: subjects.map(function (s) { return String(s).trim(); }).filter(Boolean).slice(0, 6)
      };
    });
  },

  loadLinks: function (id) {
    return metadata(id).then(function (j) {
      var files = j.files || [];
      var links = files.filter(function (f) { return VIDEO_EXT.test(f.name); })
        // equal rank: smaller first, it starts faster
        .sort(function (a, b) { return rank(b) - rank(a) || (+a.size || 0) - (+b.size || 0); })
        .map(function (f) {
          return {
            name: (f.format || 'Video') + (f.size ? ' · ' + human(f.size) : ''),
            url: fileUrl(id, f.name),
            kind: 'file',
            mime: /\.webm$/i.test(f.name) ? 'video/webm' : /\.ogv$/i.test(f.name) ? 'video/ogg' : 'video/mp4',
            quality: f.height ? f.height + 'p' : undefined
          };
        });
      var subtitles = files.filter(function (f) { return SUB_EXT.test(f.name); }).map(function (f) {
        var lang = (f.name.match(/[._-]([a-z]{2,3})\.(srt|vtt)$/i) || [])[1] || 'en';
        return { lang: lang.toLowerCase(), label: f.name, url: fileUrl(id, f.name) };
      });
      return { links: links, subtitles: subtitles };
    });
  }
});
