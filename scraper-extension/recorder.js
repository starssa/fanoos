// Runs in the page's own world (the scraper's "watch how the site loads it"): reports each request the page
// makes (XMLHttpRequest and fetch) to the scraper panel with window.postMessage. Reads nothing back.
(function () {
  if (window.__fanoosRecorder) return;
  window.__fanoosRecorder = true;
  function bodyText(b) {
    if (b == null) return '';
    if (typeof b === 'string') return b;
    try {
      if (b instanceof URLSearchParams) return b.toString();
      if (b instanceof FormData) { var p = new URLSearchParams(); b.forEach(function (v, k) { if (typeof v === 'string') p.append(k, v); }); return p.toString(); }
    } catch (e) { /* old browser */ }
    return '';
  }
  function report(method, url, body, type) {
    try { window.postMessage({ __fanoosRec: { method: String(method || 'GET').toUpperCase(), url: new URL(url, location.href).href, body: bodyText(body), type: type || '' } }, '*'); } catch (e) { /* ignore */ }
  }
  var open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send, setH = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, u) { this.__fr = { m: m, u: u, t: '' }; return open.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { if (this.__fr && /^content-type$/i.test(k)) this.__fr.t = v; return setH.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) { if (this.__fr) report(this.__fr.m, this.__fr.u, b, this.__fr.t); return send.apply(this, arguments); };
  var f = window.fetch;
  if (f) window.fetch = function (input, init) {
    try {
      var u = typeof input === 'string' ? input : input && input.url, h = init && init.headers, t = '';
      if (h) t = typeof h.get === 'function' ? h.get('content-type') || '' : h['Content-Type'] || h['content-type'] || '';
      report((init && init.method) || (input && input.method) || 'GET', u, init && init.body, t);
    } catch (e) { /* ignore */ }
    return f.apply(this, arguments);
  };
})();
