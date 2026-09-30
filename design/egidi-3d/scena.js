// Il metodo in WebGL: un appartamento tipo del centro storico recita cinque atti guidati dallo scroll.
// Contratto con egidi/index.html (la pagina possiede scroll, molla, testi, etichette e pin):
//   VERSIONE, POSE, SCATTI, PIANTA { stanze[{ id, nome, netta, w, d, cx, cz }], netta, lorda, commerciale }
//   rilievoX(T)       x in metri della linea di rilievo dell'atto 1
//   monta(canvas, o)  -> Promise<scena>; o = { token, layout, profilo, dpr, larghezza, altezza, esigente,
//                        conserva, onPerso, onRipristino }
//   scena.imposta(T)  PURA e deterministica, rende SUBITO (la pagina copia la tela nello stesso giro)
//   scena.proietta(id) -> { x, y, visibile } in px CSS; id = stanza | noncombacia | rogito | boom
//   scena.dimensiona(w, h, dpr, layout) · scena.qualita(0..3) · scena.info() · scena.distruggi()
// Niente immagini scaricate, niente postprocessing: tutto e' disegnato qui (textures.js) coi dati di plan.js.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, BoxGeometry, PlaneGeometry, CylinderGeometry, IcosahedronGeometry,
  BufferGeometry, BufferAttribute, Float32BufferAttribute, MeshStandardMaterial, MeshBasicMaterial, MeshDepthMaterial,
  ShadowMaterial, LineBasicMaterial, LineSegments, DirectionalLight, SpotLight, HemisphereLight, CanvasTexture, SRGBColorSpace,
  RepeatWrapping, ClampToEdgeWrapping, Color, Vector3, Plane, PMREMGenerator, ACESFilmicToneMapping, PCFShadowMap,
  BackSide, DoubleSide, AdditiveBlending, CatmullRomCurve3,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as PLAN from './plan.js';
import * as TX from './textures.js';

const C = new Vector3(6.0, 0, 4.7);                         // centro del corpo di fabbrica
const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const seg = (T, a, b) => cl((T - a) / (b - a));
const liscio = (x) => x * x * x * (x * (x * 6 - 15) + 10);   // smootherstep
const esce = (x) => 1 - Math.pow(1 - x, 3);
const lerp = (a, b, t) => a + (b - a) * t;
const GRADI = Math.PI / 180;
const H = PLAN.H;

// ── i dati che anche la pagina stampa: da qui, mai scritti a mano ──────────────────
export const VERSIONE = '4.0.0';
export const POSE = [0.85, 1.70, 2.48, 3.85, 4.85];
export const SCATTI = [[2.44, 2.52], [2.655, 2.72], [2.875, 2.95]];
const SUP = PLAN.superfici();
export const PIANTA = {
  netta: Math.round(SUP.netta * 100) / 100, lorda: Math.round(SUP.lorda * 100) / 100, commerciale: SUP.commerciale,
  stanze: PLAN.ROOMS.map((r) => {
    const [x0, z0, x1, z1] = r.rects[0], uno = r.rects.length === 1, mq = SUP.stanze.find((s) => s.id === r.id).mq;
    const r2 = (v) => Math.round(v * 100) / 100;
    return { id: r.id, nome: r.nome, netta: r2(mq), w: uno ? r2(x1 - x0) : null, d: uno ? r2(z1 - z0) : null, cx: r2((x0 + x1) / 2), cz: r2((z0 + z1) / 2) };
  }),
};
export const rilievoX = (T) => lerp(-1.2, 13.2, liscio(seg(T, 0.08, 0.62)));
// la planimetria disegna il tramezzo del bagno 60 cm a nord di quello costruito: si corregge la CARTA
const Z_CARTA = 2.41, Z_VERO = 3.01;
export const zCarta = (T) => lerp(Z_CARTA, Z_VERO, liscio(seg(T, 1.66, 1.72)));

const aspetta = (ms) => new Promise((r) => setTimeout(r, ms));
const idle = () => new Promise((r) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => r(), { timeout: 200 }) : setTimeout(r, 16)));

// ── geometria: tutto indicizzato, con colore per vertice, stanza e uv in metri ───────
function indicizza(g) {
  if (!g.index) { const n = g.attributes.position.count, a = new (n > 65535 ? Uint32Array : Uint16Array)(n); for (let i = 0; i < n; i++) a[i] = i; g.setIndex(new BufferAttribute(a, 1)); }
  return g;
}
const _c = new Color();
function prepara(g, col = '#FFFFFF', stanza = 0, metri = 0, uvr = null) {
  indicizza(g);
  const n = g.attributes.position.count, colori = new Float32Array(n * 3), st = new Float32Array(n);
  _c.set(col); // la Color converte da sRGB allo spazio lineare di lavoro
  for (let i = 0; i < n; i++) { colori[i * 3] = _c.r; colori[i * 3 + 1] = _c.g; colori[i * 3 + 2] = _c.b; st[i] = stanza; }
  g.setAttribute('color', new BufferAttribute(colori, 3)); g.setAttribute('aStanza', new BufferAttribute(st, 1));
  const uv = g.attributes.uv, pos = g.attributes.position, nor = g.attributes.normal;
  if (metri) {
    for (let i = 0; i < n; i++) {
      const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i)), x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (nx >= ny && nx >= nz) uv.setXY(i, z / metri, y / metri); else if (ny >= nz) uv.setXY(i, x / metri, z / metri); else uv.setXY(i, x / metri, y / metri);
    }
  } else if (uvr) {
    const [u0, v0, u1, v1] = uvr;
    for (let i = 0; i < n; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), 1 - v1 + uv.getY(i) * (v1 - v0));
  }
  return g;
}
const unisci = (lista) => (lista.length ? mergeGeometries(lista.map(indicizza)) : null);
function scatola(x0, y0, z0, x1, y1, z1) {
  if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return null;
  const g = new BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g;
}

export async function monta(canvas, o = {}) {
  const tok = Object.assign({ notte: '#111D36', notte2: '#1B2A45', luce: '#F2EFE8', nebbia: '#C5CEDE', accentoChiaro: '#96C0FE', accento: '#173FA4', oro: '#FFD700', boom: '#060607', casa: '#FFE3B8' }, o.token || {});
  let lay = o.layout || 'desktop';
  const leggero = o.profilo === 'leggero', piccolo = lay === 'mobile' || leggero;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: !!o.conserva, failIfMajorPerformanceCaveat: !!o.esigente });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap; renderer.shadowMap.autoUpdate = false;
  renderer.localClippingEnabled = true;

  let vivo = true, Tcorr = -1, ombraChiave = null;
  const perso = (e) => { e.preventDefault(); vivo = false; if (o.onPerso) o.onPerso(); };
  const ripreso = () => { vivo = true; ombraChiave = null; if (Tcorr >= 0) imposta(Tcorr); if (o.onRipristino) o.onRipristino(); };
  canvas.addEventListener('webglcontextlost', perso, false);
  canvas.addEventListener('webglcontextrestored', ripreso, false);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer), stanzaStudio = new RoomEnvironment();
  const envRT = pmrem.fromScene(stanzaStudio, 0.04); pmrem.dispose(); stanzaStudio.dispose();
  scene.environment = envRT.texture; scene.environmentIntensity = 0.62;
  const camera = new PerspectiveCamera(30, 1, 0.05, 400);
  const root = new Group(); root.position.copy(C); scene.add(root);
  const casa = new Group(); casa.position.set(-C.x, 0, -C.z); root.add(casa);

  await idle();
  // ── 1. texture procedurali ──────────────────────────────────────────────────────
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tex = (cnv, rip = true) => { const t = new CanvasTexture(cnv); t.colorSpace = SRGBColorSpace; t.wrapS = t.wrapT = rip ? RepeatWrapping : ClampToEdgeWrapping; t.anisotropy = aniso; return t; };
  const T_ = {};
  T_.spina = tex(TX.spina(1024)); await idle();
  T_.cotto = tex(TX.cotto(piccolo ? 512 : 1024)); T_.marmo = tex(TX.marmo(piccolo ? 512 : 1024)); await idle();
  T_.intonaco = tex(TX.intonaco(256)); T_.travertino = tex(TX.travertino(piccolo ? 256 : 512)); T_.legno = tex(TX.legno(piccolo ? 256 : 512));
  T_.trama = tex(TX.trama(256)); T_.bianco = tex(TX.bianco()); T_.decoro = tex(TX.decoro(512), false);
  T_.occlusione = tex(TX.occlusione(), false); T_.sera = tex(TX.sera(), false);
  try { await Promise.race([document.fonts.load('500 40px "JetBrains Mono"'), aspetta(1200)]); } catch (e) { /* ripiego sul monospace di sistema */ }
  await idle();

  // ── 2. materiali: pochi programmi, tanti colori ────────────────────────────────────
  // Tutto cio' che prende luce (muri, infissi, arredi, persiane) usa UN programma: clip + mappa + colore
  // per vertice + la caduta degli arredi stanza per stanza fatta nel vertex shader (uCade/uAlza).
  const taglio = new Plane(new Vector3(0, -1, 0), PLAN.CUT);
  const UA = { uCade: { value: new Array(9).fill(0) }, uAlza: { value: new Array(9).fill(1) } };
  const INIETTA_V = (sh) => {
    Object.assign(sh.uniforms, UA);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aStanza;\nuniform float uCade[9];\nuniform float uAlza[9];')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ int si = int(aStanza + 0.5); transformed.y = transformed.y * uAlza[si] + uCade[si]; }');
  };
  const lit = (color, roughness, map, extra = {}) => {
    const m = new MeshStandardMaterial(Object.assign({ color, roughness, metalness: 0, map, vertexColors: true, dithering: true, clippingPlanes: [taglio], clipShadows: true }, extra));
    m.onBeforeCompile = INIETTA_V; m.customProgramCacheKey = () => 'boom-lit4';
    return m;
  };
  const ombraMat = new MeshDepthMaterial(); ombraMat.onBeforeCompile = INIETTA_V; ombraMat.customProgramCacheKey = () => 'boom-ombra4';
  // lo "scan" dell'atto 1: davanti alla linea il pavimento e' un disegno (notte-2 con griglia),
  // dietro la linea e' materia. Il colore di marca entra DOPO la mappatura tonale: esce esatto.
  const US = { uScan: { value: -2 }, uBp: { value: new Color(tok.notte2) }, uGrid: { value: new Color(tok.accentoChiaro) } };
  const pavimento = (map, roughness) => {
    const m = new MeshStandardMaterial({ color: '#FFFFFF', roughness, metalness: 0, map, dithering: true });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, US);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform float uScan; uniform vec3 uBp, uGrid;')
        .replace('#include <colorspace_fragment>', `
          float rv = smoothstep(uScan + 0.06, uScan - 0.06, vWp.x);
          vec2 g1 = abs(fract(vWp.xz * 2.0 + 0.5) - 0.5) / max(fwidth(vWp.xz * 2.0), vec2(1e-4));
          vec2 g2 = abs(fract(vWp.xz + 0.5) - 0.5) / max(fwidth(vWp.xz), vec2(1e-4));
          float l1 = 1.0 - min(min(g1.x, g1.y), 1.0), l2 = 1.0 - min(min(g2.x, g2.y), 1.0);
          vec3 bp = mix(uBp, uGrid, max(l1 * 0.14, l2 * 0.30));
          gl_FragColor.rgb = mix(bp, gl_FragColor.rgb, rv);
          float dx = abs(vWp.x - uScan), acceso = step(-1.0, uScan) * step(uScan, 13.0);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uGrid, exp(-dx * 7.0) * 0.55 * acceso);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), smoothstep(0.035, 0.0, dx) * acceso);
          #include <colorspace_fragment>`);
    };
    m.customProgramCacheKey = () => 'boom-pav4';
    return m;
  };
  const basic = (color, extra = {}) => new MeshBasicMaterial(Object.assign({ color, map: T_.bianco, transparent: true, opacity: 1, toneMapped: false, depthWrite: false }, extra));
  const linee = (color, opacity = 0) => new LineBasicMaterial({ color, transparent: true, opacity, toneMapped: false, depthWrite: false });
  const M = {
    spina: pavimento(T_.spina, 0.52), cotto: pavimento(T_.cotto, 0.78), marmo: pavimento(T_.marmo, 0.22),
    intonaco: lit('#EDE9E1', 0.92, T_.intonaco),
    pietra: lit('#FFFFFF', 0.70, T_.travertino),
    lucido: lit('#FFFFFF', 0.34, T_.bianco),
    legno: lit('#FFFFFF', 0.66, T_.legno, { envMapIntensity: 0.35 }),
    tessile: lit('#FFFFFF', 0.96, T_.trama, { envMapIntensity: 0.5 }),
    metallo: lit('#FFFFFF', 0.36, T_.bianco, { metalness: 0.75 }),
    specchio: lit('#8F959B', 0.06, T_.bianco, { metalness: 1, envMapIntensity: 0.55 }),
    decoro: lit('#FFFFFF', 0.82, T_.decoro, { envMapIntensity: 0.5 }),
    persiana: lit('#FFFFFF', 0.6, T_.bianco, { metalness: 0.3 }),
    vetro: new MeshStandardMaterial({ color: '#CFE0E8', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.14, depthWrite: false, side: DoubleSide, clippingPlanes: [taglio] }),
    // la sezione dei muri: il poche' chiaro sullo scuro, come un plotter su nero. Nell'atto 5 vira all'oro.
    sezione: new MeshBasicMaterial({ color: tok.luce, side: BackSide, toneMapped: false, clippingPlanes: [taglio], polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 }),
    ao: basic('#000000', { map: T_.occlusione, opacity: 0 }),
    carta: basic('#16161A', { opacity: 0 }),
    foglioPiano: null, giorno: basic('#F4F0E8', { opacity: 1 }), cifre: null,
    terra: new ShadowMaterial({ opacity: 0.35 }),
    quota: basic(tok.accentoChiaro, { opacity: 0 }), arco: linee(tok.accentoChiaro, 0.6), finestre: linee(tok.accentoChiaro, 0.6),
    ringhiera: linee(tok.nebbia), fantasma: linee(tok.nebbia), filo: linee(tok.oro),
  };
  M.giorno.depthWrite = true;
  // le finestre accese di sera: luce di casa, NON oro (l'oro usato come luce non e' BOOM, e' fango)
  const ORDINE_LUCI = { soggiorno: 4.20, camera: 4.26, cucina: 4.32, cameretta: 4.38, bagno: 4.44 };
  // il vetro acceso si posa con fusione normale (il colore resta #FFE3B8, non satura in bianco); l'alone si somma
  const mSera = {}, mAlone = {}; for (const k of Object.keys(ORDINE_LUCI)) { mSera[k] = basic('#FFFFFF', { map: T_.sera, opacity: 0 }); mAlone[k] = basic('#FFFFFF', { map: T_.sera, opacity: 0, blending: AdditiveBlending }); }
  const stanzaDi = (q) => (q.wall === 1 ? (q.c < 6.2 ? 'soggiorno' : 'camera') : q.c < 4 ? 'cucina' : q.c < 8.6 ? 'bagno' : 'cameretta');
  const lati = (q) => { const [x0, z0, x1, z1] = PLAN.WALLS[q.wall]; const lx = x1 - x0 >= z1 - z0; return { lx, a0: lx ? x0 : z0, a1: lx ? x1 : z1, b0: lx ? z0 : x0, b1: lx ? z1 : x1 }; };
  const aggiungi = (g, mat, { ombra = true, riceve = true, ordine = 0 } = {}) => {
    if (!g) return null; const m = new Mesh(g, mat); m.castShadow = ombra; m.receiveShadow = riceve; m.renderOrder = ordine;
    if (ombra && mat.customProgramCacheKey && mat.customProgramCacheKey() === 'boom-lit4') m.customDepthMaterial = ombraMat;
    casa.add(m); return m;
  };

  // ── 3. geometria ─────────────────────────────────────────────────────────────────
  // pavimenti: una geometria per materiale, uv in metri (periodo della texture)
  const periodo = { spina: TX.SPINA_M, cotto: TX.COTTO_M, marmo: TX.MARMO_M };
  const lastre = { spina: [], cotto: [], marmo: [] };
  const lastra = (x0, z0, x1, z1, y, tipo) => { const g = new PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2); const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / periodo[tipo], -p.getZ(i) / periodo[tipo]); lastre[tipo].push(g); };
  for (const r of PLAN.ROOMS) r.rects.forEach(([x0, z0, x1, z1]) => lastra(x0 - 0.02, z0 - 0.02, x1 + 0.02, z1 + 0.02, 0, r.pav));

  // muri: pezzi pieni + architravi + davanzali, fusi in UNA geometria (la stessa fa da sezione)
  const pezzi = [], telai = [], vetri = [], mostre = [], ante = [], finestreLinee = [];
  const B = (lista, g) => { if (g) lista.push(g); };
  PLAN.WALLS.forEach(([x0, z0, x1, z1], wi) => {
    const lx = x1 - x0 >= z1 - z0; const a0 = lx ? x0 : z0, a1 = lx ? x1 : z1, b0 = lx ? z0 : x0, b1 = lx ? z1 : x1;
    const P = (u0, y0, u1, y1) => { u0 -= 0.003; u1 += 0.003; B(pezzi, lx ? scatola(u0, y0, b0, u1, y1, b1) : scatola(b0, y0, u0, b1, y1, u1)); };
    const aps = PLAN.OPENINGS.filter((q) => q.wall === wi).sort((p, q) => p.c - q.c);
    let u = a0;
    for (const q of aps) {
      const s0 = q.c - q.w / 2, s1 = q.c + q.w / 2;
      P(u, 0, s0, H); P(s0, 0, s1, q.y0); P(s0, q.y1, s1, H); u = s1;
      if (q.k === 'finestra' || q.k === 'portafinestra') {
        // telaio a un terzo dello spessore dal filo interno, montante e traverso: la croce che disegna la luce
        const esterno = wi === 0 ? b0 : b1, interno = wi === 0 ? b1 : b0, dir = Math.sign(esterno - interno);
        const bf = interno + dir * (b1 - b0) * 0.33, sp = 0.06, pr = 0.065, yt = q.y0 + (q.y1 - q.y0) * 0.72;
        const F = (u0, y0, u1, y1, l) => B(l, lx ? scatola(u0, y0, bf - sp / 2, u1, y1, bf + sp / 2) : scatola(bf - sp / 2, y0, u0, bf + sp / 2, y1, u1));
        F(s0, q.y0, s0 + pr, q.y1, telai); F(s1 - pr, q.y0, s1, q.y1, telai); F(s0, q.y1 - pr, s1, q.y1, telai); F(s0, q.y0, s1, q.y0 + pr, telai);
        F(q.c - 0.03, q.y0, q.c + 0.03, q.y1, telai); F(s0, yt, s1, yt + 0.05, telai);
        const g = lx ? scatola(s0 + pr, q.y0 + pr, bf - 0.004, s1 - pr, q.y1 - pr, bf + 0.004) : null; if (g) vetri.push(g);
        // simbolo della finestra in pianta: due fili nello spessore del muro
        for (const f of [0.40, 0.60]) { const z = b0 + (b1 - b0) * f; finestreLinee.push(s0, 0.012, z, s1, 0.012, z); }
        finestreLinee.push(s0, 0.012, b0, s0, 0.012, b1, s1, 0.012, b0, s1, 0.012, b1);
      } else ante.push({ q, lx, s0, s1, b0, b1 });
    }
    P(u, 0, a1, H);
  });
  // facciate: mostre in travertino, davanzali, cimase sopra le finestre, marcapiano e fascia di piano
  for (const q of PLAN.OPENINGS) {
    if (!(q.wall === 0 || q.wall === 1)) continue;
    const zf = q.wall === 0 ? -0.05 : 9.40, zb = q.wall === 0 ? 0 : 9.45, s0 = q.c - q.w / 2, s1 = q.c + q.w / 2, f = 0.14, sg = q.wall === 0 ? -1 : 1;
    if (q.k === 'portone') { B(mostre, scatola(s0 - f, 0, zb - 0.003, s0, q.y1 + f, 0.001)); B(mostre, scatola(s1, 0, zb - 0.003, s1 + f, q.y1 + f, 0.001)); continue; }
    B(mostre, scatola(s0 - f, q.y0, zf, s0, q.y1 + f, zb)); B(mostre, scatola(s1, q.y0, zf, s1 + f, q.y1 + f, zb)); B(mostre, scatola(s0 - f, q.y1, zf, s1 + f, q.y1 + f, zb));
    if (q.y0 > 0) B(mostre, scatola(s0 - f - 0.04, q.y0 - 0.07, Math.min(zf, zb) - (sg < 0 ? 0.04 : 0), s1 + f + 0.04, q.y0, Math.max(zf, zb) + (sg > 0 ? 0.04 : 0)));
    const zc0 = sg < 0 ? -0.13 : 9.40, zc1 = sg < 0 ? 0 : 9.53;
    B(mostre, scatola(s0 - f - 0.10, q.y1 + f + 0.04, zc0, s1 + f + 0.10, q.y1 + f + 0.14, zc1));
  }
  B(mostre, scatola(-0.04, -0.02, 9.40, 12.04, 0.16, 9.49)); B(mostre, scatola(-0.04, -0.02, -0.09, 12.04, 0.16, 0));
  B(mostre, scatola(-0.04, -0.415, 9.40, 12.04, -0.02, 9.44)); B(mostre, scatola(-0.04, -0.415, -0.04, 12.04, -0.02, 0));

  // battiscopa e cornici in gesso: dove c'e' davvero un muro, meno i vani delle porte
  const pezziFini = [];
  const facce = (asseX, coord, a, b) => { // tratti di muro la cui faccia giace sulla retta (asse, coord) fra a e b
    const out = [];
    for (const [x0, z0, x1, z1] of PLAN.WALLS) {
      const lx = x1 - x0 >= z1 - z0;
      if (asseX !== lx) continue;
      const fa = asseX ? [z0, z1] : [x0, x1];
      if (Math.abs(fa[0] - coord) > 1e-3 && Math.abs(fa[1] - coord) > 1e-3) continue;
      const lo = Math.max(a, asseX ? x0 : z0), hi = Math.min(b, asseX ? x1 : z1);
      if (hi - lo > 0.02) out.push([lo, hi]);
    }
    return out;
  };
  const sottrai = (tratti, buchi) => { let out = tratti; for (const [h0, h1] of buchi) { const n = []; for (const [a, b] of out) { if (h1 <= a || h0 >= b) n.push([a, b]); else { if (h0 > a) n.push([a, h0]); if (h1 < b) n.push([h1, b]); } } out = n; } return out.filter(([a, b]) => b - a > 0.03); };
  const CORNICE = new Set(['soggiorno', 'camera', 'ingresso', 'cameretta']);
  for (const r of PLAN.ROOMS) for (const [x0, z0, x1, z1] of r.rects) {
    for (const [asseX, coord, a, b, verso] of [[true, z0, x0, x1, 1], [true, z1, x0, x1, -1], [false, x0, z0, z1, 1], [false, x1, z0, z1, -1]]) {
      const tratti = facce(asseX, coord, a, b);
      const buchi = PLAN.OPENINGS.filter((q) => { const L = lati(q); return L.lx === asseX && q.y0 === 0 && (Math.abs(L.b0 - coord) < 1e-3 || Math.abs(L.b1 - coord) < 1e-3); }).map((q) => [q.c - q.w / 2, q.c + q.w / 2]);
      const S = (lo, hi, y0, y1, sp) => (asseX ? scatola(lo, y0, verso > 0 ? coord : coord - sp, hi, y1, verso > 0 ? coord + sp : coord) : scatola(verso > 0 ? coord : coord - sp, y0, lo, verso > 0 ? coord + sp : coord, y1, hi));
      if (r.pav !== 'marmo') for (const [lo, hi] of sottrai(tratti, buchi)) B(pezziFini, S(lo, hi, 0, 0.09, 0.014));
      if (CORNICE.has(r.id)) for (const [lo, hi] of tratti) { B(pezziFini, S(lo, hi, H - 0.10, H, 0.035)); B(pezziFini, S(lo, hi, H - 0.15, H - 0.10, 0.018)); }
    }
  }
  // mostre interne delle porte (le cornici del vano), su tutte e due le facce del muro
  for (const { q, lx, s0, s1, b0, b1 } of ante) {
    for (const [fc, sg] of [[b0, -1], [b1, 1]]) {
      if (q.k === 'portone' && sg < 0) continue;
      const S = (u0, y0, u1, y1) => (lx ? scatola(u0, y0, sg > 0 ? fc : fc - 0.016, u1, y1, sg > 0 ? fc + 0.016 : fc) : scatola(sg > 0 ? fc : fc - 0.016, y0, u0, sg > 0 ? fc + 0.016 : fc, y1, u1));
      B(pezziFini, S(s0 - 0.075, 0, s0, q.y1 + 0.075)); B(pezziFini, S(s1, 0, s1 + 0.075, q.y1 + 0.075)); B(pezziFini, S(s0 - 0.075, q.y1, s1 + 0.075, q.y1 + 0.075));
    }
  }
  // soglie in marmo nei vani porta
  for (const { lx, s0, s1, b0, b1 } of ante) lastra(lx ? s0 : b0, lx ? b0 : s0, lx ? s1 : b1, lx ? b1 : s1, 0.0015, 'marmo');

  const gMuri = unisci(pezzi.map((g) => prepara(g, '#FFFFFF', 0, TX.INTONACO_M)));
  const muri = aggiungi(gMuri, M.intonaco);
  aggiungi(unisci(mostre.map((g) => prepara(g, '#D8CFBE', 0, TX.TRAVERTINO_M))), M.pietra);
  aggiungi(unisci([...telai, ...pezziFini].map((g) => prepara(g, '#EFEBE4'))), M.lucido);
  casa.add(new Mesh(unisci(vetri), M.vetro));
  const sezione = new Mesh(gMuri, M.sezione); casa.add(sezione);
  const pav = {}; for (const k of Object.keys(lastre)) { pav[k] = new Mesh(unisci(lastre[k]), M[k]); pav[k].receiveShadow = true; casa.add(pav[k]); }

  // persiane alla romana in ferro: due ante per finestra di facciata, a lamelle, cardine sul filo esterno.
  // Chiuse finche' la casa e' chiusa (atto 2), si aprono quando si entra (atto 3).
  const persiane = [];
  const assi = [...new Set(PLAN.OPENINGS.filter((q) => (q.wall === 0 || q.wall === 1) && q.k !== 'portone').map((q) => q.c))].sort((a, b) => a - b);
  for (const q of PLAN.OPENINGS) {
    if (!((q.wall === 0 || q.wall === 1) && (q.k === 'finestra' || q.k === 'portafinestra'))) continue;
    const h = q.y1 - q.y0, lw = q.w / 2 - 0.004, verso = q.wall === 0 ? 1 : -1, z = q.wall === 0 ? -0.07 : 9.47;
    for (const lato of [1, -1]) {
      const parti = [];
      const s = (x0, y0, x1, y1, sp) => { const [a, b] = lato > 0 ? [x0, x1] : [-x1, -x0]; B(parti, scatola(a, y0, -sp / 2, b, y1, sp / 2)); };
      s(0, 0, 0.05, h, 0.035); s(lw - 0.05, 0, lw, h, 0.035); s(0, 0, lw, 0.07, 0.035); s(0, h - 0.07, lw, h, 0.035);
      if (h > 2) s(0, h * 0.42, lw, h * 0.42 + 0.06, 0.035);
      const n = Math.floor((h - 0.14) / 0.1);
      for (let i = 0; i < n; i++) {
        const y = 0.07 + (i + 0.5) * (h - 0.14) / n, g = new BoxGeometry(lw - 0.10, 0.008, 0.05);
        g.rotateX(-verso * 38 * GRADI); g.translate(lato * lw / 2, y, 0); parti.push(g);
      }
      const piv = new Group(); piv.position.set(lato > 0 ? q.c - q.w / 2 : q.c + q.w / 2, q.y0, z);
      const m = new Mesh(unisci(parti.map((g) => prepara(g, '#2A3342'))), M.persiana); m.castShadow = true; m.receiveShadow = true; m.customDepthMaterial = ombraMat;
      piv.add(m); casa.add(piv);
      persiane.push({ piv, lato, verso, k: assi.indexOf(q.c) });
    }
  }
  // parapetti in ferro davanti alle portefinestre
  const ferri = [];
  for (const q of PLAN.OPENINGS) if (q.parapetto) {
    const s0 = q.c - q.w / 2 - 0.05, s1 = q.c + q.w / 2 + 0.05, z = 9.52;
    B(ferri, scatola(s0, 0.96, z - 0.02, s1, 1.0, z + 0.02)); B(ferri, scatola(s0, 0.10, z - 0.012, s1, 0.13, z + 0.012));
    for (let x = s0; x <= s1 + 1e-3; x += 0.11) B(ferri, scatola(x - 0.008, 0.10, z - 0.008, x + 0.008, 0.98, z + 0.008));
  }

  // porte: anta su cardine (bugne e maniglia), arco in pianta (la convenzione del disegno)
  const porte = [], archi = [];
  const _y = new Vector3(0, 1, 0);
  for (const { q, lx, s0, s1, b0, b1 } of ante) {
    const bm = (b0 + b1) / 2, spess = 0.045, portone = q.k === 'portone';
    const foglie = q.k === 'doppia' ? [{ h: s0, w: q.w / 2 - 0.005, verso: 1 }, { h: s1, w: q.w / 2 - 0.005, verso: -1 }] : [{ h: q.hinge ? s1 : s0, w: q.w - 0.02, verso: q.hinge ? -1 : 1 }];
    for (const f of foglie) {
      const hh = q.y1 - 0.02, parti = [], col = portone ? '#3A2D24' : '#ECE8E0';
      const P = (x0, y0, x1, y1, z0, z1, c = col) => { const g = scatola(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1)); if (g) parti.push(prepara(g, c, 0, portone ? TX.LEGNO_M : 0)); };
      const v = f.verso;
      P(0, 0, v * f.w, hh, -spess / 2, spess / 2);
      // bugne: due riquadri in rilievo per faccia
      const m0 = 0.10, mw = f.w - 0.20;
      for (const [ya, yb] of portone ? [[0.14, hh * 0.46], [hh * 0.52, hh - 0.14]] : [[0.16, hh * 0.42], [hh * 0.48, hh - 0.14]]) for (const sz of [-1, 1]) P(v * m0, ya, v * (m0 + mw), yb, sz * spess / 2, sz * (spess / 2 + 0.008));
      const maniglia = portone ? '#B08D57' : '#B8BABD', xm = v * (f.w - 0.07), ym = portone ? 1.10 : 1.02;
      for (const sz of [-1, 1]) { P(xm - 0.012, ym - 0.06, xm + 0.012, ym + 0.06, sz * spess / 2, sz * (spess / 2 + 0.012), maniglia); P(xm, ym - 0.012, xm - v * 0.12, ym + 0.012, sz * (spess / 2 + 0.03), sz * (spess / 2 + 0.05), maniglia); }
      const piv = new Group();
      const m = new Mesh(unisci(parti), portone ? M.legno : M.lucido); m.castShadow = true; m.receiveShadow = true; m.customDepthMaterial = ombraMat; piv.add(m);
      const faccia = bm + q.side * ((b1 - b0) / 2 - spess / 2);
      if (lx) piv.position.set(f.h, 0, faccia); else { piv.position.set(faccia, 0, f.h); piv.rotation.y = -Math.PI / 2; }
      const apre = -f.verso * q.side * (lx ? 1 : -1) * (Math.PI / 2);
      // la porta a due ante del soggiorno si spalanca oltre la squadra (115 gradi): l'infilata resta libera
      piv.userData = { apre: apre * (q.k === 'doppia' ? 115 / 90 : 1), base: piv.rotation.y }; piv.visible = false; casa.add(piv); porte.push(piv);
      const N = 18, pts = [];
      for (let i = 0; i <= N; i++) { const w = new Vector3(f.verso * f.w, 0, 0).applyAxisAngle(_y, (apre * i) / N + piv.rotation.y); pts.push([piv.position.x + w.x, piv.position.z + w.z]); }
      for (let i = 0; i < N; i++) archi.push(pts[i][0], 0.012, pts[i][1], pts[i + 1][0], 0.012, pts[i + 1][1]);
      archi.push(piv.position.x, 0.012, piv.position.z, pts[N][0], 0.012, pts[N][1]);
    }
  }
  const lineeDa = (arr, mat) => { const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(arr, 3)); const l = new LineSegments(g, mat); casa.add(l); return l; };
  const lArchi = lineeDa(archi, M.arco), lFinestre = lineeDa(finestreLinee, M.finestre);

  // arredi: una geometria per famiglia di materiale, per TUTTE le stanze; la stanza viaggia nel vertice
  const ORDINE_ARREDI = ['soggiorno', 'ingresso', 'cucina', 'disimpegno', 'bagno', 'cameretta', 'camera', 'bagno2'];
  const famiglie = {}, vetriArredo = [], macchie = [];
  const UVM = { legno: TX.LEGNO_M, tessile: TX.TRAMA_M, pietra: TX.TRAVERTINO_M };
  for (const [stanza, lista] of Object.entries(PLAN.FURNITURE)) {
    const slot = ORDINE_ARREDI.indexOf(stanza) + 1;
    for (const a of lista) {
      let g;
      if (a.t === 'rbox') g = new RoundedBoxGeometry(a.s[0], a.s[1], a.s[2], a.q || 1, Math.min(a.r, a.s[0] / 2, a.s[1] / 2, a.s[2] / 2) * 0.999);
      else if (a.t === 'cyl') g = new CylinderGeometry(a.s[0], a.s[2], a.s[1], a.q || 16, 1);
      else if (a.t === 'sfera') { g = new IcosahedronGeometry(1, a.q || 1); g.scale(a.s[0], a.s[1], a.s[2]); }
      else g = new BoxGeometry(a.s[0], a.s[1], a.s[2]);
      if (a.rot) { g.rotateX(a.rot[0]); g.rotateY(a.rot[1]); g.rotateZ(a.rot[2]); }
      const hy = a.t === 'sfera' ? a.s[1] : a.s[1] / 2;
      g.translate(a.p[0], a.p[1] + hy, a.p[2]);
      if (a.m === 'vetro') { vetriArredo.push(indicizza(g)); continue; }
      const uvr = a.uv ? TX.DECORO[a.uv] : a.m === 'decoro' ? TX.DECORO.neutro : null;
      // proiettano ombra solo i pezzi che la fanno vedere: gambe, lampade e soprammobili no (meta' dei triangoli)
      const grande = Math.max(a.s[0], a.s[1], a.s[2]) > (a.t === 'cyl' ? 0.9 : 0.34) && a.s[1] > 0.02;
      (famiglie[a.m + (grande ? '' : '~')] ||= []).push(prepara(g, a.c || '#FFFFFF', slot, uvr ? 0 : UVM[a.m] || 0, uvr));
      // macchia d'ombra sotto i pezzi grandi che poggiano a terra
      const area = a.s[0] * a.s[2];
      if (a.t !== 'cyl' && a.t !== 'sfera' && a.p[1] <= 0.15 && a.s[1] > 0.15 && area > 0.12) macchie.push([a.p[0], a.p[2], a.s[0] * 1.3 + 0.12, a.s[2] * 1.3 + 0.12]);
    }
  }
  famiglie.metallo = (famiglie.metallo || []).concat(ferri.map((g) => prepara(g, '#2A2C31')));
  const arredi = [];
  for (const [fam, gs] of Object.entries(famiglie)) { const f = fam.replace('~', ''); arredi.push(aggiungi(unisci(gs), M[f], { ombra: f !== 'specchio' && !fam.endsWith('~') })); }
  const vetroDoccia = new Mesh(unisci(vetriArredo), M.vetro); vetroDoccia.visible = false; casa.add(vetroDoccia);

  // occlusione finta: strisce lungo i muri (0,34 m) + macchie sotto gli arredi, in una sola geometria
  const occl = [];
  const quad = (cx, cz, w, d, rotY, u0, u1) => { const g = new PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0)); g.rotateY(rotY); g.translate(cx, 0.006, cz); occl.push(g); };
  for (const r of PLAN.ROOMS) for (const [x0, z0, x1, z1] of r.rects) {
    quad((x0 + x1) / 2, z0 + 0.17, x1 - x0, 0.34, 0, 0, 0.5); quad((x0 + x1) / 2, z1 - 0.17, x1 - x0, 0.34, Math.PI, 0, 0.5);
    quad(x0 + 0.17, (z0 + z1) / 2, z1 - z0, 0.34, -Math.PI / 2, 0, 0.5); quad(x1 - 0.17, (z0 + z1) / 2, z1 - z0, 0.34, Math.PI / 2, 0, 0.5);
  }
  for (const [x, z, w, d] of macchie) quad(x, z, w, d, 0, 0.5, 1);
  const ao = new Mesh(unisci(occl), M.ao); ao.renderOrder = 2; ao.visible = false; casa.add(ao);

  // soffitto: una faccia rivolta in basso. Da sopra e' scartata, da dentro c'e'.
  const gSoff = prepara(new PlaneGeometry(PLAN.EXT.w - 0.9, PLAN.EXT.d - 1.1).rotateX(Math.PI / 2).translate(6.0, H - 0.002, 4.7), '#F3F0EA');
  // proietta ombra solo quando si e' DENTRO casa: da fuori il plastico e' senza tetto e le stanze prendono luce
  const soffitto = aggiungi(gSoff, M.intonaco);

  // solaio (atto 4: la casa si chiude), basamento, terreno che riceve l'ombra
  const solaio = new Group(); solaio.visible = false; casa.add(solaio);
  const gSol = unisci([scatola(0, 0, 0, 12, 0.30, 9.4), scatola(-0.12, 0.16, 9.26, 12.12, 0.30, 9.74), scatola(-0.06, 0.06, 9.32, 12.06, 0.16, 9.60), scatola(-0.12, 0.16, -0.34, 12.12, 0.30, 0.14)].map((g) => prepara(g, '#E9E4DA', 0, TX.INTONACO_M)));
  const solaioM = new Mesh(gSol, M.intonaco); solaioM.castShadow = true; solaioM.receiveShadow = true; solaioM.customDepthMaterial = ombraMat; solaio.add(solaioM);
  aggiungi(prepara(scatola(0, -0.415, 0, 12, -0.015, 9.4), '#E3DED3', 0, TX.INTONACO_M), M.intonaco);
  const terra = new Mesh(new PlaneGeometry(90, 90), M.terra); terra.rotation.x = -Math.PI / 2; terra.position.y = -0.43; terra.receiveShadow = true; scene.add(terra);

  // il pianerottolo: l'appartamento si apre sul vano scala, non sulla corte (atti 2-4)
  const pian = new Group(); pian.visible = false; casa.add(pian);
  const mPian = new Mesh(prepara(scatola(3.60, -0.315, -2.80, 6.90, -0.015, 0), '#D8CFBE', 0, TX.TRAVERTINO_M), M.pietra); mPian.receiveShadow = true; mPian.castShadow = true; mPian.customDepthMaterial = ombraMat; pian.add(mPian);
  const rg = [], L2 = (a, b) => rg.push(...a, ...b);
  for (const y of [-0.015, 1.0]) { L2([3.6, y, -2.8], [6.9, y, -2.8]); L2([3.6, y, -2.8], [3.6, y, 0]); }
  for (let x = 3.6; x <= 6.91; x += 0.11) L2([x, -0.015, -2.8], [x, 1.0, -2.8]);
  for (let z = -2.8; z <= 0.01; z += 0.11) L2([3.6, -0.015, z], [3.6, 1.0, z]);
  for (let k = 0; k < 3; k++) { const x = 6.9 + k * 0.30, y = -0.015 - (k + 1) * 0.17; for (const z of [-2.8, -1.5]) { L2([x, y + 0.17, z], [x, y, z]); L2([x, y, z], [x + 0.30, y, z]); } L2([x, y, -2.8], [x, y, -1.5]); }
  const lRing = new LineSegments(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(rg, 3)), M.ringhiera); pian.add(lRing);

  // quote (atto 1): catene sul fronte strada e sul lato ovest, tagli a 45 gradi, cifre sul disegno
  const q = [];
  const quota = (ax, az, bx, bz) => { q.push(ax, 0.02, az, bx, 0.02, bz); for (const [x, z] of [[ax, az], [bx, bz]]) q.push(x - 0.12, 0.02, z + 0.12, x + 0.12, 0.02, z - 0.12); };
  quota(0, 10.35, 12, 10.35); quota(0.45, 9.85, 6.20, 9.85); quota(6.32, 9.85, 11.55, 9.85);
  quota(-0.95, 0, -0.95, 9.40); quota(-0.45, 0.55, -0.45, 4.40); quota(-0.45, 4.75, -0.45, 8.85);
  for (const [x, z0, z1] of [[0, 9.40, 10.45], [12, 9.40, 10.45], [0.45, 8.85, 9.95], [6.2, 8.85, 9.95], [6.32, 8.85, 9.95], [11.55, 8.85, 9.95]]) q.push(x, 0.02, z0 + 0.08, x, 0.02, z1);
  for (const [z, x0, x1] of [[0, -1.05, 0], [9.40, -1.05, 0], [0.55, -0.55, 0.45], [4.40, -0.55, 0.45], [4.75, -0.55, 0.45], [8.85, -0.55, 0.45]]) q.push(x0, 0.02, z, x1 - 0.06, 0.02, z);
  // le catene di quota come nastri da 3 cm, non linee da un pixel: tratto costante e colore di misura esatto
  const nastri = [];
  for (let i = 0; i < q.length; i += 6) {
    const ax = q[i], az = q[i + 2], bx = q[i + 3], bz = q[i + 5], L = Math.hypot(bx - ax, bz - az);
    const g = new PlaneGeometry(L + 0.03, 0.03); g.rotateX(-Math.PI / 2); g.rotateY(-Math.atan2(bz - az, bx - ax)); g.translate((ax + bx) / 2, 0.02, (az + bz) / 2); nastri.push(g);
  }
  const quote = new Mesh(unisci(nastri), M.quota); quote.renderOrder = 3; casa.add(quote);
  const fmt = (v) => v.toFixed(2).replace('.', ',');
  const testiQuote = [[fmt(12), 6.0, 10.66, 0], [fmt(6.20 - 0.45), 3.325, 10.13, 0], [fmt(11.55 - 6.32), 8.935, 10.13, 0], [fmt(9.40), -1.26, 4.70, 1], [fmt(4.40 - 0.55), -0.73, 2.475, 1], [fmt(8.85 - 4.75), -0.73, 6.80, 1]];
  const tCifre = tex(TX.cifre(testiQuote.map((t) => t[0]), '#FFFFFF'), false);
  M.cifre = basic(tok.accentoChiaro, { map: tCifre, opacity: 0 });
  const cif = testiQuote.map(([, x, z, vert], i) => {
    const g = new PlaneGeometry(2.08, 0.26); const uv = g.attributes.uv, n = testiQuote.length;
    for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / n);
    g.rotateX(-Math.PI / 2); if (vert) g.rotateY(Math.PI / 2); g.translate(x, 0.025, z); return g;
  });
  const cifre = new Mesh(unisci(cif), M.cifre); cifre.renderOrder = 3; casa.add(cifre);

  // i documenti (atto 2): visura, planimetria (carta e lucido), APE, conformita'
  const nomiDoc = ['visura', 'planimetria', 'ape', 'conformita'];
  const docs = nomiDoc.map((n) => {
    const w = n === 'planimetria' ? 15.0 : 3.2, h = n === 'planimetria' ? 10.6 : 4.52;
    const g = new PlaneGeometry(w, h); g.rotateX(-Math.PI / 2);
    const m = new Mesh(g, basic('#FFFFFF', { map: tex(TX.foglio(n, PLAN, tok.accento), false), opacity: 1, depthWrite: false }));
    m.visible = false; m.renderOrder = 3; casa.add(m); return m;
  });
  const gLuc = new PlaneGeometry(15.0, 10.6); gLuc.rotateX(-Math.PI / 2);
  const lucido = new Mesh(gLuc, basic(tok.accentoChiaro, { map: tex(TX.foglio('lucido', PLAN, tok.accento), false), opacity: 0 }));
  lucido.renderOrder = 4; lucido.visible = false; docs[1].add(lucido); lucido.position.y = 0.002;
  // il tramezzo M8 SULLA CARTA: 60 cm fuori posto, poi corretto (figlio della planimetria)
  const gCarta = new PlaneGeometry(2.08, 0.18); gCarta.rotateX(-Math.PI / 2);
  const lineaCarta = new Mesh(gCarta, M.carta); lineaCarta.renderOrder = 5; lineaCarta.position.set(7.56 - 6.0, 0.004, Z_CARTA - 4.7); docs[1].add(lineaCarta);

  // atto 5: finestre accese stanza per stanza, alone, filo d'oro sul profilo
  const luci = new Group(); luci.visible = false; casa.add(luci);
  const seraPer = {}, alonePer = {}; for (const k of Object.keys(ORDINE_LUCI)) { seraPer[k] = []; alonePer[k] = []; }
  for (const qq of PLAN.OPENINGS) {
    if (!(qq.k === 'finestra' || qq.k === 'portafinestra') || (qq.wall !== 0 && qq.wall !== 1)) continue;
    const st = stanzaDi(qq), nord = qq.wall === 0, w = qq.w - 0.02, h = qq.y1 - qq.y0 - 0.02;
    const g = new PlaneGeometry(w, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5);
    if (nord) g.rotateY(Math.PI); g.translate(qq.c, (qq.y0 + qq.y1) / 2, nord ? 0.62 : 8.78); seraPer[st].push(g);
    if (!leggero) {
      const a = new PlaneGeometry(2.6, 2.6); const ua = a.attributes.uv; for (let i = 0; i < ua.count; i++) ua.setX(i, 0.5 + ua.getX(i) * 0.5);
      if (nord) a.rotateY(Math.PI); a.translate(qq.c, (qq.y0 + qq.y1) / 2, nord ? -0.30 : 9.70); alonePer[st].push(a);
    }
  }
  for (const [st, gs] of Object.entries(alonePer)) if (gs.length) { const m = new Mesh(unisci(gs), mAlone[st]); m.renderOrder = 5; luci.add(m); }
  for (const [st, gs] of Object.entries(seraPer)) if (gs.length) { const m = new Mesh(unisci(gs), mSera[st]); m.renderOrder = 7; luci.add(m); }
  const fl = []; const rett = (pts) => { for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; fl.push(...a, ...b); } };
  for (const [y, e] of [[-0.415, 0], [-0.02, 0], [H, 0], [H + 0.30, 0.12]]) rett([[-e, y, -e], [12 + e, y, -e], [12 + e, y, 9.4 + e], [-e, y, 9.4 + e]]);
  for (const [x, z] of [[0, 0], [12, 0], [12, 9.4], [0, 9.4]]) fl.push(x, -0.415, z, x, H + 0.30, z);
  for (const qq of PLAN.OPENINGS) if (qq.wall === 0 || qq.wall === 1) { const z = qq.wall === 0 ? -0.052 : 9.452, s0 = qq.c - qq.w / 2 - 0.14, s1 = qq.c + qq.w / 2 + 0.14; rett([[s0, qq.y0, z], [s1, qq.y0, z], [s1, qq.y1 + 0.14, z], [s0, qq.y1 + 0.14, z]]); }
  const lFilo = lineeDa(fl, M.filo);
  // e sui profili orizzontali delle facciate un filo pieno (4 cm): l'oro esce esatto, non sfumato dall'antialias
  M.filoPieno = basic(tok.oro, { opacity: 0 });
  const fp4 = [];
  for (const [y, h, zs, zn, e] of [[H + 0.241, 0.06, 9.745, -0.345, 0.12], [-0.415, 0.05, 9.442, -0.042, 0.04], [0.12, 0.04, 9.492, -0.092, 0.04]]) for (const [z, ry] of [[zs, 0], [zn, Math.PI]]) {
    const g = new PlaneGeometry(12 + 2 * e, h); g.rotateY(ry); g.translate(6, y + h / 2, z); fp4.push(g);
  }
  const filoPieno = new Mesh(unisci(fp4), M.filoPieno); filoPieno.renderOrder = 6; filoPieno.visible = false; casa.add(filoPieno);

  // la luce del giorno oltre le facciate (interni): bruciata come nelle foto d'interni vere
  const giorno = new Group(); giorno.visible = false; casa.add(giorno);
  for (const [z, ry] of [[10.6, Math.PI], [-3.2, 0]]) { const m = new Mesh(new PlaneGeometry(24, 9), M.giorno); m.position.set(6.0, 2.0, z); m.rotation.y = ry; giorno.add(m); }

  // il palazzo intorno (atto 4): piani a fil di ferro, finestre sugli stessi assi, archi delle botteghe
  const fp = []; const R4 = (x0, y0, x1, y1, z) => fp.push(x0, y0, z, x1, y0, z, x1, y0, z, x1, y1, z, x1, y1, z, x0, y1, z, x0, y1, z, x0, y0, z);
  for (const [y0, y1, tipo] of [[-4.6, -0.415, 'botteghe'], [4.1, 7.9, 'finestre'], [7.9, 11.3, 'finestre']]) {
    for (const z of [0, 9.4]) R4(0, y0, 12, y1, z);
    for (const x of [0, 12]) fp.push(x, y0, 0, x, y0, 9.4, x, y1, 0, x, y1, 9.4);
    for (const z of [0, 9.4]) for (const c of [1.8, 4.6, 7.4, 10.2]) {
      if (tipo === 'finestre') { R4(c - 0.6, y0 + 0.8, c + 0.6, y0 + 3.0, z); R4(c - 0.74, y0 + 3.14, c + 0.74, y0 + 3.24, z); }
      else { fp.push(c - 0.9, y0, z, c - 0.9, y0 + 2.4, z, c + 0.9, y0, z, c + 0.9, y0 + 2.4, z); for (let i = 0; i < 14; i++) { const t0 = Math.PI - (i * Math.PI) / 14, t1 = Math.PI - ((i + 1) * Math.PI) / 14; fp.push(c + 0.9 * Math.cos(t0), y0 + 2.4 + 0.9 * Math.sin(t0), z, c + 0.9 * Math.cos(t1), y0 + 2.4 + 0.9 * Math.sin(t1), z); } }
    }
  }
  R4(-0.3, 11.3, 12.3, 11.75, 9.7); R4(-0.3, 11.3, 12.3, 11.75, -0.3);
  for (const x of [-0.3, 12.3]) fp.push(x, 11.3, -0.3, x, 11.3, 9.7, x, 11.75, -0.3, x, 11.75, 9.7);
  const palazzo = lineeDa(fp, M.fantasma); palazzo.visible = false;

  // il sole, e la luce fredda da nord che entra in cucina (sempre in scena: niente ricompilazioni)
  const sole = new DirectionalLight('#FFE6C2', 2.6); sole.castShadow = true;
  const ms = piccolo ? 1024 : 2048; sole.shadow.mapSize.set(ms, ms);
  Object.assign(sole.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 75 }); sole.shadow.camera.updateProjectionMatrix();
  sole.shadow.bias = -0.0004; sole.shadow.normalBias = 0.03; sole.shadow.radius = piccolo ? 2.5 : 3.5;
  scene.add(sole); scene.add(sole.target); sole.target.position.copy(C);
  // il rimbalzo caldo: cielo chiaro, terra color parquet. Scalda le ombre senza ricompilare nulla (sempre in scena)
  const cielo = new HemisphereLight('#FFF3E2', '#C4B094', 0.4); scene.add(cielo);
  let nord = null;
  if (!leggero) { nord = new SpotLight('#D6E4FF', 0, 4.6, 0.62, 0.9, 2); nord.position.set(1.8, 2.9, 0.75); nord.target.position.set(2.0, 0, 2.6); casa.add(nord); casa.add(nord.target); }

  // ── la camera ───────────────────────────────────────────────────────────────────
  // Chiavi: [T, posizione, bersaglio, campo orizzontale sulla parte libera della tela, decentramento
  // verticale]. Negli interni la camera sta in bolla e si decentra: verticali dritte, come un obiettivo
  // decentrabile. Fra una stanza e l'altra passa SOPRA i muri tagliati (casa di bambola).
  let W0 = o.larghezza || 1, H0 = o.altezza || 1, dprBase = o.dpr || 1, livello = 0;
  const K = [
    [2.00, [19.0, 21.0, -12.0], [6.0, 1.2, 4.7], 40, 0], [2.18, [15.0, 14.0, -11.0], [5.8, 1.0, 3.5], 42, 0], [2.26, [8.0, 4.5, -6.0], [5.3, 1.4, 1.0], 46, 0.04],
    [2.30, [5.2, 1.60, -2.2], [5.2, 1.55, 3.0], 54, 0.08], [2.33, [5.2, 1.55, 0.27], [5.15, 1.5, 4.0], 58, 0.10], [2.37, [5.15, 1.45, 2.5], [5.0, 1.42, 6.5], 60, 0.12],
    [2.405, [5.12, 1.41, 3.2], [5.0, 1.40, 8.85], 60, 0.12], [2.44, [5.10, 1.40, 3.55], [4.95, 1.40, 8.85], 60, 0.12], [2.52, [5.10, 1.40, 3.62], [4.95, 1.40, 8.85], 60, 0.12],
    [2.545, [5.0, 2.9, 3.4], [3.8, 1.2, 2.5], 62, 0.06], [2.57, [4.6, 4.8, 3.9], [2.6, 1.0, 2.2], 62, 0], [2.595, [3.9, 5.2, 4.4], [1.8, 1.0, 1.4], 62, 0],
    [2.615, [3.72, 3.9, 4.18], [1.5, 1.2, 1.0], 62, 0.04], [2.635, [3.70, 2.5, 4.16], [1.4, 1.35, 0.95], 62, 0.08], [2.655, [3.70, 1.36, 4.15], [1.3, 1.36, 0.9], 62, 0.12],
    [2.72, [3.68, 1.36, 4.13], [1.3, 1.36, 0.88], 62, 0.12], [2.745, [3.65, 2.9, 4.1], [4.5, 1.2, 3.0], 64, 0.06], [2.77, [4.6, 4.8, 4.8], [8.0, 1.0, 6.5], 64, 0],
    [2.80, [8.5, 5.8, 7.8], [7.5, 1.0, 6.6], 66, 0], [2.825, [9.3, 5.2, 8.3], [7.0, 1.0, 6.4], 68, 0], [2.845, [9.32, 3.9, 8.50], [6.8, 1.2, 6.2], 70, 0.04],
    [2.86, [9.33, 2.4, 8.53], [6.5, 1.3, 6.05], 72, 0.08], [2.875, [9.33, 1.32, 8.55], [6.4, 1.30, 6.0], 72, 0.12], [2.95, [9.32, 1.32, 8.53], [6.4, 1.30, 5.96], 72, 0.12],
    [3.02, [9.3, 3.2, 8.4], [8.0, 1.6, 6.5], 60, 0.05], [3.08, [12.5, 6.0, 14.0], [7.0, 1.6, 5.5], 48, 0], [3.20, [15.0, 3.0, 25.0], [6.0, 2.2, 4.7], 34, 0.02],
    [3.60, [16.0, -2.2, 38.0], [6.0, 3.8, 4.7], 32, 0.06], [3.95, [15.0, -2.6, 39.0], [6.0, 3.8, 4.7], 32, 0.06],
    [4.40, [15.5, -1.9, 38.5], [6.0, 3.2, 4.7], 30, 0.05], [5.00, [14.8, -1.6, 37.0], [6.0, 3.0, 4.7], 30, 0.05],
  ];
  const curvaP = new CatmullRomCurve3(K.map((k) => new Vector3(...k[1])), false, 'centripetal');
  const curvaT = new CatmullRomCurve3(K.map((k) => new Vector3(...k[2])), false, 'centripetal');
  function lungoChiavi(T) {
    let i = 0; while (i < K.length - 2 && T > K[i + 1][0]) i++;
    const u = cl((T - K[i][0]) / (K[i + 1][0] - K[i][0])), t = (i + u) / (K.length - 1);
    return { pos: curvaP.getPoint(t), tgt: curvaT.getPoint(t), hfov: lerp(K[i][3], K[i + 1][3], liscio(u)), sv: lerp(K[i][4], K[i + 1][4], liscio(u)) };
  }
  // la parte di tela che il testo lascia libera: a destra della colonna su desktop, in alto sopra il foglio
  // su telefono, tutta nel poster. hw/hh = mezza larghezza e mezza altezza utili attorno al punto principale.
  function impagina(dentro, sv) {
    if (lay === 'desktop') return { sx: lerp(0.16, 0.12, dentro), sy: sv, lw: lerp(0.60, 0.62, dentro), vh: 1, hw: 0.26, hh: 0.43 };
    if (lay === 'mobile') return { sx: 0, sy: 0.16 + sv * 0.6, lw: lerp(0.94, 1.0, dentro), vh: 0.5, hw: 0.46, hh: 0.18 };
    return { sx: 0, sy: sv * 0.5, lw: lerp(0.90, 1.0, dentro), vh: 1, hw: 0.44, hh: 0.42 };
  }
  const SU = new Vector3(0, 1, 0), NORD = new Vector3(0, 0, -1);
  function pianta(T) { // zenitale quasi ortografica: la pianta con le quote sta nella parte libera
    const L = impagina(0, 0), Hf = H0 * (1 + 2 * L.sy), f = (Hf / 2) / Math.tan(6 * GRADI);
    const k = Math.min((L.hw * W0 * 2) / 15.2, (L.hh * H0 * 2) / 12.4);
    const zoom = lerp(1.0, 0.95, liscio(seg(T, 0, 0.9))), giro = lerp(0, 0.06, liscio(seg(T, 0, 0.9)));
    const d = (f / k) * zoom;
    return { pos: new Vector3(5.4, d, 5.25 + 0.001), tgt: new Vector3(5.4, 0, 5.25), f, up: new Vector3(Math.sin(giro), 0, -Math.cos(giro)), sx: L.sx, sy: L.sy };
  }
  function focale(hfov, L, interno) {
    let f = (L.lw * W0 / 2) / Math.tan(hfov * GRADI / 2);
    // negli interni il campo verticale VISIBILE (sopra il foglio del testo su telefono) resta fra 40 e 80 gradi
    if (interno) { const hv = L.vh * H0 / 2, vis = 2 * Math.atan(hv / f) / GRADI; if (vis < 40) f = hv / Math.tan(20 * GRADI); if (vis > 80) f = hv / Math.tan(40 * GRADI); }
    return f;
  }
  function inquadra(T, dentro) {
    if (T < 1.72) return pianta(Math.min(T, 1));
    const k2 = lungoChiavi(Math.max(T, 2.0)), interno = T > 2.30 && T < 3.04;
    const L = impagina(dentro, k2.sv), f2 = focale(k2.hfov, L, interno);
    if (T >= 2.0) return { pos: k2.pos, tgt: k2.tgt, f: f2, up: SU, sx: L.sx, sy: L.sy };
    // dalla pianta all'assonometria: si interpola la SCALA apparente (f/distanza), non l'angolo
    const p0 = pianta(1), u = liscio(seg(T, 1.72, 2.0));
    const pos = p0.pos.clone().lerp(k2.pos, u), tgt = p0.tgt.clone().lerp(k2.tgt, u);
    const s0 = p0.f / p0.pos.distanceTo(p0.tgt), s1 = f2 / k2.pos.distanceTo(k2.tgt), s = Math.exp(lerp(Math.log(s0), Math.log(s1), u));
    return { pos, tgt, f: s * pos.distanceTo(tgt), up: p0.up.clone().lerp(SU, u).normalize(), sx: lerp(p0.sx, L.sx, u), sy: lerp(p0.sy, L.sy, u) };
  }
  let sx = 0, sy = 0;
  function ottica(f) {
    const Wf = W0 * (1 + 2 * sx), Hf = H0 * (1 + 2 * sy);
    camera.aspect = Wf / Hf; camera.fov = 2 * Math.atan(Hf / 2 / f) / GRADI;
    if (sx || sy) camera.setViewOffset(Wf, Hf, 0, 2 * sy * H0, W0, H0); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  void NORD;

  // ── lo stato della scena al tempo T (0..5) ──────────────────────────────────────
  const statoSole = (el, az) => { const e = el * GRADI, a = az * GRADI; return new Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).multiplyScalar(32).add(C); };
  const cMuro = new Color('#EDE9E1'), cNero = new Color('#161618'), cLuce = new Color(tok.luce), cOro = new Color(tok.oro), cSole = new Color('#FFE6C2'), cSoleBasso = new Color('#FFC98F'), cTramonto = new Color('#FFB36B');
  const cBianco = new Color('#FFFFFF'), cCartaNera = new Color('#16161A'), cMisura = new Color(tok.accentoChiaro);
  let ultimo = {};
  // finestre in cui l'ombra resta ferma: la si calcola una volta, nello stato canonico della finestra
  const fermoOmbra = (T) => (T < 1.76 ? 'pianta' : T > 1.96 && T < 2.0 ? 'assono' : T > 2.42 && T < 3.02 ? 'interni' : null);
  const taglioOmbra = { pianta: PLAN.CUT, assono: H - 0.001, interni: H - 0.001 };
  const _v = new Vector3();

  function imposta(Tin) {
    const T = Math.min(5, Math.max(0, +Tin || 0)); Tcorr = T;
    const rx = rilievoX(T);
    US.uScan.value = T > 0.7 ? 100 : rx;
    // la luce: mezzogiorno alto sulla pianta, pomeriggio radente negli interni, sera nell'atto 5
    const scende = liscio(seg(T, 2.10, 2.40)), risale = liscio(seg(T, 3.02, 3.40)), tram = liscio(seg(T, 4.0, 4.45));
    const dentro = scende * (1 - risale);
    // camera prima di tutto: il taglio degli interni dipende da dove sta
    const k = inquadra(T, dentro);
    sx = k.sx; sy = k.sy;
    camera.up.copy(k.up); camera.position.copy(k.pos); camera.lookAt(k.tgt);
    const dist = k.pos.distanceTo(k.tgt), interno = k.pos.y < H + 0.4 && k.pos.y > -0.5 && T > 2.28 && T < 3.05;
    camera.near = interno ? 0.03 : Math.max(0.1, dist - 40); camera.far = dist + 70;
    ottica(k.f);
    // il taglio: 1,10 in pianta, sale coi muri (atto 2); negli interni segue la camera (casa di bambola)
    let cut = lerp(PLAN.CUT, H - 0.001, liscio(seg(T, 1.76, 1.96)));
    const wCam = liscio(seg(T, 2.38, 2.42)) * (1 - liscio(seg(T, 3.04, 3.16)));
    if (wCam > 0) { const cc = k.pos.y > 2.55 ? 2.40 : lerp(H - 0.001, 2.40, liscio(seg(k.pos.y, 1.60, 2.55))); cut = lerp(cut, Math.min(cut, cc), wCam); }
    if (T > 3.16) cut = 100;
    // atto 1: quote e cifre, archi e finestre in pianta
    const qOp = liscio(seg(T, 0.35, 0.60)) * (1 - seg(T, 1.0, 1.1));
    M.quota.opacity = qOp; M.cifre.opacity = qOp; quote.visible = cifre.visible = qOp > 0.001;
    M.arco.opacity = 0.6 * (1 - seg(T, 2.02, 2.16)); lArchi.visible = M.arco.opacity > 0.001;
    M.finestre.opacity = 0.6 * (1 - seg(T, 1.76, 1.90)); lFinestre.visible = M.finestre.opacity > 0.001;
    // atto 2: i fogli arrivano a ventaglio, la planimetria scende e si posa sulla sezione a 1:1
    docs.forEach((d, i) => {
      const arr = esce(seg(T, 1.04 + i * 0.08, 1.18 + i * 0.08));
      const stack = _v.set(7.0 + i * 1.05, 5.0 + i * 0.3, 2.6 + (i % 2) * 0.9), fuori = new Vector3(14 + i, 16, -8);
      d.visible = arr > 0 && T < 1.80;
      d.position.copy(fuori).lerp(stack, arr); d.rotation.set(0, lerp(0.9, -0.16 + i * 0.1, arr), 0);
      let sc = 1;
      if (i === 1) {
        const posa = liscio(seg(T, 1.44, 1.60));
        d.position.lerp(new Vector3(6.0, PLAN.CUT + 0.02, 4.7), posa); d.rotation.y = lerp(d.rotation.y, 0, posa); sc = lerp(0.3, 1.0, posa);
        // posata, la carta diventa un lucido: si vedono insieme il disegno (blu) e il costruito (chiaro)
        const luc = liscio(seg(T, 1.52, 1.60));
        d.material.opacity = (1 - luc) * (1 - seg(T, 1.72, 1.80));
        lucido.visible = luc > 0; lucido.material.opacity = 0.92 * luc * (1 - seg(T, 1.72, 1.80));
      } else { const via = liscio(seg(T, 1.52, 1.66)); d.position.lerp(new Vector3(18, 12, 0.5 + i), via); d.material.opacity = 1 - via; }
      d.scale.setScalar(sc);
    });
    // la linea del tramezzo sulla carta: pulsa due volte (non combacia), resta accesa, poi scivola al suo posto
    const luc = liscio(seg(T, 1.52, 1.60)), fuoco = T >= 1.60;
    M.carta.color.copy(luc > 0.5 ? cMisura : cCartaNera);
    const p = seg(T, 1.60, 1.625), batte = p > 0 && p < 1 ? 0.35 + 0.65 * (0.5 - 0.5 * Math.cos(p * Math.PI * 4)) : 1;
    M.carta.opacity = (fuoco ? batte : lerp(1, 0.92, luc)) * (1 - seg(T, 1.72, 1.80));
    lineaCarta.position.z = zCarta(T) - 4.7; lineaCarta.scale.z = fuoco && T < 1.72 ? 1.35 : 1;
    // atto 3: persiane, porte, arredi stanza per stanza
    for (const pz of persiane) {
      const u = liscio(seg(T, 2.02 + pz.k * 0.012, 2.11 + pz.k * 0.012));
      pz.piv.visible = T > 1.76; pz.piv.rotation.y = pz.lato * pz.verso * 100 * GRADI * u;
    }
    const conArredi = T > 2.04 && T < 4.3; for (const a of arredi) if (a) a.visible = conArredi;
    ORDINE_ARREDI.forEach((s, i) => { const u = seg(T, 2.04 + i * 0.022, 2.11 + i * 0.022); UA.uCade.value[i + 1] = u > 0 ? (1 - esce(u)) * 0.25 : -100; UA.uAlza.value[i + 1] = lerp(0.94, 1, esce(u)); });
    vetroDoccia.visible = seg(T, 2.04 + 7 * 0.022, 2.11 + 7 * 0.022) > 0.6;
    const ap = liscio(seg(T, 2.04, 2.18)); for (const pp of porte) { pp.visible = ap > 0; pp.rotation.y = pp.userData.base + pp.userData.apre * ap; }
    M.ao.opacity = 0.30 * seg(T, 2.04, 2.22) * (1 - seg(T, 3.10, 3.20)); ao.visible = M.ao.opacity > 0.001;
    pian.visible = T > 1.76 && T < 3.6; M.ringhiera.opacity = 0.42 * seg(T, 1.78, 1.96) * (1 - seg(T, 3.3, 3.6));
    // luce
    let el = lerp(lerp(66, 20, scende), 32, risale), az = lerp(lerp(195, 212, scende), 228, risale);
    el = lerp(el, 8, tram); az = lerp(az, 262, tram);
    sole.position.copy(statoSole(el, az)); sole.intensity = lerp(lerp(3.0, 5.2, dentro), 0.18, tram);
    sole.color.copy(cSole).lerp(cSoleBasso, dentro).lerp(cTramonto, tram);
    scene.environmentIntensity = lerp(lerp(0.36, 0.46, dentro), 0.06, tram); cielo.intensity = lerp(lerp(0.55, 0.7, dentro), 0.03, tram);
    renderer.toneMappingExposure = lerp(1, 1.04, dentro);
    if (nord) nord.intensity = 8 * dentro;
    giorno.visible = T > 2.318 && T < 3.02; soffitto.castShadow = T > 2.28 && T < 3.04;
    // atto 4: la casa si chiude, il palazzo compare intorno, l'oggetto ruota verso chi guarda
    const chiude = liscio(seg(T, 3.18, 3.45)); solaio.visible = chiude > 0; solaio.position.set(0, lerp(12, H + 0.001, chiude), 0);
    const fant = liscio(seg(T, 3.3, 3.6)) * (1 - liscio(seg(T, 4.05, 4.4)) * 0.45); palazzo.visible = fant > 0.01; M.fantasma.opacity = 0.42 * fant;
    root.rotation.y = lerp(0.0, 0.32, liscio(seg(T, 3.15, 3.95))) + lerp(0, 0.18, liscio(seg(T, 4.0, 5.0)));
    terra.visible = T < 3.12; M.terra.opacity = 0.35 * (1 - seg(T, 3.02, 3.12));
    // atto 5: nero e oro, le finestre si accendono stanza per stanza
    M.intonaco.color.copy(cMuro).lerp(cNero, tram); M.sezione.color.copy(cLuce).lerp(cOro, tram);
    M.pietra.color.copy(cBianco).lerp(cNero, tram); M.lucido.color.copy(cBianco).lerp(cNero, tram * 0.92); M.persiana.color.copy(cBianco).lerp(cNero, tram * 0.6);
    M.filo.opacity = liscio(seg(T, 4.1, 4.5)); lFilo.visible = M.filo.opacity > 0.001; M.filoPieno.opacity = M.filo.opacity; filoPieno.visible = lFilo.visible;
    luci.visible = T > 4.15;
    for (const [st, t0] of Object.entries(ORDINE_LUCI)) { const u = liscio(seg(T, t0, t0 + 0.06)); mSera[st].opacity = 0.9 * u; mAlone[st].opacity = 0.34 * u; }
    // l'ombra si ricalcola solo dove cambia davvero; nelle finestre ferme una volta, nel loro stato canonico
    const fermo = fermoOmbra(T);
    if (!vivo) return;
    if (fermo && fermo === ombraChiave) {
      taglio.constant = cut; renderer.shadowMap.needsUpdate = false; renderer.render(scene, camera);
    } else if (fermo && Math.abs(taglioOmbra[fermo] - cut) > 1e-4) {
      taglio.constant = taglioOmbra[fermo]; renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera);
      taglio.constant = cut; renderer.shadowMap.needsUpdate = false; renderer.render(scene, camera);
    } else {
      taglio.constant = cut; renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera);
    }
    ombraChiave = fermo;
    ultimo = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  }

  function dimensiona(w, h, dpr, layout) {
    W0 = Math.max(1, w); H0 = Math.max(1, h); if (dpr) dprBase = dpr; if (layout) lay = layout;
    renderer.setPixelRatio(livello >= 1 ? Math.max(1, dprBase * 0.8) : dprBase); renderer.setSize(W0, H0, false);
    ombraChiave = null;
    if (Tcorr >= 0) imposta(Tcorr);
  }
  // la scala di qualita': solo verso il basso, mai di nuovo in alto nella stessa sessione
  function qualita(n) {
    if (!(n > livello)) return; livello = Math.min(3, n);
    if (livello >= 1) { renderer.setPixelRatio(Math.max(1, dprBase * 0.8)); renderer.setSize(W0, H0, false); }
    if (livello >= 2) { sole.shadow.mapSize.set(1024, 1024); sole.shadow.radius = 1.5; if (sole.shadow.map) { sole.shadow.map.dispose(); sole.shadow.map = null; } }
    if (livello >= 3) sole.castShadow = false;
    ombraChiave = null; if (Tcorr >= 0) imposta(Tcorr);
  }
  // i punti del mondo a cui la pagina aggancia etichette e pin
  const v = new Vector3();
  const ANCORE = { rogito: () => v.set(6.0, 4.40, 4.7), boom: () => v.set(6.0, 4.45, 4.7), noncombacia: () => v.set(7.56, PLAN.CUT + 0.05, zCarta(Tcorr)) };
  for (const s of PIANTA.stanze) { const r = PLAN.ROOMS.find((x) => x.id === s.id).rects[0]; ANCORE[s.id] = () => v.set((r[0] + r[2]) / 2, 0.05, (r[1] + r[3]) / 2); }
  function proietta(id) {
    const f = ANCORE[id]; if (!f || Tcorr < 0) return { x: 0, y: 0, visibile: false };
    f(); casa.updateWorldMatrix(true, false); casa.localToWorld(v);
    const davanti = v.clone().applyMatrix4(camera.matrixWorldInverse).z < 0;
    v.project(camera);
    const x = ((v.x + 1) / 2) * W0, y = ((1 - v.y) / 2) * H0;
    return { x, y, visibile: davanti && v.z < 1 && x > -40 && x < W0 + 40 && y > -40 && y < H0 + 40 };
  }
  function info() { return { dpr: +renderer.getPixelRatio().toFixed(2), profilo: leggero ? 'leggero' : 'pieno', qualita: livello, programs: renderer.info.programs ? renderer.info.programs.length : 0, calls: ultimo.calls || 0, tris: ultimo.tris || 0, layout: lay }; }
  function distruggi() {
    canvas.removeEventListener('webglcontextlost', perso); canvas.removeEventListener('webglcontextrestored', ripreso);
    const visti = new Set();
    scene.traverse((n) => { if (n.geometry && !visti.has(n.geometry)) { visti.add(n.geometry); n.geometry.dispose(); } const m = n.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { if (x.map) x.map.dispose(); x.dispose(); }); });
    for (const t of Object.values(T_)) t.dispose();
    ombraMat.dispose(); envRT.dispose(); renderer.dispose();
  }

  // ── 4. compilazione: tutto visibile un attimo, cosi' nessuno shader nasce durante lo scroll ──
  await idle();
  W0 = o.larghezza || W0; H0 = o.altezza || H0;
  renderer.setPixelRatio(dprBase); renderer.setSize(W0, H0, false);
  for (const t of Object.values(T_)) renderer.initTexture(t);
  await idle();
  const accesi = [solaio, palazzo, pian, luci, giorno, ao, vetroDoccia, lucido, quote, cifre, ...docs, ...porte, ...persiane.map((p) => p.piv)];
  vivo = false; imposta(2.6); vivo = true;
  accesi.forEach((g) => { g.visible = true; });
  try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); } catch (e) { /* compila al primo disegno */ }
  imposta(2.6);
  ombraChiave = null; imposta(0);
  return { imposta, proietta, dimensiona, qualita, info, distruggi, renderer, scene, camera };
}
