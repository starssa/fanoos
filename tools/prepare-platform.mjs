// Copies the built web app (dist/) into a platform wrapper.
import { cpSync, existsSync, rmSync } from 'node:fs';

const target = process.argv[2];
const OUT = { tizen: 'build/tizen', webos: 'build/webos', electron: 'platforms/electron/app', studio: 'platforms/studio/app' };
const NEXT = {
  tizen: 'tizen package -t wgt -s <certificate-profile> -- build/tizen   (Tizen Studio CLI)',
  webos: 'ares-package build/webos && ares-install --device <tv> *.ipk   (webOS CLI)',
  electron: 'cd platforms/electron && npm install && npm start   (or: npm run dist)',
  studio: 'cd platforms/studio && npm install && npm start   (or: npx electron-builder)',
};
if (!OUT[target]) { console.error('usage: node tools/prepare-platform.mjs <tizen|webos|electron|studio>'); process.exit(1); }
const SRC = target === 'studio' ? 'dist-editor' : 'dist';
if (!existsSync(SRC + '/index.html')) { console.error('Run `npm run ' + (target === 'studio' ? 'build:editor' : 'build') + '` first.'); process.exit(1); }

rmSync(OUT[target], { recursive: true, force: true });
cpSync(SRC, OUT[target], { recursive: true });
if (target !== 'electron' && target !== 'studio') {
  cpSync(`platforms/${target}`, OUT[target], { recursive: true });
}
console.log(`Prepared ${OUT[target]}\nNext: ${NEXT[target]}`);
