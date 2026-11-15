import { h, clear } from '../dom';
import { icon, spinner, note, errorBox, emptyState } from '../components';
import { continueRow, homeRow } from '../rows';
import { ensureFocus } from '../focus';
import { go, type ViewContext } from '../router';
import { addons } from '../../core/addon-manager';
import { kv } from '../../core/storage';
import { library } from '../../core/library';
import type { HomeSection } from '../../core/types';

// Home rows already loaded this session: coming back from a title shows them at once instead of downloading every
// row again (the ⟳ button reloads). Kept 15 minutes.
const homeCache = new Map<string, { at: number; sections: HomeSection[] }>();
const HOME_TTL = 15 * 60 * 1000;

export async function renderHome(el: HTMLElement, ctx: ViewContext) {
  const providers = await addons.listEnabled('provider');
  if (!ctx.isCurrent()) return;
  if (!providers.length) {
    el.appendChild(emptyState('No addons yet', 'Fanoos shows content from the addons you install. Several are ready to install.',
      ['Open Addons', () => go('addons')]));
    return;
  }
  let current = ctx.route.params.addon || (await kv.get<string>('homeProvider')) || '';
  if (!providers.some((p) => p.manifest.id === current)) current = providers[0].manifest.id;

  // The title is the provider: click it to choose another (CloudStream's "select provider"); ⟳ reloads its rows.
  const active = providers.filter((p) => p.manifest.id === current)[0];
  const menu = h('div', { class: 'provider-menu hidden', role: 'listbox', 'aria-label': 'Providers' }, ...providers.map((p) =>
    h('button', {
      class: 'provider-option focusable' + (p.manifest.id === current ? ' active' : ''), role: 'option',
      'aria-selected': String(p.manifest.id === current),
      onclick: () => { kv.set('homeProvider', p.manifest.id); go('home', { addon: p.manifest.id }); },
    }, p.manifest.name)));
  const nameBtn = h('button', {
    class: 'provider-name focusable', 'aria-haspopup': 'listbox', 'aria-label': active.manifest.name + ': choose a provider',
    onclick: () => {
      const open = menu.classList.toggle('hidden') === false;
      if (open) (menu.querySelector<HTMLElement>('.active') || menu.querySelector<HTMLElement>('button'))!.focus();
    },
  }, h('span', {}, active.manifest.name), icon('expand'));
  const reload = h('button', { class: 'icon-btn focusable', 'aria-label': 'Reload', title: 'Reload', onclick: () => load(true) }, icon('refresh'));
  el.appendChild(h('header', { class: 'view-header provider-header' }, h('h1', {}, nameBtn), reload, menu));

  const contBox = h('div', {});
  const body = h('div', {});
  el.appendChild(contBox);
  el.appendChild(body);
  const load = async (force = false) => {
    clear(body);
    body.appendChild(spinner());
    const cont = await library.continueWatching();
    clear(contBox);
    if (cont.length) contBox.appendChild(continueRow(cont.slice(0, 20), () => {}));
    try {
      const cached = homeCache.get(current);
      let sections: HomeSection[];
      if (!force && cached && Date.now() - cached.at < HOME_TTL) sections = cached.sections;
      else {
        const host = await addons.host(current);
        sections = (await host.call<HomeSection[]>('getHome', 1)) || [];
        if (sections.length) homeCache.set(current, { at: Date.now(), sections });
      }
      if (!ctx.isCurrent()) return;
      clear(body);
      if (!sections.length) body.appendChild(note('This addon returned nothing. Check its settings in Addons.'));
      sections.forEach((s) => body.appendChild(homeRow(current, s)));
      ensureFocus(el);
    } catch (e) {
      if (!ctx.isCurrent()) return;
      clear(body);
      body.appendChild(errorBox(e));
    }
  };
  await load();
}
