// Addons screen: installed addons and repositories, each opening in a window (Kodi's "Add-ons" screen).
import { h, clear, toast, readFile } from '../dom';
import { isTV, platform } from '../../core/platform';
import { button, header, icon, spinner, errorBox, note } from '../components';
import { focusFirst } from '../focus';
import { go, refresh, type ViewContext } from '../router';
import { addons } from '../../core/addon-manager';
import { addLocalFiles, addRepo, findLocalRepos, findUpdates, installFromRepo, installFromUrl, isDefaultRepo, isLocalRepo, loadAllRepos, removeRepo, type RepoAddon, type RepoResult } from '../../core/repository';
import { getAddonSettings, saveAddonSettings } from '../../core/settings';
import { compareVersions, errMsg } from '../../core/util';
import type { InstalledAddon } from '../../core/types';

// Which addon row had focus in the open window, restored after the refresh that follows an action.
let keepFocus: string | null = null;

async function run(label: string, fn: () => Promise<unknown>) {
  const row = document.activeElement && (document.activeElement as HTMLElement).closest ? (document.activeElement as HTMLElement).closest('.modal [data-key]') : null;
  keepFocus = row ? row.getAttribute('data-key') : null;
  const working = label + '…';
  toast(working, 60000);
  try { await fn(); } catch (e) { toast(errMsg(e), 6000); return; }
  const t = document.getElementById('toast');
  if (t && t.textContent === working) toast('Done', 1500); // fn didn't show its own result
  refresh();
}

function iconImg(src: string | undefined) {
  return src ? h('img', { class: 'ext-icon', src, alt: '' }) : h('div', { class: 'ext-icon' });
}

async function settingsPanel(a: InstalledAddon): Promise<HTMLElement> {
  const vals = await getAddonSettings(a.manifest);
  const inputs: (HTMLInputElement | HTMLSelectElement)[] = [];
  const fields = (a.manifest.settings || []).map((s) => {
    const input: HTMLInputElement | HTMLSelectElement = s.type === 'bool'
      ? h('input', { type: 'checkbox', class: 'focusable', checked: !!vals[s.id] })
      : s.type === 'select'
        ? h('select', { class: 'input focusable' }, ...(s.options || []).map((o) => h('option', { value: o, selected: vals[s.id] === o }, o)))
        : h('input', { class: 'input focusable', type: 'text', value: String(vals[s.id] == null ? '' : vals[s.id]) });
    input.setAttribute('data-id', s.id);
    inputs.push(input);
    return h('label', { class: 'field' }, h('span', {}, s.label), input, s.help ? h('small', {}, s.help) : null);
  });
  const save = button('Save settings', async () => {
    const out: Record<string, string | boolean> = {};
    inputs.forEach((i) => { out[i.getAttribute('data-id')!] = i instanceof HTMLInputElement && i.type === 'checkbox' ? i.checked : i.value; });
    await saveAddonSettings(a.manifest.id, out);
    toast('Saved');
  }, 'btn-primary small');
  return h('div', { class: 'ext-settings' }, ...fields, save);
}

function addonRow(key: string, icon: string | undefined, name: (Node | string | null)[], desc: string, actions: (Node | null)[]): HTMLElement {
  return h('div', { class: 'ext-row', 'data-key': key }, iconImg(icon),
    h('div', { class: 'ext-info' }, h('div', { class: 'ext-name' }, ...name), h('div', { class: 'ext-desc' }, desc)),
    h('div', { class: 'ext-actions' }, ...actions));
}

const closeWindow = () => history.back(); // the window lives in the URL (?open=…), so Back and Close are the same

/** A window over the Addons screen. Arrow keys stay inside it (data-focus-scope). */
function windowEl(title: string, subtitle: string | null, headActions: (Node | null)[], body: Node[]): HTMLElement {
  const w = h('div', { class: 'modal', 'data-focus-scope': '1', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-card' },
      h('div', { class: 'modal-head' },
        h('div', { class: 'modal-title' }, h('h2', {}, title), subtitle ? h('small', {}, subtitle) : null),
        ...headActions,
        h('button', { class: 'icon-btn focusable', 'aria-label': 'Close', onclick: closeWindow }, icon('close'))),
      h('div', { class: 'modal-body' }, ...body)));
  w.addEventListener('click', (e) => { if (e.target === w) closeWindow(); }); // click outside the card
  return w;
}

function installedWindow(installed: InstalledAddon[], updates: RepoAddon[]): HTMLElement {
  const upd: Record<string, RepoAddon> = {};
  updates.forEach((u) => { upd[u.id] = u; });
  const body: Node[] = [];
  if (updates.length > 1) body.push(h('div', { class: 'modal-tools' },
    button(`Update all (${updates.length})`, () => run('Updating', async () => { for (const u of updates) await installFromRepo(u); }), 'btn-primary small')));
  if (!installed.length) body.push(note('No addons installed yet. Open a repository to install some.'));
  installed.forEach((a) => {
    const m = a.manifest, u = upd[m.id];
    const panelHost = h('div', {});
    body.push(addonRow(m.id, a.icon,
      [m.name, h('span', { class: 'badge' }, 'v' + m.version), a.enabled ? null : h("span", { class: "badge warn" }, "disabled")],
      m.description || m.id,
      [u ? button('Update to ' + u.version, () => run('Updating ' + u.name, () => installFromRepo(u)), 'btn-primary small') : null,
       m.settings && m.settings.length ? button('Settings', async () => {
         if (panelHost.firstChild) clear(panelHost); else panelHost.appendChild(await settingsPanel(a));
       }, 'small') : null,
       button(a.enabled ? 'Disable' : 'Enable', () => run('Updating', () => addons.setEnabled(m.id, !a.enabled)), 'small'),
       button('Remove', () => run('Removing', () => addons.uninstall(m.id)), 'small danger')]));
    body.push(panelHost);
  });
  return windowEl('Installed addons', installed.length + ' installed', [], body);
}

function repoWindow(r: RepoResult, installed: InstalledAddon[]): HTMLElement {
  const have: Record<string, InstalledAddon> = {};
  installed.forEach((a) => { have[a.manifest.id] = a; });
  const remove = isDefaultRepo(r.url) ? null : button('Remove repository', () => run('Removing repository', async () => {
    await removeRepo(r.url);
    location.replace('#/addons'); // the window's repository is gone: drop it from history too
  }), 'small danger');
  if (!r.repo) return windowEl('Unreachable repository', r.url, [remove], [errorBox(r.error)]);
  const list = r.repo.addons.slice().sort((a, b) => a.name.localeCompare(b.name));
  const body: Node[] = list.map((e) => {
    const cur = have[e.id];
    const action = !cur ? button('Install', () => run('Installing ' + e.name, () => installFromRepo(e)), 'btn-primary small')
      : compareVersions(e.version, cur.manifest.version) > 0 ? button('Update to ' + e.version, () => run('Updating ' + e.name, () => installFromRepo(e)), 'btn-primary small')
        : h('span', { class: 'badge' }, 'Installed');
    return addonRow(e.id, e.icon, [e.name, h('span', { class: 'badge' }, 'v' + e.version)], e.description || e.id, [action]);
  });
  if (!list.length) body.push(note('This repository has no addons.'));
  return windowEl(r.repo.name, isDefaultRepo(r.url) ? 'Built-in repository' : isLocalRepo(r.url) ? 'Opened from a file on this device' : r.url, [remove], body);
}

const count = (n: number) => n + (n === 1 ? ' addon' : ' addons');

function tile(title: string, subtitle: string, ic: Node, open: string, warn = false): HTMLElement {
  return h('button', { class: 'tile focusable', onclick: () => go('addons', { open }) },
    h('span', { class: 'tile-icon' }, ic),
    h('span', { class: 'tile-text' }, h('strong', {}, title), h('small', { class: warn ? 'warn' : '' }, subtitle)));
}

export async function renderAddons(el: HTMLElement, ctx: ViewContext) {
  el.appendChild(header('Addons'));

  // --- add a repository ---
  const url = h('input', { class: 'input focusable', type: 'text', inputmode: 'url', placeholder: 'Repository URL, e.g. example.com/repo.json', 'aria-label': 'Repository URL' });
  const add = button('Add', () => {
    const u = url.value.trim();
    if (!u) return;
    // A direct .zip link still installs that one addon.
    if (/\.zip(\?|$)/i.test(u)) run('Installing', async () => { const r = await installFromUrl(u); toast('Installed ' + r.manifest.name); });
    else run('Adding repository', async () => { const r = await addRepo(u); toast(`Added ${r.name} (${count(r.addons.length)})`); });
  }, 'btn-primary');
  url.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).keyCode === 13) { e.preventDefault(); add.click(); } }); // OK/Enter adds
  url.addEventListener('submit-field', () => add.click()); // the TV keyboard's Done
  // From this device: repo.json (+ its zips), a repository zip, or addon zips.
  const file = h('input', { type: 'file', multiple: true, accept: '.json,.zip,application/json,application/zip', style: { display: 'none' } });
  file.onchange = () => {
    const picked = Array.prototype.slice.call(file.files || []) as File[];
    file.value = '';
    if (!picked.length) return;
    run('Opening ' + (picked.length > 1 ? picked.length + ' files' : picked[0].name), async () => {
      const r = await addLocalFiles(await Promise.all(picked.map(async (f) => ({ name: f.name, data: await readFile(f) }))));
      toast(r.repo ? `Added ${r.repo.name} (${count(r.repo.addons.length)})` : 'Installed ' + r.installed.map((a) => a.manifest.name).join(', '));
    });
  };
  // No typing on a TV: find the repository a computer serves on this network (serve-repo.py) and add it.
  const scan = button('Find on my network', async () => {
    const label = scan.lastChild as HTMLElement;
    const was = label.textContent;
    try {
      const found = await findLocalRepos((t) => { label.textContent = t; });
      if (!found.length) { toast('No repository found on this network. Is serve-repo.py running on your computer?'); return; }
      for (const u of found) { const r = await addRepo(u); toast(`Added ${r.name} (${count(r.addons.length)})`); }
      refresh();
    } catch (e) { toast(errMsg(e)); } finally { label.textContent = was; }
  }, '', 'search');
  // (Not in the Android app: its native requests to silent addresses would tie it up; its keyboard works anyway.)
  el.appendChild(h('div', { class: 'tools' }, url, add, platform === 'android' ? null : scan, isTV ? null : button('Open file…', () => file.click()), file));

  const box = h('div', { class: 'tiles' }, spinner());
  el.appendChild(box);
  const [installed, repos] = await Promise.all([addons.list(), loadAllRepos()]);
  if (!ctx.isCurrent()) return;
  clear(box);
  const updates = findUpdates(installed, repos);

  // Installed addons first, then one tile per repository.
  box.appendChild(tile('Installed addons',
    installed.length + ' installed' + (updates.length ? ` · ${updates.length} update${updates.length > 1 ? 's' : ''}` : ''),
    icon('library'), 'installed'));
  repos.forEach((r) => box.appendChild(r.repo
    ? tile(r.repo.name, count(r.repo.addons.length), icon('addons'), r.url)
    : tile('Unreachable repository', r.url, icon('addons'), r.url, true)));

  // The open window, if any (?open=installed or ?open=<repository url>).
  const open = ctx.route.params.open;
  const r = open && open !== 'installed' ? repos.filter((x) => x.url === open)[0] : undefined;
  const w = open === 'installed' ? installedWindow(installed, updates) : r ? repoWindow(r, installed) : null;
  if (w) {
    el.appendChild(w);
    const row = keepFocus ? w.querySelector('[data-key="' + keepFocus.replace(/"/g, '') + '"]') : null;
    if (row) {
      // Same row if it still has a control (e.g. Settings), else the next control after it.
      const all = w.querySelectorAll<HTMLElement>('.focusable');
      let next: HTMLElement | null = row.querySelector<HTMLElement>('.focusable');
      for (let i = 0; !next && i < all.length; i++) if (row.compareDocumentPosition(all[i]) & 4) next = all[i];
      (next || all[all.length - 1]).focus();
    } else focusFirst(w.querySelector('.modal-body')!.querySelector('.focusable') ? w.querySelector('.modal-body')! : w);
  }
  keepFocus = null;
}
