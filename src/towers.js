// Gold Coast Streets — hotels, towers and malls you can go inside.
// Walk up to a tall building (or a shopping centre) and press E: you step into its lobby, built inside the real
// footprint. The lift goes to every floor (hotel rooms, apartments or offices, with the real view out the windows)
// and up to the roof. Shopping centres get a concourse lined with the shops that are really inside them.

let TOWER = null; // the building you're inside: { b, f, name, kind, floors, level, y, top, mesh, geo, grid, lifts, exit, shops, loot, people }

function towerKindOf(h, kind, area, name) {
  if (kind === 6) return area >= 100 ? 'school' : null; // buildings inside school grounds
  if (kind === 7) return area >= 150 ? 'hospital' : null;
  if ((/fair|town centre|shopping|plaza|marketplace|mall|harbour town|australia fair/i.test(name || '') && area >= 1500) || (kind === 2 && area > 7000 && h < 30)) return 'mall'; // a kiosk or sign sharing the name isn't the centre
  if (h < 14 || area < 250) return null;
  if (/hotel|resort|hilton|marriott|sofitel|novotel|star|crowne|meriton|peppers|qt |vibe|mantra|ibis|holiday inn|langham|jw /i.test(name || '')) return 'hotel';
  if (kind === 1) return 'apartments';
  return kind === 2 || kind === 5 || kind === 3 ? 'offices' : 'apartments';
}
// big buildings near a point: the Surfers core plus the streamed tiles
function bigBuildingsNear(x, z, r) {
  const out = [];
  const consider = (b, name, pois, core) => { // core buildings use their own kind numbers: 6 and 7 mean school/hospital only in tiles
    const f = b.slice(3); let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let q = 0; q < f.length; q += 2) { x0 = Math.min(x0, f[q]); x1 = Math.max(x1, f[q]); z0 = Math.min(z0, f[q + 1]); z1 = Math.max(z1, f[q + 1]); }
    if (x < x0 - r || x > x1 + r || z < z0 - r || z > z1 + r) return;
    const area = Math.abs(polyArea(f));
    if (!name && area > 2500 && b[0] < 30 && REGION) { // a big unnamed shop building inside a mapped shopping centre takes its name
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      let bd = 220; for (const [lx, lz, ln] of REGION.landmarks) { const d = Math.hypot(lx - cx, lz - cz); if (d < bd && /fair|centre|plaza|shopping|marketplace|town/i.test(ln) && !/^[A-Z]{2,4} /.test(ln)) { bd = d; name = ln; } } // skip stores like "MBE Pacific Fair"
    }
    const bk = core && b[2] >= 6 ? 2 : b[2];
    let marked = false; // a shopping-centre marker from the map inside or right beside a big low building: that's the centre
    if (!name && area > 5000 && b[0] < 30 && bk === 2 && REGION && REGION.search) { // the big unnamed shop halls of a centre take the nearest centre's name
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; let bd = 450;
      for (const [nm, k2, sx, sz] of REGION.search) if (k2 === 5 && !/^[A-Z]{2,4} /.test(nm)) { const d = Math.hypot(sx - cx, sz - cz); if (d < bd) { bd = d; name = nm; marked = true; } }
    }
    if (!marked && area > 1200 && b[0] < 30 && bk !== 6 && bk !== 7 && REGION && REGION.search && (!name || !/fair|centre|plaza|shopping|mall|village|marketplace/i.test(name)))
      for (const [nm, k2, sx, sz] of REGION.search) if (k2 === 5 && sx > x0 - 30 && sx < x1 + 30 && sz > z0 - 30 && sz < z1 + 30 && (sx > x0 && sx < x1 && sz > z0 && sz < z1 ? inRing(sx, sz, f) || area > 2500 : area > 2500)) { name = nm; marked = true; break; }
    if (!name && (bk === 6 || bk === 7) && REGION && REGION.search) { // a school or hospital building takes its campus name
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; let bd = 350;
      for (const [nm, k2, sx, sz] of REGION.search) if ((k2 === 1 && bk === 6) || (k2 === 4 && bk === 7)) { const d = Math.hypot(sx - cx, sz - cz); if (d < bd) { bd = d; name = nm; } }
    }
    const kind = marked ? 'mall' : towerKindOf(b[0], bk, area, name);
    if (kind) out.push({ b, f, name: name || '', kind, area, pois, x0, z0, x1, z1 });
  };
  if (inCore(x, z) || Math.abs(x) < 1600 && Math.abs(z) < 1900) MAP.buildings.forEach((b, bi) => consider(b, MAP.details && MAP.details.bnames && MAP.details.bnames[bi], CORE_POIS(), true));
  for (const T of TILES.values()) // big footprints can sit across a tile edge, so look in every loaded tile nearby
    if (T.blds && x > T.x0 - r - 600 && x < T.x0 + REGION.tile + r + 600 && z > T.z0 - r - 600 && z < T.z0 + REGION.tile + r + 600) T.blds.forEach((b, bi) => { if (!b.skip) consider(b, T.bnames && T.bnames[bi], T.pois); });
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
  const B = E.B, h = /^Q1\b/.test(B.name) ? 245 : B.b[0];
  let gy = groundAt(E.px, E.pz); // the floor sits on the highest ground inside the walls, so the hill outside never pokes up through it
  for (let x = B.x0 + 4; x < B.x1; x += 8) for (let z = B.z0 + 4; z < B.z1; z += 8) if (inRing(x, z, B.f)) gy = Math.max(gy, groundAt(x, z));
  gy = Math.min(gy, groundAt(E.px, E.pz) + 2.5); // ...within a big step up from the doors
  let mallLevels = null;
  if (B.kind === 'mall') { const lv = new Set(); for (const p of B.pois || []) if (inRing(p[0], p[1], B.f) && p[5] !== null && p[5] !== undefined) lv.add(p[5]); mallLevels = [...lv].sort((a, b) => a - b); if (!mallLevels.length) mallLevels = [0]; }
  const floors = B.kind === 'mall' ? mallLevels.length - 1 : B.kind === 'school' ? Math.max(0, Math.round((h - 3.4) / 3.4)) : /^Q1\b/.test(B.name) ? 77 : Math.max(1, Math.floor((h - 4.5) / 3.1));
  TOWER = { b: B.b, f: B.f, name: B.name || ({ hotel: 'Hotel', apartments: 'Apartments', offices: 'Office tower', mall: 'Shopping centre', school: 'School building', hospital: 'Hospital' })[B.kind], kind: B.kind, floors, level: 0,
    mallLevels, base: gy, top: gy + h, exit: { x: E.px + E.nx * 1.2, z: E.pz + E.nz * 1.2, ix: E.px - E.nx * 1.5, iz: E.pz - E.nz * 1.5, nx: E.nx, nz: E.nz, ex: E.ex, ez: E.ez, px: E.px, pz: E.pz }, pois: B.pois, people: [] };
  if (B.kind === 'mall') { TOWER.levelH = clamp((h - 0.3) / (floors + 1), 3.4, 5.5); TOWER.top = Math.max(TOWER.top, gy + (floors + 1) * TOWER.levelH); }
  buildTowerLevel(0);
  player.x = TOWER.exit.ix; player.z = TOWER.exit.iz; player.h = Math.atan2(-E.nx, -E.nz); camYaw = player.h;
  if (TOWER.casino && TOWER.casino.length) toast(`${TOWER.name} — the casino floor is in the lobby: E at a table`); else toast(TOWER.kind === 'mall' ? `${TOWER.name} — walk up to a shop counter, E to buy` : TOWER.kind === 'school' ? `${TOWER.name} — classrooms off the corridor` : `${TOWER.name} — lifts are in the middle (E)`);
}
function leaveTower() {
  const X = TOWER.exit; disposeTowerLevel(); TOWER = null;
  player.x = X.x; player.z = X.z; player.h = Math.atan2(X.nx, X.nz); camYaw = player.h;
}
function disposeTowerLevel() {
  if (!TOWER || !TOWER.mesh) return;
  scene.remove(TOWER.mesh); TOWER.geo.dispose(); TOWER.mesh.material.dispose();
  if (TOWER.furnMesh) { scene.remove(TOWER.furnMesh); TOWER.furnMesh.geometry.dispose(); TOWER.furnMesh = null; }
  if (TOWER.signMesh) { scene.remove(TOWER.signMesh); TOWER.signMesh.geometry.dispose(); TOWER.signMesh.material.map.dispose(); TOWER.signMesh.material.dispose(); }
  for (const L of TOWER.loot || []) if (L.mesh) scene.remove(L.mesh);
  for (const p of TOWER.people) disposePerson(p);
  for (const S of TOWER.shoppers || []) disposePerson(S.m); TOWER.shoppers = null;
  for (const sh of TOWER.shops || []) { const k = SHOPS.indexOf(sh); if (k >= 0) SHOPS.splice(k, 1); }
  const gi = GRIDS.indexOf(TOWER.grid); if (gi >= 0) GRIDS.splice(gi, 1);
  TOWER.mesh = null; TOWER.people = []; TOWER.shops = []; TOWER.loot = []; TOWER.casino = null;
}
function levelY(k) {
  if (TOWER.kind === 'mall') return TOWER.base + k * TOWER.levelH; // levels shared out over the building's height (the roof is the car park)
  if (TOWER.kind === 'school') return k > TOWER.floors ? TOWER.top : TOWER.base + k * 3.4;
  return k === 0 ? TOWER.base : k > TOWER.floors ? TOWER.top : TOWER.base + 4.5 + (k - 1) * 3.1;
}

function buildTowerLevel(k) {
  disposeTowerLevel();
  const mall = TOWER.kind === 'mall', f = TOWER.f, n = f.length / 2, y = levelY(k), roof = k > TOWER.floors;
  const ceil = roof ? y + 40 : mall ? y + TOWER.levelH - 0.25 : TOWER.kind === 'school' ? y + 3.1 : k === 0 ? Math.min(TOWER.top - 0.1, y + 4.4) : y + 2.9;
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
  const floorCol = mall && !roof ? T_COLS.tile : k === 0 ? T_COLS.marble : roof ? col('#c8c4ba') : TOWER.kind === 'offices' ? T_COLS.carpet2 : T_COLS.carpet;
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
  } else if (mall) {
    buildMallConcourse({ box, wall, u0, u1, v0, v1, W, y, ceil, segs, r, k, cx, cz, ux, uz, vx, vz, lifts });
  } else if (k === 0 && TOWER.kind !== 'school') {
    liftCore();
    const [ex, ez] = [X.ix, X.iz], ru = (ex - cx) * ux + (ez - cz) * uz, rv = (ex - cx) * vx + (ez - cz) * vz;
    const desk = box(ru * 0.45, rv * 0.45, 3.6, 1.1, 0.8, T_COLS.wood);
    if (desk) {
      const P = makePerson({ shirt: '#f4f4f2', shorts: '#1f2a3a' }); const [qx, qz] = W(ru * 0.38, rv * 0.38); P.root.position.set(qx, y, qz); P.root.rotation.y = Math.atan2(X.ix - qx, X.iz - qz); scene.add(P.root); TOWER.people.push(P);
    }
    for (const s of [-1, 1]) { box(s * (u1 - u0) * 0.3, rv * 0.2, 2.2, 0.8, 0.9, col('#3b4a57')); box(s * (u1 - u0) * 0.38, rv * 0.5, 0.6, 1.6, 0.6, T_COLS.plant); }
    if (/star|casino|jupiters/i.test(TOWER.name)) { // the casino floor: blackjack, poker and slot tables in the lobby
      TOWER.casino = [];
      [['blackjack', -0.22], ['poker', 0], ['slots', 0.22]].forEach(([g, f]) => { const t2 = box((u1 - u0) * f, -rv * 0.25, 2.6, 0.9, 1.6, col('#1f6b3a')); if (t2) TOWER.casino.push({ x: t2.x, z: t2.z, game: g }); });
    }
  } else {
    const school = TOWER.kind === 'school';
    if (!school || TOWER.floors > 0) liftCore(); // schools: stairs only on blocks with an upper floor
    // a corridor down the long axis, rooms either side every ~4.5 m (classrooms every ~8 m)
    const hw = school ? 1.4 : 1.1, roomW = TOWER.kind === 'offices' ? 9 : school ? 8 : 4.6;
    for (const side of [-1, 1]) {
      const doors = []; for (let u = u0 + roomW / 2; u < u1; u += roomW) doors.push(u - u0 + 1);
      wall([u0 - 1, side * hw], [u1 + 1, side * hw], doors.map((d) => d));
      for (let u = u0 + roomW; u < u1 - 1; u += roomW) wall([u, side * hw], [u, side * (v1 - v0 + 2)], []);
      for (let u = u0 + roomW / 2; u < u1; u += roomW) {
        const vm = side * (hw + (side > 0 ? v1 - hw : -v0 - hw) / 2);
        if (school) { // rows of student desks facing a whiteboard and the teacher's desk
          const depth = Math.abs(side > 0 ? v1 - hw : -v0 - hw);
          for (let r2 = 0; r2 < 3; r2++) for (let c2 = -1; c2 <= 1; c2++) box(u + c2 * 1.9, side * (hw + 2.2 + r2 * 1.5), 1.1, 0.72, 0.6, col('#c8a77a'));
          lootOn(box(u + 2.6, side * (hw + 1.0), 1.4, 0.75, 0.7, T_COLS.wood), 0.2);
          if (depth > 6) box(u, side * (hw + depth - 0.1), 3.2, 1.2, 0.06, col('#f7f7f4'), false, y + 0.9); // whiteboard on the back wall
        } else if (TOWER.kind === 'offices') { lootOn(box(u, vm, 1.6, 0.75, 0.8, T_COLS.desk), 0.35); box(u + 2.2, vm, 1.6, 0.75, 0.8, T_COLS.desk); }
        else {
          lootOn(box(u, vm + side * 0.6, 1.6, 0.55, 2.0, T_COLS.bed), 0.3);
          lootOn(box(u + 1.6, vm - side * 0.4, 0.5, 0.55, 0.45, T_COLS.wood), 0.35);
          box(u - 1.5, vm, 0.5, 1.0, 1.2, T_COLS.dark);
        }
      }
    }
  }
  // lighting baked into the colours, like the houses
  // (kept a notch below white: pale marble and plaster otherwise blow out to a haze under the filmic tone curve)
  for (let q = 0; q < Bf.col.length; q += 3) { const sh = (Bf.nor[q + 1] > 0.5 ? 0.8 : Bf.nor[q + 1] < -0.5 ? 0.6 : 0.6 + 0.12 * Math.abs(Bf.nor[q]) + 0.07 * Math.abs(Bf.nor[q + 2])) * (Bf.pos[q + 1] < TOWER.y + 0.6 ? 0.85 : 1); Bf.col[q] *= sh; Bf.col[q + 1] *= sh; Bf.col[q + 2] *= sh; }
  TOWER.geo = toGeometry(Bf); TOWER.mesh = new THREE.Mesh(TOWER.geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })); scene.add(TOWER.mesh);
  if (TOWER.furnB && TOWER.furnB.pos.length) { TOWER.furnMesh = new THREE.Mesh(toGeometry(TOWER.furnB), INTERIOR_MAT); scene.add(TOWER.furnMesh); } TOWER.furnB = null; // shop fit-outs
  for (const L of loot) { const m = new THREE.Mesh(LOOT_GEO, lootMat(L.kind.col)); m.scale.set(L.kind.w, L.kind.h, L.kind.w * 0.7); m.position.set(L.x, L.y + L.kind.h / 2, L.z); scene.add(m); L.mesh = m; }
  TOWER.loot = loot; TOWER.lifts = lifts;
  TOWER.grid = makeGrid(segs, Math.min(...f.filter((_, i) => i % 2 === 0)) - 5, Math.min(...f.filter((_, i) => i % 2)) - 5, Math.max(...f.filter((_, i) => i % 2 === 0)) + 5, Math.max(...f.filter((_, i) => i % 2)) + 5);
  GRIDS.push(TOWER.grid);
  if (TOWER.kind === 'mall') spawnMallShoppers();
}
// shoppers wandering the concourse: they walk to somewhere in sight, look in a window for a while, move on
function spawnMallShoppers() {
  TOWER.shoppers = [];
  const f = TOWER.f; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let q = 0; q < f.length; q += 2) { x0 = Math.min(x0, f[q]); x1 = Math.max(x1, f[q]); z0 = Math.min(z0, f[q + 1]); z1 = Math.max(z1, f[q + 1]); }
  const want = Math.round(clamp(Math.round(Math.abs(polyArea(f)) / 200), 12, 90) * GFX.cfg.crowd);
  for (let tries = 0; tries < want * 15 && TOWER.shoppers.length < want; tries++) {
    const nearYou = tries % 2 === 0, a = rand() * TAU, r = 4 + rand() * 45; // half of them around where you came in
    const x = nearYou ? player.x + Math.cos(a) * r : x0 + rand() * (x1 - x0), z = nearYou ? player.z + Math.sin(a) * r : z0 + rand() * (z1 - z0);
    if (!inRing(x, z, f) || resolveCircle(x, z, 0.5)) continue;
    const m = makePerson(); m.root.position.set(x, TOWER.y, z); scene.add(m.root);
    TOWER.shoppers.push({ m, x, z, tx: x, tz: z, idle: rand() * 5, ph: rand() * TAU, h: rand() * TAU, bag: rand() < 0.4 });
  }
  TOWER.shopBox = [x0, z0, x1, z1];
}
function updateMallShoppers(dt) {
  if (!TOWER || !TOWER.shoppers) return;
  const [x0, z0, x1, z1] = TOWER.shopBox;
  for (const S of TOWER.shoppers) {
    const M = S.m;
    if (S.idle > 0) {
      S.idle -= dt; animatePerson(M, S.ph, 0);
      if (S.idle <= 0) for (let k = 0; k < 8; k++) { // somewhere new within sight
        const a = rand() * TAU, d = 4 + rand() * 16, tx = clamp(S.x + Math.cos(a) * d, x0, x1), tz = clamp(S.z + Math.sin(a) * d, z0, z1);
        if (inRing(tx, tz, TOWER.f) && !resolveCircle(tx, tz, 0.45) && rayWalls(S.x, S.z, tx, tz, 1) >= 1) { S.tx = tx; S.tz = tz; break; }
      }
    } else {
      const dx = S.tx - S.x, dz = S.tz - S.z, d = Math.hypot(dx, dz);
      if (d < 0.3) S.idle = 2 + rand() * 7;
      else {
        const nx = S.x + dx / d * 1.1 * dt, nz = S.z + dz / d * 1.1 * dt;
        if (resolveCircle(nx, nz, 0.35) || Math.hypot(nx - player.x, nz - player.z) < 0.6) { S.idle = 0.6 + rand(); continue; } // someone in the way: wait, then go another way
        S.x = nx; S.z = nz; S.h += angDiff(S.h, Math.atan2(dx, dz)) * Math.min(1, dt * 6); S.ph += dt * 2.8; animatePerson(M, S.ph, 0.7);
      }
    }
    if (S.bag) M.armR.rotation.x = 0.1;
    M.root.position.set(S.x, TOWER.y, S.z); M.root.rotation.set(0, S.h, 0);
  }
}
// a shopping centre: a concourse down the middle, shop units either side named after the shops really inside
function buildMallConcourse(M) {
  const lv = TOWER.mallLevels ? TOWER.mallLevels[M.k] : null, one = !TOWER.mallLevels || TOWER.mallLevels.length < 2;
  const here = (TOWER.pois || []).filter((p) => inRing(p[0], p[1], TOWER.f) && (one || (p[5] === null || p[5] === undefined ? TOWER.mallLevels[0] : p[5]) === lv));
  if (here.length >= 12) return buildMallFromShops(M, here);
  if (M.k > 0) return;
  buildMallCorridor(M);
}
const ANCHOR_RE = /myer|david jones|kmart|big w|target|coles|woolworths|aldi|event|hoyts|harris farm|jb hi-fi|rebel|harvey norman|bunnings|officeworks|h&m|uniqlo|cotton on mega|best & less|spotlight/i;
function buildMallFromShops(M, here) {
  // walkways join the real shop positions (a spanning tree, squared off like a real centre); shopfronts line both
  // sides, and each real shop takes the shopfront nearest where it really is
  const { box, wall, W, y, ceil, cx, cz, ux, uz, vx, vz, lifts } = M;
  const UV = (x, z) => [(x - cx) * ux + (z - cz) * uz, (x - cx) * vx + (z - cz) * vz];
  const X = TOWER.exit, pts = here.slice(0, 140).map((p) => UV(p[0], p[1]));
  pts.unshift(UV(X.ix, X.iz));
  const inTree = [0], segsC = [], HW = 4.5, DEPTH = 10, UNIT = 8;
  const dist = pts.map(() => Infinity), from = pts.map(() => 0); dist[0] = -1;
  for (let i = 1; i < pts.length; i++) dist[i] = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
  for (let n = 1; n < pts.length; n++) { // Prim's spanning tree
    let bi = -1; for (let i = 0; i < pts.length; i++) if (dist[i] >= 0 && (bi < 0 || dist[i] < dist[bi])) bi = i;
    if (bi < 0) break; const a = pts[from[bi]], c = pts[bi]; dist[bi] = -1; inTree.push(bi);
    if (Math.abs(c[0] - a[0]) > 1) segsC.push([a[0], a[1], c[0], a[1]]); // along u, then along v
    if (Math.abs(c[1] - a[1]) > 1) segsC.push([c[0], a[1], c[0], c[1]]);
    for (let i = 0; i < pts.length; i++) if (dist[i] >= 0) { const d = Math.hypot(pts[i][0] - c[0], pts[i][1] - c[1]); if (d < dist[i]) { dist[i] = d; from[i] = bi; } }
  }
  const inWalk = (u, v, pad) => segsC.some(([a0, b0, a1, b1]) => u > Math.min(a0, a1) - HW - pad && u < Math.max(a0, a1) + HW + pad && v > Math.min(b0, b1) - HW - pad && v < Math.max(b0, b1) + HW + pad);
  const taken = new Set(), cell = (u, v) => Math.round(u / 4) + ',' + Math.round(v / 4);
  const units = [];
  for (const [a0, b0, a1, b1] of segsC) {
    const alongU = Math.abs(a1 - a0) > Math.abs(b1 - b0), L = Math.hypot(a1 - a0, b1 - b0);
    for (let t = UNIT / 2; t < L; t += UNIT) {
      const su = a0 + (a1 - a0) * t / L, sv = b0 + (b1 - b0) * t / L;
      for (const side of [-1, 1]) {
        const du = alongU ? 0 : side, dv = alongU ? side : 0, u = su + du * (HW + DEPTH / 2), v = sv + dv * (HW + DEPTH / 2);
        if (units.length > 380 || inWalk(u, v, -1) || taken.has(cell(u, v))) continue;
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p, q]) => W(u + p * (alongU ? UNIT : DEPTH) / 2, v + q * (alongU ? DEPTH : UNIT) / 2));
        if (!corners.every(([x, z]) => inRing(x, z, TOWER.f))) continue;
        for (let q = -1; q <= 1; q++) for (let r2 = -1; r2 <= 1; r2++) taken.add(cell(u + q * 3, v + r2 * 3));
        units.push({ u, v, dir: [-du, -dv], poi: null });
      }
    }
  }
  for (const p of here.slice(0, 140)) { // real shops into their nearest shopfront
    const [pu, pv] = UV(p[0], p[1]); let best = null, bd = 40;
    for (const U of units) { if (U.poi) continue; const d = Math.hypot(U.u - pu, U.v - pv); if (d < bd) { bd = d; best = U; } }
    if (best) best.poi = p;
  }
  const shops = [], hs = UNIT / 2, hd = DEPTH / 2;
  for (const U of units) {
    const [du, dv] = U.dir, eu = -dv, ev = du; // front faces the walkway
    const fu = U.u + du * hd, fv = U.v + dv * hd, bu = U.u - du * hd, bvv = U.v - dv * hd;
    wall([bu - eu * hs, bvv - ev * hs], [bu + eu * hs, bvv + ev * hs], [], y, ceil);
    for (const s2 of [-1, 1]) wall([U.u + eu * hs * s2 - du * hd, U.v + ev * hs * s2 - dv * hd], [U.u + eu * hs * s2 + du * hd, U.v + ev * hs * s2 + dv * hd], [], y, ceil);
    const [nx, nz] = [du * ux + dv * vx, du * uz + dv * vz], [fx, fz] = W(fu, fv);
    if (!U.poi) { box(fu - du * 0.15, fv - dv * 0.15, Math.abs(eu) * UNIT + Math.abs(du) * 0.2, 3.2, Math.abs(ev) * UNIT + Math.abs(dv) * 0.2, col('#a8adb2'), true); continue; } // a closed roller door
    const p = U.poi, counter = box(U.u - du * 2.5, U.v - dv * 2.5, Math.abs(eu) * 3 + Math.abs(du) * 0.7, 1.0, Math.abs(ev) * 3 + Math.abs(dv) * 0.7, T_COLS.wood);
    if (!counter) continue;
    const [sx, sz] = W(U.u - du * 1.3, U.v - dv * 1.3), [kx, kz] = W(U.u - du * 3.4, U.v - dv * 3.4);
    const sh = { id: 'mall-' + p[4], name: p[3], cat: p[2], kind: shopKind(p[2], p[3]), x: fx, z: fz, cx: sx, cz: sz, dx: fx, dz: fz, walkIn: false, keeper: null, robT: 0, robbedAt: -1e9, mall: true };
    SHOPS.push(sh); shops.push(sh);
    const P = makePerson(); P.root.position.set(kx, y, kz); P.root.rotation.y = Math.atan2(sx - kx, sz - kz); scene.add(P.root); TOWER.people.push(P);
    addSignAt(p[3], fx + nx * 0.06, fz + nz * 0.06, nx, nz, y + 3.7, Math.min(UNIT - 0.6, 0.28 * p[3].length + 1.8));
    // fitted out like the real shop: room coordinates from the shopfront, inward away from the walkway
    const ex = eu * ux + ev * vx, ez = eu * uz + ev * vz, ix = -nx, iz = -nz;
    const Pm = (a, b, yy) => [fx + ex * a + ix * b, y + yy, fz + ez * a + iz * b], seg = (a, b, c, d, h) => { const q = [[a, c], [b, c], [b, d], [a, d]].map(([m, n]) => Pm(m, n, 0)); for (let j = 0; j < 4; j++) M.segs.push(q[j][0], q[j][2], q[(j + 1) % 4][0], q[(j + 1) % 4][2], h); };
    if (!TOWER.furnB) TOWER.furnB = newBuf();
    furnish(TOWER.furnB, { name: p[3], kind: sh.kind, t0: -hs + 0.25, t1: hs - 0.25, depth: DEPTH - 0.15, counterV: hd + 2.5, x: fx, z: fz }, Pm, seg, { noCounter: true });
  }
  TOWER.shops = shops;
  // the food court: tables either side of the walkway nearest the middle, with people sitting down to eat
  let fc = null, fd = Infinity;
  for (const S2 of segsC) { if (Math.hypot(S2[2] - S2[0], S2[3] - S2[1]) < 16) continue; const d = Math.hypot((S2[0] + S2[2]) / 2, (S2[1] + S2[3]) / 2); if (d < fd) { fd = d; fc = S2; } }
  if (fc) foodCourt(M, (fc[0] + fc[2]) / 2, (fc[1] + fc[3]) / 2, Math.abs(fc[2] - fc[0]) > Math.abs(fc[3] - fc[1]), 2.6);
  if (TOWER.floors > 0 && segsC.length) { // escalators on the walkway nearest the middle
    let best = segsC[0], bd = Infinity;
    for (const S2 of segsC) { const mu = (S2[0] + S2[2]) / 2, mv = (S2[1] + S2[3]) / 2, d = Math.hypot(mu, mv); if (d < bd && Math.hypot(S2[2] - S2[0], S2[3] - S2[1]) > 12) { bd = d; best = S2; } }
    const mu = (best[0] + best[2]) / 2, mv = (best[1] + best[3]) / 2, alongU = Math.abs(best[2] - best[0]) > Math.abs(best[3] - best[1]);
    box(mu, mv, alongU ? 9 : 1.6, 1.1, alongU ? 1.6 : 9, col('#8e979e'), true);
    const [lx, lz] = W(mu + (alongU ? 0 : 2.2), mv + (alongU ? 2.2 : 0)); lifts.push({ x: lx, z: lz, h: Math.atan2(alongU ? vx : ux, alongU ? vz : uz) });
  }
}
function foodCourt(M, mu, mv, alongU, off) {
  const { box, W, y } = M;
  for (let k = -2; k <= 2; k++) for (const sd of [-1, 1]) {
    const tu = mu + (alongU ? k * 3.2 : sd * off), tv = mv + (alongU ? sd * off : k * 3.2), t = box(tu, tv, 1.0, 0.75, 1.0, col('#c9a77c'));
    if (!t) continue;
    for (const cs of [-1, 1]) {
      const cu = tu + (alongU ? cs * 0.85 : 0), cv = tv + (alongU ? 0 : cs * 0.85);
      box(cu, cv, 0.45, 0.45, 0.45, col('#3a3d40'), false);
      if (rand() < 0.55) { // someone eating, facing the table
        const [px, pz] = W(cu, cv), [tx, tz] = W(tu, tv), P = makePerson();
        P.root.position.set(px, y - 0.42, pz); P.root.rotation.y = Math.atan2(tx - px, tz - pz);
        P.legL.rotation.x = P.legR.rotation.x = -1.5; P.armL.rotation.x = P.armR.rotation.x = -0.9;
        scene.add(P.root); TOWER.people.push(P);
      }
    }
  }
}
function addSignAt(name, x, z, nx, nz, yy, w) {
  if (!TOWER.signCanvas) { const c = document.createElement('canvas'); c.width = 1024; c.height = 2048; TOWER.signCanvas = c; TOWER.signN = 0; TOWER.signBuf = newBuf(); }
  const n = TOWER.signN++; if (n >= 128) return;
  const ctx = TOWER.signCanvas.getContext('2d'), sx = (n % 4) * 256, sy = Math.floor(n / 4) * 64;
  drawSign(ctx, sx, sy, 256, 64, name, styleFor(name, 3));
  quadInto(TOWER.signBuf, x, yy, z, nx, nz, w, w / 4, { u0: sx / 1024, u1: (sx + 256) / 1024, v0: 1 - (sy + 64) / 2048, v1: 1 - sy / 2048 });
}
function buildMallCorridor(M) {
  const { box, wall, u0, u1, v0, v1, W, y, segs, ux, uz, vx, vz } = M;
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
      // the fit-out behind the shopfront (room coordinates: along the corridor, then inward)
      const [ox, oz] = W(u, side * hw), Pm = (a, b, yy) => [ox + ux * a + side * vx * b, y + yy, oz + uz * a + side * vz * b];
      const seg = (a, b, c, d, h) => { const q = [[a, c], [b, c], [b, d], [a, d]].map(([m, n]) => Pm(m, n, 0)); for (let j = 0; j < 4; j++) segs.push(q[j][0], q[j][2], q[(j + 1) % 4][0], q[(j + 1) % 4][2], h); };
      if (!TOWER.furnB) TOWER.furnB = newBuf();
      furnish(TOWER.furnB, { name: nm, kind: sh.kind, t0: -unit / 2 + 0.3, t1: unit / 2 - 0.3, depth: Math.min(6, Math.abs(v1 - v0) + 2 - hw), counterV: 2.4, x: fx, z: fz }, Pm, seg, { noCounter: true });
    }
  }
  TOWER.shops = shops;
  for (let u = u0 + 6; u < u1 - 4; u += 14) { if (Math.abs(u - (u0 + u1) / 2) < 9) continue; box(u, 0, 2.4, 0.5, 0.8, col('#5a6670')); box(u + 3, 0, 1.0, 1.4, 1.0, T_COLS.plant); }
  if (u1 - u0 > 30) foodCourt(M, (u0 + u1) / 2, 0, true, 1.6); // a few tables to sit at
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
  for (const C of TOWER.casino || []) if (TOWER.level === 0 && Math.hypot(C.x - player.x, C.z - player.z) < 2.4) { openCasino(C.game); return true; }
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
  if (TOWER.kind === 'mall') { // shopping centres: escalators between the real levels, and the rooftop car park
    $('shop-title').textContent = TOWER.name + ' — escalators';
    TOWER.mallLevels.forEach((lv, k) => add('Level ' + (TOWER.mallLevels[0] === 0 ? lv + 1 : lv), k)); add('Rooftop', TOWER.floors + 1);
  } else { add('G', 0); for (let k = 1; k <= TOWER.floors; k++) add(String(k), k); add('Roof', TOWER.floors + 1); }
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
  towerHintT -= dt; updateMallShoppers(dt);
  if (TOWER && TOWER.signBuf) finishMallSigns();
  if (TOWER && player.state === 'foot' && !inTower(player.x, player.z) && TOWER.level === 0) { // walked out through the doors
    disposeTowerLevel(); TOWER = null;
  }
  if (TOWER && player.state !== 'foot' && player.state !== 'down' && TOWER.level !== 0) { const X = TOWER.exit; disposeTowerLevel(); TOWER = null; player.x = X.x; player.z = X.z; }
  if (towerHintT <= 0 && player.state === 'foot') {
    if (!TOWER) { const E = towerEntrance(1.5); if (E) { toast(`E: go inside ${E.B.name || 'the ' + ({ hotel: 'hotel', apartments: 'building', offices: 'office tower', mall: 'shopping centre', school: 'school building', hospital: 'hospital' })[E.B.kind]}`); towerHintT = 6; } }
    else if (TOWER.lifts.some((L) => Math.hypot(L.x - player.x, L.z - player.z) < 1.6)) { toast('E: call the lift'); towerHintT = 6; }
  }
}
