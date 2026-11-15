// Per-addon settings, declared in manifest.json (Kodi: resources/settings.xml).
import { kv } from './storage';
import type { AddonManifest } from './types';

export type SettingValues = Record<string, string | boolean>;

export async function getAddonSettings(m: AddonManifest): Promise<SettingValues> {
  const saved = (await kv.get<SettingValues>('settings:' + m.id)) || {};
  const out: SettingValues = {};
  (m.settings || []).forEach((s) => {
    out[s.id] = s.id in saved ? saved[s.id] : s.default ?? (s.type === 'bool' ? false : '');
  });
  return out;
}

export function saveAddonSettings(id: string, values: SettingValues): Promise<void> {
  return kv.set('settings:' + id, values);
}
