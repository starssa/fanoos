// Fanoos Addon Studio: edit a repository and its addons, see them run live, export zips.
import './studio.css';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { h, clear, toast, readFile } from '../../src/ui/dom';
import { Preview } from './preview';
import { bridgeActive, whenApproved, whenBridgeReady } from './bridge';
import { idProblem, ID_RE, suggestId } from './naming';
import {
  addonZip, blankAddon, checkAddon, checkRepo, exampleProject, importZip, loadProject, repoZip, saveProject,
  type AddonFiles, type Project,
} from './project';

type Sel = { kind: 'repo' } | { kind: 'file'; addon: string; file: string };

const HELP: Record<string, string> = {
  repo: 'repo.json describes your repository. "name" is shown on its tile in Fanoos → Addons. ' +
    'The "addons" list is rebuilt for you on export (id, version, zip file name and SHA-256 checksum), so you only edit name and description. ' +
    'Publish: Export repository, unzip, upload the folder to any static host (GitHub Pages, Netlify…), then in Fanoos: Addons → paste the URL of repo.json → Add.',
  manifest: 'manifest.json: "id" (lowercase, dotted, e.g. provider.mysite — must match the folder), "name", "version" (bump it to ship an update), ' +
    '"type" ("provider" or "extractor"), "permissions.hosts" (every website your addon may call), and optional "settings" (Fanoos draws the form).',
  main: 'main.js runs in a sandbox with one global, fanoos. Call fanoos.register({ getHome, search, load, loadLinks, getMore }). ' +
    'Helpers: fanoos.http.get/post, fanoos.html.select, fanoos.settings.get, fanoos.storage, fanoos.log. The preview re-runs on every change.',
};

let project: Project = loadProject();
let sel: Sel = project.addons.length ? { kind: 'file', addon: project.addons[0].id, file: 'main.js' } : { kind: 'repo' };
const states: Record<string, EditorState> = {}; // per-file editor state (keeps undo history)
let runTimer: ReturnType<typeof setTimeout> | undefined;

const root = document.getElementById('studio')!;
const tree = h('nav', { class: 'tree', 'aria-label': 'Project files' });
const fileTitle = h('div', { class: 'file-title' });
const problems = h('div', { class: 'problems', role: 'status' });
const help = h('div', { class: 'help' });
const editorHost = h('div', { class: 'editor' });
const previewEl = h('section', { class: 'preview', 'aria-label': 'Live preview' });
const preview = new Preview(previewEl);

const view = new EditorView({ parent: editorHost });

const addonById = (id: string) => project.addons.filter((a) => a.id === id)[0];
const key = (s: Sel) => (s.kind === 'repo' ? 'repo.json' : s.addon + '/' + s.file);
const currentText = (): string => (sel.kind === 'repo' ? project.repo : (addonById(sel.addon) || { files: {} as Record<string, string> }).files[sel.file] || '');

function stateFor(s: Sel, text: string): EditorState {
  const k = key(s);
  if (!states[k]) {
    const isJson = s.kind === 'repo' || /\.json$/.test(s.kind === 'file' ? s.file : '');
    states[k] = EditorState.create({
      doc: text,
      extensions: [basicSetup, oneDark, isJson ? json() : javascript(), EditorView.lineWrapping,
        EditorView.updateListener.of((u) => { if (u.docChanged) onEdit(u.state.doc.toString()); })],
    });
  }
  return states[k];
}

function onEdit(text: string) {
  if (sel.kind === 'repo') project.repo = text;
  else {
    const a = addonById(sel.addon);
    if (a) {
      a.files[sel.file] = text;
      if (sel.file === 'manifest.json') {
        // Changing "id" here renames the addon folder too (once the new id is valid and unused).
        let id = '';
        try { id = JSON.parse(text).id; } catch { /* still typing */ }
        if (typeof id === 'string' && id !== a.id && ID_RE.test(id) && !addonById(id)) {
          rekey(a, id);
          fileTitle.textContent = key(sel);
        }
      }
    }
  }
  saveProject(project);
  validate();
  clearTimeout(runTimer);
  runTimer = setTimeout(runSelected, 700); // live preview, debounced
}

function validate() {
  clear(problems);
  const err = sel.kind === 'repo' ? checkRepo(project.repo) : addonById(sel.addon) ? checkAddon(addonById(sel.addon)) : null;
  problems.className = 'problems ' + (err ? 'bad' : 'ok');
  problems.textContent = err ? '⚠ ' + err : '✓ No problems found';
  renderTree();
}

function runSelected() {
  const a = sel.kind === 'file' ? addonById(sel.addon) : project.addons[0];
  if (a) preview.run(a);
}

function open(s: Sel) {
  sel = s;
  view.setState(stateFor(s, currentText()));
  fileTitle.textContent = key(s);
  help.textContent = s.kind === 'repo' ? HELP.repo : s.file === 'manifest.json' ? HELP.manifest : HELP.main;
  validate();
  runSelected();
}

function renderTree() {
  clear(tree);
  const item = (label: string, s: Sel, bad = false) => h('button', {
    class: 'tree-item' + (key(s) === key(sel) ? ' active' : '') + (bad ? ' bad' : ''), onclick: () => open(s),
  }, label);
  tree.appendChild(h('div', { class: 'tree-group' }, h('div', { class: 'tree-head' }, 'Repository'), item('repo.json', { kind: 'repo' }, !!checkRepo(project.repo))));
  project.addons.forEach((a) => {
    const bad = !!checkAddon(a);
    const rename = h('button', { class: 'tree-del', title: 'Rename ' + a.id, 'aria-label': 'Rename ' + a.id, onclick: () => renameAddon(a) }, '✎');
    const remove = h('button', { class: 'tree-del', title: 'Delete ' + a.id, 'aria-label': 'Delete ' + a.id }, '×');
    remove.onclick = async () => {
      if (!(await dialog({ title: 'Delete ' + a.id + '?', text: 'Its files are removed from this project. Export it first to keep a copy.', ok: 'Delete', danger: true }))) return;
      project.addons = project.addons.filter((x) => x !== a);
      saveProject(project);
      open(project.addons.length ? { kind: 'file', addon: project.addons[0].id, file: 'main.js' } : { kind: 'repo' });
    };
    tree.appendChild(h('div', { class: 'tree-group' },
      h('div', { class: 'tree-head' + (bad ? ' bad' : '') }, h('span', {}, a.id), h('span', { class: 'tree-tools' }, rename, remove)),
      ...Object.keys(a.files).sort().map((f) => item(f, { kind: 'file', addon: a.id, file: f }))));
  });
}

/** In-page dialog. Resolves with the field values, or null on Cancel/Escape. */
function dialog(opts: {
  title: string; text?: string; ok: string; danger?: boolean; body?: Node[];
  fields?: { id: string; label: string; value: string; help?: string; check?: (v: Record<string, string>) => string | null }[];
  onInput?: (id: string, values: Record<string, string>, set: (id: string, v: string) => void) => void;
}): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const inputs: Record<string, HTMLInputElement> = {};
    const errors: Record<string, HTMLElement> = {};
    const values = () => { const v: Record<string, string> = {}; for (const k in inputs) v[k] = inputs[k].value.trim(); return v; };
    const okBtn = h('button', { class: 'tb ' + (opts.danger ? 'danger' : 'primary'), type: 'submit' }, opts.ok);
    const refresh = () => {
      let bad = false;
      (opts.fields || []).forEach((f) => {
        const msg = f.check ? f.check(values()) : null;
        errors[f.id].textContent = msg || '';
        if (msg) bad = true;
      });
      okBtn.disabled = bad;
    };
    const fields = (opts.fields || []).map((f) => {
      const input = h('input', { class: 'pv-input', value: f.value, 'aria-label': f.label, spellcheck: false });
      input.addEventListener('input', () => {
        if (opts.onInput) opts.onInput(f.id, values(), (id, v) => { inputs[id].value = v; });
        refresh();
      });
      inputs[f.id] = input;
      errors[f.id] = h('small', { class: 'dlg-error', role: 'alert' });
      return h('label', { class: 'dlg-field' }, h('span', {}, f.label), input, f.help ? h('small', {}, f.help) : null, errors[f.id]);
    });
    const close = (result: Record<string, string> | null) => {
      document.removeEventListener('keydown', onKey, true);
      back.parentNode && back.parentNode.removeChild(back);
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
    const form = h('form', { class: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title,
      onsubmit: (e: Event) => { e.preventDefault(); if (!okBtn.disabled) close(values()); } },
      h('h2', {}, opts.title), opts.text ? h('p', {}, opts.text) : null, ...(opts.body || []), ...fields,
      h('div', { class: 'dlg-actions' }, h('button', { class: 'tb', type: 'button', onclick: () => close(null) }, 'Cancel'), okBtn));
    const back = h('div', { class: 'dlg-back', onclick: (e: Event) => { if (e.target === back) close(null); } }, form);
    document.body.appendChild(back);
    document.addEventListener('keydown', onKey, true);
    refresh();
    const first = form.querySelector<HTMLInputElement>('input') || okBtn;
    first.focus();
    if (first instanceof HTMLInputElement) first.select();
  });
}

const taken = (except?: string) => (id: string) => id !== except && !!addonById(id);

/** Change an addon's folder ID everywhere: project, open editor tabs, selection. */
function rekey(a: AddonFiles, newId: string) {
  const old = a.id;
  if (old === newId) return;
  a.id = newId;
  Object.keys(states).forEach((k) => {
    if (k.indexOf(old + '/') !== 0) return;
    states[newId + k.slice(old.length)] = states[k];
    delete states[k];
  });
  if (sel.kind === 'file' && sel.addon === old) sel = { kind: 'file', addon: newId, file: sel.file };
}

function nameFields(name: string, id: string, except?: string) {
  return {
    fields: [
      { id: 'name', label: 'Name (shown in Fanoos — any language)', value: name,
        check: (v: Record<string, string>) => (v.name ? null : 'Enter a name') },
      { id: 'id', label: 'ID (unique, lowercase)', value: id,
        help: 'Like a package name: provider.my-site. Users never see it, but changing it later makes Fanoos treat it as a new addon.',
        check: (v: Record<string, string>) => idProblem(v.id, taken(except)) },
    ],
  };
}

function download(name: string, data: Blob | ArrayBuffer) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: 'application/zip' }));
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function act(fn: () => Promise<unknown>) {
  try { await fn(); } catch (e) { toast((e as Error).message || String(e), 6000); }
}

// ---------- toolbar ----------
const fileInput = h('input', { type: 'file', accept: '.zip,application/zip', style: { display: 'none' } });
fileInput.onchange = () => act(async () => {
  const f = fileInput.files && fileInput.files[0];
  if (!f) return;
  const added = await importZip(project, await readFile(f));
  saveProject(project);
  Object.keys(states).forEach((k) => delete states[k]);
  open(added.length ? { kind: 'file', addon: added[0], file: 'main.js' } : { kind: 'repo' });
  toast('Imported ' + (added.join(', ') || 'repo.json'));
  fileInput.value = '';
});

async function newAddon() {
  let idEdited = false; // stop following the name once the user types an ID
  const r = await dialog({
    title: 'New addon', ok: 'Create',
    ...nameFields('My addon', suggestId('My addon', taken())),
    onInput: (field, v, set) => {
      if (field === 'id') idEdited = true;
      if (field === 'name' && !idEdited) set('id', suggestId(v.name, taken()));
    },
  });
  if (!r) return;
  const a: AddonFiles = blankAddon(r.id, r.name);
  project.addons.push(a);
  saveProject(project);
  open({ kind: 'file', addon: r.id, file: 'main.js' });
}

async function renameAddon(a: AddonFiles) {
  let cur: any = {};
  try { cur = JSON.parse(a.files['manifest.json']); } catch { /* broken JSON: start from the folder id */ }
  if (typeof cur !== 'object' || !cur || !Object.keys(cur).length) { toast('Fix manifest.json first (it is not valid JSON)', 5000); return; }
  const r = await dialog({ title: 'Rename addon', ok: 'Rename', ...nameFields(cur.name || a.id, a.id, a.id) });
  if (!r) return;
  rekey(a, r.id);
  cur.name = r.name;
  cur.id = r.id;
  a.files['manifest.json'] = JSON.stringify(cur, null, 2) + '\n'; // keeps everything else the user wrote
  delete states[r.id + '/manifest.json']; // reopen that tab with the new text
  saveProject(project);
  open(sel.kind === 'file' && sel.addon === r.id ? sel : { kind: 'file', addon: r.id, file: 'manifest.json' });
}

async function addExample() {
  const ex = exampleProject().addons[0];
  if (addonById(ex.id) && !(await dialog({ title: 'Replace ' + ex.id + '?', text: 'Your copy is replaced with the original example.', ok: 'Replace', danger: true }))) return;
  project.addons = project.addons.filter((a) => a.id !== ex.id).concat([ex]);
  delete states[ex.id + '/main.js']; delete states[ex.id + '/manifest.json'];
  saveProject(project);
  open({ kind: 'file', addon: ex.id, file: 'main.js' });
}

const exportAddon = () => act(async () => {
  const a = sel.kind === 'file' ? addonById(sel.addon) : project.addons[0];
  if (!a) throw new Error('No addon to export');
  const err = checkAddon(a);
  if (err) throw new Error(err);
  const m = JSON.parse(a.files['manifest.json']);
  download(`${m.id}-${m.version}.zip`, await addonZip(a));
});

// The Fanoos Scraper browser extension ships with the Studio (built by tools/build-scraper.mjs).
async function scraperInfo() {
  const step = (t: string, ...rest: (Node | string)[]) => h('li', {}, t, ...rest);
  const code = (t: string) => h('code', {}, t);
  const ok = await dialog({
    title: 'Fanoos Scraper extension', ok: 'Download extension',
    text: 'Write addons by clicking on a site, like Web Scraper: pick one poster card, the search page, the details and the video. It generates main.js and manifest.json; open the zip here with Import zip. ' +
      'It also lets this preview load any site: browsers normally block a page from reading other sites (CORS), so without it the preview shows "Could not download…" for most sites. ' +
      (bridgeActive() ? 'Status: installed and connected ✓'
        : 'Status: not connected. Installed already? In Firefox it also needs permission to access websites: click its toolbar button → "Allow access to all websites" (or about:addons → Fanoos Scraper → Permissions), then reload this page.'),
    body: [
      h('h3', { class: 'dlg-h' }, 'Firefox'),
      h('ol', { class: 'dlg-steps' },
        step('Download fanoos-scraper.xpi.'),
        step('Open ', code('about:debugging#/runtime/this-firefox'), ' → Load Temporary Add-on… → choose the file.'),
        step('Click the lantern button in the toolbar on any site → Open scraper on this page.'),
        step('Click its toolbar button. If it shows "Allow access to all websites", click it (Firefox asks for this separately).'),
        step('Reload this Studio. The first time the preview loads a site, approve this Studio in the tab the extension opens.')),
      h('p', { class: 'dlg-note' }, 'Temporary add-ons are removed when Firefox restarts. To keep it: Firefox Developer Edition/Nightly with ',
        code('xpinstall.signatures.required = false'), ' in about:config, then about:addons → ⚙ → Install Add-on From File. Or sign it for free on addons.mozilla.org (unlisted).'),
      h('h3', { class: 'dlg-h' }, 'Chrome / Edge'),
      h('p', { class: 'dlg-note' }, 'Unzip the file (rename to .zip), open chrome://extensions, turn on Developer mode, Load unpacked → the folder.'),
      h('p', { class: 'dlg-note' }, 'Only build addons for sites you are allowed to use.'),
    ],
  });
  if (!ok) return;
  const a = h('a', { href: 'fanoos-scraper.xpi', download: 'fanoos-scraper.xpi' });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const exportRepo = () => act(async () => {
  const r = await repoZip(project);
  download('fanoos-repository.zip', r.zip);
  toast('Unzip and upload the folder; users add the URL of its repo.json', 6000);
});

const button = (label: string, onclick: () => void, cls = '') => h('button', { class: 'tb ' + cls, onclick }, label);

// Can the preview download any site? Only with the Fanoos Scraper extension (browsers block it otherwise).
const siteAccess = h('button', { class: 'access', title: 'How the live preview downloads sites', onclick: () => scraperInfo() });
function showAccess() {
  siteAccess.textContent = bridgeActive() ? '● Preview can load any site (Fanoos Scraper)' : '● Preview: only sites that allow it (no extension)';
  siteAccess.classList.toggle('on', bridgeActive());
}
showAccess();
whenBridgeReady(() => { showAccess(); runSelected(); });
whenApproved(() => { toast('Studio allowed — reloading the preview'); runSelected(); });
root.appendChild(h('header', { class: 'top' },
  h('img', { class: 'logo', src: 'icon.svg', alt: '' }),
  h('div', { class: 'brand' }, h('strong', {}, 'Fanoos Addon Studio'), siteAccess),
  h('div', { class: 'toolbar' },
    button('+ New addon', newAddon), button('Add example addon', addExample), button('Import zip', () => fileInput.click()),
    button('Scraper extension', scraperInfo), button('Export addon', exportAddon), button('Export repository', exportRepo, 'primary'),
    button('Reset project', async () => {
      if (!(await dialog({ title: 'Reset project?', text: 'Everything is replaced with the examples. Export first if you want to keep your work.', ok: 'Reset', danger: true }))) return;
      project = exampleProject(); saveProject(project); Object.keys(states).forEach((k) => delete states[k]);
      open({ kind: 'file', addon: project.addons[0].id, file: 'main.js' });
    }), fileInput)));
root.appendChild(h('div', { class: 'workspace' },
  tree,
  h('main', { class: 'code' }, h('div', { class: 'code-head' }, fileTitle, problems), editorHost, help),
  previewEl));

open(sel);

// Installable + offline (needs https or localhost).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
