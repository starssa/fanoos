// The watcher: loads a player page invisibly and waits for the video file it requests (.m3u8/.mp4/.mpd).
// For hosts that build their video address with JavaScript, where reading the page isn't enough.
// The Android and desktop apps see every request the page makes (including its Referer) and report them.
import { shell } from './platform';
import type { StreamLink } from './types';

const w = window as any;

export const canSniff = shell === 'android' || !!(w.fanoosNative && w.fanoosNative.sniff);

type Seen = { url: string; ref?: string };

async function native(action: 'start' | 'poll' | 'stop'): Promise<Seen[]> {
  if (shell === 'android') {
    const r = await fetch(new URL('__sniff/' + action, location.href).href);
    return action === 'poll' ? r.json() : [];
  }
  return (await w.fanoosNative.sniff(action)) || [];
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const originOf = (u: string) => (/^https?:\/\/[^/]+/i.exec(u || '') || [''])[0].toLowerCase();
const kindOf = (u: string): StreamLink['kind'] => (/\.m3u8(\?|$)/i.test(u) ? 'hls' : /\.mpd(\?|$)/i.test(u) ? 'dash' : 'file');
let busy: Promise<unknown> = Promise.resolve(); // one watch at a time (the recorder is shared)

/**
 * Loads these player pages invisibly, together, and waits for the video files they request. A request is matched
 * to its player by the site in its Referer, so players on the same site are watched one per site. Returns as soon
 * as one player gave a file (plus a moment for the others), or after `timeout` ms: player address → links.
 */
export function sniffVideos(pageUrls: string[], timeout = 10000): Promise<Record<string, StreamLink[]>> {
  const run = async (): Promise<Record<string, StreamLink[]>> => {
    const out: Record<string, StreamLink[]> = {};
    const byOrigin: Record<string, string> = {};
    pageUrls.forEach((u) => { const o = originOf(u); if (o && /^https?:/.test(o) && !byOrigin[o]) byOrigin[o] = u; });
    const pages = Object.keys(byOrigin).map((o) => byOrigin[o]);
    if (!canSniff || !pages.length) return out;
    await native('start');
    const frames = pages.map((u) => {
      const f = document.createElement('iframe');
      f.setAttribute('aria-hidden', 'true');
      f.setAttribute('allow', 'autoplay; encrypted-media'); // many players only ask for their video once they start
      f.setAttribute('referrerpolicy', 'no-referrer'); // like a direct visit (see Player.play, kind 'web')
      f.tabIndex = -1;
      f.style.cssText = 'position:fixed;left:-10000px;top:0;width:640px;height:360px;opacity:0;pointer-events:none;border:0';
      f.src = u;
      document.body.appendChild(f);
      return f;
    });
    try {
      const end = Date.now() + timeout;
      let grace = 0;
      while (Date.now() < end && (!grace || Date.now() < grace)) {
        await sleep(400);
        const seen = (await native('poll')).filter((x) => x.url && !/\/(ads?|preroll|vast)\//i.test(x.url));
        for (const u of pages) {
          if (out[u]) continue;
          const mine = seen.filter((x) => originOf(x.ref || '') === originOf(u) || pages.length === 1);
          const hit = mine.filter((x) => /\.m3u8(\?|$)/i.test(x.url))[0] || mine.filter((x) => /\.mpd(\?|$)/i.test(x.url))[0] || mine[0];
          if (hit) out[u] = [{ name: kindOf(hit.url) === 'hls' ? 'Stream' : 'Video', url: hit.url, kind: kindOf(hit.url), headers: { Referer: hit.ref || u } }];
        }
        if (Object.keys(out).length === pages.length) break;
        if (Object.keys(out).length && !grace) grace = Date.now() + 1500;
      }
      return out;
    } finally {
      frames.forEach((f) => { if (f.parentNode) f.parentNode.removeChild(f); });
      await native('stop').catch(() => []);
    }
  };
  const p = busy.then(run, run);
  busy = p.catch(() => ({}));
  return p;
}
