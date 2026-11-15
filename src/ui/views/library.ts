import { card, row, header, emptyState } from '../components';
import { continueRow } from '../rows';
import { go, refresh, type ViewContext } from '../router';
import { library } from '../../core/library';

export async function renderLibrary(el: HTMLElement, ctx: ViewContext) {
  const [favs, hist] = await Promise.all([library.listFavorites(), library.continueWatching()]);
  if (!ctx.isCurrent()) return;
  el.appendChild(header('Library'));
  if (!favs.length && !hist.length) {
    el.appendChild(emptyState('Nothing here yet', 'Saved titles and things you are watching show up here.', ['Browse', () => go('home')]));
    return;
  }
  if (hist.length) el.appendChild(continueRow(hist, () => { if (!favs.length) refresh(); })); // empty library: show the empty state
  if (favs.length) el.appendChild(row('Saved', favs.map((f) => card(f.item, f.addonId))));
}
