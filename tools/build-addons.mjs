// Packs every folder in /addons into a zip and writes public/repo/repo.json (the repository index).
// Host public/repo anywhere static (GitHub Pages, any web server) and it's a repository.
import JSZip from 'jszip';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const SRC = 'addons';
const OUT = 'public/repo';
mkdirSync(OUT, { recursive: true });

function addDir(zip, dir, root) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) addDir(zip, p, root);
    else zip.file(relative(root, p).split('\\').join('/'), readFileSync(p));
  }
}

const entries = [];
for (const dir of readdirSync(SRC).sort()) {
  const p = join(SRC, dir);
  if (!statSync(p).isDirectory()) continue;
  const m = JSON.parse(readFileSync(join(p, 'manifest.json'), 'utf8'));
  if (m.id !== dir) throw new Error(`Folder "${dir}" must be named after its id "${m.id}"`);
  const zip = new JSZip();
  addDir(zip.folder(m.id), p, p); // Kodi-style: files live under <id>/ inside the zip
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const file = `${m.id}-${m.version}.zip`;
  writeFileSync(join(OUT, file), buf);
  let icon;
  if (m.icon) {
    icon = `${m.id}.${m.icon.split('.').pop()}`;
    writeFileSync(join(OUT, icon), readFileSync(join(p, m.icon)));
  }
  entries.push({
    id: m.id, name: m.name, version: m.version, type: m.type, description: m.description,
    icon, url: file, sha256: createHash('sha256').update(buf).digest('hex'),
  });
  console.log(`packed ${file}`);
}

writeFileSync(join(OUT, 'repo.json'), JSON.stringify({
  name: 'Fanoos Official',
  description: 'Extensions bundled with Fanoos',
  apiVersion: 1,
  addons: entries,
}, null, 2));
console.log(`wrote ${OUT}/repo.json (${entries.length} extensions)`);
