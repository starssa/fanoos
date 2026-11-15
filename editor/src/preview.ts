// Live preview: runs the addon in the same sandbox Fanoos uses (AddonHost + Web Worker)
// and draws what Fanoos would show. Every call and log line goes to the console tab.
import { h, clear } from '../../src/ui/dom';
import { AddonHost } from '../../src/core/addon-host';
import { validateManifest } from '../../src/core/addon-manager';
import { Player } from '../../src/core/player';
import { knownEmbed, webPlayer } from '../../src/core/embeds';
import { getAddonSettings, saveAddonSettings } from '../../src/core/settings';
import { errMsg } from '../../src/core/util';
import type { AddonManifest, Episode, HomeSection, LinksResult, MediaDetails, MediaItem, MorePage, StreamLink } from '../../src/core/types';
import type { AddonFiles } from './project';

type Tab = 'home' | 'search' | 'settings' | 'console';

export class Preview {
  private host: AddonHost | null = null;
  private manifest: AddonManifest | null = null;
  private tab: Tab = 'home';
  private player: Player | null = null;
  private runId = 0;
  private logs: HTMLElement;
  private body: HTMLElement;
  private tabs: Record<Tab, HTMLButtonElement>;
  private lastQuery = '';

  constructor(readonly el: HTMLElement) {
    this.logs = h('div', { class: 'console-lines' });
    this.body = h('div', { class: 'pv-body' });
    const tab = (t: Tab, label: string) => h('button', { class: 'pv-tab', onclick: () => this.show(t) }, label);
    this.tabs = { home: tab('home', 'Home'), search: tab('search', 'Search'), settings: tab('settings', 'Settings'), console: tab('console', 'Console') };
    el.appendChild(h('div', { class: 'pv-tabs' }, this.tabs.home, this.tabs.search, this.tabs.settings, this.tabs.console));
    el.appendChild(this.body);
    // The sandbox reports fanoos.log() lines as console.log('[addon.id]', text).
    const orig = console.log.bind(console);
    console.log = (...a: unknown[]) => {
      if (typeof a[0] === 'string' && /^\[[\w.-]+\]$/.test(a[0])) this.log('log', String(a[1]));
      orig(...a);
    };
  }

  log(kind: 'log' | 'call' | 'error' | 'info', text: string) {
    const t = new Date().toTimeString().slice(0, 8);
    this.logs.appendChild(h('div', { class: 'line ' + kind }, h('span', { class: 't' }, t), text));
    while (this.logs.childNodes.length > 300) this.logs.removeChild(this.logs.firstChild!);
    this.logs.scrollTop = this.logs.scrollHeight;
    if (kind === 'error') this.tabs.console.classList.add('alert');
  }

  /** Restart the sandbox with the current files (called on every edit, debounced). */
  async run(a: AddonFiles) {
    const my = ++this.runId;
    if (this.host) this.host.dispose();
    this.host = null;
    this.stopPlayer();
    let manifest: AddonManifest;
    try { manifest = validateManifest(JSON.parse(a.files['manifest.json'])); } catch (e) {
      this.log('error', 'manifest.json: ' + errMsg(e));
      return this.message('Fix manifest.json to run the preview.', errMsg(e));
    }
    this.manifest = manifest;
    const host = new AddonHost({ manifest, code: a.files[manifest.main] || '', enabled: true, installedAt: Date.now() });
    try { await host.ready; } catch (e) {
      host.dispose();
      if (my !== this.runId) return;
      this.log('error', errMsg(e));
      return this.message('The addon did not start.', errMsg(e));
    }
    if (my !== this.runId) { host.dispose(); return; }
    this.host = host;
    this.log('info', `${manifest.name} ${manifest.version} started — functions: ${(await host.ready).join(', ')}`);
    this.show(this.tab);
  }

  private async call<T>(method: string, ...args: unknown[]): Promise<T> {
    if (!this.host) throw new Error('Addon not running');
    const t0 = Date.now();
    const label = method + '(' + args.map((x) => JSON.stringify(x)).join(', ') + ')';
    try {
      const r = await this.host.call<T>(method, ...args);
      this.log('call', `${label} → ${summary(r)} in ${Date.now() - t0} ms`);
      return r;
    } catch (e) {
      const m = errMsg(e);
      this.log('error', `${label} failed: ${m}`);
      throw e;
    }
  }

  private message(title: string, detail?: string) {
    if (this.tab === 'console') return; // never wipe the console the user is reading; the error is logged there
    clear(this.body);
    this.body.appendChild(h('div', { class: 'pv-msg' }, h('strong', {}, title), detail ? h('p', {}, detail) : null));
  }

  show(t: Tab) {
    this.tab = t;
    (Object.keys(this.tabs) as Tab[]).forEach((k) => this.tabs[k].classList.toggle('active', k === t));
    if (t === 'console') { this.tabs.console.classList.remove('alert'); clear(this.body); this.body.appendChild(this.consolePane()); return; }
    if (!this.host) return;
    if (t === 'home') this.home();
    else if (t === 'search') this.searchPane();
    else this.settingsPane();
  }

  private consolePane() {
    return h('div', { class: 'console' },
      h('div', { class: 'console-head' }, h('span', {}, 'Calls, fanoos.log() output and errors'),
        h('button', { class: 'mini', onclick: () => clear(this.logs) }, 'Clear')), this.logs);
  }

  // ---------- Home ----------
  private async home() {
    this.message('Loading Home…');
    let rows: HomeSection[];
    try { rows = (await this.call<HomeSection[]>('getHome', 1)) || []; } catch (e) { return this.message('getHome() failed', errMsg(e)); }
    if (this.tab !== 'home') return;
    clear(this.body);
    if (!rows.length) return this.message('getHome() returned no rows.', 'Check the Console tab. Addons made with Fanoos Scraper 1.0 hide the reason: open the scraper again and export the addon again.');
    rows.forEach((r) => this.body.appendChild((r.tabs && r.tabs.length) || r.first ? this.tabbedRow(r) : this.row(r.title, r.items, r.more)));
  }

  // A row with sub-menu tabs, as Fanoos shows it: "All" is the row itself, a tab is loaded with getMore(tab.more).
  private tabbedRow(r: HomeSection): HTMLElement {
    const all = [{ title: r.first || 'All', more: '' }].concat(r.tabs || []);
    const tabs = h('div', { class: 'chips row-tabs' }), body = h('div', {});
    const put = (n: Node) => { clear(body); body.appendChild(n); };
    const select = async (i: number) => {
      all.forEach((_, j) => tabs.children[j].classList.toggle('active', j === i));
      if (!i) return put(this.row('', r.items, r.more));
      put(h('div', { class: 'pv-msg' }, 'Calling getMore() for ' + all[i].title + '…'));
      try {
        const p = toPage(await this.call<MorePage>('getMore', all[i].more));
        put(p.items.length ? this.row('', p.items, p.more) : h('div', { class: 'pv-msg' }, 'No items'));
      } catch (e) { put(h('div', { class: 'pv-msg error' }, errMsg(e))); }
    };
    all.forEach((t, i) => tabs.appendChild(h('button', { class: 'chip', onclick: () => select(i) }, t.title)));
    select(0);
    return h('section', { class: 'row row-tabbed' }, h('h2', {}, r.title), tabs, body);
  }

  private row(title: string, items: MediaItem[], more?: string): HTMLElement {
    const scroller = h('div', { class: 'row-scroll' }, ...items.map((i) => this.card(i)));
    if (more) {
      let token: string | undefined = more;
      const btn = h('button', { class: 'card more-card' }, h('div', { class: 'poster' }, h('div', { class: 'poster-fallback more-inner' }, '›')));
      btn.onclick = async () => {
        if (!token) return;
        try {
          const p = toPage(await this.call<MorePage>('getMore', token));
          p.items.forEach((i) => scroller.insertBefore(this.card(i), btn));
          token = p.items.length ? p.more : undefined;
          if (!token) btn.parentNode!.removeChild(btn);
        } catch { /* logged */ }
      };
      scroller.appendChild(btn);
    }
    return h('section', { class: 'row' }, h('h2', {}, title + (more ? '  · more available' : '')), scroller);
  }

  private card(i: MediaItem): HTMLElement {
    const img = h('img', { alt: '', loading: 'lazy' });
    img.onerror = () => { img.style.visibility = 'hidden'; };
    if (i.poster) img.src = i.poster;
    return h('button', { class: 'card', title: i.title + ' (id: ' + i.id + ')', onclick: () => this.details(i.id) },
      h('div', { class: 'poster' }, h('div', { class: 'poster-fallback' }, (i.title || '?').charAt(0).toUpperCase()), img),
      h('div', { class: 'card-title' }, i.title || '(no title)'),
      h('div', { class: 'card-sub' }, [i.year, i.type].filter(Boolean).join(' · ')));
  }

  // ---------- Search ----------
  private searchPane() {
    clear(this.body);
    const input = h('input', { class: 'pv-input', type: 'search', placeholder: 'Test a search…', value: this.lastQuery });
    const results = h('div', {});
    const go = async () => {
      this.lastQuery = input.value.trim();
      if (!this.lastQuery) return;
      clear(results);
      try {
        const p = toPage(await this.call<MediaItem[] | MorePage>('search', this.lastQuery));
        clear(results);
        results.appendChild(p.items.length ? this.row('Results', p.items, p.more) : h('div', { class: 'pv-msg' }, 'No results'));
      } catch (e) { results.appendChild(h('div', { class: 'pv-msg error' }, errMsg(e))); }
    };
    this.body.appendChild(h('form', { class: 'pv-search', onsubmit: (e: Event) => { e.preventDefault(); go(); } },
      input, h('button', { class: 'mini primary', type: 'submit' }, 'Search')));
    this.body.appendChild(results);
    if (this.lastQuery) go();
  }

  // ---------- Details, sources, player ----------
  private async details(id: string) {
    this.message('Loading ' + id + '…');
    let d: MediaDetails;
    try { d = await this.call<MediaDetails>('load', id); } catch (e) { return this.message('load() failed', errMsg(e)); }
    clear(this.body);
    const links = h('div', {});
    const back = h('button', { class: 'mini', onclick: () => { this.stopPlayer(); this.show(this.tab); } }, '← Back');
    const sources = (eid: string) => async () => {
      clear(links);
      links.appendChild(h('div', { class: 'pv-msg' }, 'Calling loadLinks(' + JSON.stringify(eid) + ')…'));
      try {
        const r = (await this.call<LinksResult>('loadLinks', eid)) || { links: [] };
        clear(links);
        if (!r.links || !r.links.length) links.appendChild(h('div', { class: 'pv-msg' }, 'No video sources found on this page.', h('br'), h('small', {}, 'The Console tab shows what the addon downloaded and why.')));
        else links.appendChild(h('div', { class: 'pv-msg' }, r.links.length + ' source' + (r.links.length > 1 ? 's' : '') + ':'));
        (r.links || []).forEach((l) => links.appendChild(this.linkRow(l, r)));
      } catch (e) { clear(links); links.appendChild(h('div', { class: 'pv-msg error' }, errMsg(e))); }
    };
    const eps: Episode[] = (d.episodes || []).map((e, i) => ({ e, i })).sort((a, b) =>
      ((a.e.season == null ? 1 : a.e.season) - (b.e.season == null ? 1 : b.e.season)) ||
      ((a.e.episode == null ? a.i : a.e.episode) - (b.e.episode == null ? b.i : b.e.episode)) || a.i - b.i).map((x) => x.e);
    // One row per season, episodes with the show's poster — as Fanoos shows them.
    const seasonOf = (e: Episode) => (e.season == null ? 1 : e.season);
    const seasons = eps.map(seasonOf).filter((s, i, all) => all.indexOf(s) === i).sort((a, b) => a - b);
    const epCard = (e: Episode) => {
      const img = h('img', { alt: '', loading: 'lazy' });
      img.onerror = () => { img.style.visibility = 'hidden'; };
      if (e.poster || d.poster) img.src = (e.poster || d.poster)!;
      const label = (e.episode != null ? 'E' + e.episode + ' · ' : '') + e.title;
      return h('button', { class: 'card', title: label + ' (id: ' + e.id + ')', onclick: sources(e.id) },
        h('div', { class: 'poster' }, h('div', { class: 'poster-fallback' }, e.episode != null ? 'E' + e.episode : '•'), img),
        h('div', { class: 'card-title' }, label));
    };
    const seasonTitle = (s: number) => { const n = eps.filter((e) => seasonOf(e) === s && e.seasonName)[0]; return n ? n.seasonName! : s ? 'Season ' + s : 'Specials'; };
    const seasonRows = seasons.map((s) => h('section', { class: 'row' }, h('h2', {}, seasonTitle(s)),
      h('div', { class: 'row-scroll' }, ...eps.filter((e) => seasonOf(e) === s).map(epCard))));
    this.body.appendChild(h('div', { class: 'pv-details' },
      back,
      h('div', { class: 'pv-hero' },
        d.poster ? h('img', { class: 'pv-poster', src: d.poster, alt: '' }) : h('div', { class: 'pv-poster' }),
        h('div', {}, h('h2', {}, d.title || '(no title)'),
          h('div', { class: 'card-sub' }, [d.year, d.type, eps.length ? eps.length + ' episodes' : ''].filter(Boolean).join(' · ')),
          h('div', {}, ...(d.tags || []).map((t) => h('span', { class: 'tag' }, t))),
          eps.length ? null : h('button', { class: 'mini primary', onclick: sources(d.id) }, '▶ Sources'))),
      d.plot ? h('p', { class: 'plot' }, d.plot) : null,
      eps.length ? h('div', { class: 'pv-seasons' }, ...seasonRows) : null,
      links));
  }

  private linkRow(original: StreamLink, r: LinksResult): HTMLElement {
    // Embeds play as Fanoos plays them: YouTube/Dailymotion players, else the site's own player page.
    const l = original.kind === 'embed' ? knownEmbed(original) || webPlayer(original) || original : original;
    const where = h('div', {});
    const play = h('button', { class: 'mini primary' }, 'Play');
    play.onclick = async () => {
      this.stopPlayer();
      const video = h('video', { class: 'pv-video', controls: true, autoplay: true });
      video.setAttribute('playsinline', '');
      const frame = h('div', { class: 'pv-frame' }, video);
      clear(where);
      where.appendChild(frame);
      this.player = new Player(video);
      this.player.onError = (m) => this.log('error', l.name + ': ' + m);
      try { await this.player.play(l, r.subtitles || []); this.log('info', 'Playing ' + l.name); }
      catch (e) { this.log('error', 'Cannot play ' + l.name + ': ' + errMsg(e)); where.appendChild(h('div', { class: 'pv-msg error' }, errMsg(e))); }
    };
    return h('div', { class: 'pv-link' },
      h('div', { class: 'pv-link-head' }, h('strong', {}, l.name), h('span', { class: 'badge' }, l.kind), l.quality ? h('span', { class: 'badge' }, l.quality) : null, play),
      h('code', {}, l.url), where);
  }

  private stopPlayer() {
    if (this.player) { this.player.destroy(); this.player = null; }
  }

  // ---------- Settings ----------
  private async settingsPane() {
    clear(this.body);
    const m = this.manifest!;
    if (!m.settings || !m.settings.length) return this.message('This addon declares no settings.', 'Add a "settings" array to manifest.json — Fanoos draws the form for you.');
    const vals = await getAddonSettings(m);
    const inputs: (HTMLInputElement | HTMLSelectElement)[] = [];
    const form = h('div', { class: 'pv-settings' }, ...m.settings.map((s) => {
      const input: HTMLInputElement | HTMLSelectElement = s.type === 'bool' ? h('input', { type: 'checkbox', checked: !!vals[s.id] })
        : s.type === 'select' ? h('select', {}, ...(s.options || []).map((o) => h('option', { value: o, selected: vals[s.id] === o }, o)))
          : h('input', { class: 'pv-input', type: 'text', value: String(vals[s.id] == null ? '' : vals[s.id]) });
      input.setAttribute('data-id', s.id);
      inputs.push(input);
      return h('label', { class: 'field' }, h('span', {}, s.label), input, s.help ? h('small', {}, s.help) : null);
    }), h('button', { class: 'mini primary', onclick: async () => {
      const out: Record<string, string | boolean> = {};
      inputs.forEach((i) => { out[i.getAttribute('data-id')!] = i instanceof HTMLInputElement && i.type === 'checkbox' ? i.checked : i.value; });
      await saveAddonSettings(m.id, out);
      this.log('info', 'Settings saved: ' + JSON.stringify(out));
      this.show('home');
    } }, 'Save and reload Home'));
    this.body.appendChild(form);
  }
}

function toPage(r: MediaItem[] | MorePage | null | undefined): MorePage {
  if (!r) return { items: [] };
  return Array.isArray(r) ? { items: r } : { items: r.items || [], more: r.more };
}

function summary(r: unknown): string {
  if (Array.isArray(r)) return r.length + ' item' + (r.length === 1 ? '' : 's');
  if (r && typeof r === 'object') {
    const o = r as Record<string, unknown>;
    if (Array.isArray(o.links)) return o.links.length + ' link(s)';
    if (Array.isArray(o.items)) return o.items.length + ' item(s)' + (o.more ? ', more' : '');
    if (o.title) return '"' + o.title + '"';
  }
  return JSON.stringify(r) === undefined ? 'nothing' : String(JSON.stringify(r)).slice(0, 60);
}
