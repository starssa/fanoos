// The code every generated addon runs. content.js serialises these two functions into main.js
// after a `var CONFIG = {...}` block, so a generated addon is plain readable ES5 you can edit.

/** Read one field from a selected node: f.attr is "text", an attribute, or several joined with "|" (first non-empty wins). */
function scraperVal(node, f) {
  if (!node || !f) return '';
  var keys = (f.attr || 'text').split('|');
  // Images: lazy-loading sites put a placeholder in src and the poster in another attribute (data-echo, data-lazy…).
  var image = keys.indexOf('src') >= 0 || keys.indexOf('srcset') >= 0;
  var PLACEHOLDER = /lazy|lzld|placeholder|blank\.|loading|spacer|transparent|pixel\.|^data:/i;
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var v = k === 'text' ? node.text : (node.attrs || {})[k];
    if (v && k === 'style') { var m = /url\(\s*['"]?([^'")]+)/.exec(v); v = m ? m[1] : ''; }
    if (v && k === 'srcset') v = String(v).split(',')[0].trim().split(/\s+/)[0];
    if (v && image && PLACEHOLDER.test(v)) continue;
    if (v && String(v).trim()) return String(v).replace(/\s+/g, ' ').trim();
  }
  if (image) for (var a in node.attrs || {}) {
    var w = String(node.attrs[a] || '').trim();
    if (!/^(src|alt|title|class|style|id|href)$/.test(a) && /^(https?:)?\/\/|^\/[^\/]|\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(w) && !PLACEHOLDER.test(w)) return w.split(/[\s,]/)[0];
  }
  return '';
}

// ---- video sources on a watch page (shared by the generated addon and the scraper's Video step) ----
var SCRAPER_SOURCE_ATTRS = ['data-src', 'data-url', 'data-link', 'data-embed', 'data-embed-url', 'data-video', 'data-video-url', 'data-iframe', 'data-server',
  'data-file', 'data-player', 'data-href', 'data-frame', 'data-source', 'data-stream', 'value'];
var SCRAPER_QUERIES = {
  video: 'video[src], video source[src]',
  iframe: 'iframe[src], iframe[data-src]',
  servers: SCRAPER_SOURCE_ATTRS.slice(0, -1).map(function (a) { return '[' + a + ']'; }).join(', ') + ', option[value]'
};

/**
 * All video sources on a page, without duplicates.
 * nodes: { video, iframe, servers } = arrays of { text, attrs } matched by SCRAPER_QUERIES; html: the page source.
 * Returns [{ name, url, kind }] — kind "hls" / "dash" / "file" (direct video) or "embed" (a player page).
 */
function scraperSources(nodes, html, base, abs) {
  var MEDIA = /(?:https?:)?\/\/[^"'\s<>\\]+?\.(m3u8|mp4|webm|mpd|mkv)(\?[^"'\s<>\\]*)?/gi;
  var SKIP = /\.(jpe?g|png|gif|webp|svg|avif|ico|css|js|json|woff2?)(\?|$)|facebook\.com|twitter\.com|x\.com\/intent|wa\.me|whatsapp|t\.me\/share|telegram\.me|pinterest|instagram|reddit\.com\/submit|mailto:|google\.com\/recaptcha/i;
  var PLAYERISH = /embed|player|stream|video|iframe|server|watch|play|\/e\/|\/v\//i;
  var out = [], seen = {};
  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } }
  function kindOf(u) { return /\.m3u8(\?|$)/i.test(u) ? 'hls' : /\.mpd(\?|$)/i.test(u) ? 'dash' : /\.(mp4|webm|mkv)(\?|$)/i.test(u) ? 'file' : 'embed'; }
  function add(name, u) {
    if (!u || SKIP.test(u)) return;
    var key = u.replace(/^https?:/, '').replace(/#.*$/, ''); // same video over http and https counts once
    if (seen[key]) return;
    seen[key] = 1;
    var kind = kindOf(u);
    out.push({ name: (name ? name + ' · ' : '') + (kind === 'embed' ? host(u) : kind.toUpperCase() + ' · ' + host(u)), url: u, kind: kind });
  }
  // A server attribute may hold a URL, //host/path, an <iframe …> snippet, or base64 of either.
  function toUrl(v) {
    v = String(v || '').trim();
    if (!v) return '';
    var m = /<iframe[^>]+src=["']([^"']+)/i.exec(v);
    if (m) v = m[1];
    if (/^[A-Za-z0-9+\/]{20,}={0,2}$/.test(v)) { try { var d = atob(v); if (/^(https?:)?\/\/|<iframe/i.test(d)) return toUrl(d); } catch (e) { /* not base64 */ } }
    if (/^(https?:)?\/\//i.test(v)) {
      var u = abs(v, base);
      return host(u) === host(base) && !PLAYERISH.test(u.replace(/^https?:\/\/[^\/]+/, '')) ? '' : u; // same-site pages aren't players
    }
    return /^\/[^\/]/.test(v) && PLAYERISH.test(v) ? abs(v, base) : '';
  }
  function label(t) { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length && t.length <= 40 ? t : ''; }

  (nodes.video || []).forEach(function (n) { add('Video', abs(n.attrs.src, base)); });
  // Source cards picked in the scraper: trusted even on the same site; onclick="play('…')" gives its quoted address.
  (nodes.picked || []).forEach(function (n, i) {
    var v = String((n.attrs || {})[nodes.pickedAttr] || ''), q = /['"]([^'"]{4,})['"]/.exec(v);
    if (nodes.pickedAttr === 'onclick') v = q ? q[1] : '';
    var u = toUrl(v) || (/^(https?:)?\/\/|^\/|^\?/.test(v) ? abs(v, base) : '');
    if (u) add(label(n.text) || 'Source ' + (i + 1), u);
  });
  (String(html || '').replace(/\\\//g, '/').match(MEDIA) || []).forEach(function (u) { add('', abs(u, base)); });
  (nodes.iframe || []).forEach(function (n) { var u = toUrl(n.attrs.src || n.attrs['data-src']); if (u) add('Player', u); });
  // Sites built with JavaScript (Next.js, Nuxt, React…) keep their servers as data inside <script> tags;
  // the browser draws the player frames from it later. Read player addresses from that data.
  var PLAYER_PATH = /\/(embed|e|v|f|d|player|iframe|play|watch|stream)(\/|-|_|\.|\?|$)|embed-|player\.php/i;
  var NOT_PLAYER = /youtube|youtu\.be|dailymotion|google|gstatic|apple\.com|schema\.org|w3\.org|cloudflare|jsdelivr|unpkg|jquery|gravatar|wp\.com|wordpress|themoviedb|tmdb\.org|imdb\.com/i;
  var scripts = String(html || '').match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  scripts.forEach(function (s) {
    s = s.replace(/\\u002[fF]/g, '/').replace(/\\u0026/g, '&').replace(/\\+\//g, '/');
    (s.match(/https?:\/\/[^"'\s<>\\`]+/g) || []).forEach(function (u) {
      u = u.replace(/[),;\]}]+$/, '');
      if (host(u) === host(base) || NOT_PLAYER.test(host(u)) || !PLAYER_PATH.test(u.replace(/^https?:\/\/[^\/]+/, ''))) return;
      add('Player', u);
    });
  });
  scraperSwitchers(html, base, abs).forEach(function (x) { add(label(x.name) || x.name, x.url); });
  (nodes.servers || []).forEach(function (n) {
    for (var i = 0; i < SCRAPER_SOURCE_ATTRS.length; i++) {
      var u = toUrl(n.attrs[SCRAPER_SOURCE_ATTRS[i]]);
      if (u) { add(label(n.text), u); break; }
    }
  });
  return out;
}

// Sites built with Inertia.js (Laravel + Vue/React) send their page data as JSON (<script data-page> or data-page="…")
// and load some of it only when asked: the server list of a player like megatuktuk comes from the same address
// requested again with X-Inertia headers naming the wanted data. Returns { url, headers } for that request, or null.
var SCRAPER_INERTIA_PROPS = 'streams,sources,servers,mirrors,links,players,videos,embeds,files,watch,qualities';
function scraperInertia(html, url) {
  var re = /<script\b[^>]*\sdata-page\b[^>]*>\s*(\{[\s\S]*?\})\s*<\/script>|<[a-z]+\b[^>]*\sdata-page="(\{[^"]+\})"/gi, m, page = null;
  while (!page && (m = re.exec(html || ''))) {
    try { page = JSON.parse(m[1] || m[2].replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')); } catch (e) { page = null; }
    if (page && !page.component) page = null;
  }
  if (!page) return null;
  return { url: url, page: page, headers: { 'X-Inertia': 'true', 'X-Inertia-Version': String(page.version || ''), 'X-Inertia-Partial-Component': page.component,
    'X-Inertia-Partial-Data': SCRAPER_INERTIA_PROPS, 'X-Requested-With': 'XMLHttpRequest', Accept: 'text/html, application/xhtml+xml', Referer: url } };
}
// The other sites' players a page wraps in its own <iframe> (a "server" page that only frames the real player).
function scraperFrames(html, base, abs) {
  var host = function (u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  var out = [];
  (String(html || '').match(/<iframe\b[^>]*>/gi) || []).forEach(function (t) {
    var m = /\s(?:data-src|src)=["']([^"']+)["']/i.exec(t);
    if (!m || /^(about:|javascript:|data:)/i.test(m[1])) return;
    var u = abs(m[1].replace(/&amp;/g, '&'), base);
    if (/^https?:/.test(u) && host(u) !== host(base) && out.indexOf(u) < 0 &&
      !/doubleclick|googlesyndication|googletagmanager|facebook|twitter|disqus|recaptcha|histats|crwdcntrl|dtscout|\/ads?\//i.test(u)) out.push(u);
  });
  return out;
}
// Server buttons that reload a page with another server: same address, one query value changed (?serv=2, ?server=3…).
// Each of those pages holds that server's player. Only a server-like value: a key named so (serv, server, player…) or a
// small number (?s=2), never another title's id (?vid=…), an episode or a page; and at least two such buttons.
function scraperSwitchers(html, base, abs) {
  var queryOf = function (u) {
    var i = u.indexOf('?'), o = null;
    if (i < 0) return null;
    u.slice(i + 1).split('#')[0].split('&').forEach(function (kv) { if (!kv) return; var p = kv.split('='); o = o || {}; o[p[0]] = p.slice(1).join('='); });
    return o;
  };
  var q0 = queryOf(base) || {}, out = [], seen = {}; // no query: the servers add one (?serv=2)
  (String(html || '').match(/<a\b[^>]*\shref=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi) || []).forEach(function (a) {
    var u = abs(/\shref=["']([^"']+)/i.exec(a)[1].replace(/&amp;/g, '&'), base), q = queryOf(u);
    if (!q || seen[u] || u.split('?')[0].replace(/\/$/, '') !== base.split(/[?#]/)[0].replace(/\/$/, '')) return;
    var keys = Object.keys(q), diff = keys.filter(function (k) { return q[k] !== q0[k]; });
    if (Object.keys(q0).some(function (k) { return !(k in q); }) || keys.length - Object.keys(q0).length > 1 || diff.length !== 1) return;
    var k = diff[0], v = q[k];
    var serverish = /serv|srv|player|mirror|source|embed|host|link|watch/i.test(k) ||
      (/^\d{1,2}$/.test(v) && !/^(p|pg|page|paged|vid|v|id|ep|episode|e|season|cat|sort|order|lang|year|y)$/i.test(k));
    if (serverish) { seen[u] = 1; out.push({ name: a.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || 'Server ' + v, url: u }); }
  });
  return out.length >= 2 ? out : [];
}
// Player addresses in page data: every object with a link/url/embed field, named by its server name and the quality around it.
function scraperDataLinks(data, base, abs) {
  var out = [], seen = {}, FIELDS = ['link', 'url', 'embed', 'embed_url', 'embedUrl', 'iframe', 'player', 'file', 'src', 'stream'];
  function walk(o, quality, depth) {
    if (!o || typeof o !== 'object' || depth > 8) return;
    if (Array.isArray(o)) { o.forEach(function (x) { walk(x, quality, depth + 1); }); return; }
    var q = o.label || o.quality || o.resolution || quality;
    for (var i = 0; i < FIELDS.length; i++) {
      var v = o[FIELDS[i]];
      if (typeof v === 'string' && /^(https?:)?\/\/[^\/]+\/./.test(v)) {
        var u = abs(v.indexOf('//') === 0 ? 'https:' + v : v, base);
        if (!seen[u] && !/\.(jpe?g|png|gif|webp|svg|css|js)(\?|$)/i.test(u)) {
          seen[u] = 1;
          var name = o.symbol || o.server || o.name || o.title || o.driver || o.host || '';
          out.push({ name: [typeof name === 'string' ? name : '', typeof q === 'string' && q !== name ? q : ''].filter(Boolean).join(' '), url: u });
        }
        break;
      }
    }
    for (var k in o) if (o[k] && typeof o[k] === 'object') walk(o[k], q, depth + 1);
  }
  walk(data, '', 0);
  return out;
}

// Player pages often write the video address inside a "packed" script: eval(function(p,a,c,k,e,d){…}('…',a,c,'…'.split('|'))).
function scraperUnpack(html) {
  var out = '', re = /\}\s*\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/g, m;
  var DIGITS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  while ((m = re.exec(String(html || '')))) {
    var a = +m[2], k = m[4].split('|');
    if (a < 2 || a > 62) continue;
    out += '\n' + m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\').replace(/\b\w+\b/g, function (w) {
      var n = 0;
      for (var i = 0; i < w.length; i++) { var d = DIGITS.indexOf(w.charAt(i)); if (d < 0 || d >= a) return w; n = n * a + d; }
      return k[n] || w;
    });
  }
  return out;
}
// The direct video files (m3u8/mp4/…) inside a player page.
function scraperDirect(html, base, abs) {
  return scraperSources({}, String(html || '') + scraperUnpack(html), base, abs).filter(function (l) { return l.kind !== 'embed'; });
}
var SCRAPER_OFFICIAL = /youtube(-nocookie)?\.com\/(embed|watch)|youtu\.be\/|dailymotion\.com\/(embed|video|player)/i;
// Links that may lead to the movie's watch page, best first: text like Watch/Play/مشاهدة, or a /watch/, /play/…
// address; links that carry this page's own slug or number come first (not another movie's Play button).
function scraperWatchLinks(anchors, base, abs) {
  var words = /(^|[^a-z])(watch|play|stream|servers?|voir|regarder|izle)([^a-z]|$)|مشاهدة|شاهد|سيرفر|تشغيل/i;
  var mine = (base.replace(/[?#].*$/, '').replace(/^https?:\/\/[^\/]+/, '').split('/').filter(function (x) { return x.length >= 3; }).pop() || '').toLowerCase();
  var num = (/\d{2,}/.exec(mine) || [''])[0];
  var out = [];
  for (var i = 0; i < anchors.length; i++) {
    var t = anchors[i].attrs || {}, href = t.href || '', u = href && abs(href, base);
    if (!href || href.charAt(0) === '#' || /^javascript:/i.test(href) || u.replace(/#.*/, '') === base.replace(/#.*/, '') || out.some(function (x) { return x.u === u; })) continue;
    var path = u.replace(/^https?:\/\/[^\/]+/, '');
    var score = (words.test(String(anchors[i].text || '').slice(0, 60) + ' ' + (t.title || '') + ' ' + (t['class'] || '')) ? 2 : 0) +
      (/\/(watch|play|stream|servers?|embed)([\/\-_.?]|$)/i.test(path) ? 2 : 0);
    if (!score) continue;
    if ((mine && path.toLowerCase().indexOf(mine) >= 0) || (num && path.indexOf(num) >= 0)) score += 3;
    out.push({ u: u, s: score, i: i });
  }
  out.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
  return out.slice(0, 4).map(function (x) { return x.u; });
}
// From one example (details page → watch page with the green sources) make a rule for every title:
// the part of the details address found again in the watch address becomes {n} (path segment n) or {n#} (its number).
function scraperWatchPattern(details, watch) {
  var d = details.replace(/[?#].*$/, '').replace(/^https?:\/\/[^\/]+/, '').split('/').filter(Boolean), best = null;
  for (var i = 0; i < d.length; i++) {
    var seg = decodeURIComponent(d[i]), n = (/\d{2,}/.exec(seg) || [''])[0];
    var cand = watch.indexOf(d[i]) >= 0 && d[i].length >= 2 ? { tok: d[i], ref: '{' + i + '}', s: (/[\d-]/.test(seg) ? 100 : 0) + seg.length }
      : n && watch.indexOf(n) >= 0 ? { tok: n, ref: '{' + i + '#}', s: 50 + n.length } : null;
    if (cand && (!best || cand.s > best.s)) best = cand;
  }
  return best ? watch.split(best.tok).join(best.ref) : '';
}
function scraperApplyPattern(pattern, id) {
  var d = id.replace(/[?#].*$/, '').replace(/^https?:\/\/[^\/]+/, '').split('/').filter(Boolean), ok = true;
  var u = pattern.replace(/\{(\d+)(#?)\}/g, function (m, i, num) {
    var seg = d[+i];
    if (seg && num) seg = (/\d{2,}/.exec(seg) || [''])[0];
    if (!seg) ok = false;
    return seg || '';
  });
  return ok ? u : '';
}

// Pagination learned from one "next page" link: where the page number goes, for every row.
// { query: "page" } (…?page=2) or { suffix: "/page/{page}/" } (…/page/2/).
function scraperPagerRule(a, b) {
  var A = new URL(a), B = new URL(b), found = null;
  B.searchParams.forEach(function (v, k) { if (!found && /^\d+$/.test(v) && A.searchParams.get(k) !== v) found = { query: k }; });
  if (found) return found;
  var m = /^(.*?)(\d+)(\D*)$/.exec(B.pathname);
  if (!m) return null;
  var before = m[1], tries = [];
  var cut = before.lastIndexOf('/', before.length - 2);
  if (before.charAt(before.length - 1) === '/' && cut >= 0) tries.push(before.slice(cut) + '{page}' + m[3]); // /page/{page}/
  tries.push(before.slice(before.lastIndexOf('/')) + '{page}' + m[3]);                                       // /{page}/, /p-{page}
  for (var i = 0; i < tries.length; i++) {
    var rule = { suffix: tries[i] };
    if (scraperPagerApply(a, rule) === scraperPagerApply(b, rule)) return rule; // both are the same list
  }
  return { suffix: tries[tries.length - 1] };
}
function scraperPagerApply(url, rule) {
  if (!rule || url.indexOf('{page}') >= 0) return url;
  var U = new URL(url.replace('{query}', '__Q__'));
  var out;
  if (rule.query) { U.searchParams.set(rule.query, '__P__'); out = U.href; }
  else {
    var esc = rule.suffix.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&').replace('\\{page\\}', '\\d+');
    var path = U.pathname.replace(new RegExp(esc + '$'), '').replace(/\/$/, '');
    out = U.origin + path + rule.suffix + U.search + U.hash;
  }
  return out.replace('__P__', '{page}').replace('__Q__', '{query}');
}

function scraperEngine() {
  var C = CONFIG;

  function abs(u, base) { try { return fanoos.util.absUrl(u, base || C.site); } catch (e) { return u; } }
  function get(url) {
    return fanoos.http.get(url, { headers: { Referer: C.site } }).then(function (r) {
      if (/<title>\s*(Just a moment|Attention Required|DDoS-Guard|Please wait)/i.test(r.text))
        throw new Error('The site answered with a bot check instead of the page (' + url + ')');
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      return r.text;
    }, function (e) {
      var cors = /fetch|network/i.test(e.message);
      throw new Error('Could not download ' + url + ': ' + e.message +
        (cors ? ' (a browser blocks reading other sites — CORS. The Fanoos apps are not affected. To test in the Studio, install the Fanoos Scraper extension and, in Firefox, click its button → "Allow access to all websites")' : ''));
    });
  }
  // subs: fields read inside each match in the same call (Fanoos 0.2.32+ fills node.sub; older apps ignore it).
  // "A || B": the first selector that finds something (works in every browser, unlike :has(), which old TV boxes lack).
  function select(html, s, subs) {
    if (!s) return Promise.resolve([]);
    if (subs && subs.some(function (x) { return x.indexOf('||') >= 0; })) subs = null; // read those fields one by one
    if (s.indexOf('||') >= 0) {
      var alts = s.split(/\s*\|\|\s*/).filter(Boolean);
      var next = function (i) {
        return i >= alts.length ? Promise.resolve([]) : select(html, alts[i], subs).then(function (n) { return n.length ? n : next(i + 1); }, function () { return next(i + 1); });
      };
      return next(0);
    }
    return subs ? fanoos.html.select(html, s, subs) : fanoos.html.select(html, s);
  }
  function subsOf(fields) { return fields.map(function (f) { return (f && f.sel) || ''; }); }
  // f.and: more parts read the same way and joined with a space ("h3 · text & span.year · text" in the scraper).
  // A part with "text" is that text, put in exactly as written (no space added around it): & " (" & … & ")".
  function joined(first, f, read) {
    if (!f.and || !f.and.length) return first;
    var parts = [f].concat(f.and);
    return Promise.all([first].concat(f.and.map(function (g) { return g.text != null ? Promise.resolve(g.text) : read(g); }))).then(function (v) {
      var out = '', glue = false;
      v.forEach(function (x, i) {
        if (parts[i].text != null) { out += x; glue = true; return; }
        if (!x) return;
        out += (out && !glue ? ' ' : '') + x; glue = false;
      });
      return out.trim();
    });
  }
  function firstVal(html, f) {
    if (!f) return Promise.resolve('');
    var one = function (g) { return g && g.sel ? select(html, g.sel).then(function (n) { return scraperVal(n[0], g); }) : Promise.resolve(''); };
    return joined(f.text != null ? Promise.resolve(f.text) : one(f), f, one);
  }
  // A field inside a list item; sel "" means the item element itself.
  function field(item, f, k) {
    if (!f) return Promise.resolve('');
    var one = function (g) {
      if (!g.sel) return Promise.resolve(scraperVal(item, g));
      return select(item.html, g.sel).then(function (n) { return scraperVal(n[0], g); });
    };
    var first = f.text != null ? Promise.resolve(f.text) : !f.sel ? Promise.resolve(scraperVal(item, f))
      : k != null && item.sub && item.sub.length > k ? Promise.resolve(scraperVal(item.sub[k], f)) : one(f);
    return joined(first, f, one);
  }

  // strict: a Home row's first page must have cards; say why when it doesn't.
  function list(url, rules, strict, onHtml) {
    return get(url).then(function (html) {
      if (onHtml) onHtml(html);
      return select(html, rules.item, subsOf([rules.title, rules.link, rules.poster])).then(function (items) {
        if (strict && !items.length) {
          throw new Error('Downloaded ' + url + ' but no cards match "' + rules.item + '". ' +
            (/<a\s[^>]*href/i.test(html) && html.length > 5000
              ? 'The cards may be built by JavaScript or use different classes in the raw page: re-pick the card in the scraper, or edit CONFIG.list.item.'
              : 'The page is almost empty: this site builds its pages with JavaScript, which addons cannot run.'));
        }
        return Promise.all(items.map(function (it) {
          return Promise.all([field(it, rules.title, 0), field(it, rules.link, 1), field(it, rules.poster, 2)]).then(function (v) {
            if (!v[1]) return null;
            return { id: abs(v[1], url), title: v[0] || v[1], poster: v[2] ? abs(v[2], url) : undefined, type: C.type || 'movie' };
          });
        }));
      });
    }).then(function (xs) {
      var seen = {};
      return xs.filter(function (x) { if (!x || seen[x.id]) return false; seen[x.id] = 1; return true; });
    });
  }

  // {page} in a URL = paging; the token remembers the first id so a site that ignores the page number can't loop forever.
  // page1: the address of page 1 as the site links it (often without a number). More only while the page links to the next one.
  // A row's own cards (row.list) or, by default, the addon's (C.list, those of the first row); its tabs use the row's.
  // r.cardsOf: the address of another row whose cards it shares.
  function rulesOf(ri, depth) {
    var r = ri != null && C.rows && C.rows[ri];
    if (r && r.list) return r.list;
    if (r && r.cardsOf && (depth || 0) < 4) {
      for (var j = 0; j < C.rows.length; j++) if (j !== ri && C.rows[j].url === r.cardsOf) return rulesOf(j, (depth || 0) + 1);
    }
    return C.list;
  }
  function pageTpl(url, rules) { var R = (rules || C.list).pager; return url.indexOf('{page}') >= 0 || !R ? url : scraperPagerApply(url, R); }
  function norm(u) { return String(u).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''); }
  function pageOf(u, rules) {
    var R = (rules || C.list).pager, U;
    if (!R) return 0;
    try { U = new URL(u); } catch (e) { return 0; }
    if (R.query) return parseInt(U.searchParams.get(R.query), 10) || 0;
    var re = R.suffix.replace(/\/$/, '').replace(/[.*+?^$()|[\]\\{}]/g, '\\$&').replace('\\{page\\}', '(\\d+)');
    var m = new RegExp(re + '\\/?$').exec(U.pathname);
    return m ? parseInt(m[1], 10) : 0;
  }
  function paged(tpl, n, q, kind, prevFirst, page1, ri) {
    var rules = kind === 's' && C.search && C.search.item ? C.search : rulesOf(ri);
    var enc = encodeURIComponent(q || '');
    var url = (n === 1 && page1 ? page1 : tpl.replace('{page}', n)).replace('{query}', enc);
    var html = '';
    return list(url, rules, kind === 'l' && n === 1, function (h) { html = h; }).then(function (items) {
      if (prevFirst && items.length && items[0].id === prevFirst) items = [];
      if (!items.length || tpl.indexOf('{page}') < 0) return { items: items };
      var next = norm(abs(tpl.replace('{page}', n + 1).replace('{query}', enc), url));
      return select(html, 'a[href]').then(function (as) {
        // The page numbers this page links to, read the way the pager rule writes them (whatever else the link holds).
        var nums = as.map(function (a) {
          var u = abs((a.attrs || {}).href || '', url);
          return norm(u) === next ? n + 1 : pageOf(u, rules);
        }).filter(function (x) { return x > 0; });
        // More only when there is a next page: a link to it, or (pager built by JavaScript) its address written in the page.
        var rel = next.replace(/^https?:\/\/[^\/]+/, ''), tail = rel.replace(/^.*\//, '/');
        var more = nums.indexOf(n + 1) >= 0 || (!nums.length && (html.indexOf(rel) >= 0 || (tail.length > 3 && html.indexOf(tail) >= 0)));
        return { items: items, more: more ? JSON.stringify({ t: tpl, n: n + 1, q: q || '', k: kind, f: items[0].id, r: ri }) : undefined };
      });
    });
  }

  // ---- series: episodes, optionally grouped by season ----
  // Inside a season's tab panel the panel itself is gone, so "div.tab-pane > ul > li" must
  // become "ul > li": drop leading steps until the selector matches.
  function selectWithin(html, sel, subs) {
    if (sel.indexOf('||') >= 0) { // each alternative in turn
      var alts = sel.split(/\s*\|\|\s*/).filter(Boolean);
      var tryAlt = function (i) { return i >= alts.length ? Promise.resolve([]) : selectWithin(html, alts[i], subs).then(function (n) { return n.length ? n : tryAlt(i + 1); }); };
      return tryAlt(0);
    }
    var parts = sel.split(' > ');
    function attempt(i) {
      return select(html, parts.slice(i).join(' > '), subs).then(function (n) { return n.length || i >= parts.length - 1 ? n : attempt(i + 1); });
    }
    return attempt(0);
  }

  // inPanel: html is one season's tab panel, where the leading selector steps may be gone. On a whole page the
  // selector must match as picked, or a movie page would turn any list into "episodes".
  // The episode number written in its title ("الحلقة 10", "Episode 3", "E05"), else its place in the list.
  // Many sites list the newest episode first, so the place alone would make the latest one "episode 1".
  function epNumber(title) {
    var m = /(?:الحلقة|حلقة|episode|épisode|ep\.?|e)\s*(\d+)/i.exec(title || '') || /(\d+)(?!.*\d)/.exec(title || '');
    return m ? parseInt(m[1], 10) : 0;
  }
  function episodesIn(html, base, season, inPanel, seasonName) {
    var E = C.details.episodes;
    return (inPanel ? selectWithin(html, E.item, subsOf([E.title, E.link])) : select(html, E.item, subsOf([E.title, E.link]))).then(function (items) {
      return Promise.all(items.map(function (it, i) {
        return Promise.all([field(it, E.title, 0), field(it, E.link, 1)]).then(function (e) {
          return e[1] ? { id: abs(e[1], base), title: e[0] || 'Episode ' + (i + 1), season: season, seasonName: seasonName || undefined, n: epNumber(e[0]), i: i } : null;
        });
      }));
    }).then(function (xs) {
      xs = xs.filter(Boolean);
      var nums = xs.map(function (x) { return x.n; });
      var usable = nums.every(function (n, k) { return n > 0 && nums.indexOf(n) === k; }); // all found, none twice
      // Numbers seen twice with no seasons picked: the list holds several seasons one after another
      // (22…1 then 21…1). Each run of numbers is a season; the newest is the one listed first when the list goes down.
      if (!usable && season == null && xs.length > 2 && nums.every(function (n) { return n > 0; })) {
        var down = nums[0] > nums[1], runs = [[xs[0]]];
        for (var k = 1; k < xs.length; k++) {
          if (down ? nums[k] > nums[k - 1] : nums[k] < nums[k - 1]) runs.push([]);
          runs[runs.length - 1].push(xs[k]);
        }
        var clean = runs.length > 1 && runs.every(function (r) { return r.every(function (x, j) { return r.map(function (y) { return y.n; }).indexOf(x.n) === j; }); });
        if (clean) {
          runs.forEach(function (r, ri) { r.forEach(function (x) { x.season = down ? runs.length - ri : ri + 1; }); });
          usable = true;
        }
      }
      xs.forEach(function (x) { x.episode = usable ? x.n : x.i + 1; delete x.n; delete x.i; });
      return xs.sort(function (a, b) { return ((a.season || 0) - (b.season || 0)) || a.episode - b.episode; });
    });
  }

  // A season is a link to its own page, a tab whose panel (href="#id", data-target, aria-controls…)
  // holds its episodes, or an <option> whose value is the season page.
  // A season loaded by a request the scraper watched (S.load): its {data-…} filled with this season's attributes.
  function loadSeason(it, S, base) {
    var L = S.load;
    return (L.sel ? select(it.html, L.sel).then(function (n) { return n[0] || it; }) : Promise.resolve(it)).then(function (n) {
      var a = n.attrs || {}, put = function (t, enc) { return String(t || '').replace(/\{(data-[^}]+)\}/g, function (m, k) { return a[k] == null ? '' : enc ? encodeURIComponent(a[k]) : a[k]; }); };
      var headers = { 'X-Requested-With': 'XMLHttpRequest', Referer: base };
      if (L.type) headers['Content-Type'] = L.type;
      return fanoos.http.request({ url: abs(put(L.url, true), base), method: L.method || 'GET', headers: headers,
        body: L.method && L.method !== 'GET' ? put(L.body, /urlencoded/i.test(L.type || '') || /^[^{\[]*=/.test(L.body || '')) : undefined });
    }).then(function (r) {
      var t = r.text || '';
      try { var j = JSON.parse(t); if (j && typeof j === 'object') t = j.html || j.data || j.content || (j.data && j.data.html) || t; } catch (e) { /* html */ }
      return String(t);
    });
  }
  function seasonEpisodes(html, base) {
    var S = C.details.seasons;
    return select(html, S.item).then(function (items) {
      return Promise.all(items.slice(0, 40).map(function (it, i) {
        return Promise.all([field(it, S.title), field(it, S.link), field(it, S.panel)]).then(function (v) {
          var num = parseInt((/\d+/.exec(v[0]) || [])[0], 10) || i + 1;
          if (S.load) return loadSeason(it, S, base).then(function (h) { return episodesIn(h, base, num, true, v[0]); }, function () { return []; });
          var target = v[1] || v[2];
          if (target && !/^(#|javascript:)/i.test(target)) {
            var url = abs(target, base);
            if (url.split('#')[0] !== base.split('#')[0]) return get(url).then(function (h) { return episodesIn(h, url, num, false, v[0]); }, function () { return []; });
          }
          // The panel's id, or the one a click handler names: onclick="openCity(event, 'Season2')".
          var q = /['"]([^'"]+)['"][^'"]*$/.exec(String((it.attrs || {}).onclick || ''));
          var panel = String(v[2] || v[1] || (q && q[1]) || '').replace(/^#/, '');
          // No panel named: the i-th panel (the episodes selector's first step, e.g. div.tabcontent) if there is one per season.
          var byPlace = function () {
            var box = C.details.episodes.item.split(' > ')[0];
            return box === C.details.episodes.item ? [] : select(html, box).then(function (ps) {
              return ps.length === Math.min(items.length, 40) && ps[i] ? episodesIn(ps[i].html, base, num, true, v[0]) : [];
            });
          };
          if (!panel) return byPlace();
          return select(html, '[id="' + panel.replace(/["\\]/g, '\\$&') + '"]').then(function (p) { return p[0] ? episodesIn(p[0].html, base, num, true, v[0]) : byPlace(); });
        });
      }));
    }).then(function (lists) { return [].concat.apply([], lists); });
  }

  // A show's page is often one episode's page: "مسلسل MobLand الموسم الثاني الحلقة 6 مترجمة" → "MobLand".
  function showTitle(t) {
    var m = /\s(?:الموسم|موسم|الحلقة|حلقة|season|saison|episode|épisode|ep\.?\s*\d|s\d+\s*e\d+)/i.exec(t);
    var s = (m && m.index > 0 ? t.slice(0, m.index) : t).replace(/^(?:مسلسل|برنامج|انمي|أنمي)\s+/, '').trim();
    return s || t;
  }

  function episodes(html, base) {
    var D = C.details || {};
    if (!D.episodes) return Promise.resolve([]);
    if (!D.seasons) return episodesIn(html, base, undefined);
    // Seasons that can't be followed (e.g. loaded by JavaScript): fall back to the episodes on the page.
    return seasonEpisodes(html, base).then(function (eps) { return eps.length ? eps : episodesIn(html, base, undefined); });
  }


  fanoos.register({
    getHome: function () {
      var errors = [];
      return Promise.all(C.rows.map(function (r, ri) {
        var R = rulesOf(ri);
        // Sub-menu tabs: Fanoos loads a tab with getMore(its token), page 1 of that tab's address.
        var tabs = (r.tabs || []).map(function (t) { return { title: t.title, more: JSON.stringify({ t: pageTpl(t.url, R), n: 1, q: '', k: 'l', p: t.url, r: ri }) }; });
        return paged(pageTpl(r.url, R), 1, '', 'l', undefined, r.url.indexOf('{page}') < 0 ? r.url : '', ri).then(function (p) { return { title: r.title, items: p.items, more: p.more, tabs: tabs.length ? tabs : undefined, first: r.first }; },
          function (e) { errors.push(r.title + ': ' + e.message); fanoos.log(r.title + ': ' + e.message); return null; });
      })).then(function (rows) {
        rows = rows.filter(function (r) { return r && r.items.length; });
        if (!rows.length && errors.length) throw new Error(errors.join('\n')); // show why instead of an empty Home
        return rows;
      });
    },

    search: function (q) {
      if (!C.search || !C.search.url) throw new Error('Search is not set up for this addon');
      return paged(pageTpl(C.search.url), 1, q, 's', undefined, C.search.url.indexOf('{page}') < 0 ? C.search.url : '');
    },

    getMore: function (token) {
      var t = JSON.parse(token);
      return paged(t.t, t.n, t.q, t.k, t.f, t.p, t.r);
    },

    load: function (id) {
      var D = C.details || {};
      return get(id).then(function (html) {
        return Promise.all([
          firstVal(html, D.title), firstVal(html, D.plot), firstVal(html, D.poster),
          firstVal(html, { sel: 'meta[property="og:title"]', attr: 'content' }),
          firstVal(html, { sel: 'meta[property="og:image"]', attr: 'content' }),
          firstVal(html, { sel: 'meta[name="description"]', attr: 'content' }),
          firstVal(html, { sel: 'title', attr: 'text' }),
          episodes(html, id)
        ]).then(function (v) {
          return Promise.resolve(v[7]).then(function (eps) {
            var poster = v[2] || v[4];
            return {
              id: id, title: eps.filter(Boolean).length ? showTitle(v[0] || v[3] || v[6] || id) : v[0] || v[3] || v[6] || id, type: eps.filter(Boolean).length && (C.type || 'movie') === 'movie' ? 'series' : C.type || 'movie', // a page with episodes is a show
              poster: poster ? abs(poster, id) : undefined, plot: v[1] || v[5] || undefined,
              episodes: eps.filter(Boolean).length ? eps.filter(Boolean) : undefined
            };
          });
        });
      });
    },

    // Direct video first (<video>, <source>, media URLs anywhere in the page), then embedded players.
    // Every source on the watch page: direct videos first, then players and server buttons. May be none.
    // All sources, best first: video files, then players with a video file inside (green in the scraper), then the rest. If the title page has none, its watch page is tried: the address learned in the
    // scraper's Video step, the picked Watch button, then the likeliest watch links.
    loadLinks: function (id) {
      var L = C.links || {};
      function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } }
      function sourcesOf(url, html) {
        return Promise.all([select(html, L.video || SCRAPER_QUERIES.video), select(html, L.iframe || SCRAPER_QUERIES.iframe),
          select(html, L.servers || SCRAPER_QUERIES.servers), select(html, L.source && L.source.sel)]).then(function (r) {
          return scraperSources({ video: r[0], iframe: r[1], servers: r[2], picked: r[3], pickedAttr: L.source && L.source.attr }, html, url, abs);
        });
      }
      var tried = [];
      // Servers an Inertia page loads later (see scraperInertia), as players.
      function inertiaLinks(url, html) {
        var I = scraperInertia(html, url);
        if (!I) return Promise.resolve([]);
        return fanoos.http.get(url, { headers: I.headers }).then(function (r) {
          var j; try { j = JSON.parse(r.text); } catch (e) { return []; }
          return scraperDataLinks(j && j.props, url, abs).filter(function (l) { return l.url.split('#')[0] !== url.split('#')[0]; })
            .map(function (l) { return { name: (l.name || host(l.url)) + ' · ' + host(l.url), url: l.url, kind: /\.m3u8(\?|$)/i.test(l.url) ? 'hls' : /\.(mp4|webm|mkv)(\?|$)/i.test(l.url) ? 'file' : 'embed', headers: { Referer: url } }; });
        }, function () { return []; });
      }
      function playable(url, html) {
        return Promise.all([sourcesOf(url, html), inertiaLinks(url, html)]).then(function (both) {
          var links = both[0].concat(both[1].filter(function (x) { return !both[0].some(function (y) { return y.url === x.url; }); }));
          var players = links.filter(function (l) { return l.kind === 'embed' && !SCRAPER_OFFICIAL.test(l.url); }).slice(0, 40); // all of them, like the scraper's Video step
          tried.push(url + ': ' + links.length + ' source(s), ' + players.length + ' other-site player(s)');
          return Promise.all(players.map(function (l) {
            // Green = a video file is inside. The player itself is kept: hosts only serve that file to their own player.
            // The file found inside a player is offered first: the Fanoos apps play it with that player as Referer
            // (no host page, no ads). The player itself stays listed after it.
            return fanoos.http.get(l.url, { headers: { Referer: url } }).then(function (r) {
              var direct = scraperDirect(r.text, l.url, abs).map(function (d) {
                return { name: l.name.split(' · ')[0] + ' → ' + d.kind.toUpperCase() + ' · ' + host(d.url), url: d.url, kind: d.kind, headers: { Referer: l.url }, from: l.url };
              });
              // A player that is itself a list of servers (megatuktuk…) or a page wrapping another site's player: those, as more players.
              return inertiaLinks(l.url, r.text).then(function (more) {
                if (!direct.length) scraperFrames(r.text, l.url, abs).forEach(function (u) {
                  more.push({ name: l.name.split(' · ')[0] + ' · ' + host(u), url: u, kind: 'embed', headers: { Referer: l.url } });
                });
                // Its own server buttons (albaplayer's ?serv=1…6): each button's page frames that server's player.
                var sw = direct.length ? [] : scraperSwitchers(r.text, l.url, abs).filter(function (x) { return x.url !== l.url; }).slice(0, 12);
                return Promise.all(sw.map(function (x) {
                  return fanoos.http.get(x.url, { headers: { Referer: l.url } }).then(function (r2) {
                    var d2 = scraperDirect(r2.text, x.url, abs);
                    if (d2.length) return d2.map(function (d) { return { name: x.name + ' → ' + d.kind.toUpperCase(), url: d.url, kind: d.kind, headers: { Referer: x.url } }; });
                    return scraperFrames(r2.text, x.url, abs).slice(0, 1).map(function (u) { return { name: x.name + ' · ' + host(u), url: u, kind: 'embed', headers: { Referer: x.url } }; });
                  }, function () { return []; });
                })).then(function (lists) {
                  // The player's own frame is one of its servers: keep the named copy.
                  var named = [].concat.apply([], lists), urls = named.map(function (m) { return m.url; });
                  more = more.filter(function (m) { return urls.indexOf(m.url) < 0; }).concat(named);
                  more.forEach(function (m) { m.from = l.url; m.server = true; });
                  return direct.concat(more);
                });
              });
            }, function (e) { fanoos.log('Could not open player ' + l.url + ': ' + (e && e.message)); return []; });
          })).then(function (found) {
            var all = [].concat.apply([], found), seen = {}, wrappers = {};
            all.forEach(function (f) { if (f.server && f.from) wrappers[f.from] = 1; }); // players whose real players were found inside
            links.forEach(function (l) { seen[l.url] = 1; });
            var servers = all.filter(function (f) { return f.server; });
            var files = all.filter(function (f) { return !f.server; }), green = files.map(function (f) { return f.from; });
            var clean = function (f) { if (seen[f.url]) return false; seen[f.url] = 1; delete f.from; delete f.server; return true; };
            files = files.filter(clean);
            // A server already listed as a plain player (the frame shown first): give that one the server's name.
            servers = servers.filter(function (f) {
              if (!seen[f.url]) return clean(f);
              links.forEach(function (l) { if (l.url === f.url && /^(Player|Video|Stream)\b/.test(l.name)) l.name = f.name; });
              return false;
            });
            // Best first: video files on the page, files found inside players, players with a file inside (green),
            // the servers listed inside a player, the others.
            var rank = function (l) { return l.kind !== 'embed' ? 0 : green.indexOf(l.url) >= 0 || SCRAPER_OFFICIAL.test(l.url) ? 2 : 3; };
            var embeds = links.filter(function (l) { return l.kind === 'embed'; }).sort(function (a, b) { return rank(a) - rank(b); });
            var good = embeds.filter(function (l) { return rank(l) < 3; });
            var rest = embeds.filter(function (l) { return rank(l) >= 3; });
            // Pages that only frame another player (server buttons' pages) last: the players inside them come first.
            rest = rest.filter(function (l) { return !wrappers[l.url]; }).concat(rest.filter(function (l) { return wrappers[l.url]; }));
            return links.filter(function (l) { return l.kind !== 'embed'; }).concat(files, good, servers, rest);
          });
        });
      }
      function candidates(html) {
        var list = [];
        if (L.pattern) list.push(scraperApplyPattern(L.pattern, id));
        var W = (C.details || {}).watch;
        return (W ? firstVal(html, W) : Promise.resolve('')).then(function (w) {
          w = watchUrl(w);
          if (w) list.push(abs(w, id));
          return select(html, 'a[href]');
        }).then(function (as) {
          return list.concat(scraperWatchLinks(as, id, abs)).filter(function (u, i, all) { return u && u !== id && all.indexOf(u) === i; });
        });
      }
      // The picked Watch link: an address (href, data-…, or quoted in onclick="go('…')").
      function watchUrl(v) {
        v = String(v || '').trim();
        if (/^(https?:)?\/\/|^\/|^\?|^[\w-]+\.(php|html?)/i.test(v)) return v;
        var m = /['"]((?:https?:)?\/\/[^'"]+|\/[^'"\s]+)['"]/.exec(v);
        return m ? m[1] : '';
      }
      return get(id).then(function (html) {
        // A Watch link was picked: its page is scanned for sources too, its sources first.
        var W = (C.details || {}).watch;
        var watched = (W ? firstVal(html, W) : Promise.resolve('')).then(function (w) {
          w = watchUrl(w) && abs(watchUrl(w), id);
          if (!w || w.split('#')[0] === id.split('#')[0]) return [];
          fanoos.log('Scanning the watch link ' + w);
          return get(w).then(function (h2) { return playable(w, h2); }, function (e) { tried.push(w + ': ' + e.message); return []; });
        });
        return Promise.all([watched, playable(id, html)]).then(function (both) {
          var seen = {};
          return both[0].concat(both[1]).filter(function (l) { if (seen[l.url]) return false; seen[l.url] = 1; return true; });
        }).then(function (kept) {
          if (kept.some(function (l) { return !SCRAPER_OFFICIAL.test(l.url); })) return kept; // done (YouTube alone may be a trailer)
          return candidates(html).then(function (list) {
            function next(i) {
              if (i >= list.length) return kept;
              fanoos.log('Trying the watch page ' + list[i]);
              return get(list[i]).then(function (h2) { return playable(list[i], h2); }, function (e) { tried.push(list[i] + ': ' + e.message); return []; })
                .then(function (k) { return k.length ? k : next(i + 1); });
            }
            return next(0);
          });
        });
      }).then(function (links) {
        if (!links.length) fanoos.log('No sources found. Pages read: ' + tried.join(' | ') +
          '. Tip: in the scraper, open the movie page, click through to the page that plays it, and run step 3 Video there: the addon learns that address.');
        return { links: links };
      });
    }
  });
}
