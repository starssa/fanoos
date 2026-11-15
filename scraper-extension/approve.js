var api = typeof browser !== 'undefined' ? browser : chrome;
var q = new URLSearchParams(location.search), origin = q.get('origin') || '', tab = +q.get('tab');
document.getElementById('origin').textContent = origin === 'file://' ? 'a Studio opened from a file on this computer (file://)' : origin;
function done() { api.tabs.getCurrent().then(function (t) { api.tabs.remove(t.id); }); }
document.getElementById('allow').addEventListener('click', function () {
  Promise.resolve(api.storage.local.get('fanoosBridgeAllowed')).then(function (r) {
    var list = (r && r.fanoosBridgeAllowed) || [];
    if (list.indexOf(origin) < 0) list.push(origin);
    return api.storage.local.set({ fanoosBridgeAllowed: list });
  }).then(function () { return api.runtime.sendMessage({ type: 'fanoos-approved', origin: origin, tab: tab }); }).then(done, done);
});
document.getElementById('deny').addEventListener('click', done);
