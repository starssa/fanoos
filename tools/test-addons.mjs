// Runs the sample addons against a mocked `fanoos` API (no network). `npm test`
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const calls = []; // every URL an addon requested, for assertions
function load(id, routes, settings = {}, store = {}) {
  let impl;
  const fanoos = {
    register: (o) => { impl = o; },
    http: {
      get: async (url) => {
        calls.push(url);
        const hit = Object.keys(routes).find((k) => url.includes(k));
        if (!hit) throw new Error('unmocked url ' + url);
        const body = typeof routes[hit] === 'string' ? routes[hit] : JSON.stringify(routes[hit]);
        return { status: 200, ok: true, text: body, json: () => JSON.parse(body) };
      },
    },
    settings: { get: async (k) => settings[k] },
    storage: { get: async (k) => store[k], set: async (k, v) => { store[k] = v; } },
    util: { qs: (o) => Object.keys(o).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(String(o[k]))).join('&') },
  };
  new Function('fanoos', 'manifest', readFileSync(`addons/${id}/main.js`, 'utf8'))(fanoos, {});
  return impl;
}

// --- archive.org ---
const ia = load('provider.archive-org', {
  'advancedsearch.php': { response: { docs: [{ identifier: 'night_of_the_living_dead', title: 'Night of the Living Dead', year: '1968' }] } },
  '/metadata/night_of_the_living_dead': {
    metadata: { title: 'Night of the Living Dead', year: '1968', description: 'Zombies <b>attack</b>.', subject: 'horror; zombies' },
    // Shape of a real item: a huge original + streaming derivatives.
    files: [
      { name: 'notld_orig.mp4', format: 'MPEG4', size: '4000000000', source: 'original' },
      { name: 'notld.ogv', format: 'Ogg Video', size: '100', source: 'derivative' },
      { name: 'notld_512kb.mp4', format: '512Kb MPEG4', size: '300', source: 'derivative' },
      { name: 'notld.mp4', format: 'h.264', size: '200', height: '480', source: 'derivative' },
      { name: 'notld.srt', format: 'SubRip' },
      { name: 'notld.avi', format: 'AVI', source: 'original' },
    ],
  },
});
const home = await ia.getHome();
assert.equal(home.length, 6);
assert.equal(home[0].more, undefined, 'numFound unknown -> no more');
assert.equal(home[0].items[0].year, 1968);
assert.equal((await ia.search('night: of "the"')).items.length, 1);
const iaPaged = load('provider.archive-org', { 'advancedsearch.php': { response: { numFound: 100, docs: [{ identifier: 'a', title: 'A' }] } } });
const firstRow = (await iaPaged.getHome())[0];
assert.ok(firstRow.more, 'more token when numFound > rows');
calls.length = 0;
const p2 = await iaPaged.getMore(firstRow.more);
assert.ok(calls[0].includes('page=2'), 'getMore asks for page 2');
assert.equal(p2.items.length, 1);
const d = await ia.load('night_of_the_living_dead');
assert.equal(d.plot, 'Zombies attack.');
assert.deepEqual(d.tags, ['horror', 'zombies']);
const links = await ia.loadLinks('night_of_the_living_dead');
assert.deepEqual(links.links.map((l) => l.url.split('/').pop()), ['notld.mp4', 'notld_512kb.mp4', 'notld.ogv', 'notld_orig.mp4'],
  'web-ready H.264 derivatives first (smaller first), huge original last, avi excluded');
assert.equal(links.links[0].quality, '480p');
assert.equal(links.links[0].mime, 'video/mp4');
assert.equal(links.links[2].mime, 'video/ogg');
assert.equal(links.subtitles.length, 1);

// --- m3u ---
const playlist = '#EXTM3U\n#EXTINF:-1 tvg-logo="http://x/l.png" group-title="News",Channel One\nhttp://x/one.m3u8\n#EXTINF:-1,Two\nhttp://x/two.mp4\n';
const m3u = load('provider.m3u', { 'list.m3u': playlist }, { playlist: 'http://x/list.m3u' });
const groups = await m3u.getHome();
assert.deepEqual(groups.map((g) => g.title), ['News', 'Channels']);
assert.equal((await m3u.loadLinks('ch:0')).links[0].kind, 'hls');
assert.equal((await m3u.loadLinks('ch:1')).links[0].kind, 'file');
assert.equal((await m3u.search('two')).length, 1);
assert.deepEqual(await load('provider.m3u', {}, {}).getHome(), [], 'no playlist configured → empty');

// --- youtube ---
const feed = '<feed><title>NASA</title><entry><yt:videoId>abcdefghijk</yt:videoId><title>Moon &amp; Mars</title><published>2026-01-02T00:00:00Z</published></entry></feed>';
const CH = 'UCLA_DiR1FfKNvjuUpBHmylQ';
const ytNoKey = load('provider.youtube', {
  'feeds/videos.xml': feed,
  'oembed': { title: 'Moon & Mars', author_name: 'NASA' },
}, { channels: CH + ', not-a-channel', apiKey: '' });
const yh = await ytNoKey.getHome();
assert.equal(yh.length, 1);
assert.equal(yh[0].title, 'NASA');
assert.deepEqual(yh[0].items[0], { id: 'abcdefghijk', title: 'Moon & Mars', poster: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg', type: 'other', year: 2026 });
assert.equal((await ytNoKey.load('abcdefghijk')).tags[0], 'NASA');
await assert.rejects(ytNoKey.search('moon'), /API key/);
assert.deepEqual(ytNoKey.loadLinks('abcdefghijk').links[0], { name: 'YouTube', url: 'abcdefghijk', kind: 'youtube' });
const ytKey = load('provider.youtube', {
  'feeds/videos.xml': feed,
  'youtube/v3/videos': { items: [{ id: 'zzzzzzzzzzz', snippet: { title: 'Hot', publishedAt: '2026-10-01', description: 'd', channelTitle: 'C' } }] },
  'youtube/v3/search': { items: [{ id: { videoId: 'yyyyyyyyyyy' }, snippet: { title: 'Q &amp; A', publishedAt: '2025-05-05' } }] },
}, { channels: CH, apiKey: 'KEY', region: 'MA' });
assert.deepEqual((await ytKey.getHome()).map((r) => r.title), ['Trending', 'NASA']);
assert.equal((await ytKey.search('q')).items[0].title, 'Q & A');
const ytPaged = load('provider.youtube', {
  'youtube/v3/search': { nextPageToken: 'NEXT', items: [{ id: { videoId: 'yyyyyyyyyyy' }, snippet: { title: 'p1' } }] },
}, { channels: '', apiKey: 'KEY' });
const ys = await ytPaged.search('cats');
assert.ok(ys.more);
calls.length = 0;
await ytPaged.getMore(ys.more);
assert.ok(calls[0].includes('pageToken=NEXT') && calls[0].includes('q=cats') && calls[0].includes('key=KEY'), 'next page keeps query and key');
assert.equal((await ytKey.load('zzzzzzzzzzz')).plot, 'd');

// --- dailymotion ---
const dmList = { list: [{ id: 'x8abc12', title: 'Goal!', thumbnail_480_url: 'https://s1.dmcdn.net/t.jpg', created_time: 1767225600 }] };
const dmRoutes = (embed) => ({
  'fields=allow_embed': { allow_embed: embed },
  'video/x8abc12': { id: 'x8abc12', title: 'Goal!', description: 'd', thumbnail_720_url: 'https://s1.dmcdn.net/b.jpg', created_time: 1767225600, 'owner.screenname': 'Club', channel: 'sport' },
  'channel=bogus': { error: { code: 400, message: 'bad channel' } },
  'api.dailymotion.com/videos': dmList,
});
const dm = load('provider.dailymotion', dmRoutes(true), { channels: 'sport, bogus, BAD!', country: 'MA', family: true });
const dh = await dm.getHome();
assert.deepEqual(dh.map((r) => r.title), ['Trending', 'Sport'], 'bad/invalid channels dropped');
assert.deepEqual(dh[0].items[0], { id: 'x8abc12', title: 'Goal!', poster: 'https://s1.dmcdn.net/t.jpg', type: 'other', year: 2026 });
assert.equal((await dm.search('goal')).items.length, 1);
const dmPaged = load('provider.dailymotion', { 'api.dailymotion.com/videos': { has_more: true, list: dmList.list } }, { channels: '', family: true });
const dmRow = (await dmPaged.getHome())[0];
assert.ok(dmRow.more);
calls.length = 0;
await dmPaged.getMore(dmRow.more);
assert.ok(calls[0].includes('page=2') && calls[0].includes('sort=trending'), 'same query, next page');
const dd = await dm.load('x8abc12');
assert.deepEqual(dd.tags, ['Club', 'sport']);
assert.deepEqual((await dm.loadLinks('x8abc12')).links[0], { name: 'Dailymotion', url: 'x8abc12', kind: 'dailymotion', player: undefined });
assert.equal((await load('provider.dailymotion', dmRoutes(true), { playerId: ' x1ab2 ' }).loadLinks('x8abc12')).links[0].player, 'x1ab2', 'player ID passed to Fanoos');
await assert.rejects(load('provider.dailymotion', dmRoutes(false), {}).loadLinks('x8abc12'), /does not allow/);

// --- youtube channels: links, ids, @handles (resolved once with a key, then cached) ---
const yt = load('provider.youtube', {}, {})._parseChannels;
assert.deepEqual(yt('https://www.youtube.com/channel/UCLA_DiR1FfKNvjuUpBHmylQ, @TED https://youtube.com/@veritasium/videos junk'),
  [{ id: 'UCLA_DiR1FfKNvjuUpBHmylQ' }, { handle: '@TED' }, { handle: '@veritasium' }]);
const ytStore = {};
const ytH = load('provider.youtube', {
  'forHandle=%40TED': { items: [{ id: 'UCAuUUnT6oDeKwE6v1NGQxug' }] },
  'youtube/v3/videos': { items: [] },
  'feeds/videos.xml': feed,
}, { channels: '@TED', apiKey: 'KEY' }, ytStore);
assert.equal((await ytH.getHome()).length, 1, 'handle resolved to a channel row');
assert.equal(ytStore['handle:@TED'], 'UCAuUUnT6oDeKwE6v1NGQxug', 'handle cached');
calls.length = 0;
await ytH.getHome();
assert.ok(!calls.some((u) => u.includes('forHandle')), 'cached handle is not looked up again');
assert.deepEqual(await load('provider.youtube', { 'feeds/videos.xml': feed }, { channels: '@TED', apiKey: '' }).getHome(), [], 'handles skipped without a key');

// --- dailymotion creators ---
const dmc = load('provider.dailymotion', {}, {})._parseCreators;
assert.deepEqual(dmc('https://www.dailymotion.com/france24, euronews https://www.dailymotion.com/video/x8abc12 euronews'), ['france24', 'euronews']);
const dmC = load('provider.dailymotion', {
  'user/france24/videos': dmList,
  'user/france24?': { screenname: 'FRANCE 24' },
  'api.dailymotion.com/videos': dmList,
}, { creators: 'https://www.dailymotion.com/france24', channels: '', family: true });
assert.deepEqual((await dmC.getHome()).map((r) => r.title), ['Trending', 'FRANCE 24']);

// --- example (developer guide) ---
const ex = load('provider.example', {}, { showHls: true, greeting: '' }, {});
const eh = await ex.getHome();
assert.deepEqual(eh.map((r) => r.title), ['Blender open movies', 'Series']);
assert.equal(eh[0].items.length, 4);
const exMore = await ex.getMore(eh[0].more);
assert.equal(exMore.items.length, 4);
assert.equal(exMore.more, undefined, 'last page');
assert.equal((await ex.load('fun')).title, 'For Bigger Fun', 'page-2 titles open');
assert.equal((await ex.search('sintel'))[0].id, 'sintel');
const series = await ex.load('shorts');
assert.equal(series.episodes.length, 4);
assert.equal((await ex.loadLinks(series.episodes[2].id)).links[0].kind, 'file');
assert.deepEqual((await ex.loadLinks('bbb')).links.map((l) => l.kind), ['file', 'hls']);
assert.deepEqual((await load('provider.example', {}, { showHls: false }).loadLinks('bbb')).links.map((l) => l.kind), ['file']);
assert.throws(() => ex.load('nope'), /Not found/);

console.log('addon tests passed');

