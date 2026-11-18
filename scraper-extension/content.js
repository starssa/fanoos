// Fanoos Scraper: in-page panel. Click things on a site, get a Fanoos addon.
// Injected by popup.js together with jszip.min.js and template.js.
(function () {
  'use strict';
  if (window.__fanoosScraper) { window.__fanoosScraper.show(); return; }

  var ext = (typeof browser !== 'undefined' && browser.storage) ? browser : (typeof chrome !== 'undefined' && chrome.storage ? chrome : null);
  var KEY = 'fanoosScraperProject';

  // ---------- storage (extension storage; localStorage when run outside the extension, e.g. tests) ----------
  function load() {
    if (ext) return Promise.resolve(ext.storage.local.get(KEY)).then(function (r) { return r && r[KEY]; });
    try { return Promise.resolve(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return Promise.resolve(null); }
  }
  function save() {
    var o = {}; o[KEY] = S;
    if (ext) return Promise.resolve(ext.storage.local.set(o));
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
    return Promise.resolve();
  }

  function siteName() {
    var m = document.querySelector('meta[property="og:site_name"]');
    return (m && m.content.trim()) || location.hostname.replace(/^www\./, '');
  }
  function fresh() {
    var site = location.origin + '/';
    return {
      site: site, name: siteName(), type: 'movie', tab: 'list',
      rows: [], list: null, search: null, details: {}, links: {},
    };
  }

  // ---------- selectors ----------
  var BAD_CLASS = /^(active|selected|hover|focus|focused|show|shown|open|lazy|lazyload|lazyloaded|loaded|current|visible|in|fade|swiper-slide-active)$/i;
  function goodClass(c) {
    return c && c.length < 40 && !BAD_CLASS.test(c) && !/\d{3,}/.test(c) && !/^(css|sc|jsx|svelte|ng|_)-?/.test(c) && !/^[a-z]{1,3}-[A-Za-z0-9_-]{5,}$/.test(c);
  }
  function sig(el) {
    var s = el.tagName.toLowerCase();
    var cls = Array.prototype.filter.call(el.classList || [], goodClass).slice(0, 2);
    return s + cls.map(function (c) { return '.' + CSS.escape(c); }).join('');
  }
  function siblingsLike(el) {
    var s = sig(el);
    return el.parentElement ? Array.prototype.filter.call(el.parentElement.children, function (c) { return sig(c) === s; }) : [el];
  }
  /** The repeated element (card) containing el: first ancestor whose parent holds ≥3 look-alikes. */
  function findItem(el, min) {
    for (var n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (siblingsLike(n).length >= (min || 3)) return n;
    }
    return null;
  }
  // Selectors may hold "A || B" (the first that finds something), as in the addon.
  function qsa(sel, root) {
    root = root || document;
    var alts = String(sel).split(/\s*\|\|\s*/).filter(Boolean);
    for (var i = 0; i < alts.length; i++) {
      try { var n = root.querySelectorAll(alts[i]); if (n.length || i === alts.length - 1) return Array.prototype.slice.call(n); } catch (e) { /* next */ }
    }
    return [];
  }
  function qs(sel, root) { return qsa(sel, root)[0] || null; }
  function count(sel) { return qsa(sel).length; }
  /** Selector for all cards of this list, narrowed by the parent when the same card markup appears elsewhere. */
  // loose: never anchor on the parent's id (episode lists repeated per season tab must all match).
  function itemSelector(item, loose) {
    var s = sig(item), n = siblingsLike(item).length, p = item.parentElement;
    if (count(s) <= n) return s;
    var ps = !loose && p.id && !/\d{3,}/.test(p.id) ? '#' + CSS.escape(p.id) : sig(p);
    var s2 = ps + ' > ' + s;
    if (count(s2) <= n || !p.parentElement) return s2;
    return sig(p.parentElement) + ' > ' + s2;
  }
  /** Selector from inside `root` to `el` ("" = root itself). Short when unique, else a > chain. */
  function relSelector(root, el) {
    if (el === root) return '';
    var s = sig(el);
    if (root.querySelector(s) === el) return s;
    var parts = [];
    for (var n = el; n && n !== root; n = n.parentElement) {
      var st = sig(n);
      if (siblingsLike(n).length > 1) {
        var sameTag = Array.prototype.filter.call(n.parentElement.children, function (c) { return c.tagName === n.tagName; });
        st += ':nth-of-type(' + (sameTag.indexOf(n) + 1) + ')';
      }
      parts.unshift(st);
    }
    return parts.join(' > ');
  }
  /** Selector matching exactly this one element in the page: grows upward until unique (an id ends it early). */
  function pageSelector(el) {
    var parts = [];
    for (var n = el; n && n !== document.documentElement; n = n.parentElement) {
      if (n.id && !/\d{3,}/.test(n.id)) { parts.unshift('#' + CSS.escape(n.id)); }
      else {
        var st = sig(n);
        if (siblingsLike(n).length > 1) {
          var sameTag = Array.prototype.filter.call(n.parentElement.children, function (c) { return c.tagName === n.tagName; });
          st += ':nth-of-type(' + (sameTag.indexOf(n) + 1) + ')';
        }
        parts.unshift(st);
      }
      var s = parts.join(' > ');
      if (count(s) === 1 && document.querySelector(s) === el) return s;
    }
    return parts.join(' > ');
  }

  // ---------- reading values exactly like the generated addon does ----------
  function nodeOf(el) {
    if (!el) return null;
    var attrs = {};
    Array.prototype.forEach.call(el.attributes, function (a) { attrs[a.name] = a.value; });
    return { text: (el.textContent || '').trim(), html: el.innerHTML, attrs: attrs };
  }
  function within(root, f) { return !f ? null : f.sel ? qs(f.sel, root) : root; }
  function readField(root, f) {
    if (!f) return '';
    return glueParts([f].concat(f.and || []), function (g) { return scraperVal(nodeOf(within(root, g)), g); });
  }
  // Parts' values joined by a space; a "text" part is put in exactly as written (same rule as the addon's joined()).
  function glueParts(parts, read) {
    var out = '', glue = false;
    parts.forEach(function (g) {
      if (g.text != null) { out += g.text; glue = true; return; }
      var x = read(g);
      if (!x) return;
      out += (out && !glue ? ' ' : '') + x; glue = false;
    });
    return out.trim();
  }

  function imageAttr(el) {
    if (el.tagName === 'IMG') return 'data-src|data-lazy-src|data-original|src|srcset';
    if (el.tagName === 'SOURCE') return 'srcset|src';
    return 'style'; // background-image: url(...)
  }
  function guessTitle(item) {
    var h = item.querySelector('h1,h2,h3,h4,h5,h6,[class*="title" i],[class*="name" i]');
    if (h && h.textContent.trim()) return { sel: relSelector(item, h), attr: 'text' };
    var t = item.matches('[title]') ? item : item.querySelector('[title]');
    if (t) return { sel: relSelector(item, t), attr: 'title' };
    var img = item.querySelector('img[alt]');
    if (img && img.alt.trim()) return { sel: relSelector(item, img), attr: 'alt' };
    var a = item.matches('a') ? item : item.querySelector('a');
    return a ? { sel: relSelector(item, a), attr: 'text' } : { sel: '', attr: 'text' };
  }
  // The card's own link: of all its links, the one that differs from card to card (a "category" or "quality" button
  // inside every card leads to the same page, and the addon would see one title instead of a row).
  function realHref(a) { var h = a && a.getAttribute('href'); return h && !/^(#|javascript:)/i.test(h) ? absUrl(h, location.href) : ''; }
  function guessLink(item) {
    var cards = siblingsLike(item);
    var options = (item.matches('a[href]') ? [item] : []).concat(Array.prototype.slice.call(item.querySelectorAll('a[href]')));
    var best = null, bestCount = -1;
    options.forEach(function (a) {
      var sel = a === item ? '' : relSelector(item, a), seen = {}, count = 0;
      cards.forEach(function (c) {
        var u = realHref(sel ? c.querySelector(sel) : c);
        if (u && !seen[u]) { seen[u] = 1; count++; }
      });
      if (count > bestCount) { best = sel; bestCount = count; }
    });
    return best === null ? null : { sel: best, attr: 'href' };
  }
  /** How many cards have a link of their own (different from the others). */
  function distinctLinks(items, f) {
    var seen = {}, n = 0;
    items.forEach(function (c) { var v = readField(c, f); if (v && !/^(#|javascript:)/i.test(v) && !seen[v]) { seen[v] = 1; n++; } });
    return n;
  }
  function guessPoster(item) {
    var img = item.querySelector('img');
    if (img) return { sel: relSelector(item, img), attr: imageAttr(img) };
    var bg = item.matches('[style*="url("]') ? item : item.querySelector('[style*="url("]');
    return bg ? { sel: relSelector(item, bg), attr: 'style' } : null;
  }

  // ---------- picking ----------
  var host, root, hover, marks, picking = null;
  function inPanel(e) { return e.composedPath && e.composedPath().indexOf(host) >= 0; }
  function box(el, cls) {
    var r = el.getBoundingClientRect(), b = document.createElement('div');
    b.className = cls;
    b.style.cssText = 'left:' + (r.left + scrollX) + 'px;top:' + (r.top + scrollY) + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
    return b;
  }
  function showMarks(els) {
    marks.innerHTML = '';
    Array.prototype.slice.call(els, 0, 300).forEach(function (el) { marks.appendChild(box(el, 'mark')); });
  }
  // Outline what a selector picks on the page (orange) while the pointer is over its row in the panel.
  function restoreMarks() { if (cardMarks()) showMarks(listItems()); else marks.innerHTML = ''; }
  function matches(sel, scope) {
    try {
      if (!scope) return sel ? qsa(sel) : [];
      return qsa(scope).map(function (it) { return sel ? qs(sel, it) : it; }).filter(Boolean);
    } catch (e) { return []; }
  }
  function showOn(row, get) {
    row.addEventListener('mouseenter', function () {
      if (picking) return;
      var els = get();
      marks.innerHTML = '';
      els.slice(0, 300).forEach(function (n) { marks.appendChild(box(n, 'mark hl')); });
      if (els[0] && els[0].scrollIntoView) { var r = els[0].getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) els[0].scrollIntoView({ block: 'center' }); }
    });
    row.addEventListener('mouseleave', function () { if (!picking) restoreMarks(); });
    return row;
  }
  // The elements of the page that hold this address (a player frame, a server button…).
  function holdersOf(url) {
    var out = [], all = document.body.getElementsByTagName('*');
    for (var i = 0; i < all.length && i < 20000 && out.length < 20; i++) {
      var n = all[i];
      if (host && (n === host || host.contains(n))) continue;
      for (var j = 0; j < n.attributes.length; j++) {
        var v = n.attributes[j].value;
        if (v && v.length > 6 && (v === url || absUrl(v.replace(/&amp;/g, '&'), location.href) === url || (n.attributes[j].name === 'onclick' && v.indexOf(url) >= 0))) { out.push(n); break; }
      }
    }
    return out;
  }
  function badSel(v) {
    var alts = String(v || '').split(/\s*\|\|\s*/).filter(Boolean);
    for (var i = 0; i < alts.length; i++) { try { document.createDocumentFragment().querySelector(alts[i]); } catch (e) { return alts[i]; } }
    return '';
  }
  // :has() works here but not in older TV boxes (Android WebView before 105): Fanoos would find nothing there.
  function hasWarn(v) {
    if (/:has\(/.test(v)) status('⚠ :has() does not work on older TV boxes. Use "A || B" instead: the first selector that finds something, e.g. #episodes-tab article.postEp || article.postEp', 'bad');
  }
  // An editable selector: "selector · attribute" for a field, or a bare selector (items).
  function selInput(value, onSave, withAttr) {
    var inp = el('input', { class: 'selin', value: value, spellcheck: 'false',
      title: withAttr ? 'selector · attribute — join several with " & " (their texts are put together); attributes with | mean "or" (Enter to save)' : 'CSS selector (Enter to save)' });
    inp.setAttribute('dir', 'ltr');
    inp.addEventListener('change', function () {
      var v = inp.value.trim();
      if (!withAttr) {
        var bad = badSel(v);
        if (bad) { inp.value = value; return status('Not a valid CSS selector: ' + bad, 'bad'); }
        onSave(v); return hasWarn(v);
      }
      // Split on " & " outside quotes; "…" or '…' is a text part.
      var raw = [], cur = '', quote = '';
      for (var c = 0; c < v.length; c++) {
        var ch = v.charAt(c);
        if (quote) { cur += ch; if (ch === quote) quote = ''; continue; }
        if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
        if (ch === '&' && /\s$/.test(cur) && /\s/.test(v.charAt(c + 1))) { raw.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      raw.push(cur.trim());
      var parts = raw.filter(function (p) { return p !== ''; }).map(function (p) {
        var lit = /^"((?:[^"\\]|\\.)*)"$/.exec(p) || /^'([^']*)'$/.exec(p);
        if (lit) return { text: lit[1].replace(/\\(.)/g, '$1') };
        var i = p.lastIndexOf(' · '), sel = i >= 0 ? p.slice(0, i).trim() : p.trim(), attr = i >= 0 ? p.slice(i + 3).trim() : null;
        if (sel === '(card)' || sel === '(the card itself)') sel = '';
        return { sel: sel, attr: attr };
      });
      for (var j = 0; j < parts.length; j++) {
        var b = parts[j].text == null && badSel(parts[j].sel);
        if (b) { inp.value = value; return status('Not a valid CSS selector: ' + b, 'bad'); }
      }
      onSave(parts);
      parts.forEach(function (x) { if (x.sel) hasWarn(x.sel); });
    });
    return inp;
  }
  function onMove(e) {
    if (!picking || inPanel(e)) { hover.style.display = 'none'; return; }
    var r = e.target.getBoundingClientRect();
    hover.style.cssText = 'display:block;left:' + (r.left + scrollX) + 'px;top:' + (r.top + scrollY) + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
    hover.setAttribute('data-tag', sig(e.target));
  }
  function passes(e) { return picking.passThrough && e.target instanceof Element && picking.passThrough(e.target); }
  function swallow(e) { if (picking && !inPanel(e) && !passes(e)) { e.preventDefault(); e.stopPropagation(); } }
  function onClick(e) {
    if (!picking || inPanel(e) || passes(e)) return;
    e.preventDefault(); e.stopPropagation();
    var done = picking; stopPick();
    done(e.target);
  }
  function onKey(e) { if (picking && e.key === 'Escape') { stopPick(); render(); } }
  function pick(hint, cb) {
    picking = cb;
    hover.style.display = 'none';
    status(hint + ' — Esc to cancel', 'pick');
  }
  function stopPick() { picking = null; hover.style.display = 'none'; status(''); }

  // ---------- state ----------
  var S;
  var liveTimer = 0;
  function set(fn) {
    fn(S); save(); render();
    clearTimeout(liveTimer); // the live view's Home follows the picks, as in Fanoos Studio
    if (live && S.live && live.view === 'home') liveTimer = setTimeout(refreshLive, 900);
  }

  // The cards of a list config (default: the row being set up, else the first row's).
  function listItems(L) {
    L = L || (S.cfgRow != null ? rowList(S.cfgRow) : S.list);
    if (!L || !L.item) return [];
    return qsa(L.item);
  }
  function cardMarks() { return S.tab === 'list' && S.cfgRow != null; } // outlines only while setting a row's cards

  // ---------- code generation ----------
  function slug(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  var ID_RE = /^[a-z0-9][a-z0-9_-]*(\.[a-z0-9_-]+)+$/; // same rule as the Fanoos app
  function autoId() { return 'provider.' + (slug(S.name) || slug(new URL(S.site).hostname.replace(/^www\./, '')) || 'scraped'); }
  function addonId() { return S.id && ID_RE.test(S.id) ? S.id : autoId(); }
  function config() {
    // Default cards (search, rows without their own): the first row's, even when they are that row's own.
    var def = S.list && S.list.item ? S.list : S.rows.map(function (r, ri) { return rowList(ri); }).filter(function (L) { return L && L.item; })[0] || S.list;
    var c = { site: S.site, type: S.type, rows: S.rows, list: def };
    if (S.search) c.search = S.search;
    if (S.details && (S.details.title || S.details.plot || S.details.poster || S.details.episodes || S.details.watch)) c.details = S.details;
    if (S.links && (S.links.video || S.links.iframe || S.links.pattern || S.links.source)) c.links = S.links;
    return c;
  }
  function body(fn) { var s = fn.toString(); return s.slice(s.indexOf('{') + 1, s.lastIndexOf('}')).replace(/^\n/, ''); }
  function mainJs() {
    return '// ' + S.name + ' — generated by Fanoos Scraper from ' + S.site + '\n' +
      '// Edit CONFIG to adjust what is read. Selectors are CSS; "attr" is "text", an attribute, or several joined with "|".\n' +
      'var CONFIG = ' + JSON.stringify(config(), null, 2) + ';\n\n' +
      scraperVal.toString() + '\n\n' +
      'var SCRAPER_SOURCE_ATTRS = ' + JSON.stringify(SCRAPER_SOURCE_ATTRS) + ';\nvar SCRAPER_QUERIES = ' + JSON.stringify(SCRAPER_QUERIES) + ';\n' +
      scraperSources.toString() + '\n\n' + scraperUnpack.toString() + '\n\n' + scraperDirect.toString() + '\n\n' +
      'var SCRAPER_OFFICIAL = ' + SCRAPER_OFFICIAL.toString() + ';\n' + scraperWatchLinks.toString() + '\n\n' + scraperWatchPattern.toString() + '\n\n' +
      scraperApplyPattern.toString() + '\n\n' +
      scraperPagerRule.toString() + '\n\n' + scraperPagerApply.toString() + '\n\n' +
      'var SCRAPER_INERTIA_PROPS = ' + JSON.stringify(SCRAPER_INERTIA_PROPS) + ';\n' + scraperInertia.toString() + '\n\n' + scraperFrames.toString() + '\n\n' + scraperSwitchers.toString() + '\n\n' + scraperDataLinks.toString() + '\n\n' + body(scraperEngine);
  }
  function manifestJson() {
    var hostName = new URL(S.site).hostname;
    var hosts = [hostName];
    if (S.search && S.search.url) { try { var sh = new URL(S.search.url.replace('{query}', 'x').replace('{page}', '1')).hostname; if (hosts.indexOf(sh) < 0) hosts.push(sh); } catch (e) { /* ignore */ } }
    S.rows.forEach(function (r) { try { var rh = new URL(r.url.replace('{page}', '1')).hostname; if (hosts.indexOf(rh) < 0) hosts.push(rh); } catch (e) { /* ignore */ } });
    return JSON.stringify({
      id: addonId(), name: S.name, version: S.version || '1.0.0', apiVersion: 1, type: 'provider', main: 'main.js',
      description: 'Generated by Fanoos Scraper from ' + hostName + '.',
      tvTypes: [S.type], permissions: { hosts: hosts.concat('*') }, // '*': player frames sit on many other sites
    }, null, 2) + '\n';
  }
  function problems() {
    var p = [];
    // Each row's own cards, those it shares, or the default (S.list): every row needs picked cards with a link.
    var title = function (ri) { return '"' + (S.rows[ri].title || 'row ' + (ri + 1)) + '"'; };
    var noCards = [], noLink = [];
    S.rows.forEach(function (r, ri) { var L = rowList(ri); if (!L || !L.item) noCards.push(title(ri)); else if (!L.link) noLink.push(title(ri)); });
    if (!S.rows.length) p.push('Add at least one Home row (step 1).');
    if (noCards.length) p.push('No poster cards picked for ' + noCards.join(', ') + ': in 1 List tick the row and press ⚙, then pick a poster card on its page.');
    if (noLink.length) p.push('The cards of ' + noLink.join(', ') + ' have no link: re-pick "Link" in the row\'s ⚙.');
    return p;
  }
  function download() {
    var zip = new JSZip(), dir = zip.folder(addonId());
    dir.file('manifest.json', manifestJson());
    dir.file('main.js', mainJs());
    return zip.generateAsync({ type: 'blob' }).then(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = addonId() + '-' + (S.version || '1.0.0') + '.zip';
      root.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    });
  }

  // ---------- UI ----------
  function el(tag, props) {
    var e = document.createElement(tag);
    if (tag === 'input' || tag === 'textarea') e.setAttribute('dir', 'auto');
    for (var k in props || {}) {
      if (k === 'text') e.textContent = props[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), props[k]);
      else if (props[k] != null && props[k] !== false) e.setAttribute(k, props[k]);
    }
    for (var i = 2; i < arguments.length; i++) if (arguments[i] != null) e.appendChild(typeof arguments[i] === 'string' ? document.createTextNode(arguments[i]) : arguments[i]);
    return e;
  }
  function btn(label, fn, cls) { return el('button', { class: cls || '', onclick: fn, type: 'button' }, label); }
  function status(msg, cls) { var s = root.querySelector('.status'); if (s) { s.textContent = msg; s.className = 'status ' + (cls || ''); } }
  // copy: the full value to put on the clipboard when the sample is clicked (an address).
  // scope: the item selector the field is read inside (cards, seasons, episodes); none = the whole page.
  function fieldRow(label, f, sample, repick, copy, scope) {
    var smp = el('span', { class: 'sample' }, sample || '—');
    if (copy) copyable(smp, copy);
    var part = function (g) { return g.text != null ? JSON.stringify(g.text) : (g.sel || '(card)') + ' · ' + g.attr; };
    var code = f ? selInput([f].concat(f.and || []).map(part).join(' & '), function (parts) {
      set(function () { // f is the field in S itself
        if (parts[0].text != null) { f.text = parts[0].text; f.sel = ''; } else { delete f.text; f.sel = parts[0].sel; if (parts[0].attr) f.attr = parts[0].attr; }
        var more = parts.slice(1).map(function (p) { return p.text != null ? { text: p.text } : { sel: p.sel, attr: p.attr || 'text' }; });
        if (more.length) f.and = more; else delete f.and;
      });
    }, true) : el('code', {}, 'not set');
    var row = el('div', { class: 'field' }, el('span', { class: 'lbl' }, label), code, smp, btn('Pick', repick, 'small'));
    return f ? showOn(row, function () {
      return [f].concat(f.and || []).reduce(function (all, g) { return g.text != null ? all : all.concat(matches(g.sel, scope)); }, []);
    }) : row;
  }
  // Click to copy (addresses in the panel).
  function copyable(node, text) {
    node.classList.add('copy');
    node.setAttribute('title', text + '\n(click to copy)');
    node.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('button,a,input')) return;
      e.stopPropagation();
      var done = function () { status('Copied: ' + text.slice(0, 90), 'ok'); };
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(done, function () {
        var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); done(); } catch (x) { status('Could not copy.', 'bad'); }
        t.remove();
      });
    });
    return node;
  }

  var TABS = [['list', '1 List'], ['details', '2 Details'], ['video', '3 Video'], ['search', '4 Search'], ['export', '5 Export']];

  var siteNotice = null; // { text, label, act }: a choice about which addon this page belongs to
  function render() {
    var c = root.querySelector('.content'), keep = c.scrollTop;
    c.innerHTML = '';
    if (siteNotice) c.appendChild(el('div', { class: 'found' }, siteNotice.text + ' ', btn(siteNotice.label, siteNotice.act, 'small')));
    root.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === S.tab); });
    ({ list: tabList, search: tabSearch, details: tabDetails, video: tabVideo, export: tabExport })[S.tab](c);
    c.scrollTop = keep;
    if (cardMarks()) showMarks(listItems()); else marks.innerHTML = '';
  }

  // ---------- Home rows as a tree: rows, with their tabs (sub-menu) indented under them ----------
  // Edited as a flat list of lines { lvl: 0 row | 1 tab, title, url, first? } and turned back into rows.
  function rowLines(rows) {
    var out = [];
    rows.forEach(function (r) {
      out.push({ lvl: 0, title: r.title, url: r.url, first: r.first, list: r.list, cardsOf: r.cardsOf });
      (r.tabs || []).forEach(function (t) { out.push({ lvl: 1, title: t.title, url: t.url }); });
    });
    return out;
  }
  function linesToRows(lines) {
    var rows = [];
    lines.forEach(function (l, i) {
      if (l.lvl === 0 || !rows.length) { // a tab with no row above it becomes a row
        var r = { title: l.title, url: l.url };
        if (l.first) r.first = l.first;
        if (l.list) r.list = l.list;
        if (l.cardsOf) r.cardsOf = l.cardsOf;
        rows.push(r);
      } else {
        var parent = rows[rows.length - 1];
        parent.tabs = (parent.tabs || []).concat({ title: l.title, url: l.url });
      }
    });
    return rows;
  }
  function ls0(i) { return rowLines(S.rows)[i] || {}; }
  function editLines(fn) { set(function (s) { var lines = rowLines(s.rows); fn(lines); s.rows = linesToRows(lines); }); }
  var dragFrom = -1, ticked = []; // ticked: line indexes the toolbar acts on
  function rowsTree() {
    var lines = rowLines(S.rows), wrap = el('div', {}), box = el('div', { class: 'tree' }), rowNo = -1, rowOf = [];
    ticked = ticked.filter(function (i) { return i < lines.length; });
    var on = function (i) { return ticked.indexOf(i) >= 0; };
    lines.forEach(function (l, i) { if (!l.lvl || i === 0) rowNo++; rowOf[i] = rowNo; });
    // One toolbar for the ticked lines.
    var tickedRows = ticked.filter(function (i) { return !lines[i].lvl || i === 0; }).map(function (i) { return rowOf[i]; });
    var off = function (label) { return btn(label, function () {}, 'small off'); };
    var any = ticked.length > 0;
    var act = function (label, fn, ok, title) { var b = ok ? btn(label, fn, 'small') : off(label); if (title) b.title = title; return b; };
    // Move the ticked lines one step; a block of ticked lines moves together, stopping at the top/bottom.
    var move = function (d) {
      return function () {
        editLines(function (ls) {
          var order = ticked.slice().sort(function (a, b) { return d < 0 ? a - b : b - a; }), now = [];
          order.forEach(function (i) {
            var k = i + d;
            if (k < 0 || k >= ls.length || now.indexOf(k) >= 0) { now.push(i); return; }
            var x = ls[i]; ls[i] = ls[k]; ls[k] = x; now.push(k);
          });
          ticked = now;
        });
      };
    };
    var all = el('input', { type: 'checkbox', title: 'Tick all / none', 'aria-label': 'Tick all rows' });
    all.checked = lines.length > 0 && ticked.length === lines.length;
    all.addEventListener('change', function () { ticked = all.checked ? lines.map(function (_, i) { return i; }) : []; render(); });
    var cards = el('select', { 'aria-label': 'Cards of the ticked rows', title: 'Cards of the ticked rows' });
    cards.appendChild(el('option', { value: '' }, 'Cards…'));
    cards.appendChild(el('option', { value: 'own' }, 'own cards'));
    S.rows.forEach(function (r, j) { cards.appendChild(el('option', { value: String(j) }, '= ' + r.title)); });
    cards.disabled = !tickedRows.length;
    cards.addEventListener('change', function () {
      var v = cards.value;
      if (!v) return;
      set(function (s) { tickedRows.forEach(function (ri) { if (v === 'own' || +v !== ri) applyCards(s, ri, v); }); });
    });
    wrap.appendChild(el('div', { class: 'tree-tools' }, all,
      el('span', { class: 'help' }, any ? ticked.length + ' ticked' : 'Tick rows, then:'),
      act('↑', move(-1), any), act('↓', move(1), any),
      act('→', function () { editLines(function (ls) { ticked.forEach(function (i) { if (i > 0) ls[i].lvl = 1; }); }); }, any, 'Make them tabs of the row above'),
      act('←', function () { editLines(function (ls) { ticked.forEach(function (i) { ls[i].lvl = 0; }); }); }, any, 'Make them rows'),
      act('⚙', function () { openRowCards(tickedRows[0]); }, tickedRows.length === 1, 'Cards of the ticked row'),
      S.rows.length > 1 ? cards : null,
      act('×', function () { var del = ticked.slice(); ticked = []; editLines(function (ls) { del.sort(function (a, b) { return b - a; }).forEach(function (i) { ls.splice(i, 1); }); }); }, any, 'Delete the ticked lines')));
    lines.forEach(function (l, i) {
      var ri = rowOf[i];
      var cb = el('input', { type: 'checkbox', 'aria-label': 'Tick ' + l.title });
      cb.checked = on(i);
      cb.addEventListener('change', function () { ticked = cb.checked ? ticked.concat(i) : ticked.filter(function (x) { return x !== i; }); render(); });
      var t = el('input', { value: l.title, 'aria-label': l.lvl ? 'Tab title' : 'Row title' });
      var u = el('input', { value: l.url, 'aria-label': l.lvl ? 'Tab URL' : 'Row URL', class: 'url' });
      t.addEventListener('change', function () { editLines(function (ls) { ls[i].title = t.value; }); });
      u.addEventListener('change', function () {
        var old = ls0(i).url, nu = u.value.trim();
        editLines(function (ls) { ls[i].url = nu; ls.forEach(function (x) { if (x.cardsOf === old) x.cardsOf = nu; }); }); // rows sharing its cards follow
      });
      var handle = el('span', { class: 'grip', draggable: 'true', title: 'Drag to move. Drop on the right half of a line to make it a tab.' }, '⋮⋮');
      var cf = l.lvl ? -2 : cardsFrom(ri);
      var tagText = l.list ? (l.list.item ? 'own' : 'no cards') : cf < 0 ? (S.list ? 'default' : 'no cards') : '= ' + S.rows[cf].title;
      var tag = l.lvl ? null : el('span', { class: 'cards-tag' + (l.list ? ' own' : ''), title: 'Cards: ' + tagText + ' (tick it, then ⚙ or Cards… in the toolbar)' },
        cf >= 0 && !l.list ? '= ' : tagText, cf >= 0 && !l.list ? el('bdi', {}, S.rows[cf].title) : null); // bdi: an Arabic title keeps "=" in front
      if (l.lvl) handle.textContent = '↳';
      var line = el('div', { class: 'tree-line' + (l.lvl ? ' tab' : '') + (on(i) ? ' ticked' : '') }, cb, handle, t, u, tag || el('span', {}));
      line.title = l.lvl ? 'A tab of the row above' : '';
      // Drag by the mouse: drop on a line to take its place; its right half makes the line a tab.
      handle.addEventListener('dragstart', function (e) { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch (x) { /* old browsers */ } });
      line.addEventListener('dragover', function (e) {
        if (dragFrom < 0) return;
        e.preventDefault();
        var r = line.getBoundingClientRect(), asTab = e.clientX > r.left + r.width / 2 && i > 0;
        line.classList.toggle('drop-row', !asTab); line.classList.toggle('drop-tab', asTab);
      });
      line.addEventListener('dragleave', function () { line.classList.remove('drop-row', 'drop-tab'); });
      line.addEventListener('drop', function (e) {
        e.preventDefault();
        var from = dragFrom, asTab = line.classList.contains('drop-tab');
        dragFrom = -1;
        if (from < 0 || from === i) return render();
        ticked = [];
        editLines(function (ls) { var x = ls.splice(from, 1)[0]; x.lvl = asTab ? 1 : 0; ls.splice(i, 0, x); });
      });
      handle.addEventListener('dragend', function () { dragFrom = -1; });
      box.appendChild(line);
    });
    wrap.appendChild(box);
    return wrap;
  }

  // 1 List: the Home rows; each row's ⚙ opens its cards (by default every row uses the first row's cards, S.list).
  // Same rule as the addon's rulesOf(): the row's own cards, or those of the row it shares (cardsOf), else the default.
  function rowList(ri, depth) {
    var r = S.rows[ri];
    if (r && r.list) return r.list;
    if (r && r.cardsOf && (depth || 0) < 4) {
      for (var j = 0; j < S.rows.length; j++) if (j !== ri && S.rows[j].url === r.cardsOf) return rowList(j, (depth || 0) + 1);
    }
    return S.list;
  }
  // Which row a row takes its cards from (its index), or -1 when it has its own (or is the default first row).
  function cardsFrom(ri) {
    var r = S.rows[ri];
    if (!r || r.list) return -1;
    if (r.cardsOf) for (var j = 0; j < S.rows.length; j++) if (j !== ri && S.rows[j].url === r.cardsOf) return j;
    return ri === 0 ? -1 : 0;
  }
  function tabList(c) {
    if (S.cfgRow != null && S.rows[S.cfgRow]) return rowCards(c, S.cfgRow);
    if (S.cfgRow != null) S.cfgRow = null;
    c.appendChild(el('h4', {}, 'Home rows'));
    c.appendChild(el('p', { class: 'help' }, S.list
      ? 'Each row is a page of poster cards. ⚙ sets a row\'s cards; rows use the first row\'s cards unless set otherwise. With Pagination set, a row gets More; or put {page} in an address yourself (…/movies/page/{page}).'
      : 'Open a page that lists movies or episodes and add it as a row, then press its ⚙ to pick the poster cards.'));
    c.appendChild(rowsTree());
    c.appendChild(btn('+ Add this page as a row', function () {
      set(function (s) { s.rows.push({ title: (document.title.split(/[|\-–—]/)[0] || 'Row').trim(), url: location.href }); });
    }, 'small'));
    c.appendChild(btn('+ Rows from the site menu', function () { menuCandidates = findMenus(); render(); }, 'small'));
    if (menuCandidates) {
      var box = el('div', { class: 'menu-pick' }, el('p', { class: 'help' }, menuCandidates.length
        ? 'Menus on this page (hidden ones too). Choose one:' : 'No menu found in this page.'));
      menuCandidates.forEach(function (m) {
        box.appendChild(el('div', { class: 'rowedit' }, el('span', { class: 'menu-preview' }, m.preview.slice(0, 6).join(' · ') + (m.preview.length > 6 ? ' …' : '')),
          btn('Use', function () { useMenu(menuFromEntry(m.entry, null)); }, 'small')));
      });
      box.appendChild(el('div', {}, btn('Or click a menu entry on the page', function () { menuCandidates = null; render(); pickMenu(); }, 'small'),
        btn('Cancel', function () { menuCandidates = null; render(); }, 'small')));
      c.appendChild(box);
    }
    if (S.menu) menuChooser(c);
  }
  // Where a row's cards come from: its own, or the same as another row's (also in the rows list, no ⚙ needed).
  function cardsChooser(ri, ownLabel, sameLabel) {
    var from = cardsFrom(ri), chooser = el('select', { 'aria-label': 'Cards of this row', title: 'Which cards this row reads' });
    chooser.appendChild(el('option', { value: 'own' }, ownLabel));
    S.rows.forEach(function (r, j) { if (j !== ri) chooser.appendChild(el('option', { value: String(j) }, sameLabel + r.title + (sameLabel.slice(-1) === '“' ? '”' : ''))); });
    chooser.value = from < 0 ? 'own' : String(from);
    chooser.addEventListener('change', function () { var v = chooser.value; set(function (s) { applyCards(s, ri, v); }); });
    return chooser;
  }
  // v: 'own' (a copy of what it reads now) or the index of the row whose cards it shares.
  function applyCards(s, ri, v) {
    var r = s.rows[ri];
    if (!r) return;
    if (v === 'own') {
      var cur = rowList(ri);
      if (!r.list && cur && cur.item) r.list = JSON.parse(JSON.stringify(cur)); // nothing picked yet: the row's ⚙ picks its cards
      delete r.cardsOf;
      return;
    }
    var j = +v;
    if (j === ri || !s.rows[j]) return;
    delete r.list;
    if (j === 0 && !s.rows[0].list && !s.rows[0].cardsOf) delete r.cardsOf; // the default
    else r.cardsOf = s.rows[j].url;
    if (cardsFrom(j) === ri) delete r.cardsOf; // no loops
  }
  function openRowCards(ri) { stopPick(); S.cfgRow = ri; save(); render(); }

  // A row's cards, edited on that row's page. Row 1's are the default (S.list); another row gets its own copy when changed.
  function rowCards(c, ri) {
    var row = S.rows[ri];
    c.appendChild(el('div', { class: 'lv-top' }, btn('← Rows', function () { stopPick(); S.cfgRow = null; save(); render(); }, 'small'),
      el('strong', {}, 'Cards of “' + row.title + '”')));
    var here = function (u) { return String(u || '').replace('{page}', '1').replace(/^https?:\/\/(www\.)?/, '').replace(/[#].*$/, '').replace(/\/$/, ''); };
    if (here(row.url) !== here(location.href)) {
      c.appendChild(el('div', { class: 'found' }, 'Pick on this row\'s page: ', btn('Open it', function () { location.href = String(row.url).replace('{page}', '1'); }, 'small')));
    }
    // Cards: this row's own, or the same as any other row's.
    if (S.rows.length > 1) {
      var from = cardsFrom(ri);
      c.appendChild(el('div', { class: 'rowedit' }, el('span', { style: 'margin-right:6px;font-weight:600' }, 'Cards'), cardsChooser(ri, 'Its own cards', 'Same as “'),
        el('span', { class: 'help', style: 'margin-left:8px' }, from < 0 ? '' : 'edit or re-pick below to give this row its own')));
    }
    // Change this row's cards; a row still sharing the first row's gets its own copy first.
    var edit = function (fn) {
      set(function (s) {
        if (s.rows[ri].list) { fn(s.rows[ri].list); return; }
        if (cardsFrom(ri) < 0) { fn(s.list || (s.list = {})); return; } // the first row: the default cards
        if (!s.rows[ri].list) { s.rows[ri].list = JSON.parse(JSON.stringify(rowList(ri) || {})); delete s.rows[ri].cardsOf; }
        fn(s.rows[ri].list);
      });
    };
    var L = rowList(ri);
    c.appendChild(btn(L ? 'Re-pick the card' : 'Pick a poster card', function () {
      pick('Click one poster card', function (target) {
        var item = findItem(target);
        if (!item) { status('No repeated cards around that element. Try clicking directly on a poster.', 'bad'); return; }
        edit(function (l) {
          var pager = l.pager;
          Object.keys(l).forEach(function (k) { delete l[k]; });
          l.item = itemSelector(item); l.title = guessTitle(item); l.link = guessLink(item); l.poster = guessPoster(item);
          if (pager) l.pager = pager;
        });
      });
    }, 'primary'));
    if (!L || !L.item) return;
    var items = listItems(L), first = items[0];
    c.appendChild(el('div', { class: 'found' }, items.length + ' cards found (outlined in green) · ',
      selInput(L.item, function (sel) { if (sel) edit(function (l) { l.item = sel; }); })));
    var distinct = L.link ? distinctLinks(items, L.link) : 0;
    if (items.length >= 3 && distinct < items.length / 2) {
      c.appendChild(el('div', { class: 'bad' }, '⚠ Only ' + distinct + ' of ' + items.length + ' cards have their own link: Fanoos would show ' + distinct +
        ' poster' + (distinct === 1 ? '' : 's') + '. Press Pick next to Link and click the card\'s title or poster.'));
    }
    var repick = function (key, label, attrFor) {
      return function () {
        pick('Click the ' + label + ' inside a card', function (t) {
          var item = t.closest(L.item);
          if (!item) { status('That is outside the cards. Click inside one of the green cards.', 'bad'); return; }
          var target = key === 'link' ? (t.closest('a[href]') && item.contains(t.closest('a[href]')) ? t.closest('a[href]') : t) : t;
          edit(function (l) { l[key] = { sel: relSelector(item, target), attr: attrFor(target) }; });
        });
      };
    };
    if (first) {
      c.appendChild(listField('title', 'Title', readField(first, L.title), repick('title', 'title', function (t) { return t.tagName === 'IMG' ? 'alt|title' : 'text'; })));
      var linkVal = readField(first, L.link);
      c.appendChild(listField('link', 'Link', linkVal, repick('link', 'link', function (t) { return t.tagName === 'A' ? 'href' : 'href|data-href|data-url'; }), linkVal && absUrl(linkVal, location.href)));
      c.appendChild(listField('poster', 'Poster', readField(first, L.poster), repick('poster', 'poster image', imageAttr)));
    }
    function listField(key, label, sample, rp, copy) {
      // ri 0 edits S.list in place; another row edits its own copy (made on the first change).
      if (cardsFrom(ri) < 0) return fieldRow(label, L[key], sample, rp, copy, L.item);
      var f = L[key] ? JSON.parse(JSON.stringify(L[key])) : null;
      var r = fieldRow(label, f, sample, rp, copy, L.item);
      var inp = r.querySelector('input.selin');
      if (inp) inp.addEventListener('change', function () { if (f) edit(function (l) { l[key] = f; }); });
      return r;
    }
    // Pagination: click the site's "next page" link once; this row (and its tabs) gets More (an arrow in Fanoos).
    var pg = L.pager;
    c.appendChild(el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'Pagination'),
      el('code', {}, pg ? (pg.query ? '?' + pg.query + '={page}' : pg.suffix) : 'not set'),
      el('span', { class: 'sample' }, pg ? scraperPagerApply(row.url, pg).replace('{page}', '2').slice(0, 70) : 'click the Next › link (or page 2)'),
      btn('Pick', function () {
        pick('Click the next-page link (Next, ›, » or 2)', function (t) {
          var a = t.closest('a[href]');
          if (!a) return status('That is not a link. Click the Next link or the page 2 link.', 'bad');
          var rule = null;
          try { rule = scraperPagerRule(location.href, absUrl(a.getAttribute('href'), location.href)); } catch (e) { /* bad URL */ }
          if (!rule) return status('No page number in that link. Click the Next link or the page 2 link.', 'bad');
          edit(function (l) { l.pager = rule; });
          status('Pagination saved: this row shows More while the site links to a next page.', 'ok');
        });
      }, 'small'),
      pg ? btn('×', function () { edit(function (l) { delete l.pager; }); }, 'small') : null));
  }

  // Site menu → Home rows: tick menu entries (each becomes a row) and their sub-menu entries (tabs of that row).
  function linkOf(a) { return { title: (a.textContent || a.title || '').replace(/\s+/g, ' ').trim(), url: absUrl(a.getAttribute('href'), location.href) }; }
  function usable(a) { var h = a && a.getAttribute('href'); return h && !/^(#|javascript:|mailto:)/i.test(h); }
  // A menu's entries (rows) with their sub-menu entries (tabs); `entry` is ticked.
  function menuFromEntry(entry, ticked) {
      return siblingsLike(entry).map(function (e) {
        var links = (e.matches('a[href]') ? [e] : []).concat(Array.prototype.slice.call(e.querySelectorAll('a[href]'))).filter(usable);
        // The entry's own link (not one inside its sub-menu); a heading without a link keeps only its sub-menu.
        var own = e.tagName === 'LI' ? function (a) { return a.closest('li') === e; } : function (a, i) { return i === 0; };
        var main = links.filter(own)[0];
        var subs = links.filter(function (a) { return a !== main; }).map(linkOf).filter(function (x) { return x.title; });
        var heading = ((e.firstElementChild || e).textContent || '').replace(/\s+/g, ' ').trim();
        return { title: main ? linkOf(main).title : heading, url: main ? linkOf(main).url : '',
          on: e === ticked, subs: subs.map(function (x) { return { title: x.title, url: x.url, on: e === ticked }; }) };
      }).filter(function (m) { return m.title && (m.url || m.subs.length); });
  }
  // Every menu-like list on the page, hidden ones included (☰ and hover menus keep their links in the page): top-level
  // lists of 3+ entries with links, those in a header/nav/menu first.
  var menuCandidates = null;
  function findMenus() {
    var own = function (li) { return Array.prototype.some.call(li.querySelectorAll('a[href]'), usable); };
    var lists = Array.prototype.filter.call(document.querySelectorAll('ul, ol'), function (ul) {
      if (S.list && S.list.item && ul.closest(S.list.item)) return false;
      return Array.prototype.filter.call(ul.children, function (li) { return li.tagName === 'LI' && own(li); }).length >= 3;
    });
    // Menus that are links side by side, not a list (<nav><a>Home</a><a>Movies</a>…): their box, entries being the links.
    var bars = [];
    Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (a) {
      var p = a.parentElement;
      if (!p || bars.indexOf(p) >= 0 || /^(UL|OL)$/.test(p.tagName) || (S.list && S.list.item && p.closest(S.list.item))) return;
      if (Array.prototype.filter.call(p.children, function (c) { return c.tagName === 'A' && usable(c); }).length >= 3) bars.push(p);
    });
    lists = lists.concat(bars);
    lists = lists.filter(function (ul) { return !lists.some(function (o) { return o !== ul && o.contains(ul); }); }); // not sub-menus
    var score = function (ul) {
      return (ul.closest('header,nav,[class*=menu],[id*=menu],[class*=nav],[id*=nav]') ? 1000 : 0) - (ul.closest('footer') ? 500 : 0) + ul.children.length;
    };
    return lists.sort(function (a, b) { return score(b) - score(a); }).slice(0, 8).map(function (ul) {
      var first = Array.prototype.filter.call(ul.children, function (li) { return li.tagName === 'LI' || (li.tagName === 'A' && usable(li)); })[0];
      return { entry: first, preview: menuFromEntry(first, null).map(function (m) { return m.title; }) };
    }).filter(function (m) { return m.preview.length >= 3; });
  }
  function useMenu(menu) {
    menuCandidates = null;
    if (!menu.length) return status('No menu entries found there.', 'bad');
    set(function (s) { s.menu = menu; });
  }
  function pickMenu() {
    pick('Click one entry of the site menu (☰ and other buttons still open the menu)', function (t) {
      var entry = t.closest('li') || findItem(t, 2);
      if (!entry) return status('Click a link in the site menu.', 'bad');
      useMenu(menuFromEntry(entry, entry));
    });
    // A click that isn't on a menu link (a ☰ button, a heading that opens a drop-down) reaches the page instead.
    picking.passThrough = function (t) { var a = t.closest('a[href]'); return !(a && usable(a)); };
  }
  function menuChooser(c) {
    var box = el('div', { class: 'menu-pick' });
    box.appendChild(el('p', { class: 'help' }, 'Tick the menu entries to add as rows, and the sub-menu entries to show as tabs in that row. Their pages must use the same poster cards.'));
    S.menu.forEach(function (m, i) {
      var main = el('input', { type: 'checkbox' }); main.checked = !!m.on;
      main.addEventListener('change', function () { S.menu[i].on = main.checked; save(); });
      box.appendChild(el('label', { class: 'menu-row' }, main, ' ', m.title, m.subs.length ? '  (' + m.subs.length + ' sub-menu)' : ''));
      m.subs.forEach(function (sub, j) {
        var cb = el('input', { type: 'checkbox' }); cb.checked = !!sub.on;
        cb.addEventListener('change', function () { S.menu[i].subs[j].on = cb.checked; save(); });
        box.appendChild(el('label', { class: 'menu-sub' }, cb, ' ', sub.title));
      });
    });
    box.appendChild(el('div', {}, btn('Add ticked as rows', function () {
      set(function (s) {
        s.menu.forEach(function (m) {
          var tabs = m.subs.filter(function (x) { return x.on; }).map(function (x) { return { title: x.title, url: x.url }; });
          if (!m.on && !tabs.length) return;
          if (!m.url && !tabs.length) tabs = m.subs.map(function (x) { return { title: x.title, url: x.url }; });
          if (!m.url) { // a heading without its own page: its first sub-menu entry is the row's first tab
            if (!tabs.length) return;
            s.rows.push({ title: m.title, url: tabs[0].url, first: tabs[0].title, tabs: tabs.slice(1) });
            return;
          }
          s.rows.push(tabs.length ? { title: m.title, url: m.url, tabs: tabs } : { title: m.title, url: m.url });
        });
        delete s.menu;
      });
    }, 'primary'), btn('Cancel', function () { set(function (s) { delete s.menu; }); }, 'small')));
    c.appendChild(box);
  }

  function tabSearch(c) {
    c.appendChild(el('p', { class: 'help' }, 'Search for something on the site, then come back here on the results page and type the word you searched.'));
    var word = el('input', { placeholder: 'the word you searched, e.g. batman', 'aria-label': 'Searched word' });
    c.appendChild(el('div', { class: 'rowedit' }, word, btn('Use this page', function () {
      var w = word.value.trim();
      if (!w) return status('Type the word you searched first.', 'bad');
      var url = location.href, forms = [encodeURIComponent(w), w.replace(/ /g, '+'), w.replace(/ /g, '-'), w];
      var hit = forms.filter(function (f) { return url.toLowerCase().indexOf(f.toLowerCase()) >= 0; })[0];
      if (!hit) return status('"' + w + '" is not in this page address. Is this the results page?', 'bad');
      var i = url.toLowerCase().indexOf(hit.toLowerCase());
      set(function (s) { s.search = { url: url.slice(0, i) + '{query}' + url.slice(i + hit.length) }; });
      var same = S.list && count(S.list.item);
      status(same ? 'Search saved — results use the same cards (' + same + ' found).' : 'Search saved. The cards look different: pick one result card below.', same ? 'ok' : 'bad');
    }, 'primary')));
    if (!S.search) return;
    c.appendChild(el('div', { class: 'found' }, 'Search URL: ', el('code', {}, S.search.url)));
    c.appendChild(btn(S.search.item ? 'Re-pick a result card' : 'Results look different? Pick a result card', function () {
      pick('Click one search result card', function (target) {
        var item = findItem(target);
        if (!item) return status('No repeated cards around that element.', 'bad');
        set(function (s) { s.search.item = itemSelector(item); s.search.title = guessTitle(item); s.search.link = guessLink(item); s.search.poster = guessPoster(item); });
      });
    }, 'small'));
  }

  function tabDetails(c) {
    var onWatchSite = (S.watchHosts || []).indexOf(location.host) >= 0;
    if (!onWatchSite && S.detailsUrl !== location.href) { S.detailsUrl = location.href; save(); } // the Video step learns the watch address from it
    c.appendChild(el('p', { class: 'help' }, 'Open one movie/show page (click a card on the site). Pick what to show on the Fanoos details page. All optional: Fanoos falls back to the page title, image and description.'));
    var D = S.details;
    function pg(key, label, attrFor) {
      return function () {
        pick('Click the ' + label, function (t) { set(function (s) { s.details[key] = { sel: pageSelector(t), attr: attrFor(t) }; }); });
      };
    }
    function sample(f, full) {
      try {
        return f ? glueParts([f].concat(f.and || []), function (g) { return scraperVal(nodeOf(qs(g.sel)), g); }).slice(0, full ? 2000 : 80) : '';
      } catch (e) { return '(selector not on this page)'; }
    }
    c.appendChild(fieldRow('Title', D.title, sample(D.title), pg('title', 'title', function () { return 'text'; })));
    c.appendChild(fieldRow('Plot', D.plot, sample(D.plot), pg('plot', 'description / plot', function () { return 'text'; })));
    c.appendChild(fieldRow('Poster', D.poster, sample(D.poster), pg('poster', 'poster image', imageAttr)));
    c.appendChild(el('p', { class: 'help' }, 'Player on another page? Pick the Watch link (the button, link or player frame that opens it): the addon scans that page for video sources too. Also shown at the top of 3 Video.'));
    var watchVal = D.watch && watchLink(sample(D.watch, true));
    c.appendChild(fieldRow('Watch link', D.watch, (watchVal || '').slice(0, 80), pickWatch,
      watchVal && !/^\(selector/.test(watchVal) ? absUrl(watchVal, location.href) : ''));
    var ep = D.episodes;
    var epCount = ep ? count(ep.item) : 0;
    c.appendChild(el('h4', {}, 'Series: seasons, then episodes'));
    c.appendChild(el('p', { class: 'help' }, 'Click one season (tab, link or drop-down), then one episode. No season list on the site? Just pick the episodes. Movies: skip this.'));
    var se = D.seasons, seInfo = '—';
    if (se) {
      var seasons = document.querySelectorAll(se.item);
      var first = seasons[0];
      var how = se.link && se.link.attr === 'value' ? 'drop-down → season pages' : se.link ? 'links → season pages' : 'tabs on this page';
      seInfo = seasons.length + ' found · ' + how;
      if (first && se.panel && ep) {
        var target = scraperVal(nodeOf(within(first, se.panel)), se.panel).replace(/^#/, '');
        var panel = target && document.getElementById(target);
        seInfo += panel ? ' · season 1: ' + panel.querySelectorAll(ep.item).length + ' episodes' : ' · ⚠ tab panel not found (loaded by JavaScript?)';
      }
    }
    c.appendChild(showOn(el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'Seasons'),
      se ? selInput(se.item, function (sel) { if (sel) set(function (s) { s.details.seasons.item = sel; }); }) : el('code', {}, 'not set (optional)'), el('span', { class: 'sample' }, seInfo),
      btn('Pick', pickSeasons, 'small'),
      se ? btn('×', function () { set(function (s) { delete s.details.seasons; }); }, 'small') : null), function () { return se ? matches('', se.item) : []; }));
    var epRow = el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'Episodes'),
      ep ? selInput(ep.item, function (sel) { if (sel) set(function (s) { s.details.episodes.item = sel; }); }) : el('code', {}, 'not set'), el('span', { class: 'sample' }, ep ? epCount + ' found' : '—'),
      btn('Pick', function () {
        pick('Click one episode link', function (t) {
          var item = findItem(t, 2);
          if (!item) return status('No repeated episode links around that element.', 'bad');
          set(function (s) { s.details.episodes = { item: itemSelector(item, !!s.details.seasons), title: guessTitle(item), link: guessLink(item) }; });
        });
      }, 'small'),
      ep ? btn('×', function () { set(function (s) { delete s.details.episodes; }); }, 'small') : null);
    c.appendChild(showOn(epRow, function () { return ep ? matches('', ep.item) : []; }));
    // The text shown for each season / episode: click it inside one season tab / episode.
    function pickInside(key, itemSel, label) {
      return function () {
        pick('Click the ' + label + ' inside one ' + (key === 'seasons' ? 'season' : 'episode'), function (t) {
          var item = t.closest(itemSel);
          if (!item) return status('That is outside the ' + key + ' you picked (outlined). Click inside one of them.', 'bad');
          set(function (s) { s.details[key].title = { sel: relSelector(item, t), attr: t.tagName === 'IMG' ? 'alt|title' : 'text|title' }; });
        });
      };
    }
    if (se && !(se.link && se.link.attr === 'value')) { // a drop-down already reads its option text
      // The season the page shows now (marked active/selected), else the first one.
      var allSe = Array.prototype.slice.call(document.querySelectorAll(se.item));
      var firstSe = allSe.filter(function (n) {
        return n.matches('.active,.selected,.current,.is-active,[aria-selected=true],[aria-current]') || n.querySelector('.active,.selected,.current,.is-active,[aria-selected=true],[aria-current]');
      })[0] || allSe[0];
      c.appendChild(fieldRow('Season title', se.title, firstSe ? readField(firstSe, se.title) : '', pickInside('seasons', se.item, 'season title'), null, se.item));
    }
    if (ep) {
      var firstEp = document.querySelector(ep.item);
      c.appendChild(fieldRow('Episode title', ep.title, firstEp ? readField(firstEp, ep.title) : '', pickInside('episodes', ep.item, 'episode title'), null, ep.item));
    }
  }

  var TAB_ATTRS = 'data-target|data-bs-target|aria-controls|data-tab|href'; // onclick="…('id')" is read by the addon too
  function pickSeasons() {
    pick('Click one season (a tab, a link or the season drop-down)', function (t) {
      var dropdown = t.closest('select');
      if (dropdown) {
        return set(function (s) { s.details.seasons = { item: pageSelector(dropdown) + ' > option', title: { sel: '', attr: 'text' }, link: { sel: '', attr: 'value' } }; });
      }
      // A drop-down button ("Season 2 ▾"): its menu's entries are the seasons, even while the menu is closed.
      var toggle = t.closest('[aria-haspopup],[aria-expanded],.dropdown-toggle,[data-toggle=dropdown],[data-bs-toggle=dropdown]');
      if (toggle) {
        var ctl = toggle.getAttribute('aria-controls'), box = toggle.parentElement;
        var menu = (ctl && document.getElementById(ctl)) || box.querySelector('.dropdown-menu,[role=menu],[role=listbox],ul');
        var entry = menu && (menu.querySelector('a[href]:not([href="#"]),[role=option],[role=menuitem],li,button'));
        if (entry) t = entry;
      }
      var item = findItem(t, 2) || t.closest('li,a,button,[data-tab],[role=tab],[data-season]'); // a show may have one season
      var CLICKABLE = 'a,button,[data-target],[data-bs-target],[aria-controls],[data-tab]';
      var a = item.matches(CLICKABLE) ? item : item.querySelector(CLICKABLE) || item;
      var href = a.getAttribute('href') || '', rel = relSelector(item, a);
      var isPage = href && !/^(#|javascript:)/i.test(href);
      set(function (s) {
        // "Season 2  23 eps": the name alone when it has its own element.
        var name = a.firstElementChild && a.firstElementChild.textContent.trim() && a.firstElementChild.textContent.trim() !== a.textContent.trim() ? a.firstElementChild : a;
        s.details.seasons = { item: itemSelector(item), title: { sel: relSelector(item, name), attr: 'text' },
          link: isPage ? { sel: rel, attr: 'href' } : null, panel: isPage ? null : { sel: rel, attr: TAB_ATTRS } };
        // Episodes picked before seasons may be tied to one season's list: loosen that.
        if (s.details.episodes) s.details.episodes.item = s.details.episodes.item.replace(/^#[^ ]+ > /, '');
      });
      // Neither a page nor a panel on this page: the site loads the season's episodes when it is clicked. Click it
      // and watch that request, so the addon can make it for every season.
      var holder = [item].concat(Array.prototype.slice.call(item.querySelectorAll('*'))).filter(function (n) {
        return Array.prototype.some.call(n.attributes, function (x) { return /^data-/.test(x.name) && x.value; });
      })[0];
      var target = !isPage && ((a.getAttribute('href') || '').replace(/^#/, '') || TAB_ATTRS.split('|').map(function (x) { return a.getAttribute(x); }).filter(Boolean)[0]);
      var hasPanel = target && document.getElementById(String(target).replace(/^#/, ''));
      if (!isPage && !hasPanel && holder) learnSeasonLoad(item, holder);
    });
  }

  // Watch the request a season click makes; keep it as a template filled with each season's attributes.
  function learnSeasonLoad(item, holder) {
    status('Watching how the site loads this season…', 'pick');
    var attrs = {};
    Array.prototype.forEach.call(holder.attributes, function (x) { if (/^data-/.test(x.name) && x.value) attrs[x.name] = x.value; });
    var seen = [], onMsg = function (e) { if (e.source === window && e.data && e.data.__fanoosRec) seen.push(e.data.__fanoosRec); };
    window.addEventListener('message', onMsg);
    var api = typeof browser !== 'undefined' ? browser : typeof chrome !== 'undefined' ? chrome : null;
    var ready = api && api.runtime && api.runtime.sendMessage ? Promise.resolve(api.runtime.sendMessage({ type: 'fanoos-scraper-record' })).catch(function () {}) : Promise.resolve();
    ready.then(function () {
      holder.click();
      setTimeout(function () {
        window.removeEventListener('message', onMsg);
        var fill = function (text, enc) { // the season's values → {data-…}
          var n = 0;
          Object.keys(attrs).forEach(function (k) {
            var v = attrs[k], forms = [enc ? encodeURIComponent(v) : v];
            forms.forEach(function (f) {
              var re = new RegExp('(^|[=&?/:"\'])' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[&#"\',}/])', 'g');
              text = text.replace(re, function (m0, pre) { n++; return pre + '{' + k + '}'; });
            });
          });
          return { text: text, n: n };
        };
        var best = null;
        seen.forEach(function (r) {
          if (best) return;
          var u = fill(r.url, true), b = fill(r.body, /x-www-form-urlencoded/i.test(r.type) || /^[^{\[]*=/.test(r.body));
          if (u.n + b.n) best = { url: u.text, method: r.method, body: b.text, type: r.type || (b.text && /^[^{\[]*=/.test(b.text) ? 'application/x-www-form-urlencoded; charset=UTF-8' : '') };
        });
        if (!best) return status(seen.length ? 'The season click made requests, but none named this season: episodes may stay on one season.' : 'Clicking the season loaded nothing: episodes come from this page only.', seen.length ? 'bad' : 'ok');
        best.sel = relSelector(item, holder);
        set(function (s) { if (s.details.seasons) { s.details.seasons.load = best; s.details.seasons.panel = null; } });
        status('Learned how the site loads a season: ' + best.method + ' ' + best.url.slice(0, 70) + (best.body ? ' (' + best.body.slice(0, 60) + ')' : ''), 'ok');
      }, 2500);
    });
  }

  function nodesIn(root) {
    var q = function (sel) { try { return Array.prototype.map.call(root.querySelectorAll(sel), nodeOf); } catch (e) { return []; } };
    var src = S.links.source;
    return { video: q(S.links.video || SCRAPER_QUERIES.video), iframe: q(S.links.iframe || SCRAPER_QUERIES.iframe), servers: q(SCRAPER_QUERIES.servers),
      picked: src ? q(src.sel) : [], pickedAttr: src && src.attr };
  }
  function absUrl(u, base) { try { return new URL(u, base).href; } catch (e) { return u; } }
  // A Watch link's value: the address itself, or the one quoted in onclick="go('…')".
  function watchLink(v) {
    v = String(v || '').trim();
    if (/^(https?:)?\/\/|^\/|^\?|^[\w-]+\.(php|html?)/i.test(v)) return v;
    var m = /['"]((?:https?:)?\/\/[^'"]+|\/[^'"\s]+)['"]/.exec(v);
    return m ? m[1] : v;
  }


  // What the addon will see: the page as downloaded, before the site's JavaScript runs.
  var rawCache = { url: '', sources: null };
  function fetchText(url, referer, extra) {
    var api = typeof browser !== 'undefined' ? browser : typeof chrome !== 'undefined' ? chrome : null;
    if (!api || !api.runtime || !api.runtime.sendMessage) return Promise.resolve(null);
    return Promise.resolve(api.runtime.sendMessage({ type: 'fanoos-scraper-fetch', req: { url: url, headers: Object.assign({ Referer: referer }, extra || {}) } }))
      .then(function (r) { return r && !r.error && r.status < 400 ? r.body : null; }, function () { return null; });
  }
  function rawSources() {
    if (rawCache.url === location.href && rawCache.sources) return Promise.resolve(rawCache.sources);
    return fetch(location.href, { credentials: 'omit' }).then(function (r) { return r.text(); }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      rawCache = { url: location.href, sources: scraperSources(nodesIn(doc), html, location.href, absUrl) };
      return rawCache.sources;
    }, function () { return null; });
  }

  // An Inertia.js player/page that loads its server list on demand (see scraperInertia): list those servers.
  function serversIn(I, li, note, getJson) {
    getJson(I.headers).then(function (text) {
      var j; try { j = JSON.parse(text); } catch (e) { j = null; }
      var list = j ? scraperDataLinks(j.props, I.url, absUrl).filter(function (l) { return l.url.split('#')[0] !== I.url.split('#')[0]; }) : [];
      if (!list.length) { note.textContent = '   no servers found in its data'; return; }
      li.className = 'ok';
      note.textContent = '   ' + list.length + ' servers inside (the addon offers them all):';
      var ul = el('ul', { class: 'detect' });
      list.forEach(function (l) { ul.appendChild(copyable(el('li', { class: 'ok' }, '▣ ' + (l.name || 'Server') + ' — ' + l.url.slice(0, 60)), l.url)); });
      li.appendChild(ul);
    });
  }

  // The Watch link: the element on a title page whose address is the page holding the player (the watch page).
  function pickWatch() {
    pick('Click the Watch / Play link (or the player frame)', function (t) {
      // Any attribute holding an address (href, src, data-server, data-url…, onclick="go('…')"), on the clicked element or around it.
      var holds = function (n) {
        return n && n.attributes ? Array.prototype.map.call(n.attributes, function (a) { return a.name; }).filter(function (a) {
          if (/^(class|style|id|title|alt|role|aria-|target|rel|width|height)/.test(a)) return false;
          if (n.tagName === 'IMG' && /src/.test(a)) return false; // a picture is not a page
          var v = n.getAttribute(a) || '';
          return a === 'onclick' || /^on/.test(a) ? /['"]((https?:)?\/\/|\/)[^'"]+['"]/.test(v) : /^(https?:)?\/\/|^\/[^\/]|^\?./i.test(v.trim());
        }).sort(function (x, y) { return (y === 'href' || y === 'src') - (x === 'href' || x === 'src'); }) : [];
      };
      var b = t.tagName === 'IFRAME' ? t : t;
      while (b && b !== document.body && !holds(b).length) b = b.parentElement;
      if (!b || b === document.body) { b = Array.prototype.filter.call(t.querySelectorAll('iframe,a,*'), function (n) { return holds(n).length; })[0]; }
      var attr = holds(b);
      if (!attr.length) return status('That element holds no address: the site opens its player with JavaScript.', 'bad');
      set(function (s) { s.details.watch = { sel: pageSelector(b), attr: attr.join('|') }; delete s.links.pattern; });
      status('Watch link saved: ' + absUrl(watchLink(b.getAttribute(attr[0])), location.href).slice(0, 90), 'ok');
    });
  }

  function tabVideo(c) {
    // ① Watch link → watch page, ② its source cards, ③ the sources found on this page.
    var W = S.details && S.details.watch, wn = null;
    try { wn = W && W.sel ? document.querySelector(W.sel) : null; } catch (e) { wn = null; }
    // On the watch page itself, its own frames are not another watch page.
    var onWatch = !!(S.watchPage && S.watchPage.url === location.href.split('#')[0]);
    var watchUrlHere = wn && !onWatch ? absUrl(watchLink(scraperVal(nodeOf(wn), W)), location.href) : '';
    if (watchUrlHere && watchUrlHere !== location.href) { S.watchPage = { url: watchUrlHere.split('#')[0], from: location.href }; save(); }
    c.appendChild(el('h4', {}, '① Watch link → watch page'));
    c.appendChild(el('p', { class: 'help' }, 'On a movie or episode page, pick the link or player frame that leads to the page holding the servers. The addon opens that page for every title and reads its sources.'));
    c.appendChild(fieldRow('Watch link', W || null, watchUrlHere ? watchUrlHere.slice(0, 80) : onWatch ? '(on the title page)' : '', pickWatch, watchUrlHere));
    if (watchUrlHere && watchUrlHere !== location.href) {
      c.appendChild(el('div', { class: 'found' }, 'Watch page of this title: ', copyable(el('code', {}, watchUrlHere.slice(0, 80)), watchUrlHere), ' ',
        btn('Open it', function () { location.href = watchUrlHere; }, 'small')));
    } else if (onWatch) {
      c.appendChild(el('div', { class: 'found' }, '✓ This is the watch page (from ', copyable(el('code', {}, S.watchPage.from.slice(0, 60)), S.watchPage.from), '). Pick its source cards below.'));
    } else if (W) {
      c.appendChild(el('div', { class: 'help' }, 'The Watch link is not on this page. Open a movie or episode page to see its watch page.'));
    }
    // Watch pages without a Watch link: opened from a title page of this site, learn how to get here from it, for every title.
    var fromSite = function (u) { return u.split('/')[2] === location.host || u.indexOf(S.site) === 0; };
    var from = /^https?:/.test(document.referrer) && fromSite(document.referrer) && document.referrer !== location.href &&
      /^https?:\/\/[^\/]+\/./.test(document.referrer) &&
      !(S.list && S.rows.some(function (r) { return document.referrer.indexOf(r.url.split('{')[0]) === 0 && r.url.split('{')[0].length > S.site.length; })) ? document.referrer : S.detailsUrl;
    var hasPlayers = scraperSources(nodesIn(document), document.documentElement.outerHTML, location.href, absUrl).length > 0;
    if (!W && hasPlayers && from && from !== location.href && fromSite(from)) {
      var pat = scraperWatchPattern(from, location.href);
      if (pat && S.links.pattern !== pat) { S.links.pattern = pat; save(); }
    }
    if (S.links.pattern) c.appendChild(el('div', { class: 'found' }, 'Watch pages: ', el('code', {}, S.links.pattern.slice(0, 90)),
      ' — the addon opens this for every title ({n} = part n of the title address)' + (W ? ', when the Watch link gives nothing' : '') + '. ',
      btn('Forget', function () { set(function (x) { delete x.links.pattern; }); }, 'small')));
    // No Watch link here: the watch page the addon finds by itself (an obvious "Watch" link).
    if (!W && !onWatch) {
      var anchors = Array.prototype.map.call(document.querySelectorAll('a[href]'), function (a) {
        return { text: a.textContent, attrs: { href: a.getAttribute('href'), title: a.getAttribute('title') || '', 'class': a.getAttribute('class') || '' } };
      });
      var auto = scraperWatchLinks(anchors, location.href, absUrl)[0];
      if (auto) c.appendChild(el('div', { class: 'found' }, 'Watch page: the addon opens ', copyable(el('code', {}, auto.slice(0, 80)), auto),
        ' when this page has no playable source. ', btn('Open it', function () { location.href = auto; }, 'small')));
    }
    c.appendChild(el('h4', {}, '② Source cards'));
    c.appendChild(el('p', { class: 'help' }, 'The server buttons or cards' + (W ? ' on the watch page' : '') + ': pick one, the addon reads them all.'));
    var LS = S.links.source;
    c.appendChild(LS ? fieldRow('Source cards', LS, matches(LS.sel).length + ' on this page', pickSource)
      : el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'Source cards'), el('code', {}, 'not set (optional)'), el('span', { class: 'sample' }, '—'), btn('Pick', pickSource, 'small')));
    c.appendChild(el('h4', {}, '③ Sources found on this page'));
    var live = scraperSources(nodesIn(document), document.documentElement.outerHTML, location.href, absUrl);
    live.sort(function (a, b) { return (a.kind === 'embed') - (b.kind === 'embed'); });
    var head = el('div', { class: 'found' }, live.length ? live.length + ' source' + (live.length > 1 ? 's' : '') + ' found, best first' : '');
    var ul = el('ul', { class: 'detect' });
    var rows = live.map(function (l) {
      var yt = /youtube(-nocookie)?\.com\/(embed|watch)|youtu\.be\//i.test(l.url), dm = /dailymotion\.com\/(embed|video|player)/i.test(l.url);
      var tag = l.kind !== 'embed' ? '▶ ' : yt ? '▶ YouTube · ' : dm ? '▶ Dailymotion · ' : '▣ ';
      var li = showOn(copyable(el('li', { class: l.kind !== 'embed' || yt || dm ? 'ok' : 'warn' }, tag + l.name + ' — ' + l.url.slice(0, 70)), l.url), function () { return holdersOf(l.url); });
      ul.appendChild(li);
      return { l: l, li: li };
    });
    if (!live.length) {
      head.className = 'bad';
      head.textContent = 'No video sources found on this page.';
      ul.appendChild(el('li', { class: 'help' }, 'If the site shows its player only after a click, click its play/server button, then "Scan again". Sources that appear only after a click are usually loaded by JavaScript and cannot be read by an addon.'));
    }
    c.appendChild(head);
    c.appendChild(ul);
    var selfI = scraperInertia(document.documentElement.outerHTML, location.href);
    if (selfI) {
      var selfLi = el('li', { class: 'warn' }, '▣ This page\'s own server list'), selfNote = el('div', { class: 'help' }, '   reading…');
      selfLi.appendChild(selfNote); ul.appendChild(selfLi);
      if (!live.length) { head.className = 'found'; head.textContent = 'Servers loaded by this page:'; ul.innerHTML = ''; ul.appendChild(selfLi); }
      serversIn(selfI, selfLi, selfNote, function (h) { return fetch(location.href, { headers: h, credentials: 'omit' }).then(function (r) { return r.text(); }); });
    }
    var check = el('p', { class: 'help' }, live.length ? 'Checking which ones the addon can see…' : '');
    c.appendChild(check);
    if (live.length) rawSources().then(function (raw) {
      if (!raw) { check.textContent = 'Could not re-download this page to check it.'; return; }
      var inRaw = {};
      raw.forEach(function (l) { inRaw[l.url] = 1; });
      var hidden = 0;
      rows.forEach(function (r) {
        if (!inRaw[r.l.url]) { hidden++; r.li.className = 'bad'; r.li.textContent += '  ✗ added by JavaScript: the addon cannot see it'; }
      });
      var extra = raw.filter(function (l) { return !live.some(function (x) { return x.url === l.url; }); }).length;
      check.textContent = (hidden ? hidden + ' of ' + live.length + ' only exist after the site\'s JavaScript runs (✗). ' : 'All of them are in the page source: the addon will find them. ') +
        (extra ? extra + ' more are in the page source (servers not shown yet).' : '');
    });
    // Look inside each player frame for the video file, like the addon does.
    rows.forEach(function (r) {
      if (r.l.kind !== 'embed' || SCRAPER_OFFICIAL.test(r.l.url)) return;
      var note = el('div', { class: 'help' }, '   looking inside…');
      r.li.appendChild(note);
      fetchText(r.l.url, location.href).then(function (html) {
        var d = html == null ? null : scraperDirect(html, r.l.url, absUrl);
        var I = html && scraperInertia(html, r.l.url);
        if (I) serversIn(I, r.li, note, function (h) { return fetchText(r.l.url, location.href, h); });
        if (d == null) note.textContent = '   could not open this player here';
        else if (I && !d.length) note.textContent = '   a list of servers: reading it…';
        else if (!d.length && scraperFrames(html, r.l.url, absUrl).length) {
          r.li.className = 'ok';
          note.textContent = '   → wraps (the addon plays it):';
          scraperFrames(html, r.l.url, absUrl).forEach(function (u) { note.appendChild(copyable(el('div', {}, '      ' + u.slice(0, 80)), u)); });
        }
        else if (d.length) {
          r.li.className = 'ok'; note.textContent = '   →';
          d.forEach(function (x) { note.appendChild(copyable(el('div', {}, '      ' + x.kind.toUpperCase() + ' ' + x.url.slice(0, 70)), x.url)); });
        }
        else note.textContent = '   no video file found inside; it may still play in its own player';
      });
    });
    c.appendChild(el('p', { class: 'help' }, 'Green ▶ plays in Fanoos directly or in YouTube/Dailymotion\'s player. ▣ is another site\'s player: green when a video file was found inside it (→): those are listed first.'));
    // The picks behind these sources, editable; hover to see them on the page.
    var L = S.links;
    ['iframe', 'video'].forEach(function (k) {
      if (!L[k]) return;
      c.appendChild(showOn(el('div', { class: 'field' }, el('span', { class: 'lbl' }, k === 'iframe' ? 'Player' : 'Video'),
        selInput(L[k], function (sel) { set(function (s) { if (sel) s.links[k] = sel; else delete s.links[k]; }); }),
        el('span', { class: 'sample' }, matches(L[k]).length + ' on this page'),
        btn('×', function () { set(function (s) { delete s.links[k]; }); }, 'small')), function () { return matches(L[k]); }));
    });
    c.appendChild(el('div', {}, btn('Scan again', function () { rawCache.url = ''; render(); }, 'small'),
      S.links.source ? btn('× source cards', function () { set(function (s) { delete s.links.source; }); }, 'small') : null,
      btn('Pick the player myself', function () {
        pick('Click the video or player frame', function (t) {
          var v = t.closest('video') || (t.tagName === 'IFRAME' ? t : null);
          if (!v) return status('That is not a video or player frame.', 'bad');
          set(function (s) { if (v.tagName === 'VIDEO') s.links.video = pageSelector(v) + ', ' + pageSelector(v) + ' source[src]'; else s.links.iframe = pageSelector(v); });
        });
      }, 'small')));
  }

  // Sources shown as cards/buttons (server name, quality…): the attribute holding each one's address, on the card or inside it.
  function pickSource() {
    pick('Click one source card or server button', function (t) {
      var item = findItem(t, 2) || t;
      var ATTRS = SCRAPER_SOURCE_ATTRS.concat(['href', 'onclick']);
      var looks = function (v, a) {
        v = String(v || '').trim();
        if (a === 'onclick') v = (/['"]([^'"]{4,})['"]/.exec(v) || [])[1] || '';
        return v && !/^(#|javascript:)/i.test(v) && (/^(https?:)?\/\/|^\/|^\?|<iframe/i.test(v) || /^[A-Za-z0-9+\/]{20,}={0,2}$/.test(v));
      };
      var holders = [item].concat(Array.prototype.slice.call(item.querySelectorAll('*'))), found = null;
      for (var i = 0; i < ATTRS.length && !found; i++) {
        for (var j = 0; j < holders.length; j++) if (looks(holders[j].getAttribute(ATTRS[i]), ATTRS[i])) { found = { el: holders[j], attr: ATTRS[i] }; break; }
      }
      // Any other attribute holding an address (data-embed-url, data-player-link…).
      for (var k = 0; k < holders.length && !found; k++) {
        for (var m = 0; m < holders[k].attributes.length; m++) {
          var at = holders[k].attributes[m];
          if (!/^(class|style|id|src|alt|title)$/.test(at.name) && looks(at.value, at.name)) { found = { el: holders[k], attr: at.name }; break; }
        }
      }
      if (!found) return status('This card holds no address: it loads its player with JavaScript. Click it, wait for the player, then "Scan again".', 'bad');
      var sel = itemSelector(item) + (found.el === item ? '' : ' ' + relSelector(item, found.el));
      set(function (s) { s.links.source = { sel: sel, attr: found.attr }; });
      status(count(sel) + ' source cards found.', 'ok');
    });
  }

  function tabExport(c) {
    var p = problems();
    var name = el('input', { value: S.name, 'aria-label': 'Addon name' });
    name.addEventListener('change', function () { set(function (s) { s.name = name.value.trim() || s.name; }); });
    var type = el('select', { 'aria-label': 'Content type' });
    ['movie', 'series', 'anime', 'live', 'other'].forEach(function (t) { var o = el('option', { value: t }, t); if (t === S.type) o.selected = true; type.appendChild(o); });
    type.addEventListener('change', function () { set(function (s) { s.type = type.value; }); });
    c.appendChild(el('div', { class: 'rowedit' }, name, type));
    // Same ID as an installed addon = Fanoos updates that addon instead of adding a second one.
    var idIn = el('input', { value: addonId().replace(/^provider\./, ''), placeholder: autoId().replace(/^provider\./, ''), 'aria-label': 'Addon ID', spellcheck: 'false' });
    idIn.addEventListener('change', function () {
      var v = idIn.value.trim().toLowerCase().replace(/^provider\./, '').replace(/[^a-z0-9_.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
      set(function (s) { if (v && 'provider.' + v !== autoId()) s.id = 'provider.' + v; else delete s.id; });
    });
    c.appendChild(el('div', { class: 'rowedit' }, el('span', { style: 'margin-right:2px;font-weight:600' }, 'Addon ID  provider.'), idIn));
    // Version: Fanoos replaces an installed addon only with a higher version.
    var verIn = el('input', { value: S.version || '1.0.0', 'aria-label': 'Version', spellcheck: 'false', style: 'max-width:120px' });
    verIn.addEventListener('change', function () {
      var v = verIn.value.trim();
      if (!/^\d+(\.\d+){0,3}$/.test(v)) { verIn.value = S.version || '1.0.0'; return status('Version must look like 1.0.2', 'bad'); }
      set(function (s) { s.version = v; });
    });
    c.appendChild(el('div', { class: 'rowedit' }, el('span', { style: 'margin-right:6px;font-weight:600' }, 'Version'), verIn,
      el('span', { class: 'help', style: 'margin-left:8px' }, 'raise it to update an installed addon')));
    if (p.length) { p.forEach(function (x) { c.appendChild(el('div', { class: 'bad' }, '⚠ ' + x)); }); return; }
    var code = el('textarea', { readonly: 'readonly', spellcheck: 'false' }); code.setAttribute('dir', 'ltr'); // code reads left to right
    code.value = mainJs();
    c.appendChild(code);
    c.appendChild(el('div', {},
      btn('Download addon (.zip)', function () { download().then(function () { status('Downloaded. In Fanoos Studio: Import zip.', 'ok'); }); }, 'primary'),
      btn('Copy main.js', function () {
        (navigator.clipboard ? navigator.clipboard.writeText(code.value) : Promise.reject()).then(
          function () { status('main.js copied.', 'ok'); },
          function () { code.select(); document.execCommand('copy'); status('main.js copied.', 'ok'); });
      }, 'small')));
    c.appendChild(el('p', { class: 'help' }, 'Open the zip in Fanoos Studio (Import zip) to test it live, then Export repository to publish it.'));
  }

  // ---------- import an addon made by the scraper, to change it ----------
  function importAddon() {
    var input = el('input', { type: 'file', accept: '.zip,application/zip' });
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      // Read as a plain string first: Firefox hides the page's File object from JSZip ("Permission denied … constructor").
      new Promise(function (ok, ko) {
        var r = new FileReader();
        r.onload = function () { ok(String(r.result)); };
        r.onerror = function () { ko(new Error('Could not read the file.')); };
        r.readAsBinaryString(f);
      }).then(function (bin) { return JSZip.loadAsync(bin, { binary: true }); }).then(function (zip) {
        var files = Object.keys(zip.files);
        var mainName = files.filter(function (n) { return /(^|\/)main\.js$/.test(n); })[0];
        var manName = files.filter(function (n) { return /(^|\/)manifest\.json$/.test(n); })[0];
        if (!mainName) throw new Error('No main.js in this zip.');
        return Promise.all([zip.file(mainName).async('string'), manName ? zip.file(manName).async('string') : '{}']);
      }).then(function (t) {
        var i = t[0].indexOf('var CONFIG = '), j = t[0].indexOf('\n};', i);
        if (i < 0 || j < 0) throw new Error('This addon was not made by Fanoos Scraper (no CONFIG in main.js).');
        var cfg = JSON.parse(t[0].slice(i + 13, j + 2)), man = JSON.parse(t[1] || '{}');
        var v = String(man.version || '1.0.0').split('.').map(function (x) { return parseInt(x, 10) || 0; });
        while (v.length < 3) v.push(0);
        v[2]++; // the next export is a newer version: Fanoos updates the installed addon
        var keep = { dock: S.dock, width: S.width, live: S.live };
        S = { site: cfg.site, name: man.name || cfg.site, type: cfg.type || 'movie', tab: 'list', rows: cfg.rows || [], list: cfg.list || null,
          search: cfg.search || null, details: cfg.details || {}, links: cfg.links || {}, version: v.join('.') };
        if (man.id && man.id !== autoId()) S.id = man.id;
        Object.keys(keep).forEach(function (k) { if (keep[k] != null) S[k] = keep[k]; });
        save();
        siteNotice = cfg.site === location.origin + '/' ? null : { text: 'Imported ' + S.name + ' (made on ' + cfg.site + ').', label: 'Open that site to edit it',
          act: function () { location.href = cfg.site; } };
        render();
        refreshLive();
        status('Imported ' + S.name + ' — the next export is version ' + S.version + '.', 'ok');
      }).catch(function (e) { status('Could not import: ' + (e && e.message || e), 'bad'); });
    });
    input.click();
  }

  // ---------- live view: the addon as it is now, run here like Fanoos runs it ----------
  var live = null; // { pane, body, api }
  function bgFetch(req) {
    var api = typeof browser !== 'undefined' ? browser : typeof chrome !== 'undefined' ? chrome : null;
    var p = api && api.runtime && api.runtime.sendMessage
      ? Promise.resolve(api.runtime.sendMessage({ type: 'fanoos-scraper-fetch', req: req }))
      : fetch(req.url, { method: req.method || 'GET', headers: req.headers, body: req.body }).then(function (r) {
        return r.text().then(function (b) { return { status: r.status, body: b, url: r.url }; });
      });
    return p.then(function (r) {
      if (!r || r.error) throw new Error(r && r.error === 'no-permission' ? 'No permission for ' + req.url : (r && r.error) || 'Could not download ' + req.url);
      return { status: r.status, ok: r.status >= 200 && r.status < 300, headers: r.headers || {}, url: r.url || req.url, text: r.body, json: function () { return JSON.parse(r.body); } };
    });
  }
  function addonApi(logs) {
    var api = null;
    self.CONFIG = JSON.parse(JSON.stringify(config()));
    self.fanoos = {
      apiVersion: 1,
      register: function (o) { api = o; },
      log: function (m) { logs.push(String(m)); },
      util: { absUrl: absUrl },
      html: { select: function (h, sel, subs) {
        try {
          var d = new DOMParser().parseFromString(String(h), 'text/html');
          return Promise.resolve(Array.prototype.slice.call(d.querySelectorAll(sel), 0, 1000).map(function (n) {
            var o = nodeOf(n);
            if (subs) o.sub = subs.map(function (x) { if (!x) return nodeOf(n); try { var m = n.querySelector(x); return m ? nodeOf(m) : null; } catch (e) { return null; } });
            return o;
          }));
        } catch (e) { return Promise.reject(e); }
      } },
      http: {
        request: function (o) { return bgFetch({ url: o.url, method: o.method || 'GET', headers: o.headers || {}, body: o.body }); },
        get: function (u, o) { return bgFetch({ url: u, method: 'GET', headers: (o && o.headers) || {} }); },
        post: function (u, b, o) { return bgFetch({ url: u, method: 'POST', headers: (o && o.headers) || {}, body: typeof b === 'string' ? b : JSON.stringify(b) }); },
      },
    };
    scraperEngine();
    return api;
  }
  function toggleLive() {
    S.live = !S.live; save();
    placeLive();
    if (S.live) refreshLive();
  }
  function placeLive() {
    if (!live) return;
    live.pane.style.display = S.live ? '' : 'none';
    var panel = root.querySelector('.panel'), w = panel.getBoundingClientRect().width;
    live.pane.style.left = live.pane.style.right = '';
    if (S.dock === 'left') live.pane.style.left = (w + 20) + 'px'; else live.pane.style.right = (w + 20) + 'px';
  }
  function refreshLive() { if (live && S.live) liveHome(); }
  function liveShow(title, back, nodes) {
    var b = live.body; b.innerHTML = '';
    live.view = back ? 'other' : 'home';
    b.appendChild(el('div', { class: 'lv-top' }, back ? btn('←', back, 'icon') : null, el('strong', {}, title),
      btn('↻', refreshLive, 'icon')));
    nodes.forEach(function (n) { if (n) b.appendChild(n); });
  }
  function liveRun(title, back, fn, draw) {
    var logs = [];
    liveShow(title, back, [el('div', { class: 'help' }, 'Loading…')]);
    var api;
    try { api = addonApi(logs); } catch (e) { return liveShow(title, back, [el('div', { class: 'bad' }, 'The addon does not run yet: ' + e.message)]); }
    Promise.resolve().then(function () { return fn(api); }).then(function (r) {
      liveShow(title, back, draw(r).concat(logs.length ? [el('pre', { class: 'lv-log' }, logs.slice(-8).join('\n'))] : []));
    }, function (e) {
      liveShow(title, back, [el('div', { class: 'bad' }, String(e && e.message || e))].concat(logs.length ? [el('pre', { class: 'lv-log' }, logs.slice(-8).join('\n'))] : []));
    });
  }
  function liveCard(m, back) {
    var img = el('img', { alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    if (m.poster) img.src = m.poster;
    img.onerror = function () { img.style.visibility = 'hidden'; };
    return el('button', { class: 'lv-card', title: m.title, onclick: function () { liveDetails(m.id, m.title, back); } }, el('div', { class: 'lv-poster' }, img), el('span', {}, m.title));
  }
  function liveHome() {
    if (!S.rows.some(function (r, ri) { var L = rowList(ri); return L && L.item; })) return liveShow('Live view', null, [el('div', { class: 'help' }, 'Pick a poster card in 1 List to see the addon\'s Home here.')]);
    liveRun(S.name, null, function (api) { return api.getHome(); }, function (rows) {
      var out = [];
      if (S.search && S.search.url) {
        var q = el('input', { placeholder: 'Search…', 'aria-label': 'Search' });
        q.addEventListener('keydown', function (e) { if (e.key === 'Enter' && q.value.trim()) liveSearch(q.value.trim()); });
        out.push(q);
      }
      if (!rows.length) out.push(el('div', { class: 'help' }, 'No rows.'));
      rows.forEach(function (r) {
        var strip = el('div', { class: 'lv-row' }), fill = function (items) { strip.innerHTML = ''; items.forEach(function (m) { strip.appendChild(liveCard(m, liveHome)); }); };
        fill(r.items);
        var chips = (r.tabs || []).length ? el('div', { class: 'lv-tabs' }) : null;
        if (chips) [{ title: r.first || 'All', items: r.items }].concat(r.tabs).forEach(function (t, i) {
          var b = btn(t.title, function () {
            Array.prototype.forEach.call(chips.children, function (x) { x.classList.remove('on'); }); b.classList.add('on');
            if (t.items) return fill(t.items);
            strip.innerHTML = 'Loading…';
            var logs = [];
            Promise.resolve(addonApi(logs).getMore(t.more)).then(function (p) { fill(p.items || []); }, function (e) { strip.textContent = e.message; });
          }, 'small' + (i ? '' : ' on'));
          chips.appendChild(b);
        });
        out.push(el('h4', {}, r.title + ' (' + r.items.length + (r.more ? '+' : '') + ')'), chips, strip);
      });
      return out;
    });
  }
  function liveSearch(q) {
    liveRun('Search: ' + q, liveHome, function (api) { return api.search(q); }, function (p) {
      var strip = el('div', { class: 'lv-row lv-wrap' });
      (p.items || []).forEach(function (m) { strip.appendChild(liveCard(m, function () { liveSearch(q); })); });
      return [(p.items || []).length ? strip : el('div', { class: 'help' }, 'No results.')];
    });
  }
  function liveDetails(id, title, back) {
    var self_ = function () { liveDetails(id, title, back); };
    liveRun(title, back, function (api) { return api.load(id); }, function (d) {
      var img = el('img', { alt: '', referrerpolicy: 'no-referrer', class: 'lv-hero' });
      if (d.poster) img.src = d.poster;
      var out = [el('div', { class: 'lv-det' }, img, el('div', {}, el('strong', {}, d.title), el('div', { class: 'help' }, [d.type, d.episodes ? d.episodes.length + ' episodes' : ''].filter(Boolean).join(' · ')),
        d.plot ? el('p', {}, d.plot.slice(0, 300)) : null, d.episodes ? null : btn('▶ Sources', function () { liveSources(id, d.title, self_); }, 'primary')))];
      var groups = {};
      (d.episodes || []).forEach(function (e) { var k = e.seasonName || (e.season != null ? 'Season ' + e.season : 'Episodes'); (groups[k] = groups[k] || []).push(e); });
      Object.keys(groups).forEach(function (k) {
        var box = el('div', { class: 'lv-eps' });
        groups[k].forEach(function (e) { box.appendChild(btn((e.episode != null ? 'E' + e.episode + ' ' : '') + (e.title || ''), function () { liveSources(e.id, d.title + ' · ' + (e.title || ''), self_); }, 'small')); });
        out.push(el('h4', {}, k + ' (' + groups[k].length + ')'), box);
      });
      return out;
    });
  }
  function liveSources(id, title, back) {
    liveRun(title, back, function (api) { return api.loadLinks(id); }, function (r) {
      var links = (r && r.links) || [];
      var ul = el('ul', { class: 'detect' });
      links.forEach(function (l) { ul.appendChild(copyable(el('li', { class: l.kind !== 'embed' ? 'ok' : 'warn' }, (l.kind !== 'embed' ? '▶ ' : '▣ ') + l.name + ' — ' + l.url.slice(0, 70)), l.url)); });
      return [el('div', { class: links.length ? 'found' : 'bad' }, links.length + ' source' + (links.length === 1 ? '' : 's') + ' (as Fanoos gets them; click one to copy it)'), ul];
    });
  }

  var CSS_TEXT = [
    // The panel stays left-to-right on Arabic/Hebrew pages; typed fields follow what is typed (dir=auto), site text keeps its own direction.
    ':host{all:initial;direction:ltr;unicode-bidi:isolate}',
    'input,textarea{unicode-bidi:plaintext}.sample,code,label,li,.found{unicode-bidi:plaintext;text-align:left}',
    '.hover{position:absolute;z-index:2147483646;pointer-events:none;outline:2px solid #e8a83a;background:rgba(232,168,58,.15);display:none}',
    '.hover::after{content:attr(data-tag);position:absolute;left:0;top:-20px;background:#e8a83a;color:#1a1206;font:11px/18px monospace;padding:0 5px;border-radius:3px;white-space:nowrap}',
    '.mark{position:absolute;z-index:2147483645;pointer-events:none;outline:2px solid #3ccf7f;background:rgba(60,207,127,.08)}',
    '.panel{position:fixed;top:12px;bottom:12px;right:12px;z-index:2147483647;width:440px;max-width:calc(100vw - 24px);display:flex;flex-direction:column;',
    'background:#14163a;color:#ecebf7;border:1px solid #2b2f66;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.55);font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    '.panel.min .tabs,.panel.min .content,.panel.min .status{display:none}.panel.min{bottom:auto}',
    '.panel.left{right:auto;left:12px}.panel.dragging{opacity:.85;box-shadow:0 18px 60px rgba(0,0,0,.75)}',
    '.head{cursor:grab;user-select:none;touch-action:none}.panel.dragging .head{cursor:grabbing}',
    '.head{display:flex;align-items:center;padding:10px 12px;border-bottom:1px solid #2b2f66}',
    '.head strong{flex:1;font-size:14px}.head small{color:#9c9cc4;font-weight:400;margin-left:6px}',
    '.tabs{display:flex;border-bottom:1px solid #2b2f66}',
    '.tabs button{flex:1;padding:8px 0;background:none;border:0;color:#9c9cc4;font:600 12px system-ui,sans-serif;cursor:pointer}',
    '.tabs button.on{color:#fff;box-shadow:inset 0 -2px 0 #e8a83a}',
    '.content{padding:10px 12px;overflow-y:auto;flex:1;min-height:0}',
    'button{font:600 12px system-ui,sans-serif;color:#ecebf7;background:#272b5e;border:0;border-radius:8px;padding:7px 11px;margin:4px 6px 4px 0;cursor:pointer}',
    'button:hover{background:#343a7a}button.primary{background:#e8a83a;color:#1a1206}button.small{padding:5px 9px}button.off{opacity:.3;cursor:default}',
    '.rowedit button{margin-right:3px}',
    '.tree-line{border-radius:8px;border:1px solid transparent}.tree-line.tab{margin-left:22px}.tree-mark{color:#9c9cc4;margin-right:4px}',
    '.grip{cursor:grab;color:#6f6f99;padding:0 6px 0 2px;user-select:none}.tree-line.drop-row{border-color:#e8a83a}.tree-line.drop-tab{border-color:#3ccf7f;margin-left:22px}',
    '.icon{background:none;padding:2px 6px;margin:0 0 0 4px;font-size:15px}',
    'input,select,textarea{font:12px system-ui,sans-serif;color:#ecebf7;background:#0d0d22;border:1px solid #2b2f66;border-radius:7px;padding:6px 8px;margin:3px 6px 3px 0;box-sizing:border-box}',
    'textarea{width:100%;height:150px;font:11px/1.4 ui-monospace,Menlo,Consolas,monospace;resize:vertical}',
    '.rowedit{display:flex;align-items:center}.rowedit input{flex:1;min-width:0}.rowedit input.url{flex:2}',
    '.menu-preview{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#c8c8e0}',
    '.menu-pick{margin:8px 0;padding:8px;border:1px solid #2a2d55;border-radius:8px;max-height:260px;overflow:auto}.menu-row{display:block;font-weight:600;margin-top:6px}.menu-sub{display:block;padding-left:22px}',
    '.field{display:grid;grid-template-columns:66px 1fr auto auto;grid-template-rows:auto auto;column-gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid #22264f}',
    '.field .lbl{grid-row:1/3;font-weight:600}.field code{font:11px ui-monospace,Menlo,monospace;color:#9fd3ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.field .sample{grid-column:2;color:#c8c8e0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.field button{grid-row:1/3;grid-column:3}.field button+button{grid-column:4}',
    '.found{margin:6px 0;color:#7fdca4}.found code{color:#9fd3ff;font:11px ui-monospace,monospace;word-break:break-all}',
    'h4{margin:12px 0 4px;font-size:13px}.help{color:#9c9cc4;margin:2px 0 8px}',
    '.detect{list-style:none;padding:0;margin:4px 0;font:11px ui-monospace,monospace;word-break:break-all}.detect li{padding:3px 0}',
    '.ok{color:#7fdca4}.warn{color:#ffcf7a}.bad{color:#ffb4b4;margin:4px 0}',
    '.status{padding:7px 12px;border-top:1px solid #2b2f66;min-height:16px;color:#9c9cc4}.status:empty{display:none}',
    '.status.pick{color:#1a1206;background:#e8a83a;border-radius:0 0 14px 14px;font-weight:600}.status.ok{color:#7fdca4}.status.bad{color:#ffb4b4}',
    '.legal{color:#6f6f99;font-size:11px;padding:0 12px 8px}',
    '.copy{cursor:copy}.copy:hover{text-decoration:underline dotted}',
    'button.own{background:#3a2f12;color:#e8a83a}',
    // Rows list: one aligned grid per line (tick · handle · title · address · cards), one toolbar above.
    '.tree-tools{position:sticky;top:-12px;z-index:1;display:flex;flex-wrap:wrap;align-items:center;gap:4px;background:#14163a;padding:8px 4px;border-bottom:1px solid #22264f;margin-bottom:4px}',
    '.tree-tools button{margin:0;padding:4px 9px;min-width:28px}.tree-tools .help{margin:0 6px 0 2px;font-size:11px}',
    '.tree-tools select{max-width:130px;font-size:11px;background:#1b1e48;color:#ecebf7;border:1px solid #2b2f66;border-radius:6px;padding:3px}',
    '.tree-tools input[type=checkbox],.tree-line input[type=checkbox]{width:14px;height:14px;margin:0;padding:0;flex:none;accent-color:#e8a83a;cursor:pointer}',
    '.tree-line{display:grid;grid-template-columns:14px 12px minmax(60px,1fr) minmax(0,1.6fr) 64px;align-items:center;column-gap:6px;padding:3px 4px;border-radius:8px;border:1px solid transparent}',
    '.tree-line.tab{margin-left:20px}.tree-line.ticked{background:#1f2350}.tree-line input:not([type=checkbox]){width:100%;min-width:0;box-sizing:border-box;margin:0}',
    '.tree-line .grip{padding:0;text-align:center}',
    '.cards-tag{font-size:10px;color:#9c9cc4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:ltr;text-align:left}.cards-tag.own{color:#e8a83a}',
    '.selin{font:11px ui-monospace,Menlo,monospace;color:#9fd3ff;background:transparent;border:1px solid transparent;border-radius:4px;padding:1px 3px;width:100%;min-width:0;box-sizing:border-box}',
    '.selin:hover{border-color:#2b2f66}.selin:focus{border-color:#e8a83a;background:#0b0d26;outline:none}.found .selin{width:auto;min-width:160px}',
    '.mark.hl{outline:2px solid #ff8a2a;background:rgba(255,138,42,.16)}',
    '.live{position:fixed;top:12px;bottom:12px;z-index:2147483646;width:380px;max-width:calc(100vw - 480px);display:flex;flex-direction:column;background:#0f1130;color:#ecebf7;border:1px solid #2b2f66;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.55);font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    '.lv-top{display:flex;align-items:center;gap:6px;margin-bottom:8px}.lv-top strong{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.lv-row{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px}.lv-wrap{flex-wrap:wrap}.lv-tabs{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}.lv-tabs .on{background:#e8a83a;color:#1a1206}',
    '.lv-card{flex:0 0 96px;width:96px;background:none;border:0;color:inherit;text-align:left;cursor:pointer;padding:0;font:inherit;font-size:11px}',
    '.lv-poster{width:96px;height:140px;border-radius:8px;background:#23265a;overflow:hidden;margin-bottom:3px}.lv-poster img{width:100%;height:100%;object-fit:cover}',
    '.lv-card span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;unicode-bidi:plaintext}',
    '.lv-det{display:flex;gap:10px}.lv-hero{width:110px;height:160px;object-fit:cover;border-radius:8px;background:#23265a}.lv-det p{font-size:12px;color:#c9c9e6;unicode-bidi:plaintext}',
    '.lv-eps{display:flex;flex-wrap:wrap;gap:4px}.lv-eps button{unicode-bidi:plaintext}.lv-log{font:10px/1.3 ui-monospace,monospace;color:#9c9cc4;white-space:pre-wrap;margin-top:8px}',
    '.resize{position:absolute;top:0;bottom:0;left:-4px;width:8px;cursor:ew-resize;touch-action:none}.panel.left .resize{left:auto;right:-4px}.resize:hover{background:rgba(232,168,58,.35)}',
  ].join('\n');

  function build() {
    // A panel left by an older version of the extension (its scripts die on update, its DOM stays).
    Array.prototype.forEach.call(document.querySelectorAll('fanoos-scraper'), function (old) { old.remove(); });
    host = document.createElement('fanoos-scraper');
    var shadow = host.attachShadow({ mode: 'open' });
    root = el('div', { dir: 'ltr' });
    var style = el('style', {}); style.textContent = CSS_TEXT;
    hover = el('div', { class: 'hover' });
    marks = el('div', {});
    var tabs = el('div', { class: 'tabs', role: 'tablist' });
    TABS.forEach(function (t) { tabs.appendChild(el('button', { 'data-tab': t[0], onclick: function () { stopPick(); set(function (s) { s.tab = t[0]; }); } }, t[1])); });
    var panel = el('div', { class: 'panel', role: 'dialog', 'aria-label': 'Fanoos Scraper' },
      el('div', { class: 'head' }, el('strong', {}, 'Fanoos Scraper', el('small', {}, location.hostname)),
        btn('New', function () { stopPick(); var dock = S.dock, width = S.width; S = fresh(); S.dock = dock; S.width = width; save(); render(); status('Started a new addon for ' + location.hostname, 'ok'); }, 'small'),
        btn('Import', function () { stopPick(); importAddon(); }, 'small'),
        btn('👁', function () { toggleLive(); }, 'icon'),
        btn('⇆', function () { dockTo(S.dock === 'left' ? 'right' : 'left'); }, 'icon'),
        btn('–', function () { panel.classList.toggle('min'); }, 'icon'),
        btn('×', function () { stopPick(); marks.innerHTML = ''; host.style.display = 'none'; keepOpen(false); }, 'icon')),
      tabs, el('div', { class: 'content' }), el('div', { class: 'status' }),
      el('div', { class: 'legal' }, 'Only build addons for sites you are allowed to use.'));
    root.appendChild(hover); root.appendChild(marks); root.appendChild(panel);
    live = { pane: el('div', { class: 'live', 'aria-label': 'Live view' }), body: null };
    live.body = el('div', { class: 'content' }); live.pane.appendChild(live.body); root.appendChild(live.pane);
    placeLive(); refreshLive();
    // The page changes by itself (another season loaded…): refresh the Details samples to match.
    var refreshTimer = 0;
    new MutationObserver(function (list) {
      if (S.tab !== 'details' || picking) return;
      if (!list.some(function (m) { return m.target !== host && !host.contains(m.target) && !(m.target.closest && m.target.closest('fanoos-scraper')); })) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(function () {
        var f = shadow.activeElement;
        if (S.tab === 'details' && !picking && !(f && /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName))) render();
      }, 700);
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'aria-selected', 'aria-current'] });
    // Width: drag the inner edge (left edge when docked right, right edge when docked left).
    var grip = el('div', { class: 'resize', title: 'Drag to resize' }), sizing = null;
    panel.appendChild(grip);
    var setWidth = function (w) { panel.style.width = Math.max(320, Math.min(innerWidth - 24, w)) + 'px'; placeLive(); };
    if (S.width) setWidth(S.width);
    grip.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      sizing = { x: e.clientX, w: panel.getBoundingClientRect().width };
      grip.setPointerCapture(e.pointerId); e.preventDefault();
    });
    grip.addEventListener('pointermove', function (e) {
      if (sizing) setWidth(sizing.w + (S.dock === 'left' ? e.clientX - sizing.x : sizing.x - e.clientX));
    });
    grip.addEventListener('pointerup', function () {
      if (!sizing) return;
      sizing = null; S.width = Math.round(panel.getBoundingClientRect().width); save();
    });
    // Full height, docked left or right: drag the title bar across (it snaps to the nearer side) or press ⇆.
    function dockTo(side) {
      S.dock = side;
      save();
      panel.classList.toggle('left', side === 'left');
      placeLive();
    }
    panel.classList.toggle('left', S.dock === 'left');
    var head = panel.querySelector('.head'), drag = null;
    head.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('button')) return;
      var r = panel.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, width: r.width };
      head.setPointerCapture(e.pointerId);
      panel.classList.add('dragging');
    });
    head.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var x = Math.max(0, Math.min(innerWidth - drag.width, e.clientX - drag.dx));
      panel.style.left = x + 'px';
      panel.style.right = 'auto';
    });
    head.addEventListener('pointerup', function (e) {
      if (!drag) return;
      var center = panel.getBoundingClientRect().left + drag.width / 2;
      drag = null;
      panel.classList.remove('dragging');
      panel.style.left = panel.style.right = '';
      dockTo(center < innerWidth / 2 ? 'left' : 'right');
    });
    shadow.appendChild(style); shadow.appendChild(root);
    document.documentElement.appendChild(host);
    document.addEventListener('mousemove', onMove, true);
    ['mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(function (t) { document.addEventListener(t, swallow, true); });
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    addEventListener('resize', function () { if (cardMarks()) showMarks(listItems()); });
  }

  // Tell the extension this tab has the panel open: it adds it back after each page load (following a link
  // replaces the page, and the panel with it) until the panel is closed with ×.
  function keepOpen(on) {
    try { if (ext && ext.runtime && ext.runtime.sendMessage) Promise.resolve(ext.runtime.sendMessage({ type: on ? 'fanoos-scraper-open' : 'fanoos-scraper-closed' })).catch(function () {}); } catch (e) { /* outside the extension */ }
  }
  window.__fanoosScraper = { show: function () { host.style.display = ''; render(); keepOpen(true); } };
  load().then(function (saved) {
    // One project per site, except the addon's watch pages: some sites' Watch button leads to another domain.
    var here = location.origin + '/';
    var watchSite = saved && saved.site !== here && ((saved.watchHosts || []).indexOf(location.host) >= 0 ||
      (/^https?:/.test(document.referrer) && document.referrer.indexOf(saved.site) === 0)); // opened from the addon's site
    S = saved && (saved.site === here || watchSite) ? saved : fresh();
    if (!S.details) S.details = {};
    if (!S.links) S.links = {};
    function asWatchSite() {
      S = saved;
      S.watchHosts = (S.watchHosts || []).filter(function (h) { return h !== location.host; }).concat(location.host);
      S.tab = 'video'; // a watch page: its sources are what matters here
      save();
    }
    if (watchSite) {
      asWatchSite();
      siteNotice = { text: location.hostname + ' is a watch site of the ' + S.name + ' addon.', label: 'No: new addon for ' + location.hostname,
        act: function () { siteNotice = null; S.watchHosts = S.watchHosts.filter(function (h) { return h !== location.host; }); save(); S = fresh(); save(); render(); } };
    } else if (saved && saved.site !== S.site) {
      var prev = saved;
      siteNotice = { text: 'New addon for ' + location.hostname + '. Is this the watch page of the ' + prev.name + ' addon instead?', label: 'Yes, its watch page',
        act: function () { siteNotice = null; asWatchSite(); render(); } };
    }
    build();
    render();
    keepOpen(true);
  });
})();
