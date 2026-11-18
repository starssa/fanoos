// Main-thread side of an addon: owns its worker, answers its host calls,
// enforces its network permissions.
import AddonWorker from './addon-worker?worker&inline';
import { httpRequest, type HttpRequest } from './platform';
import { kv } from './storage';
import { getAddonSettings } from './settings';
import { hostMatches, errMsg } from './util';
import { HOST_API_VERSION, type InstalledAddon } from './types';

const CALL_TIMEOUT = 45000;

type Pending = { res: (v: any) => void; rej: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

/** `:contains("text")` (jQuery style, also `:contains(., "text")`): elements whose text includes it. Not CSS, so done
 *  here; the Scraper has the same function (scraper-extension/content.js). A selector after it searches inside each match.
 *  shortcut: no "," lists or "+"/"~" right after :contains(…), use "||" or put them before it. */
export function queryAll(root: ParentNode, sel: string): Element[] {
  const m = /:contains\(\s*(?:\.\s*,\s*)?(["'])((?:(?!\1).)*)\1\s*\)/.exec(sel);
  if (!m) return Array.prototype.slice.call(root.querySelectorAll(sel));
  const head = sel.slice(0, m.index), rest = sel.slice(m.index + m[0].length);
  const more = /^(?:"[^"]*"|'[^']*'|\([^)]*\)|[^\s>+~,])*/.exec(rest)![0], tail = rest.slice(more.length);
  let base = head + more;
  if (!base || /[\s>+~]$/.test(base)) base += '*';
  const found = queryAll(root, base).filter((e) => (e.textContent || '').indexOf(m[2]) >= 0);
  if (!tail.trim()) return found;
  const out: Element[] = [];
  for (const e of found) for (const x of queryAll(e, ':scope' + tail)) if (out.indexOf(x) < 0) out.push(x);
  return out;
}

export class AddonHost {
  readonly ready: Promise<string[]>;
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private methods: string[] = [];
  private disposed = false;
  private resolveReady!: (m: string[]) => void;
  private rejectReady!: (e: Error) => void;

  constructor(readonly addon: InstalledAddon) {
    this.ready = new Promise<string[]>((res, rej) => { this.resolveReady = res; this.rejectReady = rej; });
    this.worker = new AddonWorker();
    this.worker.onmessage = (e: MessageEvent) => this.onMessage(e.data);
    this.worker.onerror = (e: ErrorEvent) => {
      e.preventDefault();
      this.rejectReady(new Error(`${this.name}: ${e.message}`));
    };
    this.worker.postMessage({ kind: 'init', code: addon.code, manifest: addon.manifest, hostApi: HOST_API_VERSION });
  }

  get name() { return this.addon.manifest.name; }
  has(method: string) { return this.methods.indexOf(method) >= 0; }

  call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    if (this.disposed) return Promise.reject(new Error(`${this.name} was stopped`));
    if (!this.has(method)) return Promise.reject(new Error(`${this.name} does not implement ${method}()`));
    const id = ++this.seq;
    return new Promise<T>((res, rej) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rej(new Error(`${this.name}.${method}() timed out`));
      }, CALL_TIMEOUT);
      this.pending.set(id, { res, rej, timer });
      this.worker.postMessage({ kind: 'call', id, method, args });
    });
  }

  dispose() {
    this.disposed = true;
    this.worker.terminate();
    this.pending.forEach((p) => { clearTimeout(p.timer); p.rej(new Error(`${this.name} was stopped`)); });
    this.pending.clear();
  }

  private onMessage(m: any) {
    switch (m.kind) {
      case 'ready':
        this.methods = m.methods;
        this.resolveReady(m.methods);
        break;
      case 'init-error':
        this.rejectReady(new Error(`${this.name} failed to start: ${m.error}`));
        break;
      case 'result': {
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        clearTimeout(p.timer);
        if (m.error) p.rej(new Error(m.error)); else p.res(m.result);
        break;
      }
      case 'host-call':
        this.hostCall(m.method, m.args).then(
          (result) => this.reply(m.id, result),
          (err) => this.reply(m.id, undefined, errMsg(err)),
        );
        break;
    }
  }

  private reply(id: number, result: unknown, error?: string) {
    if (!this.disposed) this.worker.postMessage({ kind: 'host-reply', id, result, error });
  }

  private checkPermission(url: string) {
    let host: string;
    try { host = new URL(url).hostname; } catch { throw new Error('Invalid URL: ' + url); }
    const allowed = (this.addon.manifest.permissions && this.addon.manifest.permissions.hosts) || [];
    if (!allowed.some((p) => hostMatches(p, host))) {
      throw new Error(`${this.name} is not allowed to contact ${host} (add it to permissions.hosts)`);
    }
  }

  private async hostCall(method: string, args: any[]): Promise<unknown> {
    const id = this.addon.manifest.id;
    switch (method) {
      case 'http': {
        const req = args[0] as HttpRequest;
        this.checkPermission(req.url);
        return httpRequest(req);
      }
      case 'html.select': {
        const doc = new DOMParser().parseFromString(String(args[0]), 'text/html');
        const nodes = queryAll(doc, String(args[1]));
        // args[2]: selectors inside each match; their first match comes back as node.sub[i] (one parse and one
        // message for a whole page of cards instead of one per card field).
        const subs = Array.isArray(args[2]) ? (args[2] as unknown[]).map(String) : null;
        const data = (el: Element) => {
          const attrs: Record<string, string> = {};
          for (let j = 0; j < el.attributes.length; j++) attrs[el.attributes[j].name] = el.attributes[j].value;
          return { text: (el.textContent || '').trim(), attrs };
        };
        const out: unknown[] = [];
        for (let i = 0; i < nodes.length && i < 1000; i++) {
          const el = nodes[i];
          const node: Record<string, unknown> = { ...data(el), html: el.innerHTML };
          if (subs) node.sub = subs.map((sel) => {
            if (!sel) return data(el);
            try { const m = queryAll(el, sel)[0]; return m ? data(m) : null; } catch { return null; }
          });
          out.push(node);
        }
        return out;
      }
      case 'storage.get': return kv.get(`addon:${id}:${args[0]}`);
      case 'storage.set': return kv.set(`addon:${id}:${args[0]}`, args[1]);
      case 'settings.get': return (await getAddonSettings(this.addon.manifest))[args[0]];
      case 'log': console.log(`[${id}]`, args[0]); return null;
      default: throw new Error('Unknown host method ' + method);
    }
  }
}
