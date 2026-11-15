// Spatial navigation for TV remotes / gamepads / keyboards: arrows move focus to the
// nearest .focusable in that direction, inside the top-most [data-focus-scope] (e.g. the player).
import { isKey } from '../core/platform';

type Dir = 'left' | 'right' | 'up' | 'down';

function scope(): Element {
  const s = document.querySelectorAll('[data-focus-scope]');
  return s.length ? s[s.length - 1] : document.body;
}

function candidates(root: Element = scope()): HTMLElement[] {
  const all = root.querySelectorAll<HTMLElement>('.focusable');
  const out: HTMLElement[] = [];
  for (let i = 0; i < all.length; i++) {
    const r = all[i].getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && !(all[i] as HTMLButtonElement).disabled) out.push(all[i]);
  }
  return out;
}

export function focusFirst(root?: Element) {
  const c = candidates(root);
  if (c.length) focusEl(c[0]);
}

/** Focus something if nothing is focused yet (after async content arrives). */
export function ensureFocus(root?: Element) {
  const a = document.activeElement;
  if (!a || a === document.body || !(a as HTMLElement).classList.contains('focusable')) focusFirst(root);
}

function focusEl(el: HTMLElement) {
  el.focus();
  try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' } as ScrollIntoViewOptions); } catch { el.scrollIntoView(false); }
}

// Fast path for poster rows (hundreds of cards on Home): Left/Right is the next card, Up/Down the nearest card of the
// row above/below, without measuring every focusable on the page.
function usable(el: Element | null): el is HTMLElement {
  return !!el && el.classList.contains('focusable') && !(el as HTMLButtonElement).disabled && (el as HTMLElement).offsetParent !== null;
}
function inRow(cur: HTMLElement, dir: Dir): HTMLElement | null | undefined {
  const strip = cur.parentElement;
  if (!strip || !strip.classList.contains('row-scroll') || !cur.closest('.view')) return undefined;
  if (dir === 'left' || dir === 'right') {
    let n = (dir === 'left' ? cur.previousElementSibling : cur.nextElementSibling);
    while (n && !usable(n)) n = dir === 'left' ? n.previousElementSibling : n.nextElementSibling;
    return n ? n as HTMLElement : dir === 'left' ? undefined : null; // first card + Left: to the nav (general search)
  }
  const strips = Array.prototype.slice.call(document.querySelectorAll('.view .row-scroll')) as HTMLElement[];
  const i = strips.indexOf(strip);
  // Something else between two rows (tabs, a header): let the general search handle it.
  const next = strips[dir === 'up' ? i - 1 : i + 1];
  if (!next) return undefined;
  const between = (dir === 'down' ? strip : next).closest('.row');
  const other = (dir === 'down' ? next : strip).closest('.row');
  if (!between || !other || between.nextElementSibling !== other) return undefined;
  const x = cur.getBoundingClientRect().left;
  let best: HTMLElement | null = null, bestD = Infinity;
  for (let c = next.firstElementChild; c; c = c.nextElementSibling) {
    if (!usable(c)) continue;
    const d = Math.abs(c.getBoundingClientRect().left - x);
    if (d < bestD) { bestD = d; best = c as HTMLElement; } else if (best) break; // cards are in order: past the closest
  }
  return best || undefined;
}

export function move(dir: Dir) {
  const cur = document.activeElement as HTMLElement | null;
  if (cur && scope() === document.body) {
    const fast = inRow(cur, dir);
    if (fast) { focusEl(fast); return; }
    if (fast === null) return; // end of the row
  }
  const els = candidates();
  if (!cur || els.indexOf(cur) < 0) { if (els.length) focusEl(els[0]); return; }
  const r = cur.getBoundingClientRect();
  const horizontal = dir === 'left' || dir === 'right';
  // Same region first; for left/right only the same row (so Left from the first poster reaches the nav).
  const local = els.filter((el) => {
    if (region(el) !== region(cur)) return false;
    if (!horizontal) return true;
    const b = el.getBoundingClientRect();
    return b.bottom > r.top && b.top < r.bottom;
  });
  const best = nearest(cur, dir, local) || nearest(cur, dir, els);
  if (best) focusEl(best);
}

// Stay inside the side nav / the content / an overlay while there's somewhere to go;
// cross into another region only when nothing lies that way.
function region(el: Element): Element | null {
  return el.closest ? el.closest('.nav, .view, [data-focus-scope]') : null;
}

function nearest(cur: HTMLElement, dir: Dir, els: HTMLElement[]): HTMLElement | null {
  const r = cur.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best: HTMLElement | null = null, bestScore = Infinity;
  for (const el of els) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const dx = b.left + b.width / 2 - cx, dy = b.top + b.height / 2 - cy;
    let gap: number, off: number;
    // gap = distance along the direction (edge to edge), off = misalignment across it.
    if (dir === 'right') { if (dx <= 1) continue; gap = b.left - r.right; off = Math.abs(dy); }
    else if (dir === 'left') { if (dx >= -1) continue; gap = r.left - b.right; off = Math.abs(dy); }
    else if (dir === 'down') { if (dy <= 1) continue; gap = b.top - r.bottom; off = Math.abs(dx); }
    else { if (dy >= -1) continue; gap = r.top - b.bottom; off = Math.abs(dx); }
    const score = dir === 'left' || dir === 'right' ? Math.max(gap, 0) + off * 10 : Math.max(gap, 0) * 10 + off;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

export function initFocus(onBack: () => void) {
  document.addEventListener('mousedown', () => document.body.classList.remove('kbd'));
  document.addEventListener('keydown', (e) => {
    const code = e.keyCode;
    const a = document.activeElement as HTMLElement | null;
    const typing = !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
    document.body.classList.add('kbd');

    if (isKey(code, 'BACK') && !(typing && code === 8)) { e.preventDefault(); onBack(); return; }
    // Samsung/LG on-screen keyboard: Done (65376) acts like Enter, Cancel (65385) closes it. Then the remote moves on
    // from the field (the keyboard keeps arrow keys while it is open, so a field could not be left otherwise).
    if (typing && a && a.tagName === 'INPUT' && (code === 65376 || code === 65385)) {
      e.preventDefault();
      if (code === 65376) { // fields that act on OK listen for this; a field in a form submits it
        a.dispatchEvent(new Event('submit-field'));
        const form = (a as HTMLInputElement).form;
        if (form) form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
      const field = a;
      setTimeout(() => { if (document.activeElement === field) { field.blur(); focusEl(field); move('right'); } }, 0);
      return;
    }
    const dir: Dir | null = code === 37 ? 'left' : code === 39 ? 'right' : code === 38 ? 'up' : code === 40 ? 'down' : null;
    if (!dir) return;
    if (typing && (dir === 'left' || dir === 'right')) {
      // Let the caret move inside the text; at its start/end, Left/Right leave the field (TV remotes have no Tab).
      const t = a as HTMLInputElement;
      let edge = false;
      try { edge = t.tagName === 'INPUT' && t.selectionStart === t.selectionEnd && (dir === 'right' ? t.selectionEnd === t.value.length : t.selectionStart === 0); } catch { edge = true; } // types without a caret
      if (!edge) return;
    }
    e.preventDefault();
    move(dir);
  });
}
