import { h, toast } from '../dom';
import { button, header } from '../components';
import { db, deleteDatabase } from '../../core/storage';
import { canOpenExternal, platform, isTV, shell, getLanRelay } from '../../core/platform';
import { getExternalApp, getMaxQuality, getPlayerMode, setExternalApp, setMaxQuality, setPlayerMode, type ExternalApp, type PlayerMode } from '../prefs';
import { APP_VERSION, HOST_API_VERSION } from '../../core/types';
import { ACCENTS, SIZES, THEMES, loadTheme, saveTheme } from '../theme';

/** A labelled row of chips; picking one updates in place so focus stays put on TV remotes. */
export function choice(label: string, options: { id: string; label: string; swatch?: string }[], current: string, pick: (id: string) => void): HTMLElement {
  const chips = options.map((o) => {
    const b = h('button', { class: 'chip focusable' + (o.id === current ? ' active' : ''), 'aria-pressed': String(o.id === current) },
      o.swatch ? h('span', { class: 'swatch', style: { background: o.swatch } }) : null, o.label);
    b.onclick = () => {
      chips.forEach((c) => { c.classList.toggle('active', c === b); c.setAttribute('aria-pressed', String(c === b)); });
      pick(o.id);
    };
    return b;
  });
  return h('div', { class: 'setting' }, h('h3', {}, label), h('div', { class: 'chips', role: 'group', 'aria-label': label }, ...chips));
}

let resetArmed = 0;

export function renderSettings(el: HTMLElement) {
  const info = (k: string, v: string) => h('div', { class: 'info-row' }, h('span', {}, k), h('strong', {}, v));
  el.appendChild(header('Settings'));

  const t = loadTheme();
  const list = <T extends { label: string }>(o: Record<string, T>, swatch?: (v: T) => string) =>
    Object.keys(o).map((id) => ({ id, label: o[id].label, swatch: swatch && swatch(o[id]) }));
  el.appendChild(h('div', { class: 'section' }, h('h2', {}, 'Appearance'),
    choice('Theme', list(THEMES, (v) => v.vars.bg), t.theme, (id) => saveTheme({ ...loadTheme(), theme: id })),
    choice('Accent colour', list(ACCENTS, (v) => v.accent), t.accent, (id) => saveTheme({ ...loadTheme(), accent: id })),
    choice('Text and poster size', list(SIZES), t.size, (id) => saveTheme({ ...loadTheme(), size: id }))));

  if (canOpenExternal) {
    const help: Record<string, string> = {
      internal: 'Plays inside Fanoos: remembers where you stopped, subtitles from addons, remote-control keys.',
      external: platform === 'web' ? 'Opens the stream in a new browser tab.'
        : 'Hands the video to VLC or mpv, which play every format (MKV, HEVC, cloud links). Fanoos can\'t track progress there.',
      ask: 'Choose each time you press Play.',
    };
    const note2 = h('p', { class: 'setting-help' }, help[getPlayerMode()]);
    el.appendChild(h('div', { class: 'section' }, h('h2', {}, 'Player'),
      choice('Play videos with', [
        { id: 'internal', label: 'Fanoos player' },
        { id: 'external', label: platform === 'web' ? 'New browser tab' : 'External player' },
        { id: 'ask', label: 'Ask every time' },
      ], getPlayerMode(), (id) => { setPlayerMode(id as PlayerMode); note2.textContent = help[id]; }), note2,
      platform === 'web' ? null : choice('External player app', [
        { id: 'vlc', label: 'VLC' },
        { id: 'mpv', label: 'mpv' },
        { id: 'system', label: shell === 'android' ? 'Let Android ask' : 'First one installed' },
      ], getExternalApp(), (id) => setExternalApp(id as ExternalApp)),
      platform === 'web' ? null : h('p', { class: 'setting-help' },
        'Used by "External player", by the ↗ button in the Fanoos player, and offered in "Ask every time". ' +
        (shell === 'android' ? 'If the app is missing, Fanoos offers to install it from the Play Store.' : 'mpv plays YouTube and Dailymotion links when yt-dlp is installed.'))));
  }

  el.appendChild(h('div', { class: 'section' }, h('h2', {}, 'Video quality'),
    choice('Maximum quality', [
      { id: '0', label: 'Best available' }, { id: '2160', label: '4K' }, { id: '1080', label: '1080p' },
      { id: '720', label: '720p' }, { id: '480', label: '480p' }, { id: '360', label: '360p' },
    ], String(getMaxQuality()), (id) => setMaxQuality(+id)),
    h('p', { class: 'setting-help' }, 'Sources above this quality are hidden (when the source says its quality), and adaptive streams stop there. Saves data on slow connections.')));

  el.appendChild(h('div', { class: 'section' }, h('h2', {}, 'About'),
    info('Version', APP_VERSION),
    info('Platform', platform + (isTV ? ' (TV mode)' : '')),
    info('Addon API', String(HOST_API_VERSION)),
    getLanRelay() ? info('Video relay', getLanRelay() + ' (serve-repo.py on your computer: plays videos that need a Referer)') : null,
    h('div', { class: 'actions', style: { marginTop: '20px' } },
      button('Clear watch history', async () => { await db.clear('history'); toast('History cleared'); }),
      button('Clear saved titles', async () => { await db.clear('favorites'); toast('Saved titles cleared'); }),
      // Two presses instead of confirm(): some TV runtimes don't show native dialogs.
      button('Reset everything', async () => {
        if (Date.now() - resetArmed > 4000) { resetArmed = Date.now(); toast('Press again to remove all addons and data'); return; }
        await deleteDatabase();
        try { localStorage.clear(); } catch { /* ignore */ }
        location.reload();
      }, 'danger')),
    h('p', { class: 'note', style: { margin: '24px 0' } },
      'Fanoos contains no content. Everything you browse comes from the addons you install; only install addons for sources you are allowed to use.')));
}
