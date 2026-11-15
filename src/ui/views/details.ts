import { h, clear } from '../dom';
import { button, errorBox, row, spinner } from '../components';
import { focusFirst } from '../focus';
import { go, type ViewContext } from '../router';
import { openPlayer } from '../player-view';
import { addons } from '../../core/addon-manager';
import { library } from '../../core/library';
import { fmtTime } from '../../core/util';
import type { Episode, MediaDetails } from '../../core/types';

const epLabel = (e: Episode) => (e.season != null ? 'S' + e.season : '') + (e.episode != null ? 'E' + e.episode : '') || e.title;

const LABELS: Record<string, string> = { home: 'Home', search: 'Search', library: 'Library' };

/** "Back to Home/Search/Library": history.back() returns to the exact screen (query, provider, scroll). */
function backButton(from: string | undefined): HTMLElement {
  return button('Back to ' + (LABELS[from || ''] || 'Home'), () => {
    if (from && LABELS[from] && history.length > 1) history.back(); else go('home');
  }, 'small back-btn', 'back');
}

export async function renderDetails(el: HTMLElement, ctx: ViewContext) {
  const addonId = ctx.route.params.addon, id = ctx.route.params.id, from = ctx.route.params.from;
  el.appendChild(h('div', { class: 'section' }, backButton(from)));
  el.appendChild(spinner());
  let d: MediaDetails;
  try {
    d = await (await addons.host(addonId)).call<MediaDetails>('load', id);
  } catch (e) {
    if (ctx.isCurrent()) { clear(el); el.appendChild(h('div', { class: 'section' }, backButton(from))); el.appendChild(errorBox(e)); }
    return;
  }
  if (!ctx.isCurrent()) return;
  clear(el);

  // In watching order (sites often list the newest first): season, then episode, else as the addon gave them.
  const eps = (d.episodes || []).map((e, i) => ({ e, i })).sort((a, b) =>
    ((a.e.season == null ? 1 : a.e.season) - (b.e.season == null ? 1 : b.e.season)) ||
    ((a.e.episode == null ? a.i : a.e.episode) - (b.e.episode == null ? b.i : b.e.episode)) || a.i - b.i).map((x) => x.e);
  const prev = await library.getProgress(addonId, d.id);
  const resumeEp = prev && prev.episodeId ? eps.filter((e) => e.id === prev.episodeId)[0] : undefined;
  const firstEp = resumeEp || eps[eps.length - 1]; // a show starts at its latest episode
  const playLabel = prev && (resumeEp || !eps.length)
    ? 'Resume ' + (resumeEp ? epLabel(resumeEp) + ' ' : '') + 'at ' + fmtTime(prev.position)
    : eps.length ? 'Play latest episode' : 'Play';
  const play = button(playLabel, () => openPlayer({ addonId, item: d, episode: firstEp }), 'btn-primary', 'play');

  const fav = button((await library.isFavorite(addonId, d.id)) ? 'Saved' : 'Save', async () => {
    const on = await library.toggleFavorite(addonId, { id: d.id, title: d.title, poster: d.poster, type: d.type, year: d.year });
    fav.lastChild!.textContent = on ? 'Saved' : 'Save';
  }, '', 'star');

  const pimg = h('img', { alt: '' });
  pimg.onerror = () => { pimg.style.visibility = 'hidden'; };
  if (d.poster) pimg.src = d.poster;
  const poster = h('div', { class: 'poster hero-poster' }, h('div', { class: 'poster-fallback' }, d.title.charAt(0).toUpperCase()), pimg);
  const bg = h('div', { class: 'hero-bg' });
  if (d.backdrop || d.poster) bg.style.backgroundImage = `url("${d.backdrop || d.poster}")`;
  el.appendChild(h('div', { class: 'hero' }, bg, h('div', { class: 'hero-shade' }), h('div', { class: 'hero-back' }, backButton(from)),
    h('div', { class: 'hero-inner' }, poster,
      h('div', { class: 'hero-text' },
        h('h1', {}, d.title),
        h('div', { class: 'meta' }, [d.year, d.type, eps.length ? eps.length + ' episodes' : ''].filter(Boolean).join(' · ')),
        h('div', {}, ...(d.tags || []).map((t) => h('span', { class: 'tag' }, t))),
        h('div', { class: 'actions' }, play, fav)))));
  if (d.plot) el.appendChild(h('div', { class: 'section' }, h('p', { class: 'plot' }, d.plot)));

  if (eps.length) {
    // One row per season; every episode shows the show's poster (or its own, if the addon gives one).
    const seasonOf = (e: Episode) => (e.season == null ? 1 : e.season); // no season given: a one-season show
    const seasons: number[] = [];
    eps.forEach((e) => { const s = seasonOf(e); if (seasons.indexOf(s) < 0) seasons.push(s); });
    seasons.sort((a, b) => a - b);
    const epCard = (e: Episode) => {
      const img = h('img', { alt: '', loading: 'lazy' });
      img.onerror = () => { img.style.visibility = 'hidden'; };
      const src = e.poster || d.poster;
      if (src) img.src = src;
      const label = (e.episode != null ? 'E' + e.episode + ' · ' : '') + e.title;
      return h('button', { class: 'card focusable episode-card', title: label, onclick: () => openPlayer({ addonId, item: d, episode: e }) },
        h('div', { class: 'poster' }, h('div', { class: 'poster-fallback' }, e.episode != null ? 'E' + e.episode : '•'), img,
          resumeEp === e ? h('div', { class: 'progress' }, h('i', { style: { width: Math.round((prev!.position / prev!.duration) * 100) + '%' } })) : null),
        h('div', { class: 'card-title' }, label));
    };
    seasons.forEach((s) => {
      const list = eps.filter((e) => seasonOf(e) === s);
      const named = list.filter((e) => e.seasonName)[0]; // the site's own title for this season
      el.appendChild(row(named ? named.seasonName! : s ? 'Season ' + s : 'Specials', list.map(epCard)));
    });
  }
  focusFirst(play.parentElement!);
}
