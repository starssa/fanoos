// Turns an embedded-player address into something Fanoos can play without an extractor addon.
import type { StreamLink } from './types';

const YT = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?(?:.*&)?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i;
const DM_LEGACY = /dailymotion\.com\/(?:embed\/)?video\/(x[0-9a-z]+)/i;
const DM_GEO = /geo\.dailymotion\.com\/player(?:\/(x[0-9a-z]+))?\.html\?(?:.*&)?video=(x[0-9a-z]+)/i;

/** YouTube / Dailymotion embeds → their official players; anything else → null. */
export function knownEmbed(l: StreamLink): StreamLink | null {
  let m = YT.exec(l.url);
  if (m) return { ...l, name: 'YouTube', url: m[1], kind: 'youtube' };
  m = DM_GEO.exec(l.url);
  if (m) return { ...l, name: 'Dailymotion', url: m[2], kind: 'dailymotion', player: m[1] || l.player };
  m = DM_LEGACY.exec(l.url);
  if (m) return { ...l, name: 'Dailymotion', url: m[1], kind: 'dailymotion' };
  return null;
}

/** Last resort for an embed no extractor understands: show the hoster's own player page. */
export function webPlayer(l: StreamLink): StreamLink | null {
  return /^https?:\/\//i.test(l.url) ? { ...l, kind: 'web' } : null;
}
