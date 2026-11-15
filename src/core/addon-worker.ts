// Runs inside a Web Worker: one worker per addon.
// A crash or infinite loop in an addon can't freeze the UI, and the addon only sees the
// `fanoos` API below — no DOM, no direct network (all HTTP is permission-checked by the host).
const scope: any = self;
let impl: Record<string, any> | null = null;
let seq = 0;
const pending: Record<number, { res: (v: any) => void; rej: (e: Error) => void }> = {};

function callHost(method: string, args: unknown[]): Promise<any> {
  const id = ++seq;
  return new Promise((res, rej) => {
    pending[id] = { res, rej };
    scope.postMessage({ kind: 'host-call', id, method, args });
  });
}

function response(r: any) {
  return {
    status: r.status,
    ok: r.status >= 200 && r.status < 300,
    headers: r.headers,
    url: r.url,
    text: r.body as string,
    json() { return JSON.parse(r.body); },
  };
}

const fanoos = {
  apiVersion: 1,
  register(o: Record<string, any>) { impl = o; },
  http: {
    request(opts: { url: string; method?: string; headers?: Record<string, string>; body?: string }) {
      return callHost('http', [opts]).then(response);
    },
    get(url: string, opts: { headers?: Record<string, string> } = {}) {
      return fanoos.http.request({ url, method: 'GET', headers: opts.headers });
    },
    post(url: string, body: unknown, opts: { headers?: Record<string, string> } = {}) {
      return fanoos.http.request({ url, method: 'POST', headers: opts.headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
    },
  },
  // Jsoup-like selection, parsed on the main thread (workers have no DOMParser).
  html: {
    select(html: string, selector: string, sub?: string[]): Promise<{ text: string; html: string; attrs: Record<string, string>; sub?: unknown[] }[]> {
      return callHost('html.select', sub ? [html, selector, sub] : [html, selector]);
    },
  },
  storage: {
    get: (k: string) => callHost('storage.get', [k]),
    set: (k: string, v: unknown) => callHost('storage.set', [k, v]),
  },
  settings: { get: (k: string) => callHost('settings.get', [k]) },
  log: (...a: unknown[]) => callHost('log', [a.map(String).join(' ')]),
  util: {
    absUrl: (rel: string, base: string) => new URL(rel, base).href,
    qs: (o: Record<string, string | number>) => Object.keys(o).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(String(o[k]))).join('&'),
  },
};

scope.onmessage = async (e: MessageEvent) => {
  const m = e.data;
  if (m.kind === 'host-reply') {
    const p = pending[m.id];
    if (!p) return;
    delete pending[m.id];
    if (m.error) p.rej(new Error(m.error)); else p.res(m.result);
    return;
  }
  if (m.kind === 'init') {
    try {
      // Close the side doors so addons must go through fanoos.http (permission-checked).
      scope.fetch = undefined;
      scope.XMLHttpRequest = undefined;
      scope.importScripts = undefined;
      scope.WebSocket = undefined;
      new Function('fanoos', 'manifest', '"use strict";\n' + m.code)(fanoos, m.manifest);
      if (!impl) throw new Error('addon did not call fanoos.register()');
      scope.postMessage({ kind: 'ready', methods: Object.keys(impl).filter((k) => typeof impl![k] === 'function') });
    } catch (err: any) {
      scope.postMessage({ kind: 'init-error', error: String((err && err.message) || err) });
    }
    return;
  }
  if (m.kind === 'call') {
    try {
      const result = await impl![m.method].apply(impl, m.args);
      scope.postMessage({ kind: 'result', id: m.id, result });
    } catch (err: any) {
      scope.postMessage({ kind: 'result', id: m.id, error: String((err && err.message) || err) });
    }
  }
};
