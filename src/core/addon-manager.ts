// Install / uninstall / enable zip addons and start their sandboxes on demand.
import JSZip from 'jszip';
import { db } from './storage';
import { AddonHost } from './addon-host';
import { hostMatches } from './util';
import { HOST_API_VERSION, type AddonManifest, type AddonType, type InstalledAddon } from './types';

export const ID_RE = /^[a-z0-9][a-z0-9_-]*(\.[a-z0-9_-]+)+$/;

export function validateManifest(m: any): AddonManifest {
  const bad = (why: string): never => { throw new Error('Invalid manifest.json: ' + why); };
  if (!m || typeof m !== 'object') bad('not a JSON object');
  if (typeof m.id !== 'string' || !ID_RE.test(m.id)) bad('"id" must look like "provider.example"');
  if (typeof m.name !== 'string' || !m.name) bad('"name" is required');
  if (typeof m.version !== 'string' || !/^\d+\.\d+\.\d+/.test(m.version)) bad('"version" must be semver, e.g. 1.0.0');
  if (m.type !== 'provider' && m.type !== 'extractor') bad('"type" must be "provider" or "extractor"');
  const api = Number(m.apiVersion || 1);
  if (api > HOST_API_VERSION) bad(`needs host API ${api}, this Fanoos supports ${HOST_API_VERSION}. Update Fanoos.`);
  if (m.type === 'extractor' && !Array.isArray(m.domains)) bad('extractors need a "domains" array');
  return { main: 'main.js', ...m, apiVersion: api };
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', gif: 'image/gif' };

/** Accept both flat zips and Kodi-style zips with a single top folder (id/manifest.json). */
function zipRoot(zip: JSZip): string {
  if (zip.file('manifest.json')) return '';
  const tops: Record<string, true> = {};
  zip.forEach((p) => { tops[p.split('/')[0]] = true; });
  const names = Object.keys(tops);
  if (names.length === 1 && zip.file(names[0] + '/manifest.json')) return names[0] + '/';
  throw new Error('manifest.json not found in zip');
}

class AddonManager {
  private hosts = new Map<string, Promise<AddonHost>>();

  async list(): Promise<InstalledAddon[]> {
    const all = await db.all<InstalledAddon>('addons');
    return all.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  }

  get(id: string) { return db.get<InstalledAddon>('addons', id); }

  async listEnabled(type?: AddonType): Promise<InstalledAddon[]> {
    return (await this.list()).filter((a) => a.enabled && (!type || a.manifest.type === type));
  }

  async installZip(data: ArrayBuffer, source?: string, expectedId?: string): Promise<InstalledAddon> {
    const zip = await JSZip.loadAsync(data);
    const root = zipRoot(zip);
    const manifest = validateManifest(JSON.parse(await zip.file(root + 'manifest.json')!.async('string')));
    if (expectedId && manifest.id !== expectedId) throw new Error(`Zip contains "${manifest.id}", expected "${expectedId}"`);
    const main = zip.file(root + manifest.main);
    if (!main) throw new Error(`Entry file "${manifest.main}" missing from zip`);
    const code = await main.async('string');
    let icon: string | undefined;
    if (manifest.icon) {
      const f = zip.file(root + manifest.icon);
      const ext = manifest.icon.split('.').pop()!.toLowerCase();
      if (f) icon = `data:${MIME[ext] || 'application/octet-stream'};base64,` + (await f.async('base64'));
    }
    const prev = await this.get(manifest.id);
    const rec: InstalledAddon = { manifest, code, icon, enabled: prev ? prev.enabled : true, source, installedAt: Date.now() };
    await db.put('addons', manifest.id, rec);
    this.stop(manifest.id); // next call restarts with the new code
    return rec;
  }

  async uninstall(id: string) {
    this.stop(id);
    await db.del('addons', id);
  }

  async setEnabled(id: string, enabled: boolean) {
    const a = await this.get(id);
    if (!a) return;
    a.enabled = enabled;
    await db.put('addons', id, a);
    if (!enabled) this.stop(id);
  }

  /** Lazily start (and cache) the sandbox for an addon. */
  host(id: string): Promise<AddonHost> {
    let p = this.hosts.get(id);
    if (!p) {
      p = (async () => {
        const rec = await this.get(id);
        if (!rec) throw new Error(`Addon "${id}" is not installed`);
        if (!rec.enabled) throw new Error(`Addon "${rec.manifest.name}" is disabled`);
        const h = new AddonHost(rec);
        try { await h.ready; } catch (e) { h.dispose(); throw e; }
        return h;
      })();
      this.hosts.set(id, p);
      p.catch(() => this.hosts.delete(id));
    }
    return p;
  }

  stop(id: string) {
    const p = this.hosts.get(id);
    if (!p) return;
    this.hosts.delete(id);
    p.then((h) => h.dispose(), () => {});
  }

  async findExtractor(url: string): Promise<AddonHost | null> {
    let hostname: string;
    try { hostname = new URL(url).hostname; } catch { return null; }
    for (const a of await this.listEnabled('extractor')) {
      if ((a.manifest.domains || []).some((d) => hostMatches(d, hostname))) return this.host(a.manifest.id);
    }
    return null;
  }
}

export const addons = new AddonManager();
