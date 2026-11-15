// Runs in every page but only wakes up in Fanoos Studio (it marks itself with <meta name="fanoos-studio">).
// Relays the Studio's page requests to background.js and the answers back.
(function () {
  if (!document.querySelector('meta[name="fanoos-studio"]')) return;
  var api = typeof browser !== 'undefined' ? browser : chrome;
  var origin = location.protocol === 'file:' ? 'file://' : location.origin;
  function reply(id, res) { window.postMessage({ fanoosBridge: 'response', id: id, res: res }, '*'); }
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (e.source !== window || !d || d.fanoosBridge !== 'request') return;
    if (d.ping) return reply(d.id, { pong: true });
    Promise.resolve(api.runtime.sendMessage({ type: 'fanoos-fetch', origin: origin, req: d.req, binary: !!d.binary }))
      .then(function (res) { reply(d.id, res || { error: 'No answer from the extension' }); },
        function (err) { reply(d.id, { error: String((err && err.message) || err) }); });
  });
  api.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === 'fanoos-approved') window.postMessage({ fanoosBridge: 'approved' }, '*');
  });
  window.postMessage({ fanoosBridge: 'ready' }, '*');
})();
