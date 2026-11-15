// Fanoos Studio bridge: downloads pages for the Studio's live preview, which a web page cannot do
// itself (browsers block reading other sites: CORS). Only for Studio locations the user approved,
// and never with the user's cookies.
var api = typeof browser !== 'undefined' ? browser : chrome;
var KEY = 'fanoosBridgeAllowed';
var asking = {};

function allowedList() { return Promise.resolve(api.storage.local.get(KEY)).then(function (r) { return (r && r[KEY]) || []; }); }

function toBase64(buf) {
  var s = '', u = new Uint8Array(buf);
  for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}

function handle(msg, sender) {
  var origin = String(msg.origin || '');
  return allowedList().then(function (list) {
    if (list.indexOf(origin) < 0) {
      if (!asking[origin]) { // one approval tab per Studio location, not one per request
        asking[origin] = true;
        api.tabs.create({ url: api.runtime.getURL('approve.html') + '?origin=' + encodeURIComponent(origin) + '&tab=' + sender.tab.id });
      }
      return { error: 'not-approved' };
    }
    var req = msg.req || {};
    if (!/^https?:\/\//i.test(req.url || '')) return { error: 'Blocked URL scheme' };
    return Promise.resolve(api.permissions.contains({ origins: [req.url] })).then(function (ok) {
      if (!ok) return { error: 'The Fanoos Scraper extension is not allowed to access ' + req.url.split('/')[2] + '. Click its toolbar button → Allow access to all websites.' };
      return send(msg, req);
    });
  });
}

function send(msg, req) {
  return fetch(req.url, { method: req.method || 'GET', headers: req.headers || {}, body: req.body == null ? undefined : req.body, credentials: 'omit' })
    .then(function (r) {
      var headers = {};
      r.headers.forEach(function (v, k) { headers[k] = v; });
      return (msg.binary ? r.arrayBuffer().then(toBase64) : r.text()).then(function (body) {
        return { status: r.status, headers: headers, body: body, url: r.url };
      });
    }, function (e) { return { error: String((e && e.message) || e) }; });
}

// Tabs with the scraper panel open: after each page load there, the panel is injected again.
var OPEN_KEY = 'fanoosScraperTabs';
var openArea = api.storage.session || api.storage.local; // session: forgotten when the browser closes
function openTabs() { return Promise.resolve(openArea.get(OPEN_KEY)).then(function (r) { return (r && r[OPEN_KEY]) || []; }); }
function setOpen(tabId, on) {
  return openTabs().then(function (list) {
    list = list.filter(function (id) { return id !== tabId; });
    if (on) list.push(tabId);
    var o = {}; o[OPEN_KEY] = list;
    return openArea.set(o);
  });
}
api.tabs.onUpdated.addListener(function (tabId, info) {
  if (info.status !== 'complete') return;
  openTabs().then(function (list) {
    if (list.indexOf(tabId) < 0) return;
    return api.scripting.executeScript({ target: { tabId: tabId }, files: ['jszip.min.js', 'template.js', 'content.js'] });
  }).catch(function () { /* a page the extension may not touch (about:, the add-ons store) */ });
});
api.tabs.onRemoved.addListener(function (tabId) { setOpen(tabId, false); });

api.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !sender.tab) return false;
  if (msg.type === 'fanoos-scraper-open' || msg.type === 'fanoos-scraper-closed') { setOpen(sender.tab.id, msg.type === 'fanoos-scraper-open'); return false; }
  if (msg.type === 'fanoos-fetch') { handle(msg, sender).then(sendResponse); return true; }
  if (msg.type === 'fanoos-scraper-record') { // the scraper learning how a page loads a season: watch its requests
    api.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId || 0] }, files: ['recorder.js'], world: 'MAIN' })
      .then(function () { sendResponse({ ok: true }); }, function (e) { sendResponse({ error: String(e && e.message || e) }); });
    return true;
  }
  if (msg.type === 'fanoos-scraper-fetch') { // the scraper panel looking inside a player frame (bridge.js never sends this)
    var req = msg.req || {};
    if (!/^https?:\/\//i.test(req.url || '')) { sendResponse({ error: 'Blocked URL scheme' }); return false; }
    Promise.resolve(api.permissions.contains({ origins: [req.url] })).then(function (ok) {
      return ok ? send(msg, { url: req.url, headers: req.headers, method: req.method, body: req.body }) : { error: 'no-permission' };
    }).then(sendResponse);
    return true;
  }
  if (msg.type === 'fanoos-approved') { // from approve.html: tell the waiting Studio tab to retry
    delete asking[msg.origin];
    api.tabs.sendMessage(msg.tab, { type: 'fanoos-approved' }).catch(function () {});
  }
  return false;
});
