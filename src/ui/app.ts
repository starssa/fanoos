import { h, clear, toast } from './dom';
import { icon, errorBox } from './components';
import { initFocus, ensureFocus } from './focus';
import { parseRoute, setRenderer, go, restorePosition } from './router';
import { isPlayerOpen, playerBack } from './player-view';
import { renderHome } from './views/home';
import { renderSearch } from './views/search';
import { renderDetails } from './views/details';
import { renderLibrary } from './views/library';
import { renderAddons } from './views/addons';
import { renderSettings } from './views/settings';
import { platform, isTV, registerTvKeys, exitApp } from '../core/platform';
import { applyTheme, loadTheme } from './theme';
import { addons } from '../core/addon-manager';
import { loadAllRepos, findUpdates } from '../core/repository';

const NAV = [
  { name: 'home', label: 'Home' },
  { name: 'search', label: 'Search' },
  { name: 'library', label: 'Library' },
  { name: 'addons', label: 'Addons' },
  { name: 'settings', label: 'Settings' },
];

let view: HTMLElement;
let nav: HTMLElement;
let token = 0;
let lastBack = 0;

async function render() {
  const my = ++token;
  const route = parseRoute();
  const ctx = { route, isCurrent: () => my === token };
  const navName = route.name === 'details' ? route.params.from || '' : route.name;
  for (let i = 0; i < nav.children.length; i++) {
    const b = nav.children[i];
    b.classList.toggle('active', b.getAttribute('data-route') === navName);
  }
  clear(view);
  view.scrollTop = 0;
  try {
    switch (route.name) {
      case 'search': await renderSearch(view, ctx); break;
      case 'details': await renderDetails(view, ctx); break;
      case 'library': await renderLibrary(view, ctx); break;
      case 'addons': case 'extensions': await renderAddons(view, ctx); break; // 'extensions': old links
      case 'settings': renderSettings(view); break;
      default: await renderHome(view, ctx);
    }
  } catch (e) {
    if (ctx.isCurrent()) view.appendChild(errorBox(e));
  }
  if (!ctx.isCurrent()) return;
  restorePosition(view);
  if (document.body.classList.contains('kbd')) ensureFocus(view);
}

function onBack() {
  if (isPlayerOpen()) return playerBack();
  const menu = document.querySelector('.provider-menu:not(.hidden)'); // Home's provider list: Back closes it first
  if (menu) {
    menu.classList.add('hidden');
    const name = document.querySelector<HTMLElement>('.provider-name');
    if (name) name.focus();
    return;
  }
  if (parseRoute().name !== 'home') {
    if (history.length > 1) history.back(); else go('home');
    return;
  }
  if (Date.now() - lastBack < 2000) return exitApp();
  lastBack = Date.now();
  toast('Press back again to exit', 2000);
}

async function checkUpdates() {
  try {
    const n = findUpdates(await addons.list(), await loadAllRepos()).length;
    if (n) toast(`${n} addon update${n > 1 ? 's' : ''} available — see Addons`, 5000);
  } catch { /* offline */ }
}

export function startApp(root: HTMLElement) {
  // TVs have no developer console: show unexpected errors on screen, so a broken button says why.
  window.addEventListener('error', (e) => { if (e.message) toast('Error: ' + e.message + (e.filename ? ' (' + String(e.filename).split('/').pop() + ':' + e.lineno + ')' : ''), 8000); });
  window.addEventListener('unhandledrejection', (e) => { const r = (e as PromiseRejectionEvent).reason; toast('Error: ' + (r && r.message ? r.message : String(r)), 8000); });
  applyTheme(loadTheme());
  document.body.classList.add('platform-' + platform);
  if (isTV) document.body.classList.add('tv', 'kbd');

  nav = h('nav', { class: 'nav', 'aria-label': 'Main' }, h('img', { class: 'brand', src: 'icon.svg', alt: 'Fanoos' }), ...NAV.map((n) =>
    h('button', { class: 'nav-btn focusable', 'data-route': n.name, 'aria-label': n.label, onclick: () => go(n.name) },
      icon(n.name), h('span', { class: 'nav-label' }, n.label))));
  view = h('main', { class: 'view' });
  root.appendChild(h('div', { class: 'shell' }, nav, view));

  setRenderer(render);
  window.addEventListener('hashchange', render);
  initFocus(onBack);
  (window as any).fanoosBack = onBack; // called by the Android shell's back button
  registerTvKeys();
  const capApp = (window as any).Capacitor?.Plugins?.App; // needs @capacitor/app on Android
  if (capApp && capApp.addListener) capApp.addListener('backButton', onBack);

  render();
  setTimeout(checkUpdates, 4000);
}
