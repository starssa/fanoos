// Addon names can be anything (Arabic, French, emoji…); IDs must match Fanoos's rule: provider.something
import { ID_RE } from '../../src/core/addon-manager';

export { ID_RE };

/** Suggest a valid, unused ID from a display name. Non-Latin names fall back to provider.addon, provider.addon-2… */
export function suggestId(name: string, taken: (id: string) => boolean): string {
  const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '') // é → e
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const base = 'provider.' + (slug || 'addon');
  let id = base;
  for (let n = 2; taken(id); n++) id = base + '-' + n;
  return id;
}

/** null when the ID can be used, else why not. */
export function idProblem(id: string, taken: (id: string) => boolean): string | null {
  if (!ID_RE.test(id)) return 'Use lowercase letters, digits, - or _ with a dot, e.g. provider.my-site';
  if (taken(id)) return 'Another addon in this project already uses this ID';
  return null;
}
