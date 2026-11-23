// Playback. Native <video> where the platform handles the format (iOS/Safari/Tizen/webOS do HLS natively),
// hls.js everywhere else (Chrome/Electron/Android WebView).
import Hls from 'hls.js';
import { allowReferer, httpRequest, relayAddress, relayUrl } from './platform';
import type { StreamLink, Subtitle } from './types';

const EXT_MIME: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mkv: 'video/x-matroska', mov: 'video/quicktime' };

/** '' when the device says it definitely can't decode this file (so we try the next source at once). */
export function fileSupport(v: HTMLVideoElement, link: StreamLink): string {
  const ext = (link.url.split(/[?#]/)[0].match(/\.(\w+)$/) || [])[1];
  const mime = link.mime || (ext && EXT_MIME[ext.toLowerCase()]);
  return mime ? v.canPlayType(mime) : 'maybe';
}

function srtToVtt(srt: string): string {
  return 'WEBVTT\n\n' + srt.replace(/\r+/g, '').replace(/(\d+:\d+:\d+),(\d+)/g, '$1.$2');
}

const YT_ERRORS: Record<number, string> = {
  2: 'Invalid YouTube video id', 5: 'YouTube player error', 100: 'Video is private or was removed',
  101: 'The owner does not allow this video to be played in other apps', 150: 'The owner does not allow this video to be played in other apps',
  152: 'YouTube refused the embed (no referrer — happens from file:// apps)', 153: 'YouTube refused the embed (no referrer — happens from file:// apps)',
};

export class Player {
  private hls: Hls | null = null;
  /** Adaptive (HLS) streams don't go above this height; 0 = no limit. */
  maxHeight = 0;
  /** Skip the computer relay for this play (TVs try the address directly first). */
  direct = false;
  private blobs: string[] = [];
  // YouTube: official embed driven through its postMessage API (no stream extraction).
  private yt: HTMLIFrameElement | null = null;
  private ytTime = 0;
  /** Where held-down / repeated seek keys are heading; applied once they stop (each real seek costs TVs a rebuffer). */
  private seekTarget = -1;
  private seekTimer = 0;
  private ytDuration = 0;
  private ytPaused = false;
  // Dailymotion's player and generic web players: no host-page control API, so remote keys can't drive them.
  private passive: HTMLIFrameElement | null = null;
  /** Errors that arrive after play() resolved (YouTube reports embed refusals late). */
  onError: (msg: string) => void = () => {};

  constructor(readonly video: HTMLVideoElement) {
    window.addEventListener('message', this.onMessage);
  }

  get isYouTube() { return !!this.yt; }
  get isEmbed() { return !!(this.yt || this.passive); }
  get time() { return this.yt ? this.ytTime : this.seekTarget >= 0 ? this.seekTarget : this.video.currentTime; }
  get duration() { return this.yt ? this.ytDuration : this.video.duration; }

  togglePlay() {
    if (this.passive) return;
    if (this.yt) this.ytCommand(this.ytPaused ? 'playVideo' : 'pauseVideo');
    else if (this.video.paused) this.video.play(); else this.video.pause();
  }
  setPaused(paused: boolean) {
    if (this.passive) return;
    if (this.yt) this.ytCommand(paused ? 'pauseVideo' : 'playVideo');
    else if (paused) this.video.pause(); else this.video.play();
  }
  seekBy(d: number) {
    if (this.passive) return;
    let t = this.time + d;
    const dur = this.duration;
    if (isFinite(dur) && dur > 0) t = Math.min(dur - 1, t); // unknown duration (NaN/Infinity): don't clamp
    t = Math.max(0, t);
    if (this.yt) { this.ytTime = t; this.ytCommand('seekTo', [t, true]); return; }
    this.seekTarget = t;
    this.video.dispatchEvent(new Event('timeupdate')); // the control bar shows the target at once
    clearTimeout(this.seekTimer);
    this.seekTimer = window.setTimeout(() => { const to = this.seekTarget; this.seekTarget = -1; if (to >= 0) this.video.currentTime = to; }, 600);
  }

  private ytCommand(func: string, args: unknown[] = []) {
    if (this.yt && this.yt.contentWindow) this.yt.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  }

  private onMessage = (e: MessageEvent) => {
    if (!this.yt || e.source !== this.yt.contentWindow) return;
    let d: any;
    try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
    if (d && d.event === 'infoDelivery' && d.info) {
      if (typeof d.info.currentTime === 'number') this.ytTime = d.info.currentTime;
      if (typeof d.info.duration === 'number' && d.info.duration > 0) this.ytDuration = d.info.duration;
      if (typeof d.info.playerState === 'number') this.ytPaused = d.info.playerState === 2;
    } else if (d && d.event === 'onError') {
      this.onError(YT_ERRORS[d.info] || 'YouTube error ' + d.info);
    }
  };

  /** Official embedded player in place of the <video>; resolves when it has loaded. */
  private embed(src: string, label: string, onLoad: (f: HTMLIFrameElement) => void = () => {}, referrer = 'strict-origin-when-cross-origin'): { frame: HTMLIFrameElement; ready: Promise<void> } {
    const f = document.createElement('iframe');
    f.className = 'video';
    f.src = src;
    f.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture; web-share');
    f.setAttribute('allowfullscreen', '');
    f.setAttribute('referrerpolicy', referrer);
    f.setAttribute('frameborder', '0');
    f.tabIndex = -1; // keep remote keys in our document (Back must still close the player)
    this.video.style.display = 'none';
    this.video.parentNode!.insertBefore(f, this.video.nextSibling);
    const ready = new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new Error(label + ' did not load')), 25000);
      f.onload = () => { clearTimeout(t); onLoad(f); res(); };
    });
    return { frame: f, ready };
  }

  private playYouTube(id: string, startAt: number): Promise<void> {
    if (!/^[\w-]{11}$/.test(id)) return Promise.reject(new Error(YT_ERRORS[2]));
    const origin = /^https?:/.test(location.protocol) ? '&origin=' + encodeURIComponent(location.origin) : '';
    this.ytTime = startAt;
    const e = this.embed('https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&enablejsapi=1&playsinline=1&rel=0' +
      (startAt > 5 ? '&start=' + Math.floor(startAt) : '') + origin, 'YouTube',
      // Ask the embed to stream time/state updates to us.
      (f) => f.contentWindow!.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'));
    this.yt = e.frame;
    return e.ready;
  }

  // Current Dailymotion embeds need a player ID (free: Dailymotion Studio → Players):
  // geo.dailymotion.com/player/{PLAYER}.html?video={ID}. Without one we try the pre-2021 embed URL.
  private playDailymotion(id: string, startAt: number, playerId?: string): Promise<void> {
    if (!/^x[0-9a-z]+$/i.test(id)) return Promise.reject(new Error('Invalid Dailymotion video id'));
    if (playerId && !/^x[0-9a-z]+$/i.test(playerId)) return Promise.reject(new Error('Invalid Dailymotion player ID "' + playerId + '"'));
    const start = startAt > 5 ? Math.floor(startAt) : 0;
    const src = playerId
      ? 'https://geo.dailymotion.com/player/' + playerId + '.html?video=' + id + (start ? '&startTime=' + start : '')
      : 'https://www.dailymotion.com/embed/video/' + id + '?autoplay=1' + (start ? '&start=' + start : '');
    const e = this.embed(src, 'Dailymotion');
    this.passive = e.frame;
    return e.ready;
  }

  /** Resolves once metadata is loaded; rejects if this source can't play. */
  async play(link: StreamLink, subs: Subtitle[], startAt = 0): Promise<void> {
    this.reset();
    const v = this.video;
    if (link.kind === 'youtube') return this.playYouTube(link.url, startAt);
    if (link.kind === 'dailymotion') return this.playDailymotion(link.url, startAt, link.player);
    if (link.kind === 'web') {
      if (!/^https?:\/\//i.test(link.url)) throw new Error('Invalid player address');
      // The hoster's own player page, unsandboxed: many hosters refuse to play in a sandbox ("sandbox not allowed").
      // The native shells block its ad servers, pop-ups and attempts to navigate Fanoos away.
      // No Referer: opened from inside the app, hosts like Mixdrop answer "can't find the video"; a direct visit works.
      const e = this.embed(link.url, 'The player', () => {}, 'no-referrer');
      this.passive = e.frame;
      return e.ready;
    }
    if (link.kind === 'file' && fileSupport(v, link) === '') throw new Error('Format not supported on this device');
    // A file found inside a host's player (e.g. Mixdrop) is only served with that player as Referer:
    // Android plays it through the app's relay, the desktop app adds the Referer to its requests.
    const referer = link.headers && link.headers.Referer && (link.kind === 'file' || link.kind === 'hls') ? link.headers.Referer : '';
    const relay = referer && !this.direct ? await relayUrl(link.url, referer) : '';
    if (referer && !relay && !this.direct) await allowReferer(link.url, referer);
    const loaded = new Promise<void>((res, rej) => {
      const done = (err?: Error) => {
        clearTimeout(t);
        v.removeEventListener('loadedmetadata', ok);
        v.removeEventListener('error', bad);
        if (err) rej(err); else res();
      };
      const ok = () => done();
      const bad = () => done(new Error('Media error' + (v.error ? ' ' + v.error.code + (v.error.message ? ': ' + v.error.message : '') : '')));
      const t = setTimeout(() => done(new Error('Timed out')), 25000);
      v.addEventListener('loadedmetadata', ok);
      v.addEventListener('error', bad);
    });

    const nativeHls = !!v.canPlayType('application/vnd.apple.mpegurl');
    if (link.kind === 'hls' && (!nativeHls || relay) && Hls.isSupported()) {
      const hls = new Hls({
        // TVs have little memory for video: keep 30 s behind the playhead, not everything played so far.
        backBufferLength: 30,
        maxBufferLength: 30,
        xhrSetup: (xhr, url) => {
          if (relay) xhr.open('GET', relayAddress(url, referer), true); // playlists and segments, all through the relay
          if (link.headers) for (const k in link.headers) { try { xhr.setRequestHeader(k, link.headers[k]); } catch { /* forbidden header */ } }
        },
      });
      this.hls = hls;
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        console.warn('[Fanoos] stream error: ' + data.details + (data.response ? ' HTTP ' + data.response.code : ''));
        v.dispatchEvent(new Event('error'));
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!this.maxHeight) return;
        let best = -1, lowest = 0; // the tallest level within the limit, else the smallest one
        hls.levels.forEach((lv, i) => {
          if (lv.height < hls.levels[lowest].height) lowest = i;
          if (lv.height && lv.height <= this.maxHeight && (best < 0 || lv.height > hls.levels[best].height)) best = i;
        });
        hls.autoLevelCapping = best >= 0 ? best : lowest;
      });
      hls.loadSource(link.url);
      hls.attachMedia(v);
    } else {
      // shortcut: DASH relies on native support (Tizen/webOS/Edge); add dash.js or shaka-player for others.
      v.src = relay || link.url;
    }
    subs.forEach((s) => { this.addSubtitle(s).catch(() => {}); });

    await loaded;
    if (startAt > 5 && isFinite(v.duration) && startAt < v.duration - 10) v.currentTime = startAt;
    try { await v.play(); } catch { /* autoplay blocked: user presses play */ }
  }

  private async addSubtitle(s: Subtitle) {
    const r = await httpRequest({ url: s.url });
    const text = /^﻿?WEBVTT/.test(r.body) ? r.body : srtToVtt(r.body);
    const url = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }));
    this.blobs.push(url);
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.srclang = s.lang;
    track.label = s.label || s.lang;
    track.src = url;
    this.video.appendChild(track);
  }

  reset() {
    clearTimeout(this.seekTimer); this.seekTarget = -1;
    if (this.yt) { this.yt.parentNode!.removeChild(this.yt); this.yt = null; this.ytDuration = 0; this.ytPaused = false; }
    if (this.passive) { this.passive.parentNode!.removeChild(this.passive); this.passive = null; }
    this.video.style.display = '';
    if (this.hls) { this.hls.destroy(); this.hls = null; }
    const tracks = this.video.querySelectorAll('track');
    for (let i = 0; i < tracks.length; i++) tracks[i].parentNode!.removeChild(tracks[i]);
    this.blobs.forEach((u) => URL.revokeObjectURL(u));
    this.blobs = [];
    this.video.removeAttribute('src');
    try { this.video.load(); } catch { /* ignore */ }
  }

  destroy() {
    this.reset();
    window.removeEventListener('message', this.onMessage);
  }
}
