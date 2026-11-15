// Repositories: a repo.json listing addon zips (Kodi: addons.xml + zips; CloudStream: repo.json -> plugins.json).
import JSZip from 'jszip';
import { kv } from './storage';
import { httpBinary, httpRequest, setLanRelay } from './platform';
import { addons } from './addon-manager';
import { compareVersions } from './util';
import type { AddonType, InstalledAddon } from './types';

export interface RepoAddon {
  id: string;
  name: string;
  version: string;
  type: AddonType;
  description?: string;
  icon?: string;
  url: string;
  sha256?: string;
}
export interface RepoIndex {
  url: string;
  name: string;
  description?: string;
  addons: RepoAddon[];
}
export type RepoResult = { url: string; repo?: RepoIndex; error?: string };

const KEY = 'repos';
const DEFAULT_REPO = 'repo/repo.json'; // bundled with the app, built from /addons
const OLD_DEFAULTS = ['repo/addon.json']; // index name used by a previous build

export const isDefaultRepo = (u: string) => u === DEFAULT_REPO;

// Repositories opened from a file live in storage: "local:<slug>" → { name, json, files }.
const LOCAL = 'local:';
export const isLocalRepo = (u: string) => u.indexOf(LOCAL) === 0;
interface LocalRepo { name: string; json: string; files: Record<string, ArrayBuffer> }
const localKey = (id: string) => 'localrepo:' + id;

const abs = (u: string, base = location.href) => new URL(u, base).href;
const isWebUrl = (u: string) => /^(https?:)?\/\//i.test(u);

function parseIndex(text: string, url: string, resolve: (u: string) => string): RepoIndex {
  let j: any;
  try { j = JSON.parse(text); } catch { throw new Error('Not valid JSON'); }
  if (!j || !Array.isArray(j.addons)) throw new Error('Not a Fanoos repository: repo.json must contain an "addons" list');
  // A computer's repository that also relays videos for TVs (serve-repo.py): use it for videos needing a Referer.
  if (j.relay === true && /^http:\/\/(\d+\.\d+\.\d+\.\d+|[\w-]+\.local)(:\d+)?\//i.test(url)) setLanRelay(url.replace(/^(https?:\/\/[^/]+).*$/, '$1'));
  return {
    url,
    name: j.name || url,
    description: j.description,
    addons: j.addons.map((a: RepoAddon) => ({ ...a, url: resolve(a.url), icon: a.icon && isWebUrl(resolve(a.icon)) ? resolve(a.icon) : undefined })),
  };
}

/** What people type: "example.com/repo.json", "http://host/folder/", "https://…/repo.json". */
export function repoUrlCandidates(input: string): string[] {
  let u = input.trim();
  if (/\/$/.test(u)) u += 'repo.json';
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || /^[./]/.test(u)) return [u];
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/|$)/.test(u)) return ['https://' + u, 'http://' + u]; // bare host: try https first
  return [u];
}

export async function getRepoUrls(): Promise<string[]> {
  const saved = await kv.get<string[]>(KEY);
  if (saved) {
    // Built-in source always present, first, and under its current name.
    const urls = [DEFAULT_REPO].concat(saved.filter((u) => u !== DEFAULT_REPO && OLD_DEFAULTS.indexOf(u) < 0));
    if (urls.join() !== saved.join()) await kv.set(KEY, urls);
    return urls;
  }
  const def = [DEFAULT_REPO]; // kept relative: the desktop shell's URL changes per launch
  await kv.set(KEY, def);
  return def;
}

export async function fetchRepo(stored: string): Promise<RepoIndex> {
  if (isLocalRepo(stored)) {
    const rec = await kv.get<LocalRepo>(localKey(stored));
    if (!rec) throw new Error('This repository file is no longer stored on this device');
    // Web addresses stay as they are; file names point into the stored files.
    return parseIndex(rec.json, stored, (u) => (isWebUrl(u) ? abs(u) : stored + '#' + u.replace(/^\.\//, '')));
  }
  const url = abs(stored);
  const r = await httpRequest({ url });
  if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
  return parseIndex(r.body, url, (u) => abs(u, url));
}

async function remember(url: string) {
  const urls = await getRepoUrls();
  if (!urls.some((u) => u === url || (!isLocalRepo(u) && abs(u) === url))) await kv.set(KEY, urls.concat(url)); // the built-in one is stored relative
}

export async function addRepo(input: string): Promise<RepoIndex> {
  let lastError: unknown = null;
  for (const candidate of repoUrlCandidates(input)) {
    const u = abs(candidate);
    try {
      const repo = await fetchRepo(u); // validate before saving
      await remember(u);
      return repo;
    } catch (e) { lastError = e; }
  }
  throw lastError;
}

/**
 * Repository from files on this device: a repository zip (repo.json + addon zips, as Fanoos Studio
 * exports it), or repo.json picked together with its addon zips. Addon zips alone are installed.
 */
export async function addLocalFiles(files: { name: string; data: ArrayBuffer }[]): Promise<{ repo?: RepoIndex; installed: InstalledAddon[] }> {
  let json = '';
  const stored: Record<string, ArrayBuffer> = {};
  const addonZips: ArrayBuffer[] = [];
  for (const f of files) {
    if (/\.json$/i.test(f.name)) { json = new TextDecoder().decode(f.data); continue; }
    const zip = await JSZip.loadAsync(f.data).catch(() => null);
    if (!zip) { // Android pickers may drop the extension: a repo.json is still recognised by its content
      const text = new TextDecoder().decode(f.data);
      try { JSON.parse(text); } catch { throw new Error(f.name + ' is not a zip or JSON file'); }
      json = text;
      continue;
    }
    const index = Object.keys(zip.files).filter((n) => /(^|\/)repo\.json$/i.test(n)).sort((a, b) => a.length - b.length)[0];
    if (!index) { stored[f.name] = f.data; addonZips.push(f.data); continue; }
    json = await zip.file(index)!.async('string');
    const dir = index.slice(0, index.length - 'repo.json'.length);
    for (const n of Object.keys(zip.files)) {
      if (n.indexOf(dir) === 0 && /\.zip$/i.test(n) && !zip.files[n].dir) stored[n.slice(dir.length)] = await zip.file(n)!.async('arraybuffer');
    }
  }
  if (!json) { // only addon zips: install them
    const installed: InstalledAddon[] = [];
    for (const data of addonZips) installed.push(await addons.installZip(data, 'file'));
    return { installed };
  }
  const name = (() => { try { return JSON.parse(json).name || 'Local repository'; } catch { return 'Local repository'; } })();
  const id = LOCAL + (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'repository');
  const repo = parseIndex(json, id, (u) => (isWebUrl(u) ? abs(u) : id + '#' + u.replace(/^\.\//, '')));
  const missing = repo.addons.filter((a) => isLocalRepo(a.url) && !stored[a.url.slice(a.url.indexOf('#') + 1)]).map((a) => a.url.split('#')[1]);
  if (missing.length) throw new Error('Missing addon files: ' + missing.join(', ') + '. Pick repo.json together with its zip files, or the repository zip.');
  await kv.set(localKey(id), { name, json, files: stored } as LocalRepo); // re-adding the same repository replaces it
  await remember(id);
  return { repo, installed: [] };
}

export async function removeRepo(url: string) {
  if (isDefaultRepo(url)) throw new Error('The built-in repository cannot be removed');
  if (isLocalRepo(url)) await kv.del(localKey(url));
  await kv.set(KEY, (await getRepoUrls()).filter((u) => u !== url));
}

async function addonBytes(url: string): Promise<ArrayBuffer> {
  if (!isLocalRepo(url)) return httpBinary(url);
  const hash = url.indexOf('#');
  const rec = await kv.get<LocalRepo>(localKey(url.slice(0, hash)));
  const data = rec && rec.files[url.slice(hash + 1)];
  if (!data) throw new Error('The file ' + url.slice(hash + 1) + ' is no longer stored on this device');
  return data;
}

export async function loadAllRepos(): Promise<RepoResult[]> {
  const urls = await getRepoUrls();
  return Promise.all(urls.map((url) => fetchRepo(url).then((repo) => ({ url, repo }), (e) => ({ url, error: String(e && e.message || e) }))));
}

async function sha256Hex(buf: ArrayBuffer): Promise<string | null> {
  const subtle = window.crypto && window.crypto.subtle;
  if (!subtle) return null; // not a secure context (some TV file:// runtimes)
  const d = new Uint8Array(await subtle.digest('SHA-256', buf));
  let s = '';
  for (let i = 0; i < d.length; i++) s += (d[i] < 16 ? '0' : '') + d[i].toString(16);
  return s;
}

export async function installFromRepo(entry: RepoAddon): Promise<InstalledAddon> {
  const buf = await addonBytes(entry.url);
  if (entry.sha256) {
    const got = await sha256Hex(buf);
    if (got === null) console.warn('SHA-256 unavailable here, skipping integrity check for', entry.id);
    else if (got !== entry.sha256.toLowerCase()) throw new Error(`Checksum mismatch for ${entry.name}, refusing to install`);
  }
  return addons.installZip(buf, entry.url, entry.id);
}

export async function installFromUrl(url: string): Promise<InstalledAddon> {
  return addons.installZip(await httpBinary(abs(url)), url);
}

/** Newest repo entry per id that is newer than what's installed (Kodi auto-update). */
export function findUpdates(installed: InstalledAddon[], repos: RepoResult[]): RepoAddon[] {
  const best: Record<string, RepoAddon> = {};
  repos.forEach((r) => (r.repo ? r.repo.addons : []).forEach((a) => {
    if (!best[a.id] || compareVersions(a.version, best[a.id].version) > 0) best[a.id] = a;
  }));
  return installed.filter((i) => best[i.manifest.id] && compareVersions(best[i.manifest.id].version, i.manifest.version) > 0)
    .map((i) => best[i.manifest.id]);
}


// ---- repositories on this home network (serve-repo.py on a computer: http://<its IP>:8000/repo.json) ----

/** This device's own network address (Samsung/LG TVs tell it; elsewhere ''), to guess which addresses to try. */
function localIp(): Promise<string> {
  const w = window as any;
  return new Promise((done) => {
    try {
      if (w.tizen && w.tizen.systeminfo) {
        let left = 2;
        const one = (ip?: string) => { if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip) && ip !== '0.0.0.0') { left = 0; done(ip); } else if (--left === 0) done(''); };
        ['WIFI_NETWORK', 'ETHERNET_NETWORK'].forEach((k) => {
          try { w.tizen.systeminfo.getPropertyValue(k, (v: any) => one(v && v.ipAddress), () => one()); } catch { one(); }
        });
        setTimeout(() => done(''), 3000);
        return;
      }
      if (w.webOS || w.PalmSystem) return done('');
    } catch { /* fall through */ }
    done('');
  });
}

const PORTS = [8000, 8080];
const COMMON = ['192.168.1', '192.168.0', '192.168.100', '192.168.8', '192.168.2', '10.0.0', '10.0.1'];

/** Looks for Fanoos repositories served on the home network; calls onFound for each. Stops after the first subnet with one. */
export async function findLocalRepos(onProgress: (text: string) => void): Promise<string[]> {
  const ip = await localIp();
  const own = ip ? ip.split('.').slice(0, 3).join('.') : '';
  const subnets = (own ? [own] : []).concat(COMMON.filter((x) => x !== own));
  const found: string[] = [];
  const probe = (u: string) => Promise.race([
    // Plain fetch (serve-repo.py allows it): unanswered addresses are simply dropped after the timeout.
    fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => (j && Array.isArray(j.addons) ? u : null), () => null),
    new Promise<null>((ok) => setTimeout(() => ok(null), 1500)),
  ]);
  for (const net of subnets) {
    onProgress('Looking on ' + net + '.x …');
    const urls: string[] = [];
    for (let i = 1; i < 255; i++) for (const p of PORTS) urls.push('http://' + net + '.' + i + ':' + p + '/repo.json');
    for (let k = 0; k < urls.length; k += 48) {
      const got = await Promise.all(urls.slice(k, k + 48).map(probe));
      got.forEach((u) => { if (u && found.indexOf(u) < 0) found.push(u); });
    }
    if (found.length) break;
  }
  return found;
}
