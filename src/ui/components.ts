import { h } from './dom';
import { go, parseRoute, rememberPosition } from './router';
import { errMsg } from '../core/util';
import type { MediaItem } from '../core/types';

const ICONS: Record<string, string> = {
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  library: 'M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z',
  addons: 'M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4c-1.1 0-2 .9-2 2v3.8h1.5c1.5 0 2.7 1.2 2.7 2.7S5 16.2 3.5 16.2H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.5 1.2-2.7 2.7-2.7s2.7 1.2 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z',
  settings: 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
  close: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  star: 'M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  external: 'M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7zM19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  next: 'M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z',
  refresh: 'M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  expand: 'M7 10l5 5 5-5z',
  list: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
};

export function icon(name: string): HTMLElement {
  const s = h('span', { class: 'ic', 'aria-hidden': 'true' });
  s.innerHTML = `<svg viewBox="0 0 24 24"><path d="${ICONS[name] || ''}"/></svg>`;
  return s;
}

export function button(label: string, onClick: () => unknown, cls = '', ic?: string): HTMLButtonElement {
  return h('button', { class: 'btn focusable ' + cls, onclick: onClick }, ic ? icon(ic) : null, h('span', {}, label));
}

export function card(item: MediaItem, addonId: string, progress?: number): HTMLButtonElement {
  const img = h('img', { alt: '', loading: 'lazy', decoding: 'async' });
  img.onerror = () => { img.style.visibility = 'hidden'; };
  if (item.poster) img.src = item.poster;
  const key = addonId + '|' + item.id;
  const open = () => {
    rememberPosition(key);
    go('details', { addon: addonId, id: item.id, from: parseRoute().name }); // from: Back label + nav highlight
  };
  return h('button', { class: 'card focusable', title: item.title, 'data-key': key, onclick: open },
    h('div', { class: 'poster' },
      h('div', { class: 'poster-fallback' }, item.title.charAt(0).toUpperCase()),
      img,
      progress != null ? h('div', { class: 'progress' }, h('i', { style: { width: Math.round(progress * 100) + '%' } })) : null),
    h('div', { class: 'card-title' }, item.title),
    item.year ? h('div', { class: 'card-sub' }, String(item.year)) : null);
}

export function row(title: string, cards: HTMLElement[], action?: Node): HTMLElement {
  return h('section', { class: 'row' },
    action ? h('div', { class: 'row-head' }, h('h2', {}, title), action) : h('h2', {}, title),
    h('div', { class: 'row-scroll' }, ...cards));
}

export function header(title: string, ...extra: (Node | null)[]): HTMLElement {
  return h('header', { class: 'view-header' }, h('h1', {}, title), ...extra);
}

export const spinner = () => h('div', { class: 'spinner', role: 'status', 'aria-label': 'Loading' });
export const note = (t: string) => h('div', { class: 'note' }, t);
export const errorBox = (e: unknown) => h('div', { class: 'error', role: 'alert' }, errMsg(e));

export function emptyState(title: string, text: string, action?: [string, () => void]): HTMLElement {
  return h('div', { class: 'empty' }, h('h2', {}, title), h('p', {}, text), action ? button(action[0], action[1], 'btn-primary') : null);
}
