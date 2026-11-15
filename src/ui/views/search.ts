import { h } from '../dom';
import { button, header, icon, note, errorBox, spinner } from '../components';
import { pagedRow, toPage } from '../rows';
import { go, restorePosition, type ViewContext } from '../router';
import { addons } from '../../core/addon-manager';
import { kv } from '../../core/storage';
import type { MediaItem, MorePage } from '../../core/types';

const HISTORY_KEY = 'searchHistory';
const SCOPE_KEY = 'searchScope'; // '' = all addons, else an addon id
const HISTORY_MAX = 15;

/** Most recent first, no duplicates (case-insensitive). */
export function addToHistory(list: string[], q: string): string[] {
  const lower = q.toLowerCase();
  return [q].concat(list.filter((x) => x.toLowerCase() !== lower)).slice(0, HISTORY_MAX);
}

export async function renderSearch(el: HTMLElement, ctx: ViewContext) {
  const q = ctx.route.params.q || '';
  const [providers, history, savedScope] = await Promise.all([
    addons.listEnabled('provider'), kv.get<string[]>(HISTORY_KEY), kv.get<string>(SCOPE_KEY),
  ]);
  if (!ctx.isCurrent()) return;
  // Scope from the URL (so Back restores it), else the last one used; fall back to all if that addon is gone.
  let scope = ctx.route.params.addon != null ? ctx.route.params.addon : savedScope || '';
  if (scope && !providers.some((p) => p.manifest.id === scope)) scope = '';
  const scopeName = scope ? providers.filter((p) => p.manifest.id === scope)[0].manifest.name : '';

  const search = (query: string, inScope = scope) => {
    const v = query.trim();
    if (!v) return;
    kv.set(HISTORY_KEY, addToHistory(history || [], v));
    go('search', { q: v, addon: inScope });
  };

  const input = h('input', {
    class: 'input focusable', type: 'search', value: q, 'aria-label': 'Search',
    placeholder: scope ? 'Search in ' + scopeName + '…' : 'Search all addons…',
  });
  const form = h('form', { class: 'search-bar', onsubmit: (e: Event) => { e.preventDefault(); search(input.value); } },
    input, h('button', { class: 'btn btn-primary focusable', type: 'submit' }, icon('search'), h('span', {}, 'Search')));
  el.appendChild(header('Search'));
  el.appendChild(form);

  if (!providers.length) { el.appendChild(note('Install a provider addon to search.')); return; }

  // Where to search: all addons, or one.
  const setScope = (id: string) => {
    kv.set(SCOPE_KEY, id);
    go('search', q ? { q, addon: id } : { addon: id });
  };
  el.appendChild(h('div', { class: 'chips search-scope', role: 'group', 'aria-label': 'Search in' },
    h('button', { class: 'chip focusable' + (scope ? '' : ' active'), onclick: () => setScope('') }, 'All addons'),
    ...providers.map((p) => h('button', {
      class: 'chip focusable' + (p.manifest.id === scope ? ' active' : ''), onclick: () => setScope(p.manifest.id),
    }, p.manifest.name))));

  if (!q) {
    if (history && history.length) {
      el.appendChild(h('div', { class: 'section history' },
        h('div', { class: 'history-head' }, h('h2', {}, 'Recent searches'),
          button('Clear', async () => { await kv.del(HISTORY_KEY); go('search', scope ? { addon: scope } : {}); }, 'small')),
        h('div', { class: 'chips' }, ...history.map((x) =>
          h('button', { class: 'chip focusable', onclick: () => search(x) }, icon('search'), h('span', {}, x))))));
    }
    if (!document.body.classList.contains('kbd')) input.focus(); // on TV keep focus off the keyboard field
    return;
  }

  // One row per addon in scope, filled in as each answers (CloudStream's per-provider results).
  providers.filter((p) => !scope || p.manifest.id === scope).forEach((p) => {
    const slot = h('section', { class: 'row' }, h('h2', {}, p.manifest.name), spinner());
    el.appendChild(slot);
    addons.host(p.manifest.id)
      .then((host) => host.call<MediaItem[] | MorePage>('search', q))
      .then((r) => {
        if (!ctx.isCurrent()) return;
        const page = toPage(r);
        const section = page.items.length ? pagedRow(p.manifest.id, p.manifest.name, page.items, page.more)
          : h('section', { class: 'row' }, h('h2', {}, p.manifest.name), note('No results'));
        slot.parentNode!.replaceChild(section, slot);
        restorePosition(el); // coming Back to this search: refocus the poster that was opened
      }, (e) => {
        if (!ctx.isCurrent()) return;
        slot.parentNode!.replaceChild(h('section', { class: 'row' }, h('h2', {}, p.manifest.name), errorBox(e)), slot);
      });
  });
}
