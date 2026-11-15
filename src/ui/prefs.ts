// Small synchronous preferences (localStorage), read before anything renders.
import { canOpenExternal } from '../core/platform';

export type PlayerMode = 'internal' | 'external' | 'ask';
const KEY = 'fanoos.player';

export function getPlayerMode(): PlayerMode {
  if (!canOpenExternal) return 'internal';
  try {
    const v = localStorage.getItem(KEY);
    return v === 'external' || v === 'ask' ? v : 'internal';
  } catch { return 'internal'; }
}

export type ExternalApp = 'vlc' | 'mpv' | 'system';
const APP_KEY = 'fanoos.extplayer';

export const EXTERNAL_APPS: Record<'vlc' | 'mpv', { label: string; android: string; store: string; install: string }> = {
  vlc: { label: 'VLC', android: 'org.videolan.vlc', store: 'https://play.google.com/store/apps/details?id=org.videolan.vlc',
    install: 'Install VLC: sudo apt install vlc (Linux) or videolan.org (Windows, macOS)' },
  mpv: { label: 'mpv', android: 'is.xyz.mpv', store: 'https://play.google.com/store/apps/details?id=is.xyz.mpv',
    install: 'Install mpv: sudo apt install mpv yt-dlp (Linux) or mpv.io (Windows, macOS)' },
};

export function getExternalApp(): ExternalApp {
  try {
    const v = localStorage.getItem(APP_KEY);
    return v === 'mpv' || v === 'system' ? v : 'vlc';
  } catch { return 'vlc'; }
}

export function setExternalApp(a: ExternalApp) {
  try { localStorage.setItem(APP_KEY, a); } catch { /* private mode */ }
}

// Maximum video quality (height in pixels; 0 = no limit): sources above it are hidden.
const QKEY = 'fanoos.maxq';
export function getMaxQuality(): number {
  try { return parseInt(localStorage.getItem(QKEY) || '0', 10) || 0; } catch { return 0; }
}
export function setMaxQuality(q: number) {
  try { localStorage.setItem(QKEY, String(q)); } catch { /* private mode */ }
}
/** Height named by a source ("1080p", "4K" in its quality, name or address); 0 when it doesn't say. */
export function qualityOf(l: { quality?: string; name: string; url: string }): number {
  const t = (l.quality || '') + ' ' + l.name + ' ' + l.url;
  if (/(^|[^a-z0-9])(4k|uhd|2160p?)([^a-z0-9]|$)/i.test(t)) return 2160;
  const m = /(^|[^0-9])(\d{3,4})p([^a-z0-9]|$)/i.exec(t);
  return m ? +m[2] : 0;
}

export function setPlayerMode(m: PlayerMode) {
  try { localStorage.setItem(KEY, m); } catch { /* private mode */ }
}
