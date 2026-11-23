// Full-screen player overlay with a CloudStream-style source picker.
import { h, clear } from './dom';
import { icon } from './components';
import { focusFirst } from './focus';
import { Player } from '../core/player';
import { knownEmbed, webPlayer } from '../core/embeds';
import { addons } from '../core/addon-manager';
import { library } from '../core/library';
import { canOpenExternal, httpRequest, usesLanRelay, isKey, isTV, NotInstalledError, openExternal, platform, shell } from '../core/platform';
import { EXTERNAL_APPS, getExternalApp, getMaxQuality, getPlayerMode, qualityOf, type ExternalApp } from './prefs';
import { toast } from './dom';
import { errMsg } from '../core/util';
import type { Episode, LinksResult, MediaDetails, StreamLink } from '../core/types';
import { builtinExtract, builtinHost, genericExtract } from '../core/extractors';
import { canSniff, sniffVideos } from '../core/sniffer';

let overlay: HTMLElement | null = null;
let player: Player | null = null;
let saveTimer: ReturnType<typeof setInterval> | undefined;
let saveNow: () => void = () => {};
let returnFocus: HTMLElement | null = null;

export const isPlayerOpen = () => !!overlay;

const getPage = async (url: string, referer: string) => {
  const r = await httpRequest({ url, headers: { Referer: referer } });
  if (r.status >= 400) throw new Error('HTTP ' + r.status + ' for ' + url);
  return { body: r.body, url: r.url || url };
};

/** "name · quality": the source's own name, and its quality when known. */
function sourceLabel(l: StreamLink): string {
  const q = qualityOf(l);
  return [l.name.split(' · ')[0].trim() || 'Source', l.quality || (q ? (q === 2160 ? '4K' : q + 'p') : '')].filter(Boolean).join(' · ');
}

/** Ask the provider for links, then resolve "embed" links through extractor addons. */
async function resolveLinks(addonId: string, id: string): Promise<LinksResult> {
  const host = await addons.host(addonId);
  const res = (await host.call<LinksResult>('loadLinks', id)) || { links: [] };
  const subtitles = (res.subtitles || []).slice();
  // Every source at once (extractors fetch pages), kept in the addon's order.
  // Players nothing else could open; the watcher tries them afterwards, only if no source has a file yet.
  const unresolved: StreamLink[] = [];
  const one = async (l: StreamLink): Promise<StreamLink[]> => {
    // Links that ask for a Referer stay even where it can't be sent: many hosts don't check it (fallback handles the rest).
    if (l.kind !== 'embed') return [l];
    const known = knownEmbed(l);
    if (known) return [known];
    // An extractor turns the site's player into its video file; without one (or if it fails, or the file needs a
    // Referer this device can't send) the site's own player is shown.
    let got: StreamLink[] = [];
    if (builtinHost(l.url)) {
      try { got = await builtinExtract(l.url, getPage); } catch (e) { console.warn('built-in extractor failed', l.url, e); }
    }
    if (!got.length) {
      try {
        const ex = await addons.findExtractor(l.url);
        if (ex) {
          const r = await ex.call<LinksResult>('extract', l.url);
          got = r.links || [];
          (r.subtitles || []).forEach((s) => subtitles.push(s));
        }
      } catch (e) { console.warn('extractor failed', l.url, e); }
    }
    let unsure = false; // generic / watched results: also keep the player, in case the file won't play
    if (!got.length) {
      try { got = await genericExtract(l.url, getPage); unsure = true; } catch { /* no address in the page */ }
    }
    const w = webPlayer(l);
    if (!got.length) { if (w) unresolved.push(l); return w ? [w] : []; }
    return got.map((x) => ({ ...x, name: l.name + ' · ' + x.name })).concat(unsure && w ? [w] : []);
  };
  let links = ([] as StreamLink[]).concat(...(await Promise.all((res.links || []).map(one))));
  // The watcher (loads a player invisibly, catches its video request) takes seconds per player and runs one at a
  // time: only when no source has a file yet, for the first three players.
  if (canSniff && unresolved.length && !links.some((x) => x.kind !== 'web')) {
    let found: Record<string, StreamLink[]> = {};
    try { found = await sniffVideos(unresolved.slice(0, 6).map((l) => l.url)); } catch (e) { console.warn('watcher failed', e); }
    const files = ([] as StreamLink[]).concat(...unresolved.map((l) => (found[l.url] || [])
      .map((x) => ({ ...x, name: l.name + ' · ' + x.name }))));
    links = files.concat(links);
  }
  const seen: Record<string, boolean> = {};
  links = links.filter((x) => (seen[x.url] ? false : (seen[x.url] = true))); // the same file found two ways counts once
  return { links, subtitles };
}

/** Shows the Sources list with the playing source focused (remote Up/Down while a video plays). */
let showSources: (() => void) | null = null;
/** Hides the Sources list over a playing video; false when there is nothing to hide (Back then closes the player). */
let hideSources: (() => boolean) | null = null;

/** Remote Back: first closes the Sources list over a playing video, then the player. */
export function playerBack() {
  if (hideSources && hideSources()) return;
  closePlayer();
}

/** Shows the player's buttons again and restarts the hide timer (any key, pointer move or touch). */
let wake = () => {};
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function onKey(e: KeyboardEvent) {
  if (!player) return;
  wake();
  const p = player, k = e.keyCode;
  // The "surface" is the video, or the transparent focus target over a YouTube embed on TVs.
  const onSurface = document.activeElement === p.video || (!!overlay && (document.activeElement === overlay.querySelector('.yt-surface') || document.activeElement === overlay.querySelector('.player-controls .icon-btn')));
  let used = true;
  if (isKey(k, 'PLAY')) p.setPaused(false);
  else if (isKey(k, 'PAUSE')) p.setPaused(true);
  else if (isKey(k, 'PLAY_PAUSE')) p.togglePlay();
  else if (isKey(k, 'FF')) p.seekBy(30);
  else if (isKey(k, 'RW')) p.seekBy(-30);
  else if (isKey(k, 'STOP')) closePlayer();
  else if (onSurface && k === 37) p.seekBy(-10);
  else if (onSurface && k === 39) p.seekBy(10);
  else if (onSurface && k === 13) p.togglePlay();
  else if (onSurface && (k === 38 || k === 40) && showSources) showSources();
  else used = false;
  if (used) { e.preventDefault(); e.stopPropagation(); }
}

/** URL + type another app understands. Embeds become their normal watch page (the YouTube app catches those). */
function externalTarget(l: StreamLink): { url: string; mime: string } {
  if (l.kind === 'youtube') return { url: 'https://www.youtube.com/watch?v=' + l.url, mime: '' };
  if (l.kind === 'dailymotion') return { url: 'https://www.dailymotion.com/video/' + l.url, mime: '' };
  if (l.kind === 'web') return { url: l.url, mime: '' }; // mpv + yt-dlp understands many player pages
  return { url: l.url, mime: l.mime || 'video/*' };
}

type Choice = { mode: 'internal' } | { mode: 'external'; app: ExternalApp };

/** Fanoos player, VLC, mpv or another app; shown when the setting is "Ask every time". */
function askMode(where: HTMLElement): Promise<Choice> {
  return new Promise((res) => {
    const pick = (c: Choice) => () => { where.parentNode && where.parentNode.removeChild(where); res(c); };
    const ext = (app: ExternalApp, label: string) =>
      h('button', { class: 'btn focusable', onclick: pick({ mode: 'external', app }) }, icon('external'), h('span', {}, label));
    clear(where);
    where.appendChild(h('div', { class: 'player-ask' }, h('h3', {}, 'Play with'),
      h('button', { class: 'btn btn-primary focusable', onclick: pick({ mode: 'internal' }) }, icon('play'), h('span', {}, 'Fanoos player')),
      ...(platform === 'web' ? [ext('system', 'New browser tab')]
        : [ext('vlc', 'VLC'), ext('mpv', 'mpv'), ext('system', shell === 'android' ? 'Other app' : 'Default app')])));
    focusFirst(where);
  });
}

/** A clickable panel over the player (the status line itself ignores clicks). */
function panel(content: Node[]): HTMLElement {
  const wrap = h('div', { class: 'player-ask-wrap' }, h('div', { class: 'player-ask' }, ...content));
  overlay!.appendChild(wrap);
  focusFirst(wrap);
  return wrap;
}

/** The chosen player isn't installed: offer the store (Android) or install instructions (desktop). */
function notInstalled(app: ExternalApp, retry: () => void) {
  const a = app === 'system' ? null : EXTERNAL_APPS[app];
  const close = () => wrap.parentNode && wrap.parentNode.removeChild(wrap);
  const wrap = panel([
    h('h3', {}, (a ? a.label : 'A video player') + ' is not installed'),
    a && shell === 'android'
      ? h('button', { class: 'btn btn-primary focusable', onclick: () => { openExternal(a.store, '', ''); close(); } }, h('span', {}, 'Install ' + a.label))
      : h('p', { class: 'player-ask-note' }, a ? a.install : 'Install VLC or mpv.'),
    h('button', { class: 'btn focusable', onclick: () => { close(); retry(); } }, h('span', {}, 'Try again')),
    h('button', { class: 'btn focusable', onclick: close }, h('span', {}, 'Cancel')),
  ]);
}

export async function openPlayer(opts: { addonId: string; item: MediaDetails; episode?: Episode }) {
  closePlayer();
  returnFocus = document.activeElement as HTMLElement | null;
  const { addonId, item, episode } = opts;
  const video = h('video', { class: 'video focusable', autoplay: true, tabIndex: 0 });
  video.setAttribute('playsinline', '');
  const status = h('div', { class: 'player-status' }, 'Loading links…');
  // TV remotes can't reach inside a cross-origin iframe, so on TVs a transparent focus target
  // sits over the YouTube embed and forwards OK/left/right. Touch devices tap the embed directly.
  const surface = h('button', { class: 'yt-surface focusable', 'aria-label': 'Play or pause', onclick: () => player && player.togglePlay() });
  // Own control bar (Tizen shows no native controls): Play/Pause, time, progress (click/tap to seek), length.
  const playBtn = h('button', { class: 'icon-btn focusable', 'aria-label': 'Play or pause', onclick: () => player && player.togglePlay() }, icon('play'));
  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) s = 0;
    const t = Math.floor(s), hh = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, ss = t % 60;
    return (hh ? hh + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
  };
  const cur = h('span', { class: 'pc-time' }, '0:00');
  const len = h('span', { class: 'pc-time' }, '0:00');
  const fill = h('div', { class: 'pc-fill' });
  const track: HTMLElement = h('div', { class: 'pc-track', onclick: (e: MouseEvent) => {
    const r = track.getBoundingClientRect();
    if (isFinite(video.duration) && r.width) video.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * video.duration;
  } }, fill);
  const bar = h('div', { class: 'player-controls', style: { display: 'none' } }, playBtn, cur, track, len);
  const tick = () => {
    if (overlay && overlay.classList.contains('idle')) return; // hidden bar: no repaint over the playing video
    const d = video.duration, t = player ? player.time : video.currentTime;
    cur.textContent = fmt(t);
    len.textContent = isFinite(d) ? fmt(d) : 'Live';
    const f = 'scaleX(' + (isFinite(d) && d ? Math.min(1, t / d) : 0) + ')'; // transform: no layout, GPU only
    fill.style.webkitTransform = f;
    fill.style.transform = f;
  };
  video.addEventListener('timeupdate', tick);
  video.addEventListener('durationchange', tick);
  video.addEventListener('seeking', tick);
  const list = h('div', {});
  const side = h('div', { class: 'player-side' }, h('h3', {}, 'Sources'), list);
  const title = item.title + (episode ? ' · ' + episode.title : '');
  let onExternal = () => {}; // set once the sources are known
  overlay = h('div', { class: 'player-overlay', 'data-focus-scope': '1' },
    video,
    h('div', { class: 'player-top' },
      h('button', { class: 'icon-btn focusable', 'aria-label': 'Close player', onclick: closePlayer }, icon('close')),
      h('div', { class: 'player-title' }, title),
      canOpenExternal ? h('button', { class: 'icon-btn focusable', 'aria-label': 'Open in external player', onclick: () => onExternal() }, icon('external')) : null,
      h('button', { class: 'icon-btn focusable', 'aria-label': 'Sources', onclick: () => side.classList.toggle('hidden') }, icon('list'))),
    surface, bar, side, status);
  document.body.appendChild(overlay);
  window.addEventListener('keydown', onKey, true);
  // The title bar and Sources fade out after a few seconds of playing; a key, pointer move or touch brings them back.
  const ov = overlay;
  wake = () => {
    ov.classList.remove('idle');
    tick();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (player && (player.isEmbed || !stopped())) ov.classList.add('idle'); }, 4000);
  };
  // Paused, buffering or ended: keep the top bar and Sources on screen so another source can be picked.
  const stopped = () => video.paused || video.ended || video.readyState < 3;
  const setIcon = (name: string) => { clear(playBtn); playBtn.appendChild(icon(name)); };
  const showMenu = () => {
    if (!player || player.isEmbed || !video.currentSrc) return;
    setIcon('play');
    side.classList.remove('hidden');
    wake();
  };
  video.addEventListener('pause', () => { setIcon('play'); wake(); });
  video.addEventListener('ended', showMenu);
  video.addEventListener('waiting', () => { if (video.currentSrc) status.textContent = 'Buffering…'; wake(); });
  video.addEventListener('playing', () => {
    setIcon('pause');
    status.textContent = '';
    if (!side.contains(document.activeElement)) side.classList.add('hidden');
    wake();
  });
  ov.addEventListener('mousemove', () => wake());
  ov.addEventListener('touchstart', () => wake(), { passive: true } as AddEventListenerOptions);
  video.addEventListener('play', () => wake());
  video.addEventListener('pause', () => wake());
  const p = (player = new Player(video));
  focusFirst(overlay);

  let res: LinksResult;
  try { res = await resolveLinks(addonId, episode ? episode.id : item.id); }
  catch (e) { status.textContent = 'Could not load links: ' + errMsg(e); return; }
  if (player !== p) return; // closed meanwhile
  if (!res.links.length) { status.textContent = 'No video sources found for this title.'; return; }
  const maxQ = getMaxQuality();
  if (maxQ) { // hide sources above the chosen quality; if all are above it, keep the lowest one
    const fits = res.links.filter((l) => { const q = qualityOf(l); return !q || q <= maxQ; });
    res.links = fits.length ? fits : [res.links.slice().sort((a, b) => qualityOf(a) - qualityOf(b))[0]];
    p.maxHeight = maxQ;
  }

  const saved = getPlayerMode();
  let choice: Choice = saved === 'external' ? { mode: 'external', app: getExternalApp() } : { mode: 'internal' };
  if (saved === 'ask') {
    status.textContent = '';
    const where = h('div', { class: 'player-ask-wrap' });
    overlay!.appendChild(where);
    choice = await askMode(where);
    if (player !== p) return;
  }
  const external = choice.mode === 'external';
  const app: ExternalApp = choice.mode === 'external' ? choice.app : getExternalApp();

  const prev = await library.getProgress(addonId, item.id);
  const startAt = prev && (prev.episodeId || '') === (episode ? episode.id : '') ? prev.position : 0;
  // Same name and quality = one entry; it stands for all those links, tried in order when one fails.
  const groups: { label: string; idx: number[] }[] = [];
  const groupOf = res.links.map((l, i) => {
    const label = sourceLabel(l);
    let g = groups.map((x) => x.label).indexOf(label);
    if (g < 0) { g = groups.length; groups.push({ label, idx: [] }); }
    groups[g].idx.push(i);
    return g;
  });
  side.querySelector('h3')!.textContent = 'Sources (' + groups.length + ')';
  let current = -1; // index in res.links of the link playing or loading
  const buttons = groups.map((g) => h('button', {
    class: 'source focusable', onclick: () => (external ? openExt(g.idx[0]) : tryPlay(g.idx[0], p.time || startAt)),
  }, (external ? '↗ ' : '') + g.label));
  clear(list);
  buttons.forEach((b) => list.appendChild(b));
  const activeIndex = () => Math.max(0, current);
  onExternal = () => openExt(activeIndex());
  showSources = () => {
    side.classList.remove('hidden');
    (buttons[current >= 0 ? groupOf[current] : 0] || buttons[0]).focus();
  };
  hideSources = () => {
    if (side.classList.contains('hidden') || current < 0) return false; // no source chosen yet: Back leaves
    side.classList.add('hidden');
    // back to what has focus while playing (see tryPlay)
    (p.isYouTube && isTV ? surface : p.isEmbed ? overlay!.querySelector<HTMLElement>('.icon-btn')! : video).focus();
    return true;
  };

  // Hand a source to VLC / MX Player / mpv… (all formats; no Fanoos progress tracking there).
  async function openExt(i: number) {
    const l = res.links[i];
    if (!l) return;
    const t = externalTarget(l);
    const a = app === 'system' ? null : EXTERNAL_APPS[app];
    const name = a ? a.label : 'an external player';
    status.textContent = 'Opening in ' + name + '…';
    try {
      await openExternal(t.url, title, t.mime, a ? app : '', a ? a.android : '');
      toast('Opened ' + l.name + ' in ' + name);
      closePlayer();
    } catch (e) {
      status.textContent = '';
      if (e instanceof NotInstalledError) notInstalled(app, () => openExt(i));
      else status.textContent = errMsg(e);
    }
  }

  if (external) {
    if (groups.length === 1) return openExt(0);
    status.textContent = '';
    side.querySelector('h3')!.textContent = 'Choose a source for the external player';
    focusFirst(side);
    return;
  }

  // Try sources in order; fall back to the next one on failure (like CloudStream's auto-select).
  const tryPlay = async (i: number, at: number, viaPc = false): Promise<void> => {
    if (player !== p) return;
    current = i;
    buttons.forEach((b, g) => b.classList.toggle('active', groupOf[i] === g));
    status.textContent = 'Loading ' + res.links[i].name + '…';
    const pcCan = !!(res.links[i].headers && res.links[i].headers!.Referer) && usesLanRelay();
    p.direct = pcCan && !viaPc; // TV: straight from the TV first, the computer only if the host refuses
    try {
      await p.play(res.links[i], res.subtitles || [], at);
      status.textContent = '';
      side.classList.add('hidden');
      bar.style.display = p.isEmbed ? 'none' : '';
      const l = res.links[i];
      if (!p.isEmbed && video.paused) { // autoplay refused (no recent key press): one OK on Play starts it
        status.textContent = 'Press OK to play';
        showMenu();
        playBtn.focus();
        return;
      }
      if (l.kind === 'dailymotion' && !l.player) {
        // Without a player ID Dailymotion's current embed may refuse to play; say how to fix it.
        const hint = h('div', { class: 'player-hint' }, 'Video not starting? Add your free Dailymotion player ID in Addons → Installed addons → Dailymotion → Settings.');
        overlay!.appendChild(hint);
        setTimeout(() => hint.parentNode && hint.parentNode.removeChild(hint), 15000);
      }
      surface.style.display = p.isYouTube && isTV ? 'block' : 'none';
      // Dailymotion's embed can't be remote-controlled: keep focus on Close so Return still works.
      (p.isYouTube && isTV ? surface : p.isEmbed ? overlay!.querySelector<HTMLElement>('.icon-btn')! : video).focus();
    } catch (e) {
      if (pcCan && !viaPc) return tryPlay(i, at, true);
      console.warn('[Fanoos] source failed: ' + res.links[i].name + ' (' + res.links[i].kind + ') ' + res.links[i].url + ' → ' + errMsg(e)); // shows in adb logcat
      if (i + 1 < res.links.length) return tryPlay(i + 1, at);
      status.textContent = 'All sources failed (' + errMsg(e) + ')';
    }
  };

  // Late failures (e.g. YouTube "embedding disabled"): move on to the next source.
  p.onError = (msg) => {
    const i = current;
    if (i >= 0 && i + 1 < res.links.length) tryPlay(i + 1, p.time);
    else status.textContent = msg;
  };

  saveNow = () => {
    library.saveProgress({
      addonId, item: { id: item.id, title: item.title, poster: item.poster, type: item.type, year: item.year },
      episodeId: episode && episode.id, episodeTitle: episode && episode.title,
      position: p.time, duration: p.duration,
    }).catch(() => {});
  };
  saveTimer = setInterval(saveNow, 10000);
  tryPlay(0, startAt);
}

export function closePlayer() {
  if (!overlay) return;
  saveNow();
  saveNow = () => {};
  clearInterval(saveTimer);
  window.removeEventListener('keydown', onKey, true);
  clearTimeout(idleTimer);
  wake = () => {};
  showSources = hideSources = null;
  if (player) player.destroy();
  player = null;
  overlay.parentNode!.removeChild(overlay);
  overlay = null;
  if (returnFocus && document.body.contains(returnFocus)) returnFocus.focus();
  else focusFirst(document.querySelector('.view') || undefined);
}
