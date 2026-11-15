// A Studio project = one repository (repo.json) + its addons (manifest.json + main.js each).
import JSZip from 'jszip';
import { validateManifest } from '../../src/core/addon-manager';
import exampleMain from '../../addons/provider.example/main.js?raw';
import exampleManifest from '../../addons/provider.example/manifest.json?raw';

export interface AddonFiles { id: string; files: Record<string, string> }
export interface Project { repo: string; addons: AddonFiles[] }

const KEY = 'fanoos.studio.project';

export const REPO_EXAMPLE = JSON.stringify({
  name: 'My Fanoos repository',
  description: 'Addons I publish. Users add this repository with the URL of this repo.json.',
  apiVersion: 1,
  addons: [],
}, null, 2) + '\n';

export function blankAddon(id: string, name: string): AddonFiles {
  const manifest = {
    id, name, version: '1.0.0', apiVersion: 1, type: 'provider', main: 'main.js',
    description: 'Describe what this addon shows.',
    permissions: { hosts: [] as string[] },
    settings: [] as unknown[],
  };
  const main = `// ${name} — see the Example addon for every feature, explained.
fanoos.register({
  // Home rows: [{ title, items: [{ id, title, poster?, type, year? }], more? }]
  getHome: function () {
    return [{ title: 'Hello', items: [{ id: 'first', title: 'My first title', type: 'movie', year: 2026 }] }];
  },

  // Search results: same items as Home (or { items, more })
  search: function (query) {
    return [];
  },

  // Details page for one id
  load: function (id) {
    return { id: id, title: 'My first title', type: 'movie', plot: 'Edit main.js and watch this change.' };
  },

  // Streams for Play: { links: [{ name, url, kind: 'file'|'hls'|'dash'|'youtube'|'dailymotion' }] }
  loadLinks: function (id) {
    return { links: [{ name: 'Sample MP4', kind: 'file', mime: 'video/mp4',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' }] };
  }
});
`;
  return { id, files: { 'manifest.json': JSON.stringify(manifest, null, 2) + '\n', 'main.js': main } };
}

export function exampleProject(): Project {
  return {
    repo: REPO_EXAMPLE,
    addons: [{ id: 'provider.example', files: { 'manifest.json': exampleManifest, 'main.js': exampleMain } }],
  };
}

export function loadProject(): Project {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (p && typeof p.repo === 'string' && Array.isArray(p.addons)) return p;
  } catch { /* corrupt or unavailable: start over */ }
  return exampleProject();
}

export function saveProject(p: Project) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full or private mode */ }
}

/** null when fine, else a human-readable problem with this addon. */
export function checkAddon(a: AddonFiles): string | null {
  let m: any;
  try { m = JSON.parse(a.files['manifest.json']); } catch (e) { return 'manifest.json is not valid JSON: ' + (e as Error).message; }
  try { validateManifest(m); } catch (e) { return (e as Error).message; }
  if (m.id !== a.id) return `manifest "id" is "${m.id}" but the folder is "${a.id}"`;
  if (!a.files[m.main || 'main.js']) return `entry file "${m.main || 'main.js'}" is missing`;
  return null;
}

export function checkRepo(text: string): string | null {
  try {
    const j = JSON.parse(text);
    if (!j || typeof j !== 'object') return 'repo.json must be a JSON object';
    if (!j.name) return 'repo.json needs a "name" (shown on the repository tile in Fanoos)';
    return null;
  } catch (e) { return 'repo.json is not valid JSON: ' + (e as Error).message; }
}

async function sha256(buf: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return Array.prototype.map.call(d, (b: number) => (b < 16 ? '0' : '') + b.toString(16)).join('');
}

/** The addon as Fanoos expects it: files under a folder named after the id. */
export async function addonZip(a: AddonFiles): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const dir = zip.folder(a.id)!;
  Object.keys(a.files).forEach((name) => dir.file(name, a.files[name]));
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

/** Whole repository: repo.json (addons list rebuilt, with checksums) + every addon zip. Upload the folder anywhere. */
export async function repoZip(p: Project): Promise<{ zip: Blob; repoJson: string }> {
  const problem = checkRepo(p.repo) || p.addons.map((a) => checkAddon(a) && a.id + ': ' + checkAddon(a)).filter(Boolean)[0];
  if (problem) throw new Error(problem as string);
  const repo = JSON.parse(p.repo);
  const out = new JSZip();
  repo.addons = [];
  for (const a of p.addons) {
    const m = JSON.parse(a.files['manifest.json']);
    const buf = await addonZip(a);
    const file = `${m.id}-${m.version}.zip`;
    out.file(file, buf);
    repo.addons.push({ id: m.id, name: m.name, version: m.version, type: m.type, description: m.description, url: file, sha256: await sha256(buf) });
  }
  const repoJson = JSON.stringify(repo, null, 2) + '\n';
  out.file('repo.json', repoJson);
  return { zip: await out.generateAsync({ type: 'blob', compression: 'DEFLATE' }), repoJson };
}

async function readAddon(zip: JSZip): Promise<AddonFiles> {
  let root = '';
  if (!zip.file('manifest.json')) {
    const tops = Object.keys(zip.files).map((n) => n.split('/')[0]).filter((v, i, a) => a.indexOf(v) === i);
    if (tops.length === 1 && zip.file(tops[0] + '/manifest.json')) root = tops[0] + '/';
    else throw new Error('No manifest.json in this zip');
  }
  const files: Record<string, string> = {};
  const names = Object.keys(zip.files).filter((n) => n.indexOf(root) === 0 && !zip.files[n].dir && /\.(js|json|txt|md)$/i.test(n));
  for (const n of names) files[n.slice(root.length)] = await zip.file(n)!.async('string');
  const id = JSON.parse(files['manifest.json']).id;
  if (!id) throw new Error('manifest.json has no "id"');
  return { id, files };
}

/** Import an addon zip, or a repository zip (repo.json + addon zips). Returns what was added. */
export async function importZip(p: Project, data: ArrayBuffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(data);
  const added: string[] = [];
  const put = (a: AddonFiles) => {
    const i = p.addons.map((x) => x.id).indexOf(a.id);
    if (i >= 0) p.addons[i] = a; else p.addons.push(a);
    added.push(a.id);
  };
  const repoFile = zip.file('repo.json');
  if (repoFile) {
    p.repo = await repoFile.async('string');
    const inner = Object.keys(zip.files).filter((n) => /\.zip$/i.test(n));
    for (const n of inner) put(await readAddon(await JSZip.loadAsync(await zip.file(n)!.async('arraybuffer'))));
    return added;
  }
  put(await readAddon(zip));
  return added;
}
