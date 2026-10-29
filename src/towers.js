// Gold Coast Streets — hotels, towers and malls you can go inside.
// Walk up to a tall building (or a shopping centre) and press E: you step into its lobby, built inside the real
// footprint. The lift goes to every floor (hotel rooms, apartments or offices, with the real view out the windows)
// and up to the roof. Shopping centres get a concourse lined with the shops that are really inside them.

let TOWER = null; // the building you're inside: { b, f, name, kind, floors, level, y, top, mesh, geo, grid, lifts, exit, shops, loot, people }

function towerKindOf(h, kind, area, name) {
  if (/fair|town centre|shopping|plaza|marketplace|mall|harbour town|australia fair/i.test(name || '') || (kind === 2 && area > 7000 && h < 30)) return 'mall';
  if (h < 14 || area < 250) return null;
  if (/hotel|resort|hilton|marriott|sofitel|novotel|star|crowne|meriton|peppers|qt |vibe|mantra|ibis|holiday inn|langham|jw /i.test(name || '')) return 'hotel';
  if (kind === 1) return 'apartments';
  return kind === 2 || kind === 5 || kind === 3 ? 'offices' : 'apartments';
}
// big buildings near a point: the Surfers core plus the streamed tiles
function bigBuildingsNear(x, z, r) {
  const out = [];
  const consider = (b, name, pois) => {
    const f = b.slice(3); let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let q = 0; q < f.length; q += 2) { x0 = Math.min(x0, f[q]); x1 = Math.max(x1, f[q]); z0 = Math.min(z0, f[q + 1]); z1 = Math.max(z1, f[q + 1]); }
    if (x < x0 - r || x > x1 + r || z < z0 - r || z > z1 + r) return;
    const area = Math.abs(polyArea(f));
    if (!name && area > 2500 && b[0] < 30 && REGION) { // a big unnamed shop building inside a mapped shopping centre takes its name
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      let bd = 220; for (const [lx, lz, ln] of REGION.landmarks) { const d = Math.hypot(lx - cx, lz - cz); if (d < bd && /fair|centre|plaza|shopping|marketplace|town/i.test(ln) && !/^[A-Z]{2,4} /.test(ln)) { bd = d; name = ln; } } // skip stores like "MBE Pacific Fair"
    }
    const kind = towerKindOf(b[0], b[2], area, name);
    if (kind) out.push({ b, f, name: name || '', kind, area, pois, x0, z0, x1, z1 });
  };
  if (inCore(x, z) || Math.abs(x) < 1600 && Math.abs(z) < 1900) MAP.buildings.forEach((b, bi) => consider(b, MAP.details && MAP.details.bnames && MAP.details.bnames[bi], CORE_POIS()));
  for (const T of TILES.values()) // big footprints can sit across a tile edge, so look in every loaded tile nearby
    if (T.blds && x > T.x0 - r - 600 && x < T.x0 + REGION.tile + r + 600 && z > T.z0 - r - 600 && z < T.z0 + REGION.tile + r + 600) T.blds.forEach((b, bi) => consider(b, T.bnames && T.bnames[bi], T.pois));
  return out;
}
// the core's shops as [x, z, cat, name] (for shopping arcades in Surfers)
let _corePois = null;
function CORE_POIS() { return _corePois || (_corePois = SHOPS.filter((sh) => !sh.tile && !sh.mall).map((sh) => [sh.x, sh.z, sh.cat, sh.name])); }
// the outside wall you're standing at, if it belongs to a big building
function towerEntrance(maxD) {
  let best = null;
  for (const B of bigBuildingsNear(player.x, player.z, maxD + 1)) {
    if (inRing(player.x, player.z, B.f)) continue;
    const f = B.f, n = f.length / 2;
    for (let q = 0; q < n; q++) {
      const ax = f[2 * q], az = f[2 * q + 1], bx = f[(2 * q + 2) % (2 * n)], bz = f[(2 * q + 3) % (2 * n)], ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez; if (L2 < 9) continue;
      const t = clamp(((player.x - ax) * ex + (player.z - az) * ez) / L2, 0.1, 0.9), px = ax + ex * t, pz = az + ez * t, d = Math.hypot(player.x - px, player.z - pz);
      if (d < maxD && (!best || d < best.d - 0.3 || (Math.abs(d - best.d) < 0.3 && B.b[0] > best.B.b[0]))) {
        const L = Math.sqrt(L2); let nx = ez / L, nz = -ex / L; if (inRing(px + nx * 0.4, pz + nz * 0.4, f)) { nx = -nx; nz = -nz; }
        best = { B, q, px, pz, nx, nz, ex: ex / L, ez: ez / L, d };
      }
    }
  }
  return best;
}

const T_COLS = { marble: col('#e9e5dc'), carpet: col('#7b5d63'), carpet2: col('#4f5d73'), wall: col('#efe9de'), wood: col('#7a5a3c'), dark: col('#24292e'),
  lift: col('#b9bec4'), glass: col('#9fc3d6'), bed: col('#f1ede6'), desk: col('#d9d4c9'), plant: col('#3f7a3a'), pool: col('#3fb5d6'), tile: col('#dfe6ea'), shop: col('#f6f3ee') };

function enterTower(E) {
  // Q1's height includes its spire: 77 floors with the roof deck at about 245 m
  const B = E.B, gy = groundAt(E.px, E.pz), h = /^Q1\b/.test(B.name) ? 245 : B.b[0];
  const floors = B.kind === 'mall' ? 0 : /^Q1\b/.test(B.name) ? 77 : Math.max(1, Math.floor((h - 4.5) / 3.1));
  TOWER = { b: B.b, f: B.f, name: B.name || ({ hotel: 'Hotel', apartments: 'Apartments', offices: 'Office tower', mall: 'Shopping centre' })[B.kind], kind: B.kind, floors, level: 0,
    base: gy, top: gy + h, exit: { x: E.px + E.nx * 1.2, z: E.pz + E.nz * 1.2, ix: E.px - E.nx * 1.5, iz: E.pz - E.nz * 1.5, nx: E.nx, nz: E.nz, ex: E.ex, ez: E.ez, px: E.px, pz: E.pz }, pois: B.pois, people: [] };
  buildTowerLevel(0);
  player.x = TOWER.exit.ix; player.z = TOWER.exit.iz; player.h = Math.atan2(-E.nx, -E.nz); camYaw = player.h;
  toast(TOWER.kind === 'mall' ? `${TOWER.name} — walk up to a shop counter, E to buy` : `${TOWER.name} — lifts are in the middle (E)`);
}
function leaveTower() {
  const X = TOWER.exit; disposeTowerLevel(); TOWER = null;
  player.x = X.x; player.z = X.z; player.h = Math.atan2(X.nx, X.nz); camYaw = player.h;
}
function disposeTowerLevel() {
  if (!TOWER || !TOWER.mesh) return;
  scene.remove(TOWER.mesh); TOWER.geo.dispose(); TOWER.mesh.material.dispose();
  if (TOWER.signMesh) { scene.remove(TOWER.signMesh); TOWER.signMesh.geometry.dispose(); TOWER.signMesh.material.map.dispose(); TOWER.signMesh.material.dispose(); }
  for (const L of TOWER.loot || []) if (L.mesh) scene.remove(L.mesh);
  for (const p of TOWER.people) disposePerson(p);
  for (const sh of TOWER.shops || []) { const k = SHOPS.indexOf(sh); if (k >= 0) SHOPS.splice(k, 1); }
  const gi = GRIDS.indexOf(TOWER.grid); if (gi >= 0) GRIDS.splice(gi, 1);
  TOWER.mesh = null; TOWER.people = []; TOWER.shops = []; TOWER.loot = [];
}
function levelY(k) { return k === 0 ? TOWER.base : k > TOWER.floors ? TOWER.top : TOWER.base + 4.5 + (k - 1) * 3.1; }

function buildTowerLevel(k) {
  disposeTowerLevel();
  const f = TOWER.f, n = f.length / 2, y = levelY(k), roof = k > TOWER.floors, ceil = roof ? y + 40 : k === 0 ? Math.min(TOWER.top - 0.1, y + (TOWER.kind === 'mall' ? 7 : 4.4)) : y + 2.9;
  const r = mulberry32((TOWER.b[3] * 1000 + TOWER.b[4]) | 0 + k * 7), Bf = newBuf(), segs = [], lifts = [], loot = [];
  TOWER.level = k; TOWER.y = y; TOWER.ceil = ceil;
  const X = TOWER.exit;
  // the long axis of the outline: corridors and the lift core line up with it
  let cx = 0, cz = 0; for (let q = 0; q < n; q++) { cx += f[2 * q]; cz += f[2 * q + 1]; } cx /= n; cz /= n;
  let bestL = 0, ax_ = 1, az_ = 0;
  for (let q = 0; q < n; q++) { const ex = f[(2 * q + 2) % (2 * n)] - f[2 * q], ez = f[(2 * q + 3) % (2 * n)] - f[2 * q + 1], L = Math.hypot(ex, ez); if (L > bestL) { bestL = L; ax_ = ex / L; az_ = ez / L; } }
  const ux = ax_, uz = az_, vx = -az_, vz = ax_;
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (let q = 0; q < n; q++) { const u = (f[2 * q] - cx) * ux + (f[2 * q + 1] - cz) * uz, v = (f[2 * q] - cx) * vx + (f[2 * q + 1] - cz) * vz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const W = (u, v) => [cx + u * ux + v * vx, cz + u * uz + v * vz];
  const floorCol = k === 0 ? (TOWER.kind === 'mall' ? T_COLS.tile : T_COLS.marble) : roof ? col('#c8c4ba') : TOWER.kind === 'offices' ? T_COLS.carpet2 : T_COLS.carpet;
  // floor and ceiling
  const contour = []; for (let q = 0; q < n; q++) contour.push(new THREE.Vector2(f[2 * q], f[2 * q + 1]));
  let tris = []; try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { /* odd outline */ }
  for (const t of tris) {
    const P = t.map((q) => [f[2 * q], f[2 * q + 1]]);
    triInto(Bf, [P[0][0], y + 0.02, P[0][1]], [P[1][0], y + 0.02, P[1][1]], [P[2][0], y + 0.02, P[2][1]], 1); for (let v = 0; v < 3; v++) { Bf.nor.push(0, 1, 0); Bf.col.push(floorCol.r, floorCol.g, floorCol.b); }
    if (!roof) { triInto(Bf, [P[0][0], ceil, P[0][1]], [P[1][0], ceil, P[1][1]], [P[2][0], ceil, P[2][1]], -1); for (let v = 0; v < 3; v++) { Bf.nor.push(0, -1, 0); Bf.col.push(0.93, 0.93, 0.92); } }
  }
  // outer walls from inside: solid below 0.9 m and above 2.5 m, window between (the real view out)
  for (let q = 0; q < n; q++) {
    const ax = f[2 * q], az = f[2 * q + 1], bx = f[(2 * q + 2) % (2 * n)], bz = f[(2 * q + 3) % (2 * n)], L = Math.hypot(bx - ax, bz - az); if (L < 0.05) continue;
    const ex = (bx - ax) / L, ez = (bz - az) / L; let nx = -ez, nz = ex; if (!inRing((ax + bx) / 2 + nx * 0.3, (az + bz) / 2 + nz * 0.3, f)) { nx = -nx; nz = -nz; }
    const ix = nx * 0.1, iz = nz * 0.1, P = (t, ya, yb, c) => wallInto(Bf, ax + ix, az + iz, ax + ex * t + ix, az + ez * t + iz, ya, yb, nx, nz, c);
    if (roof) { wallInto(Bf, ax + ix, az + iz, bx + ix, bz + iz, y, y + 1.1, nx, nz, col('#9aa0a4')); wallInto(Bf, ax + ix, az + iz, bx + ix, bz + iz, y, y + 1.1, -nx, -nz, col('#9aa0a4')); continue; }
    const isExit = k === 0 && Math.abs((X.px - ax) * nx + (X.pz - az) * nz) < 0.3 && (X.px - ax) * ex + (X.pz - az) * ez > 0 && (X.px - ax) * ex + (X.pz - az) * ez < L;
    if (isExit) { // glass entrance with a 2.4 m doorway
      const t = (X.px - ax) * ex + (X.pz - az) * ez;
      wallInto(Bf, ax + ix, az + iz, ax + ex * (t - 1.2) + ix, az + ez * (t - 1.2) + iz, y, ceil, nx, nz, T_COLS.glass);
      wallInto(Bf, ax + ex * (t + 1.2) + ix, az + ez * (t + 1.2) + iz, bx + ix, bz + iz, y, ceil, nx, nz, T_COLS.glass);
      wallInto(Bf, ax + ex * (t - 1.2) + ix, az + ez * (t - 1.2) + iz, ax + ex * (t + 1.2) + ix, az + ez * (t + 1.2) + iz, y + 2.8, ceil, nx, nz, T_COLS.wall);
      continue;
    }
    P(L, y, y + 0.9, T_COLS.wall); P(L, y + 2.5, ceil, T_COLS.wall);
    for (let t = 0; t + 1.4 < L; t += 3) wallInto(Bf, ax + ex * (t + 1.4) + ix, az + ez * (t + 1.4) + iz, ax + ex * Math.min(L, t + 1.6) + ix, az + ez * Math.min(L, t + 1.6) + iz, y + 0.9, y + 2.5, nx, nz, T_COLS.dark); // mullions
  }
  const box = (u, v, su, sh, sv, c, solid = true, yb = y) => {
    const [x, z] = W(u, v);
    for (const [a, b] of [[su / 2, sv / 2], [-su / 2, sv / 2], [su / 2, -sv / 2], [-su / 2, -sv / 2]]) { const [px, pz] = W(u + a, v + b); if (!inRing(px, pz, f)) return null; }
    const s0 = Bf.pos.length; boxInto(Bf, 0, 0, 0, su, sh, sv, c);
    for (let q = s0; q < Bf.pos.length; q += 3) { const pu = Bf.pos[q], pv = Bf.pos[q + 2]; Bf.pos[q] = x + pu * ux + pv * vx; Bf.pos[q + 1] += yb; Bf.pos[q + 2] = z + pu * uz + pv * vz; const nu = Bf.nor[q], nv = Bf.nor[q + 2]; Bf.nor[q] = nu * ux + nv * vx; Bf.nor[q + 2] = nu * uz + nv * vz; }
    if (solid) { const c4 = [[-su / 2, -sv / 2], [su / 2, -sv / 2], [su / 2, sv / 2], [-su / 2, sv / 2]].map(([a, b]) => W(u + a, v + b)); for (let q = 0; q < 4; q++) segs.push(c4[q][0], c4[q][1], c4[(q + 1) % 4][0], c4[(q + 1) % 4][1], sh); }
    return { x, z, top: yb + sh };
  };
  const wall = (pa, pb, gaps, ya = y, yb = ceil) => { // an inside wall in u/v with doorway gaps at the given u/v distances
    const [ax, az] = W(...pa), [bx, bz] = W(...pb), L = Math.hypot(bx - ax, bz - az); if (L < 0.3) return;
    const ex = (bx - ax) / L, ez = (bz - az) / L, nx = -ez, nz = ex;
    for (const [s0, s1] of clipToRing(ax, az, bx, bz, f)) {
      let from = s0 * L; const cuts = gaps.filter((g) => g > s0 * L + 0.5 && g < s1 * L - 0.5).sort((p, q) => p - q);
      const piece = (t0, t1, y0, y1) => { if (t1 - t0 < 0.02) return; const px = ax + ex * t0, pz = az + ez * t0, qx = ax + ex * t1, qz = az + ez * t1; wallInto(Bf, px, pz, qx, qz, y0, y1, nx, nz, T_COLS.wall); wallInto(Bf, px, pz, qx, qz, y0, y1, -nx, -nz, T_COLS.wall); if (y0 === ya) segs.push(px, pz, qx, qz, 2.6); };
      for (const g of cuts) { piece(from, g - 0.45, ya, yb); piece(g - 0.45, g + 0.45, ya + 2.1, yb); from = g + 0.45; }
      piece(from, s1 * L, ya, yb);
    }
  };
  const lootOn = (spot, chance) => {
    if (!spot || r() > chance) return; const Lk = LOOT_KINDS[Math.floor(r() * LOOT_KINDS.length)];
    loot.push({ x: spot.x, z: spot.z, y: spot.top, kind: Lk, value: Math.round((Lk.min + r() * (Lk.max - Lk.min)) / 5) * 5 });
  };
  const liftCore = () => { // a lift core in the middle with two lift doors on each long side
    const cw = Math.min(5, (u1 - u0) * 0.35), cd = Math.min(3.2, (v1 - v0) * 0.3);
    if (!box(0, 0, cw, ceil - y, cd, T_COLS.wall)) return;
    for (const side of [-1, 1]) for (const du of [-cw / 4, cw / 4]) {
      const [lx, lz] = W(du, side * (cd / 2 + 0.02)); box(du, side * (cd / 2 + 0.03), 1.1, 2.2, 0.06, T_COLS.lift, false);
      lifts.push({ x: lx + vx * side * 1.6, z: lz + vz * side * 1.6, h: Math.atan2(vx * side, vz * side) });
    }
  };
  if (roof) {
    // rooftop: a pool for hotels and apartments, loungers, the lift housing
    if (TOWER.kind !== 'offices') {
      const pw = Math.min(10, (u1 - u0) * 0.5), pd = Math.min(5, (v1 - v0) * 0.35);
      if (box(0, (v1 - v0) * 0.18, pw + 1, 0.3, pd + 1, col('#d9d3c4'), false)) {
        box(0, (v1 - v0) * 0.18, pw, 0.31, pd, T_COLS.pool, false);
        for (let i = -2; i <= 2; i++) box(i * 1.6, (v1 - v0) * 0.18 - pd / 2 - 1.6, 0.7, 0.35, 1.8, col('#f2f2ee'));
      }
    }
    const lb = box(0, -(v1 - v0) * 0.22, 3.4, 3, 3, col('#8e9499'));
    if (lb) { const [lx, lz] = W(0, -(v1 - v0) * 0.22 + 2.4); lifts.push({ x: lx, z: lz, h: Math.atan2(vx, vz) }); }
  } else if (k === 0 && TOWER.kind === 'mall') {
    buildMallConcourse({ box, wall, u0, u1, v0, v1, W, y, ceil, segs, r });
  } else if (k === 0) {
    liftCore();
    const [ex, ez] = [X.ix, X.iz], ru = (ex - cx) * ux + (ez - cz) * uz, rv = (ex - cx) * vx + (ez - cz) * vz;
    const desk = box(ru * 0.45, rv * 0.45, 3.6, 1.1, 0.8, T_COLS.wood);
    if (desk) {
      const P = makePerson({ shirt: '#f4f4f2', shorts: '#1f2a3a' }); const [qx, qz] = W(ru * 0.38, rv * 0.38); P.root.position.set(qx, y, qz); P.root.rotation.y = Math.atan2(X.ix - qx, X.iz - qz); scene.add(P.root); TOWER.people.push(P);
    }
    for (const s of [-1, 1]) { box(s * (u1 - u0) * 0.3, rv * 0.2, 2.2, 0.8, 0.9, col('#3b4a57')); box(s * (u1 - u0) * 0.38, rv * 0.5, 0.6, 1.6, 0.6, T_COLS.plant); }
  } else {
    liftCore();
    // a corridor down the long axis, rooms either side every ~4.5 m
    const hw = 1.1, roomW = TOWER.kind === 'offices' ? 9 : 4.6;
    for (const side of [-1, 1]) {
      const doors = []; for (let u = u0 + roomW / 2; u < u1; u += roomW) doors.push(u - u0 + 1);
      wall([u0 - 1, side * hw], [u1 + 1, side * hw], doors.map((d) => d));
      for (let u = u0 + roomW; u < u1 - 1; u += roomW) wall([u, side * hw], [u, side * (v1 - v0 + 2)], []);
      for (let u = u0 + roomW / 2; u < u1; u += roomW) {
        const vm = side * (hw + (side > 0 ? v1 - hw : -v0 - hw) / 2);
        if (TOWER.kind === 'offices') { lootOn(box(u, vm, 1.6, 0.75, 0.8, T_COLS.desk), 0.35); box(u + 2.2, vm, 1.6, 0.75, 0.8, T_COLS.desk); }
        else {
          lootOn(box(u, vm + side * 0.6, 1.6, 0.55, 2.0, T_COLS.bed), 0.3);
          lootOn(box(u + 1.6, vm - side * 0.4, 0.5, 0.55, 0.45, T_COLS.wood), 0.35);
          box(u - 1.5, vm, 0.5, 1.0, 1.2, T_COLS.dark);
        }
      }
    }
  }
  // lighting baked into the colours, like the houses
  for (let q = 0; q < Bf.col.length; q += 3) { const sh = Bf.nor[q + 1] > 0.5 ? 0.92 : Bf.nor[q + 1] < -0.5 ? 1 : 0.76 + 0.14 * Math.abs(Bf.nor[q]) + 0.08 * Math.abs(Bf.nor[q + 2]); Bf.col[q] *= sh; Bf.col[q + 1] *= sh; Bf.col[q + 2] *= sh; }
  TOWER.geo = toGeometry(Bf); TOWER.mesh = new THREE.Mesh(TOWER.geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })); scene.add(TOWER.mesh);
  for (const L of loot) { const m = new THREE.Mesh(LOOT_GEO, lootMat(L.kind.col)); m.scale.set(L.kind.w, L.kind.h, L.kind.w * 0.7); m.position.set(L.x, L.y + L.kind.h / 2, L.z); scene.add(m); L.mesh = m; }
  TOWER.loot = loot; TOWER.lifts = lifts;
  TOWER.grid = makeGrid(segs, Math.min(...f.filter((_, i) => i % 2 === 0)) - 5, Math.min(...f.filter((_, i) => i % 2)) - 5, Math.max(...f.filter((_, i) => i % 2 === 0)) + 5, Math.max(...f.filter((_, i) => i % 2)) + 5);
  GRIDS.push(TOWER.grid);
}
// a shopping centre: a concourse down the middle, shop units either side named after the shops really inside
function buildMallConcourse(M) {
  const { box, wall, u0, u1, v0, v1, W, y, segs } = M;
  const names = [];
  for (const p of TOWER.pois || []) if (inRing(p[0], p[1], TOWER.f)) names.push(p);
  const fill = ['Coles', 'Woolworths', 'Kmart', 'Target', 'Big W', 'JB Hi-Fi', 'Cotton On', 'Priceline', 'Boost Juice', 'Myer', 'David Jones', 'Rebel', 'EB Games', 'Hoyts', 'Sushi Train', 'Gloria Jean\'s', 'Typo', 'Lowes', 'Best & Less', 'Officeworks'];
  const hw = 3.5, unit = 7, shops = [];
  let ni = 0;
  for (const side of [-1, 1]) {
    const doorsAt = []; for (let u = u0 + unit / 2; u < u1; u += unit) doorsAt.push(u - u0 + 1);
    wall([u0 - 1, side * hw], [u1 + 1, side * hw], doorsAt.flatMap((d) => [d - 1.2, d, d + 1.2]));
    for (let u = u0 + unit; u < u1 - 1; u += unit) wall([u, side * hw], [u, side * (v1 - v0 + 2)], []);
    for (let u = u0 + unit / 2; u < u1; u += unit) {
      const vIn = side * (hw + 2.4), counter = box(u, vIn, 2.6, 1.0, 0.7, T_COLS.wood);
      if (!counter) continue;
      const p = names[ni] || null, nm = p ? p[3] : fill[(ni + Math.floor(TOWER.base * 7)) % fill.length]; ni++;
      const [fx, fz] = W(u, side * (hw - 0.6)), [kx, kz] = W(u, vIn + side * 0.9);
      const cat = p ? p[2] : 3, sh = { id: 'mall-' + TOWER.name + '-' + ni, name: nm, cat, kind: shopKind(cat, nm), x: fx, z: fz, cx: fx + (kx - fx) * 0.25, cz: fz + (kz - fz) * 0.25, dx: fx, dz: fz, walkIn: false, keeper: null, robT: 0, robbedAt: -1e9, mall: true };
      // stand in front of the counter: the shop's service spot
      const [sx, sz] = W(u, vIn - side * 0.9); sh.cx = sx; sh.cz = sz;
      SHOPS.push(sh); shops.push(sh);
      const P = makePerson(); P.root.position.set(kx, y, kz); P.root.rotation.y = Math.atan2(sx - kx, sz - kz); scene.add(P.root); TOWER.people.push(P);
      addMallSign(nm, W, u, side * (hw - 0.02), side, y);
    }
  }
  TOWER.shops = shops;
  for (let u = u0 + 6; u < u1 - 4; u += 14) { box(u, 0, 2.4, 0.5, 0.8, col('#5a6670')); box(u + 3, 0, 1.0, 1.4, 1.0, T_COLS.plant); }
  void segs;
}
function addMallSign(name, W, u, v, side, y) {
  // one canvas per level holds every sign
  if (!TOWER.signCanvas) { const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; TOWER.signCanvas = c; TOWER.signN = 0; TOWER.signBuf = newBuf(); }
  const n = TOWER.signN++; if (n >= 64) return;
  const ctx = TOWER.signCanvas.getContext('2d'), sx = (n % 4) * 256, sy = Math.floor(n / 4) * 64;
  drawSign(ctx, sx, sy, 256, 64, name, styleFor(name, 3));
  const [x, z] = W(u, v), [bx, bz] = W(u, v - side), dx = bx - x, dz = bz - z, L = Math.hypot(dx, dz) || 1; // faces the concourse
  quadInto(TOWER.signBuf, x + (dx / L) * 0.05, y + 3.1, z + (dz / L) * 0.05, dx / L, dz / L, 3.2, 0.8, { u0: sx / 1024, u1: (sx + 256) / 1024, v0: 1 - (sy + 64) / 1024, v1: 1 - sy / 1024 });
}
function finishMallSigns() {
  if (!TOWER || !TOWER.signBuf || !TOWER.signBuf.pos.length) return;
  const t = new THREE.CanvasTexture(TOWER.signCanvas); t.encoding = THREE.sRGBEncoding;
  const m = new THREE.Mesh(toGeometry(TOWER.signBuf), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
  scene.add(m); TOWER.signMesh = m; TOWER.signBuf = null; TOWER.signCanvas = null;
}

// ---------------------------------------------------------------- inside: E for the lift, loot, the exit
function inTower(x, z) { return TOWER && inRing(x, z, TOWER.f); }
function towerUse() {
  if (player.state !== 'foot') return false;
  if (!TOWER) {
    const E = towerEntrance(1.5); if (!E) return false;
    enterTower(E); return true;
  }
  for (const L of TOWER.loot) if (!L.taken && Math.hypot(L.x - player.x, L.z - player.z) < 1.4) {
    L.taken = true; scene.remove(L.mesh); player.money += L.value; sfxTone([880, 1320], 0.12, 0.05); toast(`Took ${L.kind.name === 'cash' ? 'cash' : 'a ' + L.kind.name}: +$${L.value}`); saveGame(); return true;
  }
  for (const Lf of TOWER.lifts) if (Math.hypot(Lf.x - player.x, Lf.z - player.z) < 1.6) { openLift(); return true; }
  if (TOWER.level === 0 && Math.hypot(TOWER.exit.ix - player.x, TOWER.exit.iz - player.z) < 2.2) { leaveTower(); return true; }
  return false;
}
function openLift() {
  uiOpen = true; if (document.pointerLockElement) document.exitPointerLock();
  $('shop').hidden = false; $('shop-title').textContent = TOWER.name + ' — lift'; $('shop-sub').textContent = `You're on ${TOWER.level === 0 ? 'the ground floor' : TOWER.level > TOWER.floors ? 'the roof' : 'level ' + TOWER.level}. Pick a floor.`;
  const body = $('shop-body'); body.innerHTML = '';
  const grid = document.createElement('div'); grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;max-height:46vh;overflow:auto';
  const add = (label, k) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.style.minWidth = '52px'; b.disabled = k === TOWER.level; b.addEventListener('click', () => { closeShop(); rideLift(k); }); grid.appendChild(b); };
  add('G', 0); for (let k = 1; k <= TOWER.floors; k++) add(String(k), k); add('Roof', TOWER.floors + 1);
  body.appendChild(grid);
}
function rideLift(k) {
  sfxTone([523, 659], 0.15, 0.04);
  buildTowerLevel(k); finishMallSigns();
  const Lf = TOWER.lifts[0] || { x: TOWER.exit.ix, z: TOWER.exit.iz };
  player.x = Lf.x; player.z = Lf.z; player.y = 0; player.vy = 0;
  if (Lf.h !== undefined) { player.h = Lf.h; camYaw = Lf.h; } // step out of the lift facing away from it
  toast(k === 0 ? 'Ground floor' : k > TOWER.floors ? 'The roof' : `Level ${k}`);
}
let towerHintT = 0;
function updateTowers(dt) {
  towerHintT -= dt;
  if (TOWER && TOWER.signBuf) finishMallSigns();
  if (TOWER && player.state === 'foot' && !inTower(player.x, player.z) && TOWER.level === 0) { // walked out through the doors
    disposeTowerLevel(); TOWER = null;
  }
  if (TOWER && player.state !== 'foot' && player.state !== 'down' && TOWER.level !== 0) { const X = TOWER.exit; disposeTowerLevel(); TOWER = null; player.x = X.x; player.z = X.z; }
  if (towerHintT <= 0 && player.state === 'foot') {
    if (!TOWER) { const E = towerEntrance(1.5); if (E) { toast(`E: go inside ${E.B.name || 'the ' + ({ hotel: 'hotel', apartments: 'building', offices: 'office tower', mall: 'shopping centre' })[E.B.kind]}`); towerHintT = 6; } }
    else if (TOWER.lifts.some((L) => Math.hypot(L.x - player.x, L.z - player.z) < 1.6)) { toast('E: call the lift'); towerHintT = 6; }
  }
}
