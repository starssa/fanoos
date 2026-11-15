// Rows with behaviour: "More" paging, and Continue watching with remove/clear.
import { h, clear } from './dom';
import { button, card, icon, row } from './components';
import { addons } from '../core/addon-manager';
import { library, type HistoryEntry } from '../core/library';
import { errMsg } from '../core/util';
import type { HomeSection, MediaItem, MorePage } from '../core/types';

/** search() may return MediaItem[] or { items, more }. */
export function toPage(r: MediaItem[] | MorePage | null | undefined): MorePage {
  if (!r) return { items: [] };
  return Array.isArray(r) ? { items: r } : { items: r.items || [], more: r.more };
}

/** A poster row; if `more` is set, a "More" card at the end loads the next items via the addon's getMore(). */
export function pagedRow(addonId: string, title: string, items: MediaItem[], more?: string): HTMLElement {
  const section = row(title, items.map((i) => card(i, addonId)));
  if (!more) return section;
  const scroller = section.querySelector('.row-scroll')!;
  let token: string | undefined = more;
  let busy = false;
  const label = h('span', { class: 'more-label' }, '');
  const moreBtn = h('button', { class: 'card more-card focusable', 'aria-label': 'More ' + title, title: 'More' },
    h('div', { class: 'poster' }, h('div', { class: 'poster-fallback more-inner' }, icon('next'), label)));
  const load = async () => {
    if (busy || !token) return;
    busy = true;
    label.textContent = 'Loading…';
    try {
      const page = toPage(await (await addons.host(addonId)).call<MorePage>('getMore', token));
      const cards = page.items.map((i) => card(i, addonId));
      cards.forEach((c) => scroller.insertBefore(c, moreBtn));
      token = page.items.length ? page.more : undefined;
      const hadFocus = document.activeElement === moreBtn;
      if (!token) moreBtn.parentNode!.removeChild(moreBtn);
      if (hadFocus && cards.length) cards[0].focus(); // remote: you moved onto More, land on the first new poster
      else if (hadFocus && !token) (scroller.lastElementChild as HTMLElement | null)?.focus();
    } catch (e) {
      label.textContent = errMsg(e).slice(0, 40);
    }
    label.textContent = '';
    busy = false;
  };
  moreBtn.addEventListener('click', load);
  moreBtn.addEventListener('focus', () => { if (document.body.classList.contains('kbd')) load(); });
  scroller.appendChild(moreBtn);
  return section;
}

/** A Home row; with tabs (e.g. a site menu's sub-menu): "All" shows the row's own items, a tab loads its page. */
export function homeRow(addonId: string, s: HomeSection): HTMLElement {
  if ((!s.tabs || !s.tabs.length) && !s.first) return pagedRow(addonId, s.title, s.items, s.more);
  const tabs = h('div', { class: 'chips row-tabs', role: 'tablist', 'aria-label': s.title });
  const body = h('div', {}, pagedRow(addonId, '', s.items, s.more));
  const all = [{ title: s.first || 'All', more: '' }].concat(s.tabs || []);
  let shown = 0;
  const put = (n: Node) => { clear(body); body.appendChild(n); };
  const select = async (i: number) => {
    if (i === shown) return;
    shown = i;
    all.forEach((_, j) => { tabs.children[j].classList.toggle('active', j === i); tabs.children[j].setAttribute('aria-selected', String(j === i)); });
    if (!i) { put(pagedRow(addonId, '', s.items, s.more)); return; }
    put(h('div', { class: 'note' }, 'Loading…'));
    try {
      const page = toPage(await (await addons.host(addonId)).call<MorePage>('getMore', all[i].more));
      if (shown === i) put(page.items.length ? pagedRow(addonId, '', page.items, page.more) : h('div', { class: 'note' }, 'Nothing here'));
    } catch (e) { if (shown === i) put(h('div', { class: 'note' }, errMsg(e))); }
  };
  all.forEach((t, i) => tabs.appendChild(h('button', { class: 'chip focusable' + (i ? '' : ' active'), role: 'tab', 'aria-selected': String(!i), onclick: () => select(i) }, t.title)));
  return h('section', { class: 'row row-tabbed' }, h('h2', {}, s.title), tabs, body);
}

/** Continue watching: Clear for the whole row, and a remove button under every poster. */
export function continueRow(entries: HistoryEntry[], onEmpty: () => void): HTMLElement {
  const wraps = entries.map((c) => {
    const wrap = h('div', { class: 'card-wrap' }, card(c.item, c.addonId, c.position / c.duration));
    const remove = h('button', { class: 'card-remove focusable', 'aria-label': 'Remove ' + c.item.title + ' from Continue watching' },
      icon('close'), h('span', {}, 'Remove'));
    remove.onclick = async () => {
      await library.removeProgress(c.addonId, c.item.id);
      const next = (wrap.nextElementSibling || wrap.previousElementSibling) as HTMLElement | null;
      wrap.parentNode!.removeChild(wrap);
      if (next) (next.querySelector('.card-remove') as HTMLElement).focus();
      else { section.parentNode!.removeChild(section); onEmpty(); }
    };
    wrap.appendChild(remove);
    return wrap;
  });
  const clearBtn = button('Clear', async () => {
    await library.clearProgress();
    section.parentNode!.removeChild(section);
    onEmpty();
  }, 'small');
  const section = row('Continue watching', wraps, clearBtn);
  return section;
}
