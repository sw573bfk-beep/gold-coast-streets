// ============================================================================
// Gold Coast Streets — trains and CityCats (tools/build_transit.py works out their routes from OpenStreetMap).
// Trains run the Gold Coast line, Varsity Lakes to Roma Street (88 km, 33 stations), both ways on their own tracks;
// the CityCats run the Brisbane River, Northshore Hamilton to UQ St Lucia (20 terminals). Hop on with E while one
// is stopped (like the G:link and the buses) and E at a stop to get off.
// ============================================================================
const TRANSIT = { lines: [], vehicles: [], track: new Map(), loaded: false, trackT: 0 };
const TRAIN_CAR = 23.5, TRAIN_CARS = 6, CAT_LEN = 25;
let transitGeos = null;
function transitGeometries() {
  if (transitGeos) return transitGeos;
  const car = (front) => mergeGeos([ // a Queensland Rail suburban car: white, a dark window band, yellow on the front
    box(3.0, 2.3, TRAIN_CAR - 0.6, 0, 1.75, 0, '#f2f2ef'), box(3.02, 1.0, TRAIN_CAR - 1.4, 0, 2.35, 0, '#1b232a'),
    box(3.03, 0.28, TRAIN_CAR - 0.6, 0, 0.75, 0, '#2c5c9e'), box(2.8, 0.45, TRAIN_CAR - 1.0, 0, 3.15, 0, '#cfd3d6'),
    box(2.3, 0.6, 2.6, 0, 0.35, -TRAIN_CAR / 2 + 3, '#2a2a2a'), box(2.3, 0.6, 2.6, 0, 0.35, TRAIN_CAR / 2 - 3, '#2a2a2a'),
    ...(front ? [box(2.9, 1.2, 0.4, 0, 2.2, TRAIN_CAR / 2 - 0.4, '#141a1e'), box(3.0, 1.0, 0.3, 0, 1.2, TRAIN_CAR / 2 - 0.3, '#f2c200')] : []),
  ]);
  const cat = mergeGeos([ // a CityCat: twin white hulls, a blue-windowed cabin, the name stripe
    box(1.2, 1.1, CAT_LEN, -2.3, 0.2, 0, '#f4f4f2'), box(1.2, 1.1, CAT_LEN, 2.3, 0.2, 0, '#f4f4f2'), box(5.6, 0.4, CAT_LEN - 2, 0, 0.9, 0, '#e9e9e6'),
    box(5.0, 2.1, CAT_LEN - 7, 0, 2.15, -1, '#f4f4f2'), box(5.04, 0.9, CAT_LEN - 8, 0, 2.4, -1, '#1f4f78'), box(5.06, 0.25, CAT_LEN - 7, 0, 1.25, -1, '#c8102e'),
    box(4.4, 0.25, CAT_LEN - 9, 0, 3.3, -1.5, '#d8dbdd'), box(1.6, 0.9, 1.6, 0, 3.7, 2, '#1f4f78'),
  ]);
  return (transitGeos = { mid: car(false), front: car(true), cat });
}
const transitMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.1 });
// a train's height along its line: the ground, but held level across rivers (the rail bridges aren't in the ground model)
function trackY(L, s) {
  const P = {}, at = (q) => { railPoint(L, q, P); return isLand(P.x, P.z) ? groundAt(P.x, P.z) : null; };
  const h = at(s); if (h !== null) return h;
  let a = null, b = null, da = 0, db = 0;
  for (let d = 10; d <= 800 && (a === null || b === null); d += 10) { if (a === null && (a = at(s - d)) !== null) da = d; if (b === null && (b = at(s + d)) !== null) db = d; }
  if (a === null && b === null) return 3; if (a === null) return b; if (b === null) return a;
  return Math.max(a + (b - a) * da / (da + db), WATER_Y + 4);
}
class RailVehicle {
  constructor(L, s, dir) {
    this.L = L; this.s = s; this.dir = dir; this.v = 0; this.dwell = 0; this.mods = []; this.kind = L.kind;
    const G = transitGeometries(), n = L.kind === 'ferry' ? 1 : TRAIN_CARS;
    for (let k = 0; k < n; k++) { const m = new THREE.Mesh(L.kind === 'ferry' ? G.cat : k === 0 || k === n - 1 ? G.front : G.mid, transitMat); m.castShadow = true; scene.add(m); this.mods.push({ m, x: 0, z: 0, tx: 0, tz: 1 }); }
    this.place();
  }
  get carLen() { return this.kind === 'ferry' ? CAT_LEN : TRAIN_CAR; }
  place() {
    const P = {}, lane = this.L.lane, near = Math.hypot(this.mods[0].x - player.x, this.mods[0].z - player.z) < 2500 || this.mods[0].x === 0;
    this.mods.forEach((md, k) => {
      const s = this.s - this.dir * (k * this.carLen + this.carLen / 2); railPoint(this.L, s, P);
      md.tx = P.tx * this.dir; md.tz = P.tz * this.dir; md.x = P.x - md.tz * lane; md.z = P.z + md.tx * lane;
      md.m.visible = near; if (!near) return;
      md.m.position.set(md.x, this.kind === 'ferry' ? WATER_Y + 0.1 + Math.sin(elapsed * 1.6 + k) * 0.05 : trackY(this.L, s) + 0.25, md.z);
      md.m.rotation.y = Math.atan2(md.tx, md.tz) + (this.kind !== 'ferry' && k === this.mods.length - 1 ? Math.PI : 0);
    });
    const m0 = this.mods[Math.floor(this.mods.length / 2)]; this.x = m0.x; this.z = m0.z; this.h = Math.atan2(m0.tx, m0.tz);
  }
  update(dt) {
    const L = this.L, vmax = this.kind === 'ferry' ? 9 : 24, acc = this.kind === 'ferry' ? 0.6 : 0.9;
    if (this.dwell > 0) { this.dwell -= dt; if (this.dwell <= 0) this.v = 0.5; return this.place(); }
    const ahead = L.stops.map((s) => (s - this.s) * this.dir).filter((d) => d > 0.5), dStop = ahead.length ? Math.min(...ahead) : Infinity;
    let vt = vmax;
    if (dStop < 400) vt = Math.min(vt, Math.max(1.2, Math.sqrt(2 * acc * dStop)));
    if (dStop < 2 && this.v < 3) { this.dwell = this.kind === 'ferry' ? 16 : 20; this.v = 0; this.s += this.dir * dStop; return this.place(); }
    const end = this.dir > 0 ? L.len - this.s : this.s;
    if (end < 300) vt = Math.min(vt, Math.max(0.8, Math.sqrt(2 * acc * end)));
    if (end < 1) { this.dir = -this.dir; this.s += this.dir * this.mods.length * this.carLen; this.dwell = 30; return this.place(); }
    if (this.kind !== 'ferry') { // something on the track: brake
      const P = {};
      for (const d of [10, 25, 45]) { railPoint(L, this.s + this.dir * d, P); const tx = P.tx * this.dir, tz = P.tz * this.dir, x = P.x - tz * L.lane, z = P.z + tx * L.lane;
        if ((player.deadT === 0 && Math.abs(player.x - x) < 2.8 && Math.abs(player.z - z) < 2.8) || cars.some((c) => Math.abs(c.x - x) < 2.8 && Math.abs(c.z - z) < 2.8)) { vt = Math.min(vt, Math.max(0, d - 10) * 0.3); if (rand() < dt * 0.5) sfxTone([520, 440], 0.6, 0.05, 'square'); break; } }
    }
    this.v += clamp(vt - this.v, -2.2 * dt, acc * dt); this.s += this.dir * this.v * dt;
    this.place();
  }
  stopName(next) { // the stop it's at (or, with next, the one coming up)
    const L = this.L; let best = null, bd = 1e9;
    L.stops.forEach((s, i) => { const d = (s - this.s) * this.dir; const k = next ? (d > -1 ? d : 1e9) : Math.abs(d); if (k < bd) { bd = k; best = L.names[i]; } });
    return best || L.title;
  }
}
async function initTransitLines() {
  if (TRANSIT.loaded || !REGION) return; TRANSIT.loaded = true;
  let d; try { d = await (await fetch(`tiles/transit.json?b=${REGION.built || 0}`)).json(); } catch (e) { return; }
  for (const [kind, list] of [['train', d.trains || []], ['ferry', d.ferries || []]]) for (const T of list) {
    const L = railLine(T.line); Object.assign(L, { kind, title: T.name, stops: T.stops.map((q) => q[0]), names: T.stops.map((q) => q[1]), lane: kind === 'ferry' ? 6 : 2.1 });
    TRANSIT.lines.push(L);
    const n = kind === 'ferry' ? 3 : 4;
    for (let k = 0; k < n; k++) TRANSIT.vehicles.push(new RailVehicle(L, L.len * (0.08 + k / n), k % 2 ? -1 : 1));
  }
}
// the tracks: ballast and two rails each way, built in 400 m pieces near you once the ground there has loaded
const TRACK_MATS = { ballast: new THREE.MeshStandardMaterial({ color: col('#8a8173'), roughness: 1 }), rail: new THREE.MeshStandardMaterial({ color: col('#b9bcbf'), metalness: 0.7, roughness: 0.35 }) };
function updateTrack() {
  for (const L of TRANSIT.lines) {
    if (L.kind !== 'train') continue;
    const P = {}, PIECE = 400;
    for (let s0 = 0; s0 < L.len; s0 += PIECE) {
      const key = L.title + s0; railPoint(L, s0 + PIECE / 2, P); const d = Math.hypot(P.x - player.x, P.z - player.z), have = TRANSIT.track.get(key);
      if (d > 1700 && have) { for (const m of have) { scene.remove(m); m.geometry.dispose(); } TRANSIT.track.delete(key); continue; }
      if (d > 1100 || have || !tileAt(P.x, P.z) || !tileAt(P.x, P.z).mask) continue;
      const B = newBuf(), R = newBuf(), pts = []; for (let s = s0; s <= Math.min(L.len, s0 + PIECE); s += 5) { railPoint(L, s, P); pts.push([P.x, P.z, P.tx, P.tz, trackY(L, s)]); }
      for (const lane of [-L.lane, L.lane]) {
        const strip = (B2, off, hw, lift) => { for (let i = 1; i < pts.length; i++) { const [ax, az, atx, atz, ay] = pts[i - 1], [bx, bz, btx, btz, by] = pts[i]; const q = (x, z, tx, tz, y, o) => [x - tz * o, y + lift, z + tx * o];
          const a0 = q(ax, az, atx, atz, ay, lane + off - hw), a1 = q(ax, az, atx, atz, ay, lane + off + hw), b0 = q(bx, bz, btx, btz, by, lane + off - hw), b1 = q(bx, bz, btx, btz, by, lane + off + hw);
          triInto(B2, a0, b0, b1, 1); triInto(B2, a0, b1, a1, 1); for (let k = 0; k < 6; k++) B2.nor.push(0, 1, 0); } };
        strip(B, 0, 1.7, 0.06); strip(R, -0.72, 0.05, 0.2); strip(R, 0.72, 0.05, 0.2);
      }
      const ms = [new THREE.Mesh(toGeometry(B), TRACK_MATS.ballast), new THREE.Mesh(toGeometry(R), TRACK_MATS.rail)]; ms[0].receiveShadow = true;
      for (const m of ms) scene.add(m); TRANSIT.track.set(key, ms);
    }
  }
}
function updateTransitLines(dt) {
  if (!TRANSIT.loaded) { initTransitLines(); return; }
  for (const V of TRANSIT.vehicles) V.update(dt);
  TRANSIT.trackT -= dt; if (TRANSIT.trackT <= 0) { TRANSIT.trackT = 1; updateTrack(); }
}
// for boardRide: a stopped train or CityCat right beside you
function nearRailVehicle(maxD) {
  let best = null, bd = maxD;
  for (const V of TRANSIT.vehicles) if (V.dwell > 1.5) for (const md of V.mods) { const d = Math.hypot(md.x - player.x, md.z - player.z) - (V.kind === 'ferry' ? 3 : 1.5); if (d < bd) { bd = d; best = V; } }
  return best;
}
// for the phone: the nearest station and CityCat terminal
function nearestTransitStops() {
  const out = [];
  for (const L of TRANSIT.lines) { const P = {}; let best = null; L.stops.forEach((s, i) => { railPoint(L, s, P); const d = Math.hypot(P.x - player.x, P.z - player.z); if (!best || d < best.d) best = { d, x: P.x, z: P.z, name: L.names[i], L }; }); if (best) out.push(best); }
  return out;
}
