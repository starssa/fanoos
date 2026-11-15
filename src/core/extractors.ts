// Built-in extractors: a video host's player page → its video file, so Fanoos plays it in its own player
// (no host page, no ads). Each host serves the file only to its own site, so links carry that site as Referer;
// the Android and desktop apps send it (see allowReferer). YouTube and Dailymotion are in embeds.ts.
import type { StreamLink } from './types';

/** Downloads a page (the app passes its native HTTP); returns its text and final address (after redirects to a mirror). */
export type PageGetter = (url: string, referer: string) => Promise<{ body: string; url: string }>;

const origin = (u: string) => (/^https?:\/\/[^/]+/.exec(u) || [''])[0];
const https = (u: string) => (u.indexOf('//') === 0 ? 'https:' + u : u);

/** Scripts packed as eval(function(p,a,c,k,e,d){…}('…',a,c,'…'.split('|'))), unpacked. */
export function unpack(html: string): string {
  const re = /\}\s*\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/g;
  const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let out = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const a = +m[2], k = m[4].split('|');
    if (a < 2 || a > 62) continue;
    out += '\n' + m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\').replace(/\b\w+\b/g, (w) => {
      let n = 0;
      for (let i = 0; i < w.length; i++) { const d = DIGITS.indexOf(w.charAt(i)); if (d < 0 || d >= a) return w; n = n * a + d; }
      return k[n] || w;
    });
  }
  return out;
}

/** The first .m3u8 (preferred) or .mp4 address written in a page or its packed scripts. */
function mediaIn(html: string): string {
  const text = (html + unpack(html)).replace(/\\\//g, '/');
  const all = text.match(/(?:https?:)?\/\/[^"'\s<>\\]+?\.(?:m3u8|mp4)(?:\?[^"'\s<>\\]*)?/gi) || [];
  return https(all.filter((u) => /\.m3u8/i.test(u))[0] || all[0] || '');
}

function link(name: string, url: string, page: string, referer = origin(page) + '/'): StreamLink {
  return { name, url, kind: /\.m3u8/i.test(url) ? 'hls' : 'file', headers: { Referer: referer } };
}

function notFound(name: string, html: string): Error {
  return new Error(/not found|was deleted|has been removed|file is no longer/i.test(html)
    ? 'This ' + name + ' video was removed' : 'No video on the ' + name + ' page (it may show a bot check)');
}

type Host = { name: string; re: RegExp; page?: (u: string) => string; run: (get: PageGetter, url: string) => Promise<StreamLink[]> };

/** A page that writes its video address (plainly or packed): Uqload, Vidmoly, Vidoza, Mixdrop. */
// fullReferer: the file is only served with the player's own address as Referer (Mixdrop), not just its site.
const simple = (name: string, re: RegExp, page?: (u: string) => string, pick?: (html: string) => string, fullReferer = false): Host => ({
  name, re, page,
  run: async (get, url) => {
    const r = await get(url, url);
    const file = (pick && pick(r.body)) || mediaIn(r.body);
    if (!file) throw notFound(name, r.body);
    return [link(name, file, r.url, fullReferer ? url : undefined)];
  },
});

const HOSTS: Host[] = [
  simple('Mixdrop', /(^|\.)(mixdro?o?p|m1xdrop|mixdrp)\.[a-z]+$/i, (u) => u.replace(/\/f\//, '/e/'),
    (html) => https((/MDCore\.wurl\s*=\s*"([^"]+)"/.exec(unpack(html)) || [])[1] || ''), true),
  simple('Uqload', /(^|\.)uqload\.[a-z]+$/i),
  simple('Vidmoly', /(^|\.)vidmoly\.[a-z]+$/i),
  simple('Vidoza', /(^|\.)(vidoza\.(net|co)|videzz\.net)$/i),
  {
    // Streamtape writes its address in two halves: '//…/get_video?id=…&token=' + ('xyzTOKEN').substring(3)
    name: 'Streamtape', re: /(^|\.)(streamtape|strtape|strcloud)\.[a-z]+$|(^|\.)(streamta\.pe|stape\.fun)$/i,
    page: (u) => u.replace(/\/v\//, '/e/'),
    run: async (get, url) => {
      const r = await get(url, url);
      const m = /robotlink'\)\.innerHTML\s*=\s*'([^']+)'\s*\+\s*\(?'([^']+)'\)?\.substring\((\d+)\)/.exec(r.body);
      if (!m) throw notFound('Streamtape', r.body);
      return [{ name: 'Streamtape', url: https(m[1] + m[2].substring(+m[3])) + '&stream=1', kind: 'file', headers: { Referer: origin(r.url) + '/' } }];
    },
  },
  {
    // Doodstream: the page's /pass_md5/<…>/<token> answers the start of the address; + 10 random characters,
    // the token and the time make the .mp4 (as yt-dlp does).
    name: 'Doodstream',
    re: /(^|\.)(dood(stream)?\.[a-z]+|d0+d\.com|do0od\.com|d0o0d\.com|dooood\.com|doods\.pro|ds2play\.com|ds2video\.com|dsvplay\.com|vidply\.com|all3do\.com|myvidplay\.com|playmogo\.com)$/i,
    page: (u) => u.replace(/\/(d|f)\//, '/e/'),
    run: async (get, url) => {
      const r = await get(url, url);
      const m = /\/pass_md5\/[^'"\s<>]+/.exec(r.body);
      if (!m) throw notFound('Doodstream', r.body);
      const site = origin(r.url);
      const base = (await get(site + m[0], r.url)).body.trim();
      if (!/^https?:\/\//.test(base)) throw new Error('Doodstream did not give a video address');
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let rand = '';
      for (let i = 0; i < 10; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
      const file = /cloudflarestorage/.test(base) ? base : base + rand + '?token=' + m[0].split('/').pop() + '&expiry=' + Date.now();
      return [{ name: 'Doodstream', url: file, kind: 'file', mime: 'video/mp4', headers: { Referer: site + '/' } }];
    },
  },
];

/**
 * Any other host: the first video address its player page writes (plainly or in a packed script). Many small
 * hosts work this way; hosts that build the address with JavaScript need the watcher (sniffer.ts) instead.
 */
export async function genericExtract(url: string, get: PageGetter): Promise<StreamLink[]> {
  const r = await get(url, url);
  const file = mediaIn(r.body.replace(/(?:https?:)?\/\/[^"'\s<>]*(?:\/ads?\/|preroll|vast|advert)[^"'\s<>]*/gi, '')); // not ad videos
  if (!file) throw new Error('No video address in the page');
  return [link(/\.m3u8/i.test(file) ? 'Stream' : 'Video', file, r.url)];
}

/** The built-in extractor for this player address, or null when Fanoos has none for its host. */
export function builtinHost(url: string): string | null {
  let host = '';
  try { host = new URL(url).hostname; } catch { return null; }
  const h = HOSTS.filter((x) => x.re.test(host))[0];
  return h ? h.name : null;
}

/** Player page → video links. Throws when the host isn't built in or the page has no video. */
export async function builtinExtract(url: string, get: PageGetter): Promise<StreamLink[]> {
  let host = '';
  try { host = new URL(url).hostname; } catch { throw new Error('Not a web address: ' + url); }
  const h = HOSTS.filter((x) => x.re.test(host))[0];
  if (!h) throw new Error('No built-in extractor for ' + host);
  return h.run(get, h.page ? h.page(url) : url);
}
