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
