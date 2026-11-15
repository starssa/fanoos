// Talks to the Fanoos Scraper extension (bridge.js) so the live preview can download any site.
// Without it, browsers only let the Studio read sites that send CORS headers.
// It plugs in as window.fanoosNative, which src/core/platform.ts already uses for cross-site requests.
const w = window as any;
let seq = 0;
const pending: Record<number, (r: any) => void> = {};
let ready = false;
const onReady: (() => void)[] = [];
const onApproved: (() => void)[] = [];

export const bridgeActive = () => ready;
export function whenBridgeReady(fn: () => void) { if (ready) fn(); else onReady.push(fn); }
export function whenApproved(fn: () => void) { onApproved.push(fn); }

function call(req: unknown, binary: boolean): Promise<any> {
  const id = ++seq;
  return new Promise((res) => {
    pending[id] = res;
    window.postMessage({ fanoosBridge: 'request', id, req, binary }, '*');
  });
}

function check(r: any) {
  if (r && r.error === 'not-approved') throw new Error('Allow this Studio in the "Allow Fanoos Studio?" tab the Fanoos Scraper extension opened; the preview reloads by itself.');
  if (!r || r.error) throw new Error((r && r.error) || 'The Fanoos Scraper extension did not answer');
  return r;
}

function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function enable() {
  if (ready) return;
  ready = true;
  w.fanoosNative = {
    request: async (req: unknown) => check(await call(req, false)),
    requestBinary: async (url: string) => fromBase64(check(await call({ url }, true)).body),
  };
  onReady.splice(0).forEach((f) => f());
}

window.addEventListener('message', (e) => {
  const d = e.data;
  if (e.source !== window || !d || typeof d !== 'object') return;
  if (d.fanoosBridge === 'ready') enable();
  else if (d.fanoosBridge === 'approved') onApproved.forEach((f) => f());
  else if (d.fanoosBridge === 'response') {
    if (d.res && d.res.pong) enable();
    const p = pending[d.id];
    if (p) { delete pending[d.id]; p(d.res); }
  }
});
// The extension's script may have loaded before or after us: say hello in case we missed its "ready".
window.postMessage({ fanoosBridge: 'request', id: 0, ping: true }, '*');
