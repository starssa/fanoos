// Built-in extractors (src/core/extractors.ts) against page samples shaped like each host's.
// Run: node --experimental-strip-types tools/test-extractors.mjs
import assert from 'node:assert/strict';
import { builtinExtract, builtinHost, genericExtract, unpack } from '../src/core/extractors.ts';

// Packs a script the way the hosts' packer does (base 36), to test unpacking.
function pack(src) {
  const words = [];
  for (const w of src.match(/\b\w+\b/g)) if (!words.includes(w)) words.push(w);
  const p = src.replace(/\b\w+\b/g, (w) => words.indexOf(w).toString(36)).replace(/'/g, "\\'");
  return `eval(function(p,a,c,k,e,d){return p}('${p}',36,${words.length},'${words.join('|')}'.split('|'),0,{}))`;
}
const pages = (map) => async (url, referer) => {
  const hit = Object.keys(map).find((k) => url.startsWith(k));
  if (!hit) throw new Error('unmocked ' + url);
  const v = map[hit];
  return typeof v === 'string' ? { body: v, url } : { body: v.body, url: v.url, referer };
};

assert.equal(unpack(pack('var a="hello";')).trim(), 'var a="hello";');

// Mixdrop: packed MDCore.wurl, protocol-relative
let r = await builtinExtract('https://mixdrop.ps/f/abc', pages({
  'https://mixdrop.ps/e/abc': '<script>' + pack('MDCore.wurl="//a-delivery29.mxcontent.net/v2/abc.mp4?s=x&e=1";') + '</script>',
}));
assert.deepEqual([r[0].kind, r[0].url, r[0].headers.Referer], ['file', 'https://a-delivery29.mxcontent.net/v2/abc.mp4?s=x&e=1', 'https://mixdrop.ps/e/abc']);

// Uqload: sources: ["…mp4"]
r = await builtinExtract('https://uqload.io/embed-xyz.html', pages({ 'https://uqload.io/': 'var player = new Clappr.Player({ sources: ["https://m180.uqload.io/3rfk/v.mp4"], poster: "https://uqload.io/i.jpg" })' }));
assert.deepEqual([r[0].kind, r[0].url, r[0].headers.Referer], ['file', 'https://m180.uqload.io/3rfk/v.mp4', 'https://uqload.io/']);

// Vidmoly: sources: [{file:"…m3u8"}] (HLS preferred over an mp4 thumbnail preview)
r = await builtinExtract('https://vidmoly.to/embed-abc.html', pages({ 'https://vidmoly.to/': 'sources: [{file:"https://box.vmrange.lat/hls/xyz/master.m3u8"}], tracks: [{file:"https://vidmoly.to/prev.mp4"}]' }));
assert.deepEqual([r[0].kind, r[0].url], ['hls', 'https://box.vmrange.lat/hls/xyz/master.m3u8']);

// Vidoza: sourcesCode: [{ src: "…mp4" }]
r = await builtinExtract('https://vidoza.net/embed-k9.html', pages({ 'https://vidoza.net/': 'sourcesCode: [{ src: "https://str38.vidoza.net/x/v.mp4", type: "video/mp4", label:"SD"}]' }));
assert.equal(r[0].url, 'https://str38.vidoza.net/x/v.mp4');

// Streamtape: robotlink in two halves
r = await builtinExtract('https://streamtape.com/v/AbC/movie.mp4', pages({
  'https://streamtape.com/e/AbC': "<script>document.getElementById('robotlink').innerHTML = '//streamtape.com/get_video?id=AbC&expires=1&ip=X&token=' + ('xcdTOK123').substring(3);</script>",
}));
assert.equal(r[0].url, 'https://streamtape.com/get_video?id=AbC&expires=1&ip=X&token=TOK123&stream=1');

// Doodstream: redirect to a mirror, /pass_md5/, random + token + expiry
r = await builtinExtract('https://doodstream.com/d/abc123', pages({
  'https://doodstream.com/e/abc123': { body: "$.get('/pass_md5/123-45-6/tok987', function(d){})", url: 'https://dood.li/e/abc123' },
  'https://dood.li/pass_md5/123-45-6/tok987': 'https://xyz.cloudatacdn.com/u5kj/abc~',
}));
assert.match(r[0].url, /^https:\/\/xyz\.cloudatacdn\.com\/u5kj\/abc~[A-Za-z0-9]{10}\?token=tok987&expiry=\d{13}$/);
assert.equal(r[0].headers.Referer, 'https://dood.li/');

// Removed videos and unknown hosts
await assert.rejects(builtinExtract('https://dood.li/e/gone', pages({ 'https://dood.li/e/gone': '<h1>Video not found</h1>' })), /removed/);
assert.equal(builtinHost('https://player.example.org/e/1'), null);
for (const u of ['https://mixdrop.ag/e/1', 'https://uqload.to/embed-1.html', 'https://vidmoly.me/embed-1.html', 'https://streamtape.to/e/1',
  'https://ds2play.com/e/1', 'https://d0000d.com/e/1', 'https://videzz.net/embed-1.html'])
  assert.ok(builtinHost(u), u);
// Generic: any host that writes its address (plainly or packed); ad videos are skipped
r = await genericExtract('https://newhost.example/e/1', pages({ 'https://newhost.example/e/1': 'var ad = "https://cdn.x/ads/pre.mp4"; player.setup({ file: "https:\\/\\/cdn.newhost.example\\/v\\/a.mp4" })' }));
assert.deepEqual([r[0].name, r[0].url, r[0].headers.Referer], ['Video', 'https://cdn.newhost.example/v/a.mp4', 'https://newhost.example/']);
r = await genericExtract('https://other.example/e/2', pages({ 'https://other.example/e/2': '<script>' + pack('jwplayer().setup({file:"https://s1.other.example/hls/x/master.m3u8"})') + '</script>' }));
assert.equal(r[0].kind, 'hls');
await assert.rejects(genericExtract('https://js.example/e/3', pages({ 'https://js.example/e/3': '<script>fetch("/api/src").then(load)</script>' })), /No video/);
console.log('extractor tests passed');
