// Inject the scraper into the current tab (activeTab grants access because the user clicked our button).
var api = typeof browser !== 'undefined' ? browser : chrome;
document.getElementById('go').addEventListener('click', function () {
  api.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
    return api.scripting.executeScript({ target: { tabId: tabs[0].id }, files: ['jszip.min.js', 'template.js', 'content.js'] });
  }).then(function () { window.close(); }, function (e) {
    document.getElementById('err').textContent = 'Cannot run on this page (' + (e && e.message || e) + '). Browser pages like about: and the add-ons store are protected.';
  });
});

// Studio locations allowed to use the extension for their live preview (approved in approve.html).
function showAccess() {
  var box = document.getElementById('access');
  Promise.resolve(api.storage.local.get('fanoosBridgeAllowed')).then(function (r) {
    var list = (r && r.fanoosBridgeAllowed) || [];
    box.innerHTML = '';
    if (!list.length) return;
    var h = document.createElement('h2'); h.textContent = 'Studios allowed to load sites'; box.appendChild(h);
    list.forEach(function (o) {
      var row = document.createElement('div'), t = document.createElement('span'), x = document.createElement('button');
      row.className = 'acc'; t.textContent = o === 'file://' ? 'Studio opened from a file' : o; x.textContent = 'Remove';
      x.addEventListener('click', function () {
        api.storage.local.set({ fanoosBridgeAllowed: list.filter(function (v) { return v !== o; }) }).then(showAccess);
      });
      row.appendChild(t); row.appendChild(x); box.appendChild(row);
    });
  });
}
showAccess();

// Firefox (Manifest V3) lets users withhold "Access your data for all websites", and temporary
// add-ons don't get the install prompt. Without it the Studio bridge can't run, so ask for it here.
var ALL = { origins: ['<all_urls>'] };
function checkPerm() {
  Promise.resolve(api.permissions.contains(ALL)).then(function (ok) { document.getElementById('perm').hidden = ok; });
}
document.getElementById('grant').addEventListener('click', function () {
  Promise.resolve(api.permissions.request(ALL)).then(function (ok) {
    checkPerm();
    if (ok) document.getElementById('err').textContent = 'Done. Reload your Fanoos Studio tab.';
  }, function () {
    document.getElementById('err').textContent = 'Open about:addons → Fanoos Scraper → Permissions, and turn on "Access your data for all websites".';
  });
});
checkPerm();
