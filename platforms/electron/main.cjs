// Windows / Linux (and macOS) shell. HTTP for extensions runs here, outside the browser's CORS rules.
const { app, BrowserWindow, ipcMain, net, shell, webFrameMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// External players, best first; on Windows also VLC's usual install folders.
const PF = process.env.ProgramFiles || 'C:\\Program Files', PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
const CANDIDATES = {
  vlc: process.platform === 'win32' ? [path.join(PF, 'VideoLAN', 'VLC', 'vlc.exe'), path.join(PF86, 'VideoLAN', 'VLC', 'vlc.exe')]
    : ['/usr/bin/vlc', '/snap/bin/vlc', '/Applications/VLC.app/Contents/MacOS/VLC'],
  mpv: process.platform === 'win32' ? [path.join(PF, 'mpv', 'mpv.exe'), path.join(process.env.LOCALAPPDATA || '', 'Programs', 'mpv', 'mpv.exe')]
    : ['/usr/bin/mpv', '/usr/local/bin/mpv', '/opt/homebrew/bin/mpv', '/Applications/mpv.app/Contents/MacOS/mpv'],
};

// which: 'vlc' | 'mpv' = exactly that player; '' = FANOOS_PLAYER, else the first one installed.
function findPlayer(which) {
  if (!which && process.env.FANOOS_PLAYER) return process.env.FANOOS_PLAYER;
  const list = which ? CANDIDATES[which] || [] : CANDIDATES.vlc.concat(CANDIDATES.mpv);
  return list.filter((p) => fs.existsSync(p))[0] || null;
}

const ALLOWED = /^(https?|file):/i;

// Requests to ad servers (player frames included) are cancelled. List: app/adblock.txt, subdomains match too.
function blockAds(session) {
  let hosts = new Set();
  try {
    hosts = new Set(fs.readFileSync(path.join(__dirname, 'app', 'adblock.txt'), 'utf8').split(/\r?\n/)
      .map((l) => l.trim().toLowerCase()).filter((l) => l && l[0] !== '#'));
  } catch { return; }
  const blocked = (host) => {
    for (let h = host.toLowerCase(); h; h = h.indexOf('.') < 0 ? '' : h.slice(h.indexOf('.') + 1)) if (hosts.has(h)) return true;
    return false;
  };
  session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => {
    let host = '';
    try { host = new URL(d.url).hostname; } catch { /* keep */ }
    cb({ cancel: !!host && blocked(host) });
  });
}

// Video hosts that only serve their own player: requests to a registered host carry its player's Referer,
// and its answers may be read by the page (hls.js). Fanoos registers a host just before playing from it.
const REFERERS = new Map();
ipcMain.handle('fanoos:referer', (_e, { host, ref }) => { if (host && /^https?:/i.test(ref || '')) REFERERS.set(host, ref); });
const refFor = (url) => { try { return REFERERS.get(new URL(url).hostname); } catch { return undefined; } };
// The watcher: while on, video file requests made by frames are noted with their Referer (sniffer.ts polls them).
let sniffing = false;
let sniffed = [];
ipcMain.handle('fanoos:sniff', (_e, action) => {
  if (action === 'start') { sniffing = true; sniffed = []; return []; }
  if (action === 'stop') { sniffing = false; sniffed = []; return []; }
  return sniffed.slice();
});
function sendReferers(session) {
  session.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => {
    if (sniffing && d.resourceType !== 'mainFrame') {
      let path = '';
      try { path = new URL(d.url).pathname.toLowerCase(); } catch { /* keep */ }
      if (/\.(m3u8|mp4|mpd)$/.test(path)) sniffed.push({ url: d.url, ref: d.requestHeaders.Referer || d.requestHeaders.referer });
    }
    const ref = refFor(d.url);
    if (ref) d.requestHeaders.Referer = ref;
    cb({ requestHeaders: d.requestHeaders });
  });
  session.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => {
    if (refFor(d.url)) d.responseHeaders['Access-Control-Allow-Origin'] = ['*'];
    cb({ responseHeaders: d.responseHeaders });
  });
}

// Runs app/adclean.js inside other sites' player frames (not YouTube/Dailymotion, not Fanoos itself).
function cleanPlayerFrames(contents) {
  let code = '';
  try { code = fs.readFileSync(path.join(__dirname, 'app', 'adclean.js'), 'utf8'); } catch { return; }
  contents.on('did-frame-finish-load', (_e, isMainFrame, pid, rid) => {
    if (isMainFrame) return;
    const frame = webFrameMain.fromId(pid, rid);
    if (!frame || !/^https?:/i.test(frame.url) || /(youtube(-nocookie)?|dailymotion|google)\.com/i.test(frame.url)) return;
    frame.executeJavaScript(code).catch(() => {});
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0f0f12',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  blockAds(win.webContents.session);
  sendReferers(win.webContents.session);
  cleanPlayerFrames(win.webContents);
  // Player pages (no sandbox) may try to send the whole window to an ad: Fanoos stays put.
  win.webContents.on('will-navigate', (e, url) => { if (!/^file:/i.test(url)) e.preventDefault(); });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') win.setFullScreen(!win.isFullScreen());
  });
}

ipcMain.handle('fanoos:request', async (_e, req) => {
  if (!ALLOWED.test(req.url)) throw new Error('Blocked URL scheme');
  const r = await net.fetch(req.url, { method: req.method || 'GET', headers: req.headers, body: req.body });
  const headers = {};
  r.headers.forEach((v, k) => { headers[k] = v; });
  return { status: r.status, headers, body: await r.text(), url: r.url };
});

ipcMain.handle('fanoos:binary', async (_e, url) => {
  if (!ALLOWED.test(url)) throw new Error('Blocked URL scheme');
  const r = await net.fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return new Uint8Array(await r.arrayBuffer());
});

ipcMain.handle('fanoos:open', async (_e, { url, title, player: which }) => {
  if (!/^https?:/i.test(url)) throw new Error('Blocked URL scheme');
  const player = findPlayer(which);
  if (!player && which) throw new Error('not-installed');
  if (!player) return shell.openExternal(url); // no player installed: default app/browser
  const args = /vlc/i.test(player) && title ? ['--meta-title=' + title, url] : /mpv/i.test(player) && title ? ['--force-media-title=' + title, url] : [url];
  spawn(player, args, { detached: true, stdio: 'ignore' }).unref();
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
