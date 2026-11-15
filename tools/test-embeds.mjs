// Embed recognition (src/core/embeds.ts). Run: node --experimental-strip-types tools/test-embeds.mjs
import assert from 'node:assert/strict';
import { knownEmbed, webPlayer } from '../src/core/embeds.ts';

const e = (url) => ({ name: 'Embed', url, kind: 'embed' });
const pick = (l) => l && { kind: l.kind, url: l.url, player: l.player };
for (const u of ['https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  'https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?feature=x&v=dQw4w9WgXcQ', 'https://youtube.com/shorts/dQw4w9WgXcQ'])
  assert.deepEqual(pick(knownEmbed(e(u))), { kind: 'youtube', url: 'dQw4w9WgXcQ', player: undefined }, u);
assert.deepEqual(pick(knownEmbed(e('https://www.dailymotion.com/embed/video/x8abc12'))), { kind: 'dailymotion', url: 'x8abc12', player: undefined });
assert.deepEqual(pick(knownEmbed(e('https://geo.dailymotion.com/player/x1ab2.html?video=x8abc12'))), { kind: 'dailymotion', url: 'x8abc12', player: 'x1ab2' });
assert.deepEqual(pick(knownEmbed(e('https://geo.dailymotion.com/player.html?video=x8abc12'))), { kind: 'dailymotion', url: 'x8abc12', player: undefined });
assert.equal(knownEmbed(e('https://player.example.org/e/abc')), null);
assert.equal(knownEmbed(e('https://evil.example/?u=youtube.com/embed/short')), null, 'not 11 chars');
assert.equal(webPlayer(e('https://player.example.org/e/abc')).kind, 'web');
assert.equal(webPlayer(e('javascript:alert(1)')), null, 'only http(s) pages');
console.log('embed tests passed');
