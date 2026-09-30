// Costruisce egidi/js/metodo3d.js (esm minificato, three incluso e potato) + manifest + licenza.
// Uso: node build.mjs   (da design/egidi-3d, dopo npm ci)
// Il nome del file e' FISSO: la pagina lo importa come /js/metodo3d.js?v=<sha8>.
import * as esbuild from 'esbuild';
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(QUI, '../..');
const USCITA = path.join(REPO, 'egidi/js');
const THREE = path.join(QUI, 'node_modules/three');
const SORGENTI = ['plan.js', 'textures.js', 'scena.js'];
const VERSIONE_THREE = JSON.parse(fs.readFileSync(path.join(THREE, 'package.json'), 'utf8')).version;
if (VERSIONE_THREE !== '0.186.1') throw new Error('three deve essere 0.186.1, trovato ' + VERSIONE_THREE);

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sourceHash = sha256(Buffer.concat(SORGENTI.map((f) => fs.readFileSync(path.join(QUI, f)))));

// three dai sorgenti (src/), cosi' le stringhe GLSL arrivano come file .glsl.js e si possono
// asciugare: via commenti e indentazione, righe conservate (le direttive # vogliono la loro riga).
const asciuga = (body) => body.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\s*\/\/.*$/, '').replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n') + '\n';
const plugin = {
  name: 'three-src-glsl',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(THREE, 'src/Three.js') }));
    b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: path.join(THREE, 'examples/jsm', a.path.slice('three/addons/'.length)) }));
    // niente realta' virtuale nel sito: il gestore WebXR (13 KB) diventa un guscio vuoto con la stessa
    // interfaccia che il renderer interroga (enabled/isPresenting falsi, nessuna sessione).
    b.onLoad({ filter: /[\\/]renderers[\\/]webxr[\\/]WebXRManager\.js$/ }, () => ({ loader: 'js', resolveDir: path.join(THREE, 'src/renderers/webxr'), contents: `
      import { EventDispatcher } from '../../core/EventDispatcher.js';
      class WebXRManager extends EventDispatcher {
        constructor() { super(); this.enabled = false; this.isPresenting = false; this.cameraAutoUpdate = true; }
        getEnvironmentBlendMode() {} setAnimationLoop() {} dispose() {} updateCamera() {} getCamera() {}
        hasDepthSensing() { return false; } getDepthSensingMesh() { return null; }
      }
      export { WebXRManager };` }));
    b.onLoad({ filter: /\.glsl\.js$/ }, async (a) => {
      const t = await fs.promises.readFile(a.path, 'utf8');
      return { contents: t.replace(/`([\s\S]*?)`/g, (m, body) => '`' + asciuga(body) + '`'), loader: 'js' };
    });
  },
};

fs.mkdirSync(USCITA, { recursive: true });
const banner = `// metodo3d ${'4.0.0'} · three ${VERSIONE_THREE} (MIT, vedi LICENSE-three.txt) · sourceHash ${sourceHash}`;
const r = await esbuild.build({
  entryPoints: [path.join(QUI, 'scena.js')], bundle: true, format: 'esm', minify: true, treeShaking: true,
  target: ['es2020'], outfile: path.join(USCITA, 'metodo3d.js'), legalComments: 'none', banner: { js: banner },
  metafile: true, plugins: [plugin], logLevel: 'warning',
});
const bundle = fs.readFileSync(path.join(USCITA, 'metodo3d.js'));
const sha = sha256(bundle);
const gzip = zlib.gzipSync(bundle, { level: 9 }).length;
const brotli = zlib.brotliCompressSync(bundle, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
fs.copyFileSync(path.join(THREE, 'LICENSE'), path.join(USCITA, 'LICENSE-three.txt'));
const manifest = {
  bundle: '/js/metodo3d.js', versione: '4.0.0', sha256: sha, sha8: sha.slice(0, 8), bytes: bundle.length, gzip, brotli,
  sourceHash, sorgenti: SORGENTI.map((f) => 'design/egidi-3d/' + f), three: VERSIONE_THREE,
  posters: [1, 2, 3, 4, 5].map((n) => `/img/metodo-${n}.webp`),
  pose: [0.85, 1.70, 2.48, 3.85, 4.85], posterT: [0.85, 1.635, 2.48, 3.85, 4.85],
};
fs.writeFileSync(path.join(USCITA, 'metodo3d.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
// quanto pesa il nostro codice rispetto a three
let nostro = 0; for (const [f, i] of Object.entries(r.metafile.outputs[Object.keys(r.metafile.outputs)[0]].inputs)) if (!f.includes('node_modules')) nostro += i.bytesInOutput;
console.log(`metodo3d.js  ${bundle.length} B min · ${gzip} gzip · ${brotli} brotli · nostro ${nostro} B · sha8 ${sha.slice(0, 8)} · sourceHash ${sourceHash.slice(0, 12)}`);
if (bundle.length > 600000 || brotli > 130000) { console.error('FUORI BUDGET: <= 600 KB min e <= 130 KB brotli'); process.exitCode = 1; }
