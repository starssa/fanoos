export interface Route { name: string; params: Record<string, string> }
export interface ViewContext { route: Route; isCurrent: () => boolean }

let renderer: () => void = () => {};
export function setRenderer(fn: () => void) { renderer = fn; }
export function refresh() { renderer(); }

export function parseRoute(): Route {
  const hash = location.hash.replace(/^#\/?/, '');
  const q = hash.indexOf('?');
  const name = (q < 0 ? hash : hash.slice(0, q)) || 'home';
  const params: Record<string, string> = {};
  (q < 0 ? '' : hash.slice(q + 1)).split('&').forEach((p) => {
    if (!p) return;
    const i = p.indexOf('=');
    params[decodeURIComponent(i < 0 ? p : p.slice(0, i))] = i < 0 ? '' : decodeURIComponent(p.slice(i + 1));
  });
  return { name, params };
}

// Scroll position + focused poster per screen, so Back returns exactly where you were.
const positions: Record<string, { key: string; scroll: number }> = {};

export function rememberPosition(key: string) {
  const view = document.querySelector('.view');
  positions[location.hash] = { key, scroll: view ? view.scrollTop : 0 };
}

/** Call after content renders (and again as async rows arrive). Restores once, when the poster exists. */
export function restorePosition(view: HTMLElement) {
  const pos = positions[location.hash];
  if (!pos) return;
  const cards = view.querySelectorAll<HTMLElement>('[data-key]');
  for (let i = 0; i < cards.length; i++) {
    if (cards[i].getAttribute('data-key') !== pos.key) continue;
    view.scrollTop = pos.scroll;
    cards[i].focus();
    try { cards[i].scrollIntoView({ block: 'nearest', inline: 'nearest' } as ScrollIntoViewOptions); } catch { /* old engines */ }
    delete positions[location.hash];
    return;
  }
}

export function go(name: string, params: Record<string, string> = {}) {
  const qs = Object.keys(params).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
  const hash = '#/' + name + (qs ? '?' + qs : '');
  if (location.hash === hash) renderer(); else location.hash = hash;
}
