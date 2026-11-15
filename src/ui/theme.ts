// Themes ("skins"): sets the CSS variables used by styles.css. Engines without CSS variables
// (Tizen 2017 / Chrome 47) ignore this and keep the built-in dark look.
type Vars = Record<string, string>;

export const THEMES: Record<string, { label: string; vars: Vars; meta: string }> = {
  dark: { label: 'Dark', meta: '#0f0f12', vars: {
    bg: '#0f0f12', 'bg-fade': 'rgba(15,15,18,.55)', nav: '#16161c', surface: '#17171f', surface2: '#1f1f29', surface3: '#262633',
    border: '#22222b', text: '#e8e8ee', text2: '#cfcfda', strong: '#fff', muted: '#9a9aa8', faint: '#3a3a4c', tint: 'rgba(255,255,255,.08)', focus: '#fff' } },
  black: { label: 'Black (OLED)', meta: '#000000', vars: {
    bg: '#000', 'bg-fade': 'rgba(0,0,0,.6)', nav: '#07070a', surface: '#0d0d11', surface2: '#15151b', surface3: '#1e1e27',
    border: '#17171d', text: '#e8e8ee', text2: '#cfcfda', strong: '#fff', muted: '#8e8e9c', faint: '#2a2a36', tint: 'rgba(255,255,255,.08)', focus: '#fff' } },
  midnight: { label: 'Midnight (Fanoos)', meta: '#0d0d22', vars: {
    bg: '#0d0d22', 'bg-fade': 'rgba(13,13,34,.55)', nav: '#121433', surface: '#15173a', surface2: '#1c1f48', surface3: '#272b5e',
    border: '#22264f', text: '#ecebf7', text2: '#d3d2ea', strong: '#fff', muted: '#9c9cc4', faint: '#383c78', tint: 'rgba(255,255,255,.08)', focus: '#ffd36b' } },
  light: { label: 'Light', meta: '#f4f4f7', vars: {
    bg: '#f4f4f7', 'bg-fade': 'rgba(244,244,247,.6)', nav: '#ffffff', surface: '#ffffff', surface2: '#ebebf1', surface3: '#dfdfe9',
    border: '#dcdce4', text: '#1c1c22', text2: '#33333d', strong: '#0d0d12', muted: '#686876', faint: '#c4c4cf', tint: 'rgba(0,0,0,.06)', focus: '#1c1c22' } },
};

export const ACCENTS: Record<string, { label: string; accent: string; soft: string; on: string }> = {
  indigo: { label: 'Indigo', accent: '#5865f2', soft: '#c9cbff', on: '#fff' },
  gold: { label: 'Lantern gold', accent: '#e8a83a', soft: '#ffd88f', on: '#1a1206' },
  teal: { label: 'Teal', accent: '#14a394', soft: '#9ff0e5', on: '#fff' },
  rose: { label: 'Rose', accent: '#e0306f', soft: '#ffb3cd', on: '#fff' },
  green: { label: 'Green', accent: '#1f9d55', soft: '#a6f0c6', on: '#fff' },
  orange: { label: 'Orange', accent: '#ea6a1c', soft: '#ffc49c', on: '#fff' },
};

export const SIZES: Record<string, { label: string; zoom: number }> = {
  small: { label: 'Small', zoom: 0.9 },
  normal: { label: 'Normal', zoom: 1 },
  large: { label: 'Large', zoom: 1.15 },
  xlarge: { label: 'Extra large (far TV)', zoom: 1.3 },
};

export interface ThemePrefs { theme: string; accent: string; size: string }
const KEY = 'fanoos.theme';
const DEFAULTS: ThemePrefs = { theme: 'dark', accent: 'indigo', size: 'normal' };

// localStorage (synchronous) so the right theme is applied before the first paint.
export function loadTheme(): ThemePrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      theme: THEMES[saved.theme] ? saved.theme : DEFAULTS.theme,
      accent: ACCENTS[saved.accent] ? saved.accent : DEFAULTS.accent,
      size: SIZES[saved.size] ? saved.size : DEFAULTS.size,
    };
  } catch { return { ...DEFAULTS }; }
}

export function applyTheme(p: ThemePrefs) {
  const root = document.documentElement.style;
  const t = THEMES[p.theme] || THEMES.dark, a = ACCENTS[p.accent] || ACCENTS.indigo;
  for (const k in t.vars) root.setProperty('--' + k, t.vars[k]);
  root.setProperty('--accent', a.accent);
  root.setProperty('--accent-soft', a.soft);
  root.setProperty('--on-accent', a.on);
  (document.body.style as any).zoom = String((SIZES[p.size] || SIZES.normal).zoom);
  document.body.classList.toggle('theme-light', p.theme === 'light');
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', t.meta);
}

export function saveTheme(p: ThemePrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: applies for this session only */ }
  applyTheme(p);
}
