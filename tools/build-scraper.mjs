// Packs scraper-extension/ (+ JSZip) into a Firefox/Chrome extension and copies it into the Studio.
import JSZip from 'jszip';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';

const zip = new JSZip();
for (const f of readdirSync('scraper-extension')) zip.file(f, readFileSync('scraper-extension/' + f));
zip.file('jszip.min.js', readFileSync('node_modules/jszip/dist/jszip.min.js'));
const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
mkdirSync('dist-packages', { recursive: true });
writeFileSync('dist-packages/fanoos-scraper.xpi', buf);
writeFileSync('editor/public/fanoos-scraper.xpi', buf);
console.log('built fanoos-scraper.xpi (' + buf.length + ' bytes)');

// Chrome / Edge / Brave: same files, manifest without the Firefox-only keys (Chrome warns on them).
// Not from the Chrome Web Store, so it is unzipped and added with "Load unpacked" (Developer mode).
const chrome = new JSZip();
for (const f of readdirSync('scraper-extension')) {
  if (f !== 'manifest.json') chrome.file(f, readFileSync('scraper-extension/' + f));
}
const m = JSON.parse(readFileSync('scraper-extension/manifest.json', 'utf8'));
delete m.browser_specific_settings;
delete m.background.scripts;
chrome.file('manifest.json', JSON.stringify(m, null, 2));
chrome.file('jszip.min.js', readFileSync('node_modules/jszip/dist/jszip.min.js'));
const cbuf = await chrome.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
writeFileSync('dist-packages/fanoos-scraper-chrome.zip', cbuf);
console.log('built fanoos-scraper-chrome.zip (' + cbuf.length + ' bytes)');
