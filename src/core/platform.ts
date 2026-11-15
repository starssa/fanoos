// Platform adapters. The only place that knows which device we're on.
// Everything above this file is identical on Android, iOS, Windows, Linux, Tizen and webOS.

export type PlatformName = 'tizen' | 'webos' | 'android' | 'ios' | 'electron' | 'linux' | 'web';

const w = window as any;

// Native shells (platforms/android, platforms/linux) load the app as index.html?shell=<name>
// and expose an HTTP bridge at ./__proxy plus ./__exit.
const shellMatch = /[?&]shell=(android|linux)\b/.exec(location.search);
export const shell = shellMatch ? shellMatch[1] : '';

function detect(): PlatformName {
  if (shell) return shell as PlatformName;
  if (typeof w.tizen !== 'undefined') return 'tizen';
  if (typeof w.webOS !== 'undefined' || typeof w.PalmSystem !== 'undefined') return 'webos';
  if (w.fanoosNative) return 'electron';
  const cap = w.Capacitor;
  if (cap && cap.getPlatform) {
    const p = cap.getPlatform();
    if (p === 'android' || p === 'ios') return p;
  }
  return 'web';
}

export const platform: PlatformName = detect();
export const isTV =
  platform === 'tizen' || platform === 'webos' || (shell === 'android' && !('ontouchstart' in window)) || /\b(SmartTV|SMART-TV|AFT\w|BRAVIA|GoogleTV|Android TV)\b/i.test(navigator.userAgent);

// ---------- HTTP (CORS-free where the platform allows it) ----------

export interface HttpRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}
export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  url: string;
}

function isSameOrigin(url: string): boolean {
  try { return new URL(url, location.href).origin === location.origin; } catch { return true; }
}

function capHttp(): any {
  const c = w.Capacitor;
  return c && c.Plugins && c.Plugins.CapacitorHttp && (platform === 'android' || platform === 'ios') ? c.Plugins.CapacitorHttp : null;
}

function parseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  raw.split(/\r?\n/).forEach((line) => {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  });
  return out;
}

// fetch() can't read file:// (TV packaged apps), XHR can.
function xhr(req: HttpRequest, type: 'text' | 'arraybuffer'): Promise<XMLHttpRequest> {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open(req.method || 'GET', req.url, true);
    x.responseType = type;
    if (req.headers) for (const k in req.headers) { try { x.setRequestHeader(k, req.headers[k]); } catch { /* forbidden header */ } }
    x.onload = () => res(x);
    x.onerror = () => rej(new Error('Network error: ' + req.url));
    x.send(req.body == null ? null : req.body);
  });
}

function shellUrl(req: HttpRequest, bin: boolean): string {
  return new URL('__proxy?' + (bin ? 'bin=1&' : '') + 'r=' + encodeURIComponent(JSON.stringify(req)), location.href).href;
}

/**
 * Hosts like mixdrop only serve a video file to their own player page: ask the app to send `referer` with every
 * request to this file's host (Android and desktop apps). False where that isn't possible (browsers, TVs).
 */
// Android: the app's video relay on 127.0.0.1 (LocalProxy) fetches a video with a Referer and passes it back as a
// normal HTTP server would (byte ranges included), so the player can seek and resume.
let relayPort = 0;
// TVs (Samsung/LG) can't send a Referer: a computer running serve-repo.py relays for them (set when its
// repository is added: repo.json says "relay": true).
let lanRelay = '';
try { lanRelay = localStorage.getItem('fanoos.lanRelay') || ''; } catch { /* storage off */ }
export const getLanRelay = () => lanRelay;
export function setLanRelay(origin: string) {
  lanRelay = origin.replace(/\/+$/, '');
  try { if (lanRelay) localStorage.setItem('fanoos.lanRelay', lanRelay); else localStorage.removeItem('fanoos.lanRelay'); } catch { /* storage off */ }
}
const nativeReferer = () => shell === 'android' || !!(w.fanoosNative && w.fanoosNative.setReferer);
export const relayAddress = (url: string, referer: string) =>
  (relayPort ? 'http://127.0.0.1:' + relayPort + '/s' : lanRelay + '/relay') + '?u=' + encodeURIComponent(url) + '&r=' + encodeURIComponent(referer);
/** The relay address for this video, or '' where there is no relay (not Android). */
export async function relayUrl(url: string, referer: string): Promise<string> {
  if (shell !== 'android') return !nativeReferer() && lanRelay ? relayAddress(url, referer) : '';
  if (!relayPort) {
    try { relayPort = parseInt(await (await fetch(new URL('__streamport', location.href).href)).text(), 10) || 0; } catch { relayPort = 0; }
  }
  return relayPort ? relayAddress(url, referer) : '';
}

/** Videos that need a Referer can play: the apps send it themselves, TVs through a computer's relay. */
export const canSendReferer = () => nativeReferer() || !!lanRelay;
/** This TV sends Referer-needing videos through a computer (tried only after the direct address fails). */
export const usesLanRelay = () => !!lanRelay && !nativeReferer();

export async function allowReferer(url: string, referer: string): Promise<boolean> {
  let host = '';
  try { host = new URL(url).hostname; } catch { return false; }
  try {
    if (shell === 'android') {
      const r = await fetch(new URL('__referer?host=' + encodeURIComponent(host) + '&ref=' + encodeURIComponent(referer), location.href).href);
      return r.ok;
    }
    if (w.fanoosNative && w.fanoosNative.setReferer) { await w.fanoosNative.setReferer(host, referer); return true; }
  } catch { /* fall through */ }
  return false;
}

export async function httpRequest(req: HttpRequest): Promise<HttpResponse> {
  if (shell && !isSameOrigin(req.url)) {
    const r = await fetch(shellUrl(req, false));
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
  if (/^file:/i.test(req.url)) {
    const x = await xhr(req, 'text');
    return { status: x.status || 200, headers: parseHeaders(x.getAllResponseHeaders()), body: x.responseText, url: req.url };
  }
  if (!isSameOrigin(req.url)) {
    if (w.fanoosNative && w.fanoosNative.request) return w.fanoosNative.request(req); // Electron main process
    const cap = capHttp(); // Android/iOS native HTTP stack
    if (cap) {
      const r = await cap.request({ url: req.url, method: req.method || 'GET', headers: req.headers || {}, data: req.body, responseType: 'text' });
      return { status: r.status, headers: r.headers || {}, body: typeof r.data === 'string' ? r.data : JSON.stringify(r.data), url: r.url || req.url };
    }
  }
  // TVs: a request with a Referer (video hosts' pages check it) goes through the computer's relay, which sends it.
  if (lanRelay && !nativeReferer() && req.headers && Object.keys(req.headers).some((k) => /^referer$/i.test(k))) {
    try {
      const rr = await fetch(lanRelay + '/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
      const j = await rr.json();
      if (j && !j.error) return { status: j.status, headers: j.headers || {}, body: j.body, url: j.url || req.url };
    } catch { /* relay off: try directly */ }
  }
  // Browser, Tizen (<access origin="*">), webOS: plain fetch.
  const r = await fetch(req.url, { method: req.method || 'GET', headers: req.headers, body: req.body });
  const headers: Record<string, string> = {};
  r.headers.forEach((v, k) => { headers[k] = v; });
  return { status: r.status, headers, body: await r.text(), url: r.url || req.url };
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export async function httpBinary(url: string): Promise<ArrayBuffer> {
  if (shell && !isSameOrigin(url)) {
    const r = await fetch(shellUrl({ url }, true));
    if (!r.ok) throw new Error(await r.text());
    return r.arrayBuffer();
  }
  if (/^file:/i.test(url)) return (await xhr({ url }, 'arraybuffer')).response as ArrayBuffer;
  if (!isSameOrigin(url)) {
    if (w.fanoosNative && w.fanoosNative.requestBinary) return w.fanoosNative.requestBinary(url);
    const cap = capHttp();
    if (cap) {
      const r = await cap.request({ url, method: 'GET', responseType: 'arraybuffer' });
      if (r.status >= 400) throw new Error(`HTTP ${r.status} for ${url}`);
      return typeof r.data === 'string' ? base64ToBuffer(r.data) : r.data;
    }
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.arrayBuffer();
}

// ---------- External players ----------

/** Where Fanoos can hand a stream to another app (VLC, MX Player, mpv, the YouTube app…). TVs can't. */
export const canOpenExternal = !!shell || platform === 'electron' || platform === 'web';

/** Thrown when the chosen player app isn't installed (so the UI can offer to install it). */
export class NotInstalledError extends Error {}

/**
 * player: 'vlc' | 'mpv' to use exactly that app, '' to let the system pick.
 * androidPackage: the app's package on Android (e.g. org.videolan.vlc).
 */
export async function openExternal(url: string, title: string, mime = '', player = '', androidPackage = ''): Promise<void> {
  if (shell) {
    const qs = 'url=' + encodeURIComponent(url) + '&type=' + encodeURIComponent(mime) + '&title=' + encodeURIComponent(title) +
      '&player=' + encodeURIComponent(player) + '&pkg=' + encodeURIComponent(shell === 'android' ? androidPackage : '');
    const r = await fetch('__open?' + qs);
    if (!r.ok) { const t = await r.text(); throw t === 'not-installed' ? new NotInstalledError(t) : new Error(t); }
    return;
  }
  if (w.fanoosNative && w.fanoosNative.open) {
    try { return await w.fanoosNative.open({ url, title, player }); } catch (e) {
      if (/not-installed/.test(String(e))) throw new NotInstalledError('not-installed');
      throw e;
    }
  }
  if (!window.open(url, '_blank')) throw new Error('The browser blocked the new tab');
}

// ---------- Remote control keys ----------

export const KEYS = {
  LEFT: [37], UP: [38], RIGHT: [39], DOWN: [40], ENTER: [13],
  BACK: [27, 8, 10009, 461], // Esc, Backspace, Tizen Return, webOS Back
  PLAY: [415, 250], PAUSE: [19], PLAY_PAUSE: [179, 10252, 463],
  STOP: [413, 178], FF: [417, 228], RW: [412, 227],
};
export type KeyName = keyof typeof KEYS;

export function isKey(code: number, name: KeyName): boolean {
  return KEYS[name].indexOf(code) >= 0;
}

export function registerTvKeys(): void {
  if (platform !== 'tizen') return;
  ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind'].forEach((k) => {
    try { w.tizen.tvinputdevice.registerKey(k); } catch { /* not supported on this model */ }
  });
}

export function exitApp(): void {
  if (shell) { fetch('__exit').catch(() => {}); return; }
  try {
    if (platform === 'tizen') return w.tizen.application.getCurrentApplication().exit();
    if (platform === 'webos' && w.webOS && w.webOS.platformBack) return w.webOS.platformBack();
    if (platform === 'android' && w.Capacitor?.Plugins?.App?.exitApp) return w.Capacitor.Plugins.App.exitApp();
  } catch { /* fall through */ }
  window.close();
}
