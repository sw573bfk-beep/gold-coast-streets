// ============================================================================
// Gold Coast Streets — street-level detail: signs, street names, traffic lights,
// crossings, furniture, the G:link tram, Q1, the Timezone octopus, the arch, the beach
// ============================================================================
const D = MAP.details;
const NIGHT_MATS = []; // { mat, day, night } — emissive follows the clock
const nightMat = (mat, day, night) => { NIGHT_MATS.push({ mat, day, night }); return mat; };

// ---------------------------------------------------------------- road lookups
const RSEG = [], RGRID = new Map(), RCELL = 25;
function buildRoadIndex() {
  if (RSEG.length) return;
  ROADS.forEach((r, ri) => {
    if (!(DRIVE.has(r.type) || r.type === RT.service || r.type === RT.pedestrian)) return;
    const p = r.p;
    for (let i = 0; i < p.length - 2; i += 2) {
      const id = RSEG.length; RSEG.push([p[i], p[i + 1], p[i + 2], p[i + 3], ri]);
      for (let gx = Math.floor(Math.min(p[i], p[i + 2]) / RCELL); gx <= Math.floor(Math.max(p[i], p[i + 2]) / RCELL); gx++)
        for (let gz = Math.floor(Math.min(p[i + 1], p[i + 3]) / RCELL); gz <= Math.floor(Math.max(p[i + 1], p[i + 3]) / RCELL); gz++) {
          const k = gx * 10000 + gz; let a = RGRID.get(k); if (!a) RGRID.set(k, (a = [])); a.push(id);
        }
    }
  });
}
function roadNear(x, z, filter, rad = 2) {
  let best = null;
  const gx0 = Math.floor(x / RCELL), gz0 = Math.floor(z / RCELL);
  for (let gx = gx0 - rad; gx <= gx0 + rad; gx++) for (let gz = gz0 - rad; gz <= gz0 + rad; gz++) {
    for (const id of RGRID.get(gx * 10000 + gz) || []) {
      const [ax, az, bx, bz, ri] = RSEG[id], r = ROADS[ri];
      if (filter && !filter(r)) continue;
      const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1, t = clamp(((x - ax) * ex + (z - az) * ez) / L2, 0, 1);
      const cx = ax + ex * t, cz = az + ez * t, d = Math.hypot(x - cx, z - cz);
      if (!best || d < best.d) { const L = Math.sqrt(L2); best = { d, cx, cz, tx: ex / L, tz: ez / L, w: r.w, r }; }
    }
  }
  return best;
}
const isDrive = (r) => DRIVE.has(r.type);

// ---------------------------------------------------------------- text atlases
const FONT = { cond: '"Barlow Condensed", "Arial Narrow", sans-serif', display: '"Bowlby One", Impact, sans-serif', serif: 'Georgia, "Times New Roman", serif' };
class AtlasPool {
  constructor(slotW, slotH, size = 2048) { this.sw = slotW; this.sh = slotH; this.size = size; this.list = []; }
  slot() {
    let A = this.list[this.list.length - 1];
    if (!A || A.n >= A.cols * A.rows) {
      const c = document.createElement('canvas'); c.width = c.height = this.size;
      A = { c, ctx: c.getContext('2d'), n: 0, cols: Math.floor(this.size / this.sw), rows: Math.floor(this.size / this.sh), B: newBuf(), F: newBuf() };
      this.list.push(A);
    }
    const i = A.n++, x = (i % A.cols) * this.sw, y = Math.floor(i / A.cols) * this.sh, S = this.size;
    return { A, x, y, w: this.sw, h: this.sh, uv: { u0: x / S, u1: (x + this.sw) / S, v0: 1 - (y + this.sh) / S, v1: 1 - y / S } };
  }
  meshes(matFn, frameMat) {
    for (const A of this.list) {
      const t = new THREE.CanvasTexture(A.c); t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO;
      scene.add(new THREE.Mesh(toGeometry(A.B), matFn(t)));
      if (frameMat && A.F.pos.length) { const m = new THREE.Mesh(toGeometry(A.F), frameMat); m.castShadow = true; scene.add(m); }
    }
  }
}
function pushTri(B, a, b, c, ua, ub, uc, nx, ny, nz, colr) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * nx + cy * ny + cz * nz < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; }
  B.pos.push(...a, ...b, ...c);
  if (ua) B.uv.push(...ua, ...ub, ...uc);
  for (let i = 0; i < 3; i++) { B.nor.push(nx, ny, nz); if (colr) B.col.push(colr.r, colr.g, colr.b); }
}
// vertical quad centred at (cx,cy,cz) facing (nx,nz); text reads left-to-right for a viewer in front
function quadInto(B, cx, cy, cz, nx, nz, w, h, uv, colr) {
  const rx = nz, rz = -nx, hw = w / 2, hh = h / 2;
  const p00 = [cx - rx * hw, cy - hh, cz - rz * hw], p10 = [cx + rx * hw, cy - hh, cz + rz * hw];
  const p11 = [cx + rx * hw, cy + hh, cz + rz * hw], p01 = [cx - rx * hw, cy + hh, cz - rz * hw];
  const U = uv ? [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]] : [null, null, null, null];
  pushTri(B, p00, p10, p11, U[0], U[1], U[2], nx, 0, nz, colr);
  pushTri(B, p00, p11, p01, U[0], U[2], U[3], nx, 0, nz, colr);
}
function fitFont(ctx, text, maxW, maxH, weight, fam) {
  let size = maxH; ctx.font = `${weight} ${size}px ${fam}`;
  const w = ctx.measureText(text).width; if (w > maxW) size = Math.max(8, size * maxW / w);
  ctx.font = `${weight} ${Math.floor(size)}px ${fam}`;
}

// ---------------------------------------------------------------- shop signs
const BRANDS = [
  [/mcdonald/i, { bg: '#da291c', fg: '#ffc72c', font: 'display' }], [/hungry jack/i, { bg: '#d62300', fg: '#ffb000', font: 'display' }],
  [/^kfc/i, { bg: '#a3080c', fg: '#ffffff', font: 'display' }], [/subway/i, { bg: '#008c15', fg: '#ffc600', font: 'display' }],
  [/domino/i, { bg: '#006491', fg: '#ffffff', font: 'display' }], [/coles/i, { bg: '#e01a22', fg: '#ffffff', font: 'display' }],
  [/woolworths/i, { bg: '#125430', fg: '#ffffff' }], [/7-eleven/i, { bg: '#ffffff', fg: '#008163', stripe: '#ee2526' }],
  [/timezone/i, { bg: '#2a0f5c', fg: '#ffd400', font: 'display', neon: '#ff3fd2' }], [/ripley/i, { bg: '#c8102e', fg: '#ffd200', font: 'display' }],
  [/billabong/i, { bg: '#111111', fg: '#ffffff', font: 'display' }], [/roxy/i, { bg: '#ffffff', fg: '#e4007c', font: 'display' }],
  [/cotton on/i, { bg: '#ffffff', fg: '#111111' }], [/sportsgirl/i, { bg: '#000000', fg: '#ffffff', font: 'serif' }],
  [/universal store/i, { bg: '#000000', fg: '#ffffff' }], [/adidas/i, { bg: '#000000', fg: '#ffffff', font: 'display' }],
  [/ugg/i, { bg: '#f3eee6', fg: '#2b2b2b', font: 'display' }], [/starbucks/i, { bg: '#00704a', fg: '#ffffff' }],
  [/hard rock/i, { bg: '#111111', fg: '#f2c230', font: 'display' }], [/hilton/i, { bg: '#0e3a6b', fg: '#ffffff', font: 'serif' }],
  [/marriott/i, { bg: '#7a1f2b', fg: '#ffffff', font: 'serif' }], [/novotel/i, { bg: '#1d3f8f', fg: '#ffffff' }],
  [/mantra/i, { bg: '#1d1d1b', fg: '#d7b56d', font: 'serif' }], [/infinity/i, { bg: '#050505', fg: '#ffffff', font: 'display', rainbow: true }],
  [/chemist warehouse/i, { bg: '#ed1c24', fg: '#ffde00', font: 'display' }], [/priceline/i, { bg: '#e4007c', fg: '#ffffff' }],
  [/oporto/i, { bg: '#ffdd00', fg: '#d0021b', font: 'display' }], [/guzman/i, { bg: '#111111', fg: '#ffffff' }],
  [/zambrero/i, { bg: '#e3262f', fg: '#ffffff' }], [/boost/i, { bg: '#e2007a', fg: '#ffffff', font: 'display' }],
  [/bottlemart|bws|liquorland|dan murphy/i, { bg: '#1c3f2c', fg: '#ffffff' }], [/newsxpress|newsagen/i, { bg: '#c8102e', fg: '#ffffff' }],
  [/surf life|slsc|lifesav/i, { bg: '#ffd400', fg: '#d0021b', font: 'display' }], [/police/i, { bg: '#1a3f9a', fg: '#ffffff' }],
  [/wax museum/i, { bg: '#5a1020', fg: '#f4d27a', font: 'serif' }], [/sporting globe/i, { bg: '#0b2a4a', fg: '#ffffff', font: 'display' }],
  [/waxy/i, { bg: '#0f4d2a', fg: '#f2e2b3', font: 'serif' }], [/cavill hotel/i, { bg: '#20201e', fg: '#e8c77a', font: 'serif' }],
];
const CAT_STYLE = [
  { bg: '#b3261e', fg: '#fff4d6', font: 'display' }, { bg: '#4a2c1d', fg: '#f5e6c8', font: 'serif' }, { bg: '#120a1f', fg: '#ff5fe0', neon: '#ff5fe0' },
  { bg: '#1f3b57', fg: '#ffffff' }, { bg: '#1b1b1b', fg: '#d9b45a', font: 'serif' }, { bg: '#4b1d8a', fg: '#ffd400', font: 'display' },
  { bg: '#111111', fg: '#ffffff' }, { bg: '#0d5c8c', fg: '#ffffff' },
];
const styleFor = (name, cat) => { for (const [re, st] of BRANDS) if (re.test(name)) return st; return CAT_STYLE[cat] || CAT_STYLE[3]; };
function drawSign(ctx, x, y, W, H, text, st) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = st.bg; ctx.fillRect(0, 0, W, H);
  if (st.stripe) { ctx.fillStyle = st.stripe; ctx.fillRect(0, H - 8, W, 8); ctx.fillStyle = '#f7941d'; ctx.fillRect(0, H - 14, W, 6); }
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 3; ctx.strokeRect(3, 3, W - 6, H - 6);
  const fam = FONT[st.font || 'cond'], weight = st.font === 'serif' ? '700' : st.font === 'display' ? '400' : '700';
  const label = st.font === 'serif' ? text : text.toUpperCase();
  fitFont(ctx, label, W * 0.9, H * 0.66, weight, fam);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (st.neon) { ctx.shadowColor = st.neon; ctx.shadowBlur = 14; }
  if (st.rainbow) {
    const g = ctx.createLinearGradient(W * 0.1, 0, W * 0.9, 0);
    ['#ff3b3b', '#ffb13b', '#f6f23b', '#3bff6e', '#3bc8ff', '#a43bff'].forEach((c, i) => g.addColorStop(i / 5, c));
    ctx.fillStyle = g;
  } else ctx.fillStyle = st.fg;
  ctx.fillText(label, W / 2, H / 2 + 2);
  ctx.restore();
}
let INFINITY_MAT = null;
function buildSigns() {
  const pool = new AtlasPool(384, 64);
  const frameCol = col('#2a2d30');
  for (const [x, z, nx, nz, w, y, cat, name] of D.signs) {
    const S = pool.slot(), st = styleFor(name, cat);
    drawSign(S.A.ctx, S.x, S.y, S.w, S.h, name, st);
    const h = Math.min(1.1, Math.max(0.6, w / 6));
    quadInto(S.A.B, x + nx * 0.06, y, z + nz * 0.06, nx, nz, w, h, S.uv);
    quadInto(S.A.F, x, y, z, nx, nz, w + 0.16, h + 0.16, null, frameCol);
  }
  // free-standing signs on poles (kiosks, places not attached to a building)
  const poles = [];
  for (const [x, z, cat, name] of D.freeSigns) {
    const S = pool.slot(), st = styleFor(name, cat);
    drawSign(S.A.ctx, S.x, S.y, S.w, S.h, name, st);
    const rd = roadNear(x, z, null);
    let nx = 1, nz = 0;
    if (rd && rd.d > 0.5) { nx = (rd.cx - x) / rd.d; nz = (rd.cz - z) / rd.d; }
    const w = Math.min(3.4, Math.max(1.8, 0.3 * name.length + 0.8));
    quadInto(S.A.B, x + nx * 0.05, 2.7, z + nz * 0.05, nx, nz, w, 0.7, S.uv);
    quadInto(S.A.B, x - nx * 0.05, 2.7, z - nz * 0.05, -nx, -nz, w, 0.7, S.uv);
    poles.push([x, z]);
  }
  pool.meshes((t) => nightMat(new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: col('#ffffff'), emissiveIntensity: 0, roughness: 0.6 }), 0.0, 0.9),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
  const pg = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6); pg.translate(0, 1.2, 0);
  const pm = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: col('#6f7478'), metalness: 0.5 }), poles.length);
  const m4 = new THREE.Matrix4();
  poles.forEach(([x, z], i) => { m4.makeTranslation(x, 0, z); pm.setMatrixAt(i, m4); });
  scene.add(pm);

  // tower names near the top: lit letters, the way Surfers towers wear them
  const tp = new AtlasPool(512, 64);
  for (const [x, z, nx, nz, w, y, name] of D.towerSigns) {
    const S = tp.slot(), ctx = S.A.ctx;
    ctx.save(); ctx.translate(S.x, S.y);
    fitFont(ctx, name.toUpperCase(), S.w * 0.96, S.h * 0.8, '700', FONT.cond);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff';
    ctx.fillText(name.toUpperCase(), S.w / 2, S.h / 2 + 2);
    ctx.restore();
    quadInto(S.A.B, x + nx * 0.1, y, z + nz * 0.1, nx, nz, w, w / 8, S.uv);
  }
  tp.meshes((t) => nightMat(new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.35, emissiveMap: t, emissive: col('#fff3d6'), emissiveIntensity: 0, roughness: 0.5 }), 0.15, 1.6));
}

// ---------------------------------------------------------------- street-name blades on every corner
function buildStreetSigns() {
  const blades = new Map(); // street name -> atlas slot
  const pool = new AtlasPool(256, 40);
  const bladeFor = (name) => {
    if (blades.has(name)) return blades.get(name);
    const S = pool.slot(), ctx = S.A.ctx;
    ctx.save(); ctx.translate(S.x, S.y);
    ctx.fillStyle = '#0d3b86'; ctx.fillRect(0, 0, S.w, S.h);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.strokeRect(3, 3, S.w - 6, S.h - 6);
    const short = name.replace(/ Avenue$/, ' Av').replace(/ Street$/, ' St').replace(/ Boulevard$/, ' Bvd').replace(/ Parade$/, ' Pde').replace(/ Drive$/, ' Dr').replace(/ Highway$/, ' Hwy').replace(/ Court$/, ' Ct').replace(/ Esplanade$/, ' Esp');
    fitFont(ctx, short, S.w * 0.88, S.h * 0.7, '700', FONT.cond);
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(short, S.w / 2, S.h / 2 + 1);
    ctx.restore();
    blades.set(name, S); return S;
  };
  const placed = [];
  const poles = [];
  for (const [node, list] of PADJ_ALL) {
    const named = [];
    for (const o of list) { const E = EDGES[o.e]; if (E.name && !named.some((n) => n.name === E.name)) named.push({ name: E.name, E, dir: o.dir }); }
    if (named.length < 2) continue;
    const a = named[0], b = named[1];
    const x = GN[node * 2], z = GN[node * 2 + 1];
    if (placed.some((p) => Math.abs(p[0] - x) < 45 && Math.abs(p[1] - z) < 45 && p[2] === a.name + b.name)) continue;
    placed.push([x, z, a.name + b.name]);
    const ta = edgePoint(a.E, a.dir, Math.min(6, a.E.len), {}), tb = edgePoint(b.E, b.dir, Math.min(6, b.E.len), {});
    let bx = ta.tx + tb.tx, bz = ta.tz + tb.tz; const bl = Math.hypot(bx, bz);
    if (bl < 0.2) { bx = -ta.tz; bz = ta.tx; } else { bx /= bl; bz /= bl; }
    const off = Math.max(a.E.width, b.E.width) / 2 + 2.0;
    const px = x + bx * off * 1.35, pz = z + bz * off * 1.35;
    if (!isLand(px, pz)) continue;
    poles.push([px, pz]);
    for (const [s, hgt] of [[a, 3.05], [b, 2.75]]) {
      const S = bladeFor(s.name), t = s === a ? ta : tb;
      const nx = -t.tz, nz = t.tx; // blade runs along its street
      quadInto(S.A.B, px + nx * 0.02, hgt, pz + nz * 0.02, nx, nz, 1.9, 0.3, S.uv);
      quadInto(S.A.B, px - nx * 0.02, hgt, pz - nz * 0.02, -nx, -nz, 1.9, 0.3, S.uv);
    }
  }
  pool.meshes((t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, side: THREE.FrontSide }));
  const pg = new THREE.CylinderGeometry(0.045, 0.045, 3.25, 6); pg.translate(0, 1.62, 0);
  const pm = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: col('#8c9296'), metalness: 0.6, roughness: 0.4 }), poles.length);
  const m4 = new THREE.Matrix4();
  poles.forEach(([x, z], i) => { m4.makeTranslation(x, 0, z); pm.setMatrixAt(i, m4); addBox(x, z, 0.08, 3); });
  scene.add(pm);
}
const PADJ_ALL = new Map();
EDGES.forEach((E, i) => { for (const [n, dir] of [[E.a, 1], [E.b, -1]]) { let a = PADJ_ALL.get(n); if (!a) PADJ_ALL.set(n, (a = [])); a.push({ e: i, dir }); } });

// ---------------------------------------------------------------- traffic lights (cycle, and traffic obeys them)
const SIGNALS = [];
let signalLamps = null, signalClock = 0;
const SIG_CYCLE = 28;
function signalState(axis, t = signalClock) { // 0 green, 1 amber, 2 red
  const p = ((t % SIG_CYCLE) + SIG_CYCLE) % SIG_CYCLE, q = axis ? (p + 14) % SIG_CYCLE : p;
  return q < 11 ? 0 : q < 14 ? 1 : 2;
}
function buildTrafficLights() {
  const heads = [];
  for (const [x, z] of D.props.signal) {
    const rd = roadNear(x, z, isDrive, 1); if (!rd || rd.d > 6) continue;
    const axis = Math.abs(rd.tx) > Math.abs(rd.tz) ? 1 : 0;
    const nx = -rd.tz, nz = rd.tx, off = rd.w / 2 + 0.9;
    let px = rd.cx + nx * off, pz = rd.cz + nz * off;
    if (!isLand(px, pz)) { px = rd.cx - nx * off; pz = rd.cz - nz * off; }
    if (SIGNALS.some((s) => Math.abs(s.px - px) < 3 && Math.abs(s.pz - pz) < 3)) continue;
    SIGNALS.push({ x: rd.cx, z: rd.cz, px, pz, axis });
    heads.push({ px, pz, tx: rd.tx, tz: rd.tz, axis });
    addBox(px, pz, 0.1, 3.5);
  }
  const pole = new THREE.CylinderGeometry(0.07, 0.09, 3.6, 6); pole.translate(0, 1.8, 0);
  const box1 = new THREE.BoxGeometry(0.34, 0.95, 0.26); box1.translate(0, 3.1, 0);
  const metal = new THREE.MeshStandardMaterial({ color: col('#2b2f33'), roughness: 0.6 });
  const pm = new THREE.InstancedMesh(pole, metal, heads.length), bm = new THREE.InstancedMesh(box1, metal, heads.length * 2);
  const lamp = new THREE.SphereGeometry(0.095, 8, 6);
  signalLamps = new THREE.InstancedMesh(lamp, new THREE.MeshBasicMaterial({ toneMapped: false }), heads.length * 6);
  signalLamps.userData.heads = heads;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  heads.forEach((hd, i) => {
    m4.makeTranslation(hd.px, 0, hd.pz); pm.setMatrixAt(i, m4);
    for (const s of [1, -1]) { // two faces: one for each direction of travel
      const fx = hd.tx * s, fz = hd.tz * s; // traffic approaching from +s sees a face pointing back at it
      e.set(0, Math.atan2(-fx, -fz), 0); q.setFromEuler(e);
      m4.compose(v.set(hd.px - fx * 0.0, 0, hd.pz - fz * 0.0), q, one); bm.setMatrixAt(i * 2 + (s > 0 ? 0 : 1), m4);
      for (let k = 0; k < 3; k++) {
        m4.makeTranslation(hd.px - fx * 0.14, 3.42 - k * 0.3, hd.pz - fz * 0.14);
        signalLamps.setMatrixAt(i * 6 + (s > 0 ? 0 : 3) + k, m4);
      }
    }
  });
  pm.castShadow = true;
  scene.add(pm, bm, signalLamps);
  updateSignalLamps(true);
}
const LAMP_ON = [col('#2bff6a'), col('#ffb000'), col('#ff2a2a')], LAMP_OFF = col('#1a1c1e');
let lastSigPhase = -1;
function updateSignalLamps(force) {
  if (!signalLamps) return;
  const ph = Math.floor(signalClock * 2);
  if (!force && ph === lastSigPhase) return;
  lastSigPhase = ph;
  const heads = signalLamps.userData.heads;
  heads.forEach((hd, i) => {
    const st = signalState(hd.axis);
    for (const base of [0, 3]) for (let k = 0; k < 3; k++) {
      const on = (k === 0 && st === 2) || (k === 1 && st === 1) || (k === 2 && st === 0);
      signalLamps.setColorAt(i * 6 + base + k, on ? LAMP_ON[2 - k] : LAMP_OFF);
    }
  });
  signalLamps.instanceColor.needsUpdate = true;
}
// distance to a red/amber light ahead of a car, or Infinity
function redLightAhead(car) {
  const fx = Math.sin(car.h), fz = Math.cos(car.h), axis = Math.abs(fx) > Math.abs(fz) ? 1 : 0;
  let best = Infinity;
  for (const s of SIGNALS) {
    const dx = s.x - car.x, dz = s.z - car.z;
    if (Math.abs(dx) > 40 || Math.abs(dz) > 40 || s.axis !== axis) continue;
    const al = dx * fx + dz * fz; if (al < 3 || al > 38) continue;
    if (Math.abs(dx * fz - dz * fx) > 9) continue;
    const st = signalState(s.axis);
    if (st === 2 || (st === 1 && al > 14)) best = Math.min(best, al);
  }
  return best;
}

// ---------------------------------------------------------------- crossings, tram tracks, furniture
function buildCrossings(markB) {
  for (const [x, z, ang, zebra] of D.crossings) {
    const rd = roadNear(x, z, isDrive, 1); const W = rd ? rd.w : 8;
    const tx = Math.sin(ang), tz = Math.cos(ang), nx = tz, nz = -tx;
    if (zebra) {
      for (let o = -W / 2 + 0.5; o <= W / 2 - 0.4; o += 1.1) {
        const cx = x + nx * o, cz = z + nz * o, p = [cx - tx * 1.5, cz - tz * 1.5, cx + tx * 1.5, cz + tz * 1.5];
        ribbonInto(markB, p, 0, 0.28, 0.08, 12, 1);
      }
    } else {
      for (const s of [-1.6, 1.6]) { const cx = x + tx * s, cz = z + tz * s; ribbonInto(markB, [cx - nx * W / 2, cz - nz * W / 2, cx + nx * W / 2, cz + nz * W / 2], 0, 0.08, 0.08, 12, 1); }
    }
  }
}
function instanced(geo, mat, pts, orient, shadow) {
  const m = new THREE.InstancedMesh(geo, mat, pts.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  pts.forEach(([x, z], i) => {
    let a = 0;
    if (orient) { const rd = roadNear(x, z, null, 1); if (rd) a = Math.atan2(rd.cx - x, rd.cz - z); }
    e.set(0, a, 0); q.setFromEuler(e); m4.compose(v.set(x, 0, z), q, one); m.setMatrixAt(i, m4);
  });
  if (shadow) m.castShadow = true;
  scene.add(m); return m;
}
function buildProps() {
  const bench = mergeGeos([box(1.8, 0.06, 0.45, 0, 0.45, 0, '#8a5a35'), box(1.8, 0.4, 0.05, 0, 0.75, -0.22, '#8a5a35'), box(0.08, 0.45, 0.4, -0.8, 0.22, 0, '#3a3d40'), box(0.08, 0.45, 0.4, 0.8, 0.22, 0, '#3a3d40')]);
  const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  instanced(bench, vc, D.props.bench, true, true);
  D.props.bench.forEach(([x, z]) => addBox(x, z, 0.4, 0.8));
  const bin = mergeGeos([paintGeo(new THREE.CylinderGeometry(0.3, 0.27, 0.95, 10).translate(0, 0.47, 0), '#2f5a3a'), paintGeo(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 10).translate(0, 0.98, 0), '#c43a2a')]);
  const binM = instanced(bin, vc, D.props.bin, false, true);
  D.props.bin.forEach(([x, z], k) => addBreakable(x, z, [[binM, k]], 1, 'bin'));
  D.props.bin.forEach(([x, z]) => addBox(x, z, 0.3, 1));
  const shower = mergeGeos([paintGeo(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6).translate(0, 1.2, 0), '#c9ced2'), box(0.5, 0.05, 0.08, 0.22, 2.38, 0, '#c9ced2'), paintGeo(new THREE.CylinderGeometry(0.1, 0.06, 0.08, 8).translate(0.45, 2.32, 0), '#c9ced2'), box(0.9, 0.04, 0.9, 0, 0.02, 0, '#bdb6a8')]);
  instanced(shower, vc, D.props.shower, false, true);
  const bubbler = mergeGeos([box(0.3, 0.9, 0.3, 0, 0.45, 0, '#9aa2a6'), box(0.4, 0.06, 0.4, 0, 0.92, 0, '#b8bfc3')]);
  instanced(bubbler, vc, D.props.water, false, true);
  const shelter = mergeGeos([box(3.6, 0.08, 1.6, 0, 2.5, 0, '#e4e6e8'), box(3.6, 2.4, 0.04, 0, 1.25, -0.75, '#9fc4d4'), box(0.06, 2.5, 1.6, -1.78, 1.25, 0, '#5f6468'), box(0.06, 2.5, 1.6, 1.78, 1.25, 0, '#5f6468'), box(2.4, 0.06, 0.4, 0, 0.5, -0.5, '#5f6468'), box(0.5, 0.5, 0.05, 1.5, 2.15, 0.78, '#f2c200')]);
  const sm = instanced(shelter, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2, transparent: true, opacity: 0.92 }), D.props.bus.map(([x, z]) => { const rd = roadNear(x, z, isDrive, 1); return rd ? [x + (x - rd.cx) / (rd.d || 1) * 1.2, z + (z - rd.cz) / (rd.d || 1) * 1.2] : [x, z]; }), true, true);
  D.props.lamp = D.props.lamp.map(([x, z, ...rest]) => { const p = besideRoad(MAP.roads, x, z); return p && [p[0], p[1], ...rest]; }).filter(Boolean);
  const lampG = mergeGeos([paintGeo(new THREE.CylinderGeometry(0.06, 0.09, 5, 6).translate(0, 2.5, 0), '#55595d')]);
  const poleM = instanced(lampG, vc, D.props.lamp, false, true);
  const globe = new THREE.SphereGeometry(0.25, 10, 8).translate(0, 5.1, 0);
  const globeM = instanced(globe, nightMat(new THREE.MeshStandardMaterial({ color: col('#f4efe2'), emissive: col('#ffd8a0'), emissiveIntensity: 0 }), 0, 3), D.props.lamp, false);
  D.props.lamp.forEach(([x, z], k) => addBreakable(x, z, [[poleM, k], [globeM, k]], 5, 'lamp'));
  D.props.lamp.forEach(([x, z]) => addBox(x, z, 0.1, 5));
}

// ---------------------------------------------------------------- G:link light rail
const RAIL = []; // { p, cum, len }
const trams = [];
function railLine(p) { const cum = [0]; for (let i = 2; i < p.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1])); return { p, cum, len: cum[cum.length - 1] }; }
function railPoint(L, s, out) {
  s = clamp(s, 0, L.len); let i = 0; const c = L.cum; while (i < c.length - 2 && c[i + 1] < s) i++;
  const t = (s - c[i]) / ((c[i + 1] - c[i]) || 1), p = L.p;
  out.x = p[2 * i] + (p[2 * i + 2] - p[2 * i]) * t; out.z = p[2 * i + 1] + (p[2 * i + 3] - p[2 * i + 1]) * t;
  const l = Math.hypot(p[2 * i + 2] - p[2 * i], p[2 * i + 3] - p[2 * i + 1]) || 1;
  out.tx = (p[2 * i + 2] - p[2 * i]) / l; out.tz = (p[2 * i + 3] - p[2 * i + 1]) / l;
  return out;
}
function railProject(L, x, z) {
  let best = 1e18, bs = 0; const p = L.p;
  for (let i = 0; i < p.length / 2 - 1; i++) {
    const ax = p[2 * i], az = p[2 * i + 1], ex = p[2 * i + 2] - ax, ez = p[2 * i + 3] - az, L2 = ex * ex + ez * ez || 1;
    const t = clamp(((x - ax) * ex + (z - az) * ez) / L2, 0, 1), d = (x - ax - ex * t) ** 2 + (z - az - ez * t) ** 2;
    if (d < best) { best = d; bs = L.cum[i] + Math.sqrt(L2) * t; }
  }
  return { s: bs, d: Math.sqrt(best) };
}
function buildRail() {
  const steel = new THREE.MeshStandardMaterial({ color: col('#8d9297'), metalness: 0.9, roughness: 0.3 });
  const bed = new THREE.MeshStandardMaterial({ color: col('#7f8a6b'), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -10 });
  const R = newBuf(), Bd = newBuf();
  for (const p of D.rail) { ribbonInto(R, p, 0.72, 0.045, 0.1, 6, 1); ribbonInto(R, p, -0.72, 0.045, 0.1, 6, 1); ribbonInto(Bd, p, 0, 1.45, 0.07, 6, 1); }
  scene.add(new THREE.Mesh(toGeometry(Bd), bed), new THREE.Mesh(toGeometry(R), steel));
  for (const p of D.railLines) RAIL.push(railLine(p));
  if (RAIL.length < 1) return;
  // overhead poles and wire along the first line
  const L0 = RAIL[0], P = {}, poles = [], wire = [];
  let prev = null;
  for (let s = 10; s < L0.len; s += 42) {
    railPoint(L0, s, P);
    const other = RAIL[1] ? railProject(RAIL[1], P.x, P.z) : { d: 4 };
    const mx = P.x, mz = P.z;
    poles.push([mx + P.tz * -2.1 * (other.d > 0 ? 1 : 1), mz - P.tx * -2.1]);
    if (prev) wire.push(prev[0], 5.6, prev[1], mx, 5.6, mz);
    prev = [mx, mz];
  }
  const pg = new THREE.CylinderGeometry(0.11, 0.14, 6.2, 8); pg.translate(0, 3.1, 0);
  instanced(pg, new THREE.MeshStandardMaterial({ color: col('#e8e8e4'), roughness: 0.5 }), poles, false, true);
  poles.forEach(([x, z]) => addBox(x, z, 0.15, 6));
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x222222 })));
  // stations: platforms, shelters and the station name
  const pool = new AtlasPool(512, 64), plat = new THREE.MeshStandardMaterial({ color: col('#c9c4b8'), roughness: 0.9 });
  const roofM = new THREE.MeshStandardMaterial({ color: col('#f2f2ee'), roughness: 0.5 });
  for (const [sx, sz, name] of D.stations) {
    RAIL.forEach((L, li) => {
      const pr = railProject(L, sx, sz); if (pr.d > 40) return;
      railPoint(L, pr.s, P);
      const other = RAIL[1 - li] ? railProject(RAIL[1 - li], P.x, P.z) : null;
      let side = 1;
      if (other) { const Q = railPoint(RAIL[1 - li], other.s, {}); side = ((P.x - Q.x) * P.tz - (P.z - Q.z) * P.tx) >= 0 ? 1 : -1; }
      const nx = P.tz * side, nz = -P.tx * side, cx = P.x + nx * 2.9, cz = P.z + nz * 2.9;
      const a = Math.atan2(P.tx, P.tz);
      const pm = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.32, 40), plat); pm.position.set(cx, 0.16, cz); pm.rotation.y = a; pm.receiveShadow = true; scene.add(pm);
      const rf = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 14), roofM); rf.position.set(cx + nx * 0.2, 3.1, cz + nz * 0.2); rf.rotation.y = a; rf.castShadow = true; scene.add(rf);
      for (const o of [-6, 0, 6]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.8, 6), roofM); c.position.set(cx + nx * 0.9 + P.tx * o, 1.7, cz + nz * 0.9 + P.tz * o); scene.add(c); addBox(c.position.x, c.position.z, 0.1, 3); }
      const S = pool.slot(), ctx = S.A.ctx;
      ctx.save(); ctx.translate(S.x, S.y); ctx.fillStyle = '#0a6b6b'; ctx.fillRect(0, 0, S.w, S.h);
      ctx.fillStyle = '#ffd200'; ctx.beginPath(); ctx.arc(32, 32, 22, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0a6b6b'; ctx.font = `400 30px ${FONT.display}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('G', 32, 34);
      fitFont(ctx, name, S.w - 80, 40, '700', FONT.cond); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.fillText(name, 66, 34);
      ctx.restore();
      quadInto(S.A.B, cx + nx * 0.25 - nx * 0.02, 2.75, cz + nz * 0.25 - nz * 0.02, -nx, -nz, 4.0, 0.5, S.uv);
      quadInto(S.A.B, cx + nx * 0.25 + nx * 0.02, 2.75, cz + nz * 0.25 + nz * 0.02, nx, nz, 4.0, 0.5, S.uv);
    });
  }
  pool.meshes((t) => nightMat(new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: col('#ffffff'), emissiveIntensity: 0 }), 0, 0.8));
  RAIL.forEach((L) => { L.stops = D.stations.map(([x, z]) => railProject(L, x, z)).filter((p) => p.d < 40).map((p) => p.s).sort((a, b) => a - b); });
  // two trams, one on each track
  RAIL.forEach((L, li) => trams.push(new Tram(L, li === 0 ? L.len * 0.3 : L.len * 0.7, li === 0 ? 1 : -1)));
}
const TRAM_MOD = 8.7, TRAM_N = 5;
let tramGeos = null;
function tramGeometries() {
  if (tramGeos) return tramGeos;
  const body = (front) => mergeGeos([
    box(2.65, 2.0, TRAM_MOD - 0.3, 0, 1.45, 0, '#f4f4f0'),
    box(2.67, 1.15, TRAM_MOD - 0.6, 0, 2.15, 0, '#1d262c'),
    box(2.68, 0.32, TRAM_MOD - 0.3, 0, 0.62, 0, '#0a8a7a'),
    box(2.5, 0.4, TRAM_MOD - 0.5, 0, 3.05, 0, '#e8e8e4'),
    ...(front ? [box(2.4, 1.3, 0.3, 0, 2.0, TRAM_MOD / 2 - 0.1, '#141a1e'), box(2.5, 0.25, 0.2, 0, 0.9, TRAM_MOD / 2 - 0.05, '#f2c200')] : []),
    box(2.0, 0.5, 1.0, 0, 0.25, -TRAM_MOD / 2 + 1.2, '#2a2a2a'), box(2.0, 0.5, 1.0, 0, 0.25, TRAM_MOD / 2 - 1.2, '#2a2a2a'),
  ]);
  return (tramGeos = { mid: body(false), front: body(true) });
}
const tramMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.1 });
class Tram {
  constructor(L, s, dir) {
    this.L = L; this.s = s; this.dir = dir; this.v = 0; this.dwell = 0; this.mods = [];
    const G = tramGeometries();
    for (let k = 0; k < TRAM_N; k++) {
      const m = new THREE.Mesh(k === 0 || k === TRAM_N - 1 ? G.front : G.mid, tramMat); m.castShadow = true; scene.add(m);
      this.mods.push({ m, x: 0, z: 0, tx: 0, tz: 1 });
    }
    this.place();
  }
  place() {
    const P = {};
    this.mods.forEach((md, k) => {
      const s = this.s - this.dir * (k * TRAM_MOD + TRAM_MOD / 2);
      railPoint(this.L, s, P);
      md.x = P.x; md.z = P.z; md.tx = P.tx * this.dir; md.tz = P.tz * this.dir;
      md.m.position.set(P.x, 0.12, P.z);
      md.m.rotation.y = Math.atan2(md.tx, md.tz) + (k === TRAM_N - 1 ? Math.PI : 0);
    });
  }
  update(dt) {
    const L = this.L;
    if (this.dwell > 0) { this.dwell -= dt; if (this.dwell <= 0) { this.v = 0.5; if (Math.hypot(this.mods[0].x - player.x, this.mods[0].z - player.z) < 80) sfxTone([1200, 1500], 0.25, 0.04, 'sine'); } return this.place(); }
    let vt = 12.5;
    // next stop ahead
    const ahead = L.stops.map((s) => (s - this.s) * this.dir).filter((d) => d > 0.5);
    const dStop = ahead.length ? Math.min(...ahead) : Infinity;
    if (dStop < 70) vt = Math.min(vt, Math.max(1.2, Math.sqrt(2 * 1.1 * dStop)));
    if (dStop < 1.5 && this.v < 2.5) { this.dwell = 14; this.v = 0; this.s += this.dir * dStop; return this.place(); }
    // line end: wait then turn back
    const end = this.dir > 0 ? L.len - this.s : this.s;
    if (end < 60) vt = Math.min(vt, Math.max(0.8, Math.sqrt(2 * 1.1 * end)));
    if (end < 1) { this.dir = -this.dir; this.s += this.dir * (TRAM_N * TRAM_MOD); this.dwell = 10; return this.place(); }
    // something on the track ahead
    const P = {};
    for (const d of [6, 14, 24]) {
      railPoint(L, this.s + this.dir * d, P);
      const blocked = (x, z) => Math.abs(x - P.x) < 2.6 && Math.abs(z - P.z) < 2.6;
      if ((player.deadT === 0 && blocked(player.x, player.z)) || cars.some((c) => blocked(c.x, c.z))) { vt = Math.min(vt, Math.max(0, d - 6) * 0.4); if (rand() < dt * 0.6 && d < 15) sfxTone([900, 1100], 0.2, 0.03, 'sine'); break; }
    }
    this.v += clamp(vt - this.v, -2.4 * dt, 1.2 * dt);
    this.s += this.dir * this.v * dt;
    this.place();
  }
  // push people and cars out of the tram's footprint
  shove(x, z, r) {
    for (const md of this.mods) {
      const dx = x - md.x, dz = z - md.z, al = dx * md.tx + dz * md.tz, la = dx * md.tz - dz * md.tx;
      if (Math.abs(al) < TRAM_MOD / 2 + r && Math.abs(la) < 1.35 + r) {
        const push = 1.35 + r - Math.abs(la), s = Math.sign(la) || 1;
        return { x: x + md.tz * push * s, z: z - md.tx * push * s, nx: md.tz * s, nz: -md.tx * s, v: this.v };
      }
    }
    return null;
  }
}
function updateTrams(dt) {
  signalClock += dt; updateSignalLamps(false);
  for (const t of trams) {
    t.update(dt);
    if (player.mode === 'foot' && player.deadT === 0) {
      const h = t.shove(player.x, player.z, 0.35);
      if (h) { player.x = h.x; player.z = h.z; if (h.v > 4 && player.stun <= 0) { damagePlayer(h.v * 2); knockPlayer(h.nx * 6, h.nz * 6); } }
    }
    for (const c of cars) {
      for (const s of c.offs) {
        const fx = Math.sin(c.h), fz = Math.cos(c.h), h = t.shove(c.x + fx * s, c.z + fz * s, c.r);
        if (!h) continue;
        c.x += h.x - (c.x + fx * s); c.z += h.z - (c.z + fz * s);
        const vn = c.vx * h.nx + c.vz * h.nz; if (vn < 0) { c.vx -= 1.4 * vn * h.nx; c.vz -= 1.4 * vn * h.nz; if (-vn > 3) c.crash(-vn); }
      }
    }
  }
}

// ---------------------------------------------------------------- hero buildings
function footCentroid(f) { let x = 0, z = 0; const n = f.length / 2; for (let i = 0; i < n; i++) { x += f[2 * i]; z += f[2 * i + 1]; } return [x / n, z / n]; }
function buildQ1() {
  const f = Q1_FOOT; if (!f) return;
  const [cx, cz] = footCentroid(f), n = f.length / 2;
  for (let i = 0; i < n; i++) addSeg(f[2 * i], f[2 * i + 1], f[(2 * i + 2) % (2 * n)], f[(2 * i + 3) % (2 * n)], 240);
  const gold = col('#f1dfa8'), B = newBuf();
  let acc = 0;
  const TOP = 235;
  for (let i = 0; i < n; i++) {
    const ax = f[2 * i], az = f[2 * i + 1], bx = f[(2 * i + 2) % (2 * n)], bz = f[(2 * i + 3) % (2 * n)], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
    const s0 = B.pos.length; wallInto(B, ax, az, bx, bz, 0, TOP, (bz - az) / L, -(bx - ax) / L, gold);
    for (let k = s0; k < B.pos.length; k += 3) { const along = Math.abs(B.pos[k] - ax) + Math.abs(B.pos[k + 2] - az) < 1e-4 ? 0 : L; B.uv.push((acc + along) / 32, B.pos[k + 1] / 25.6); }
    acc += L;
  }
  const body = new THREE.Mesh(toGeometry(B), buildingMats.glass); body.castShadow = true; scene.add(body);
  // the crown narrows to the spire base; SkyPoint sits just under it
  const rings = [[TOP, 1], [241, 0.93], [248, 0.78], [255, 0.6], [262, 0.42], [268, 0.26]];
  const pos = [];
  const ringPt = (i, s) => [cx + (f[2 * (i % n)] - cx) * s, cz + (f[2 * (i % n) + 1] - cz) * s];
  for (let r = 0; r < rings.length - 1; r++) {
    const [y0, s0] = rings[r], [y1, s1] = rings[r + 1];
    for (let i = 0; i < n; i++) {
      const a0 = ringPt(i, s0), b0 = ringPt(i + 1, s0), a1 = ringPt(i, s1), b1 = ringPt(i + 1, s1);
      pos.push(a0[0], y0, a0[1], b0[0], y0, b0[1], b1[0], y1, b1[1], a0[0], y0, a0[1], b1[0], y1, b1[1], a1[0], y1, a1[1]);
    }
  }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.computeVertexNormals();
  const crown = new THREE.Mesh(cg, nightMat(new THREE.MeshStandardMaterial({ color: col('#c9d9e2'), metalness: 0.7, roughness: 0.2, side: THREE.DoubleSide, emissive: col('#9fd3ff'), emissiveIntensity: 0 }), 0, 0.6));
  scene.add(crown);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 4, 24, 1, true), nightMat(new THREE.MeshStandardMaterial({ color: col('#e7f4ff'), emissive: col('#bfe6ff'), emissiveIntensity: 0, transparent: true, opacity: 0.7, side: THREE.DoubleSide }), 0.1, 1.4));
  const sx = Math.max(...Array.from({ length: n }, (_, i) => Math.abs(f[2 * i] - cx))), sz = Math.max(...Array.from({ length: n }, (_, i) => Math.abs(f[2 * i + 1] - cz)));
  band.scale.set(sx * 1.01, 1, sz * 1.01); band.position.set(cx, 229, cz); scene.add(band);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 2.4, 323 - 268, 10), new THREE.MeshStandardMaterial({ color: col('#e8ecef'), metalness: 0.8, roughness: 0.3 }));
  spire.position.set(cx, 268 + (323 - 268) / 2, cz); spire.castShadow = true; scene.add(spire);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), new THREE.MeshBasicMaterial({ color: col('#ff2020'), toneMapped: false }));
  beacon.position.set(cx, 323.5, cz); scene.add(beacon); BLINKERS.push(beacon);
}
const BLINKERS = [];
const CROWN_COLS = ['#ffffff', '#7fd8ff', '#ffd27a', '#ff7ad1', '#9dff8a', '#c8a2ff'];
function buildCrowns() {
  const B = newBuf(), brand = mulberry32(5);
  for (const t of CROWNS) {
    const f = t.f, n = f.length / 2, c = col(CROWN_COLS[Math.floor(brand() * CROWN_COLS.length)]);
    for (let i = 0; i < n; i++) {
      const ax = f[2 * i], az = f[2 * i + 1], bx = f[(2 * i + 2) % (2 * n)], bz = f[(2 * i + 3) % (2 * n)], L = Math.hypot(bx - ax, bz - az); if (L < 0.5) continue;
      const nx = (bz - az) / L, nz = -(bx - ax) / L;
      wallInto(B, ax + nx * 0.15, az + nz * 0.15, bx + nx * 0.15, bz + nz * 0.15, t.h - 1.2, t.h + 1.6, nx, nz, c);
    }
  }
  scene.add(new THREE.Mesh(toGeometry(B), nightMat(new THREE.MeshStandardMaterial({ vertexColors: true, color: col('#d8d8d4'), emissive: col('#ffffff'), emissiveIntensity: 0, roughness: 0.5 }), 0, 0.9)));
}
function heroFacade(name, roadFilter) {
  const f = D.heroes[name]; if (!f) return null;
  const n = f.length / 2; let best = null;
  for (let i = 0; i < n; i++) {
    const ax = f[2 * i], az = f[2 * i + 1], bx = f[(2 * i + 2) % (2 * n)], bz = f[(2 * i + 3) % (2 * n)], L = Math.hypot(bx - ax, bz - az); if (L < 3) continue;
    const nx = (bz - az) / L, nz = -(bx - ax) / L, mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const rd = roadNear(mx + nx * 3, mz + nz * 3, roadFilter); if (!rd) continue;
    const facing = (rd.cx - mx) * nx + (rd.cz - mz) * nz; if (facing <= 0) continue;
    if (!best || rd.d < best.d) best = { d: rd.d, mx, mz, nx, nz, L };
  }
  let h = 8;
  const [cx, cz] = footCentroid(f);
  for (const b of MAP.buildings) { const bf = b.slice(3); const [bx, bz] = footCentroid(bf); if (Math.abs(bx - cx) < 25 && Math.abs(bz - cz) < 25 && b[1] < 1) { h = Math.min(h, b[0]) || h; h = b[0]; break; } }
  return best && Object.assign(best, { h: Math.min(Math.max(h, 6), 14) });
}
// the facade a named shop sign was placed on (position, outward normal, building height)
function signFacade(re) {
  const s = D.signs.find((q) => re.test(q[7])); if (!s) return null;
  const b = MAP.buildings[s[8]];
  return { mx: s[0], mz: s[1], nx: s[2], nz: s[3], L: Math.max(8, s[4] + 4), h: Math.min(Math.max(b ? b[0] : 8, 6), 14) };
}
function buildOctopus() {
  const F = signFacade(/^timezone/i) || heroFacade('Timezone', (r) => r.type === RT.pedestrian); if (!F) return;
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: col('#c2378f'), roughness: 0.45, emissive: col('#5a0a3a'), emissiveIntensity: 0.2 });
  const belly = new THREE.MeshStandardMaterial({ color: col('#f2a3c8'), roughness: 0.5 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(2.8, 24, 18), skin); head.scale.set(1, 1.25, 0.95); head.position.set(0, 2.9, -0.4); head.castShadow = true; g.add(head);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), new THREE.MeshStandardMaterial({ color: col('#ffffff'), roughness: 0.3 })); eye.position.set(s * 1.1, 2.0, 2.0); g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), new THREE.MeshStandardMaterial({ color: col('#111111') })); pupil.position.set(s * 1.1, 1.95, 2.68); g.add(pupil);
  }
  // eight tentacles of shrinking beads, draped down the facade and curling out over the mall
  const beadGeo = new THREE.SphereGeometry(1, 10, 8), parts = [], pale = [];
  for (let t = 0; t < 8; t++) {
    const a = [-1.75, -1.35, -1.0, -0.7, 0.7, 1.0, 1.35, 1.75][t], curl = t % 2 ? 1 : -1; // leave the sign in the middle clear
    for (let k = 0; k < 16; k++) {
      const s = k / 15, r = 0.75 * (1 - s * 0.82);
      const x = Math.sin(a) * (1.6 + s * 5.4) + Math.sin(s * 6 + t) * 0.45 * curl;
      const y = 0.3 - s * (F.h - 2.4) * (0.75 + 0.25 * Math.cos(a)) + Math.max(0, s - 0.85) * 6;
      const z = 0.7 + Math.sin(s * Math.PI) * 1.0 + Math.max(0, s - 0.8) * 3;
      const m4 = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(r, r, r));
      parts.push(m4);
      if (k % 2 === 0 && k > 1) pale.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y - r * 0.6, z + r * 0.55), new THREE.Quaternion(), new THREE.Vector3(r * 0.35, r * 0.2, r * 0.35)));
    }
  }
  const tm = new THREE.InstancedMesh(beadGeo, skin, parts.length); parts.forEach((m, i) => tm.setMatrixAt(i, m)); tm.castShadow = true; g.add(tm);
  const sm = new THREE.InstancedMesh(beadGeo, belly, pale.length); pale.forEach((m, i) => sm.setMatrixAt(i, m)); g.add(sm);
  g.position.set(F.mx + F.nx * 0.5, F.h + 0.6, F.mz + F.nz * 0.5);
  g.rotation.y = Math.atan2(F.nx, F.nz);
  scene.add(g);
  OCTOPUS = g;
}
let OCTOPUS = null;
// Soul's podium on the Cavill Mall corner: slatted facade, blue "soul" letters, Ripley's blue-ringed octopus
// holding a Cavill Av street sign and a Believe It or Not! surfboard, Cargo Hold gift shop on the canopy.
function canvasTex(w, h, draw, alpha) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  if (!alpha) { x.fillStyle = '#000'; x.fillRect(0, 0, w, h); }
  draw(x, w, h);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO; return t;
}
function buildSoulPodium() {
  const F = signFacade(/^ripleys believe/i); if (!F) return;
  const g = new THREE.Group(); // local x: to your right as you face the building, y up, z out towards the mall
  g.position.set(F.mx + F.nx * 0.25, 0, F.mz + F.nz * 0.25); g.rotation.y = Math.atan2(F.nx, F.nz);
  const slats = canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = '#b9bcbd'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 8) { x.fillStyle = i % 16 ? '#a7aaab' : '#cfd2d3'; x.fillRect(i, 0, 4, h); }
    const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.15)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(22, 6.8), new THREE.MeshStandardMaterial({ map: slats, roughness: 0.6, metalness: 0.3 }));
  panel.position.set(0, 8.0, 0.05); g.add(panel);
  const soulTex = canvasTex(1024, 384, (x, w, h) => {
    x.font = `500 300px "Helvetica Neue", Arial, ${FONT.cond}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#2438b8'; x.fillText('soul', w / 2, h / 2 + 10);
  }, true);
  const soul = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), nightMat(new THREE.MeshStandardMaterial({ map: soulTex, transparent: true, alphaTest: 0.3, emissiveMap: soulTex, emissive: col('#6f86ff'), emissiveIntensity: 0, side: THREE.DoubleSide }), 0.05, 1.4));
  soul.position.set(4.2, 9.6, 0.15); g.add(soul);
  // glass canopy with the Cargo Hold sign along its edge
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(22, 0.18, 3.6), new THREE.MeshStandardMaterial({ color: col('#9fb7c4'), metalness: 0.5, roughness: 0.2, transparent: true, opacity: 0.75 }));
  canopy.position.set(0, 4.45, 1.8); canopy.castShadow = true; g.add(canopy);
  const cargoTex = canvasTex(1024, 64, (x, w, h) => {
    x.fillStyle = '#c8102e'; x.fillRect(0, 0, w, h); x.fillStyle = '#ffffff'; x.font = `400 40px ${FONT.display}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText("RIPLEY'S CARGO HOLD · GIFT SHOP", w / 2, h / 2 + 2);
  });
  const cargo = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.85), nightMat(new THREE.MeshStandardMaterial({ map: cargoTex, emissiveMap: cargoTex, emissive: col('#ffffff'), emissiveIntensity: 0 }), 0.35, 1.2));
  cargo.position.set(0, 4.0, 3.62); g.add(cargo);
  // the blue-ringed octopus
  const rings = canvasTex(256, 128, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#e3a062'); gr.addColorStop(1, '#c97a3e'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    const r = mulberry32(77);
    for (let i = 0; i < 34; i++) {
      const cx = r() * w, cy = r() * h, rad = 5 + r() * 9;
      x.lineWidth = 4; x.strokeStyle = '#3a2412'; x.beginPath(); x.arc(cx, cy, rad + 1.5, 0, TAU); x.stroke();
      x.lineWidth = 3; x.strokeStyle = '#2c7df0'; x.beginPath(); x.arc(cx, cy, rad, 0, TAU); x.stroke();
    }
  });
  rings.wrapS = rings.wrapT = THREE.RepeatWrapping;
  const skin = new THREE.MeshStandardMaterial({ map: rings, roughness: 0.45 });
  const oct = new THREE.Group(); oct.position.set(-1.6, 6.9, 1.3); g.add(oct);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.9, 28, 20), skin); head.scale.set(1, 1.15, 0.85); head.position.set(0, 0.9, -0.2); head.castShadow = true; oct.add(head);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), new THREE.MeshStandardMaterial({ color: col('#f2c879') })); eye.position.set(s * 0.75, 0.1, 1.25); oct.add(eye);
    const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.05), new THREE.MeshStandardMaterial({ color: col('#111') })); pupil.position.set(s * 0.75, 0.1, 1.66); oct.add(pupil);
  }
  const bead = new THREE.SphereGeometry(1, 12, 9), mats = [], tips = [];
  const ANG = [168, 200, 228, 256, 284, 312, 340, 18].map((a) => (a * Math.PI) / 180);
  ANG.forEach((a0, t) => {
    const curl = t % 2 ? 1 : -1, len = t === 0 || t === 7 ? 5.2 : 4.4 + (t % 3) * 0.5;
    let last = null;
    for (let k = 0; k < 18; k++) {
      const s = k / 17, a = a0 + curl * s * s * 1.5, dist = 1.2 + s * len, r = 0.55 * (1 - s * 0.8);
      const p = new THREE.Vector3(Math.cos(a) * dist, Math.sin(a) * dist * 0.72 - 0.2, 0.7 + Math.sin(s * Math.PI) * 0.6 + s * 0.4);
      mats.push(new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(r, r, r))); last = p;
    }
    tips.push(last);
  });
  const tm = new THREE.InstancedMesh(bead, skin, mats.length); mats.forEach((m, i) => tm.setMatrixAt(i, m)); tm.castShadow = true; oct.add(tm);
  // Cavill Av street sign (top left) and the Believe It or Not! surfboard (right)
  const bladeTex = canvasTex(256, 48, (x, w, h) => { x.fillStyle = '#0d3b86'; x.fillRect(0, 0, w, h); x.strokeStyle = '#fff'; x.lineWidth = 3; x.strokeRect(3, 3, w - 6, h - 6); x.fillStyle = '#fff'; x.font = `700 30px ${FONT.cond}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('CAVILL AV', w / 2, h / 2 + 1); });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.42, 0.06), [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({ color: col('#0d3b86') })).concat([new THREE.MeshStandardMaterial({ map: bladeTex }), new THREE.MeshStandardMaterial({ map: bladeTex })]));
  const tl = tips[0]; blade.position.set(tl.x - 0.2, tl.y + 1.1, tl.z); blade.rotation.z = 0.18; oct.add(blade);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), new THREE.MeshStandardMaterial({ color: col('#c9ced2'), metalness: 0.7 })); stick.position.set(tl.x, tl.y + 0.4, tl.z); stick.rotation.z = 0.5; oct.add(stick);
  const boardTex = canvasTex(512, 128, (x, w, h) => {
    x.fillStyle = '#f7d21c'; x.fillRect(0, 0, w, h); x.fillStyle = '#e8401f'; x.fillRect(w * 0.82, 0, w * 0.18, h);
    x.fillStyle = '#c8102e'; x.font = `italic 400 30px ${FONT.display}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText("Ripley's", w * 0.38, h * 0.32);
    x.fillStyle = '#1a1a1a'; x.font = `700 44px ${FONT.cond}`; x.fillText('Believe It or Not!', w * 0.42, h * 0.7);
  });
  const board = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.35 }));
  board.scale.set(2.6, 0.62, 0.14); board.position.set(4.6, -1.5, 1.7); board.rotation.z = 0.12; // held low on the right, like the real one board.castShadow = true; oct.add(board);
  scene.add(g);
  OCTOPUS = oct;
}
function bigFacadeSign(name, re, text, st, w, hgt) {
  const F = signFacade(re) || heroFacade(name, (r) => r.type === RT.pedestrian) || heroFacade(name, null); if (!F) return null;
  const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * hgt / w);
  drawSign(c.getContext('2d'), 0, 0, c.width, c.height, text, st);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO;
  const mat = nightMat(new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: col('#ffffff'), emissiveIntensity: 0 }), 0.05, 1.1);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w, F.L * 0.95), hgt), mat);
  m.position.set(F.mx + F.nx * 0.3, Math.max(4.6 + hgt / 2, Math.min(F.h, 9) - hgt / 2 - 0.3), F.mz + F.nz * 0.3); m.rotation.y = Math.atan2(F.nx, F.nz);
  scene.add(m); return { m, mat };
}
function buildAttractions() {
  const inf = bigFacadeSign('Infinity', /^infinity$/i, 'INFINITY', { bg: '#050505', fg: '#ffffff', font: 'display', rainbow: true }, 9, 2.0);
  if (inf) INFINITY_MAT = inf.mat;
  bigFacadeSign('Timezone', /^timezone/i, 'TIMEZONE', { bg: '#2a0f5c', fg: '#ffd400', font: 'display', neon: '#ff3fd2' }, 9, 1.8);
}
function buildArch() {
  const sp = D.spots["Surfer's Paradise Arch"]; if (!sp) return;
  const rd = roadNear(sp[0], sp[1], (r) => r.type === RT.pedestrian) || roadNear(sp[0], sp[1], null);
  let fx = rd ? rd.tx : 1, fz = rd ? rd.tz : 0; if (fx < 0) { fx = -fx; fz = -fz; } // face the beach (east)
  const g = new THREE.Group(), white = new THREE.MeshStandardMaterial({ color: col('#f4f4f2'), roughness: 0.35, metalness: 0.2 });
  const arc = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.32, 10, 40, Math.PI), white); arc.position.y = 1.2; arc.castShadow = true; g.add(arc);
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 1.2, 10), white); leg.position.set(s * 6.2, 0.6, 0); g.add(leg); }
  const c = document.createElement('canvas'); c.width = 1024; c.height = 160;
  const x = c.getContext('2d'); x.clearRect(0, 0, 1024, 160);
  x.font = `400 104px ${FONT.display}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 10; x.strokeStyle = '#0b3e7a'; x.strokeText('SURFERS PARADISE', 512, 84); x.fillStyle = '#ffffff'; x.fillText('SURFERS PARADISE', 512, 84);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO;
  const lm = nightMat(new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.2, emissiveMap: t, emissive: col('#ffffff'), emissiveIntensity: 0, side: THREE.DoubleSide }), 0.1, 1.2);
  const letters = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.7), lm); letters.position.set(0, 5.6, 0); g.add(letters);
  g.position.set(sp[0], 0, sp[1]); g.rotation.y = Math.atan2(fx, fz) + Math.PI / 2;
  scene.add(g);
  const rx = Math.cos(g.rotation.y), rz = -Math.sin(g.rotation.y);
  for (const s of [-1, 1]) addBox(sp[0] + rx * 6.2 * s, sp[1] + rz * 6.2 * s, 0.4, 2);
  window.SIGN_POS = { x: sp[0], z: sp[1], fx, fz };
}
function bronzeFigure(x, z, a, scale, pose) {
  const P = makePerson({ skin: '#7a5a34', hair: '#6b4c2c', shirt: '#86643a', shorts: '#6f532f', shoe: '#5a4226' });
  const bronze = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.75, roughness: 0.35 });
  P.root.traverse((o) => { if (o.isMesh) { o.material = bronze; o.castShadow = true; } });
  if (pose === 'wave') { P.armR.rotation.x = -2.6; P.armR.rotation.z = -0.3; }
  if (pose === 'hold') { P.armL.rotation.x = -3.0; P.armR.rotation.x = -3.0; }
  P.root.scale.setScalar(scale); P.root.position.set(x, 1.0, z); P.root.rotation.y = a;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.4), new THREE.MeshStandardMaterial({ color: col('#b9b3a6'), roughness: 0.8 }));
  plinth.position.set(x, 0.5, z); plinth.castShadow = true;
  scene.add(P.root, plinth); addBox(x, z, 0.75, 2);
  return P;
}
function buildArtworks() {
  const S = D.spots, face = (x, z) => { const rd = roadNear(x, z, null); return rd ? Math.atan2(rd.cx - x, rd.cz - z) : 0; };
  if (S['Sir Bruce Small']) bronzeFigure(S['Sir Bruce Small'][0], S['Sir Bruce Small'][1], face(...S['Sir Bruce Small']), 1.15, 'wave');
  if (S['Matey Monument']) bronzeFigure(S['Matey Monument'][0], S['Matey Monument'][1], face(...S['Matey Monument']), 1.1, null);
  if (S['Keeper of Light']) {
    const [x, z] = S['Keeper of Light'];
    bronzeFigure(x, z, face(x, z), 1.9, 'hold');
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), nightMat(new THREE.MeshStandardMaterial({ color: col('#fff4d0'), emissive: col('#ffd27a'), emissiveIntensity: 0 }), 0.3, 3));
    orb.position.set(x, 1.0 + 1.9 * 2.4, z); scene.add(orb);
  }
  if (S['Tiki Statue']) {
    const [x, z] = S['Tiki Statue'], g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: col('#6b4a2c'), roughness: 0.9 }), dark = new THREE.MeshStandardMaterial({ color: col('#2a1a10') });
    for (let k = 0; k < 3; k++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.9), wood); seg.position.y = 0.5 + k * 1.05; g.add(seg);
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.05), dark); e.position.set(s * 0.22, 0.7 + k * 1.05, 0.46); g.add(e); }
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.05), dark); mouth.position.set(0, 0.3 + k * 1.05, 0.46); g.add(mouth);
    }
    g.position.set(x, 0, z); g.rotation.y = face(x, z); scene.add(g); addBox(x, z, 0.55, 3);
  }
  if (S['Orbit']) {
    const [x, z] = S['Orbit'], steel = new THREE.MeshStandardMaterial({ color: col('#d9dde0'), metalness: 0.9, roughness: 0.2 });
    for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(2.2 - k * 0.4, 0.08, 8, 40), steel); r.position.set(x, 2.8, z); r.rotation.set(k * 0.7, k * 1.1, 0); scene.add(r); ORBITS.push(r); }
  }
}
const ORBITS = [];
function buildBeach() {
  // patrol flags either side of each lifeguard tower
  const fc = document.createElement('canvas'); fc.width = 64; fc.height = 64;
  const fx = fc.getContext('2d'); fx.fillStyle = '#e1251b'; fx.fillRect(0, 0, 64, 32); fx.fillStyle = '#ffd400'; fx.fillRect(0, 32, 64, 32);
  const flagMat = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(fc), side: THREE.DoubleSide });
  flagMat.map.encoding = THREE.sRGBEncoding;
  const coast = [];
  for (const ring of MAP.ocean) { const c = coastLine(ring); for (let i = 0; i < c.length; i += 2) coast.push(c[i], c[i + 1]); }
  const coastX = (z) => { let best = 1e9, bx = 0; for (let i = 0; i < coast.length; i += 2) { const d = Math.abs(coast[i + 1] - z); if (d < best) { best = d; bx = coast[i]; } } return bx; };
  for (const [x, z] of MAP.towers) {
    for (const o of [-40, 40]) {
      const fz = z + o, fxp = coastX(fz) - 18;
      if (!isLand(fxp, fz)) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 6), new THREE.MeshStandardMaterial({ color: col('#dddddd') }));
      pole.position.set(fxp, 1.6, fz); scene.add(pole);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.75), flagMat); fl.position.set(fxp, 2.75, fz + 0.58); fl.rotation.y = Math.PI / 2; scene.add(fl); FLAGS.push(fl);
    }
  }
  // umbrellas and towels on the sand
  const umb = mergeGeos([paintGeo(new THREE.ConeGeometry(1.3, 0.5, 8, 1, true).translate(0, 2.2, 0), '#ffffff'), paintGeo(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5).translate(0, 1.1, 0), '#dddddd')]);
  const towel = new THREE.BoxGeometry(0.9, 0.02, 1.8);
  const spots = [];
  for (let i = 0; i < 160; i++) { const z = rr(MINZ + 40, MAXZ - 40), x = coastX(z) - rr(14, 60); if (isLand(x, z) && onBeachSand(x, z)) spots.push([x, z]); }
  const um = new THREE.InstancedMesh(umb, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 }), spots.length);
  const tw = new THREE.InstancedMesh(towel, new THREE.MeshStandardMaterial({ color: col('#ffffff'), roughness: 0.9 }), spots.length);
  const colours = ['#e23b2a', '#2a7de2', '#f2c230', '#2ac28a', '#f07ac0', '#ffffff', '#ff8a2a'].map(col);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  spots.forEach(([x, z], i) => {
    e.set(rr(-0.15, 0.15), rr(0, TAU), rr(-0.15, 0.15)); q.setFromEuler(e); m4.compose(v.set(x, 0, z), q, one); um.setMatrixAt(i, m4); um.setColorAt(i, pick(colours));
    e.set(0, rr(0, TAU), 0); q.setFromEuler(e); m4.compose(v.set(x + 1.2, 0.02, z), q, one); tw.setMatrixAt(i, m4); tw.setColorAt(i, pick(colours));
  });
  um.castShadow = true; scene.add(um, tw);
  // rock walls (Narrowneck and the groynes)
  const rocks = [];
  for (const pl of MAP.piers) {
    const p = pl.slice(1);
    for (let i = 0; i < p.length / 2 - 1; i++) {
      const ax = p[2 * i], az = p[2 * i + 1], bx = p[2 * i + 2], bz = p[2 * i + 3], L = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s < L; s += 1.6) rocks.push([ax + (bx - ax) * s / L + rr(-1, 1), az + (bz - az) * s / L + rr(-1, 1)]);
    }
  }
  const rg = new THREE.DodecahedronGeometry(1, 0);
  const rm = new THREE.InstancedMesh(rg, new THREE.MeshStandardMaterial({ color: col('#7d746a'), roughness: 1, flatShading: true }), rocks.length);
  rocks.forEach(([x, z], i) => { e.set(rr(0, 3), rr(0, 3), rr(0, 3)); q.setFromEuler(e); const s = rr(0.8, 1.6); m4.compose(v.set(x, rr(-0.6, 0.1), z), q, new THREE.Vector3(s, s * 0.8, s)); rm.setMatrixAt(i, m4); });
  rm.castShadow = true; scene.add(rm);
}
const FLAGS = [];
function onBeachSand(x, z) { // inside a mapped beach polygon
  for (const rings of MAP.areas.beach) for (const r of rings) { let c = false; for (let i = 0, j = r.length / 2 - 1; i < r.length / 2; j = i++) { const xi = r[2 * i], zi = r[2 * i + 1], xj = r[2 * j], zj = r[2 * j + 1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } if (c) return true; }
  return false;
}
// awnings over the shops on Cavill Mall, Orchid Avenue and other pedestrian streets
function buildAwnings() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 16;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#ffffff'; ctx.fillRect(i * 8, 0, 8, 16); if (i % 2) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(i * 8, 0, 8, 16); } }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = THREE.RepeatWrapping; tex.encoding = THREE.sRGBEncoding;
  const B = newBuf(), colours = ['#d94e3a', '#2f7fb8', '#2f8a5b', '#e0a32a', '#7a3e9a', '#1f1f1f', '#e66a9c'].map(col);
  for (const [x, z, nx, nz, w, y, cat, name] of D.signs) {
    const rd = roadNear(x, z, (r) => r.type === RT.pedestrian || r.name === 'Orchid Avenue' || r.name === 'Cavill Avenue', 1);
    if (!rd || rd.d > 16) continue;
    const colr = pick(colours), aw = w + 1.2, depth = 2.2, y0 = y - 0.75, y1 = y0 - 0.55;
    const rx = nz, rz = -nx;
    const a0 = [x - rx * aw / 2, y0, z - rz * aw / 2], b0 = [x + rx * aw / 2, y0, z + rz * aw / 2];
    const a1 = [a0[0] + nx * depth, y1, a0[2] + nz * depth], b1 = [b0[0] + nx * depth, y1, b0[2] + nz * depth];
    const u = aw / 2;
    pushTri(B, a0, b0, b1, [0, 1], [u, 1], [u, 0], nx * 0.25, 1, nz * 0.25, colr); pushTri(B, a0, b1, a1, [0, 1], [u, 0], [0, 0], nx * 0.25, 1, nz * 0.25, colr);
    pushTri(B, a0, b1, b0, [0, 1], [u, 0], [u, 1], -nx * 0.25, -1, -nz * 0.25, colr); pushTri(B, a0, a1, b1, [0, 1], [0, 0], [u, 0], -nx * 0.25, -1, -nz * 0.25, colr);
  }
  const m = new THREE.Mesh(toGeometry(B), new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.8 })); m.castShadow = true; scene.add(m);
}

// ---------------------------------------------------------------- clothes shops (change your outfit)
const OUTFIT_SHOPS = [];
function buildOutfitShops() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#ffd400'; x.beginPath();
  x.moveTo(34, 20); x.lineTo(50, 14); x.quadraticCurveTo(64, 30, 78, 14); x.lineTo(94, 20); x.lineTo(118, 44); x.lineTo(100, 60); x.lineTo(92, 52); x.lineTo(92, 114); x.lineTo(36, 114); x.lineTo(36, 52); x.lineTo(28, 60); x.lineTo(10, 44); x.closePath(); x.fill();
  x.lineWidth = 6; x.strokeStyle = '#2a1a00'; x.stroke();
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  const ringMat = new THREE.MeshBasicMaterial({ color: col('#ffd400'), transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false });
  for (const [px, pz, name] of D.clothes) {
    if (!isLand(px, pz)) continue;
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, toneMapped: false })); icon.scale.set(0.9, 0.9, 0.9); icon.position.set(px, 1.6, pz);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 32), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.set(px, 0.06, pz);
    scene.add(icon, ring);
    OUTFIT_SHOPS.push({ x: px, z: pz, name, icon });
  }
}

function updateDetails(dt) {
  updateTrams(dt);
  for (const b of BLINKERS) b.visible = Math.floor(elapsed * 1.2) % 2 === 0;
  for (const f of FLAGS) f.rotation.x = Math.sin(elapsed * 4 + f.position.z) * 0.15;
  for (const r of ORBITS) { r.rotation.y += dt * 0.3; r.rotation.x += dt * 0.15; }
  for (const s of OUTFIT_SHOPS) s.icon.position.y = 1.6 + Math.sin(elapsed * 2.5) * 0.12;
  if (OCTOPUS) OCTOPUS.rotation.z = Math.sin(elapsed * 0.8) * 0.025;
  if (INFINITY_MAT) INFINITY_MAT.emissive.setHSL((elapsed * 0.1) % 1, 0.9, 0.6);
}
function buildDetails() {
  buildRoadIndex();
  buildSigns();
  buildStreetSigns();
  buildTrafficLights();
  buildProps();
  buildRail();
  buildQ1();
  buildCrowns();
  buildSoulPodium();
  buildAttractions();
  buildArch();
  buildArtworks();
  buildBeach();
  buildAwnings();
  buildOutfitShops();
}
