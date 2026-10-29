// Gold Coast Streets — every house can be entered.
// Each house in a streamed tile gets a front door (facing its street) and a back door, plus side fences between it and
// its neighbours. Kicking in the front door brings the police; jumping a side fence and going in the back is quiet
// unless someone sees you. Inside, rooms are fitted to the house's real outline, with furniture and loot.

const HOUSE_ACTIVE = [];          // houses with their interior built (the nearest few)
let LOOTED = new Set();           // house ids already emptied (kept apart from the main save so old saves still load)
try { LOOTED = new Set(JSON.parse(localStorage.getItem('gcs-looted') || '[]')); } catch (e) { /* storage blocked */ }
function saveLooted() { try { localStorage.setItem('gcs-looted', JSON.stringify([...LOOTED].slice(-5000))); } catch (e) { /* storage blocked */ } }

function inRing(x, z, f) {
  let c = false; const n = f.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = f[2 * i], zi = f[2 * i + 1], xj = f[2 * j], zj = f[2 * j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
// the part of segment a->b that lies inside the polygon, as [t0, t1] pieces
function clipToRing(ax, az, bx, bz, f) {
  const ts = [0, 1], n = f.length / 2;
  for (let q = 0; q < n; q++) {
    const t = segIntersect(ax, az, bx, bz, f[2 * q], f[2 * q + 1], f[(2 * q + 2) % (2 * n)], f[(2 * q + 3) % (2 * n)]);
    if (t > 0 && t < 1) ts.push(t);
  }
  ts.sort((p, q) => p - q);
  const out = [];
  for (let k = 0; k < ts.length - 1; k++) {
    const m = (ts[k] + ts[k + 1]) / 2;
    if (ts[k + 1] - ts[k] > 0.02 && inRing(ax + (bx - ax) * m, az + (bz - az) * m, f)) out.push([ts[k], ts[k + 1]]);
  }
  return out;
}

// ---------------------------------------------------------------- doors and fences, made with the tile
const DOOR_W = { front: 1.0, back: 0.9 }, DOOR_H = 2.1;
// openings for tileBuildings: edge index -> [[t0, t1, lintel above the base]], and the door records
function houseOpenings(data, bi, f, base) {
  const d = data.bdoor && data.bdoor[bi]; if (!d) return null;
  const n = f.length / 2, cuts = new Map(), doors = [];
  let floorY = -Infinity; for (let q = 0; q < n; q++) floorY = Math.max(floorY, groundAt(f[2 * q], f[2 * q + 1]));
  floorY += 0.12;
  ['front', 'back'].forEach((type, k) => {
    const q = d[k]; if (q < 0 || q >= n) return;
    const ax = f[2 * q], az = f[2 * q + 1], bx = f[(2 * q + 2) % (2 * n)], bz = f[(2 * q + 3) % (2 * n)], L = Math.hypot(bx - ax, bz - az);
    const w = DOOR_W[type]; if (L < w + 0.8) return;
    const ex = (bx - ax) / L, ez = (bz - az) / L, tm = L / 2;
    let nx = ez, nz = -ex; const mx = ax + ex * tm, mz = az + ez * tm;
    if (inRing(mx + nx * 0.3, mz + nz * 0.3, f)) { nx = -nx; nz = -nz; }
    cuts.set(q, [[tm - w / 2, tm + w / 2, floorY - base + DOOR_H]]);
    doors.push({ type, x: mx, z: mz, ex, ez, nx, nz, w, y: floorY, open: 0, target: 0, kicked: false });
  });
  return { cuts, doors, floorY };
}
const DOOR_GEO = new THREE.BoxGeometry(1, DOOR_H - 0.02, 0.05).translate(0.5, DOOR_H / 2, 0);
const DOOR_MAT = new THREE.MeshStandardMaterial({ color: col('#ffffff'), roughness: 0.6, envMapIntensity: 0.3 });
const DOOR_COLS = ['#6e4a2f', '#8a5a36', '#2f3b45', '#3d4a3a', '#f0ede6', '#5a2f2a'].map(col);
const FENCE_COL = col('#5f6b5a');
// after the walls exist: fences in the side gaps beside each front wall, then the door panels
function tileHouses(T, data, segs) {
  if (!T.houses || !T.houses.length) return;
  const temp = makeGrid(segs, T.x0 - 60, T.z0 - 60, T.x0 + REGION.tile + 60, T.z0 + REGION.tile + 60);
  GRIDS.push(temp);
  const FB = newBuf(); T.fences = [];
  for (const H of T.houses) {
    const fd = H.doors.find((d) => d.type === 'front'); if (!fd) continue;
    // the front wall's two corners: walk sideways from each until a neighbour (or 4 m)
    const f = H.f, n = f.length / 2;
    let q = -1, best = 1e9;
    for (let k = 0; k < n; k++) { const mx = (f[2 * k] + f[(2 * k + 2) % (2 * n)]) / 2, mz = (f[2 * k + 1] + f[(2 * k + 3) % (2 * n)]) / 2, dd = Math.hypot(mx - fd.x, mz - fd.z); if (dd < best) { best = dd; q = k; } }
    const A = [f[2 * q], f[2 * q + 1]], B = [f[(2 * q + 2) % (2 * n)], f[(2 * q + 3) % (2 * n)]];
    for (const [P, sx, sz] of [[A, -fd.ex, -fd.ez], [B, fd.ex, fd.ez]]) {
      const ox = P[0] - fd.nx * 1.2, oz = P[1] - fd.nz * 1.2; // a little behind the front wall line
      const t = rayWalls(ox + sx * 0.12, oz + sz * 0.12, ox + sx * 6, oz + sz * 6, 1), len = t < 1 ? t * 5.88 + 0.12 : 3.5;
      if (len < 0.5 || !tileIsLand(ox + sx * len, oz + sz * len)) continue;
      const bx = ox + sx * len, bz = oz + sz * len;
      segs.push(ox, oz, bx, bz, 1.6); T.fences.push([ox, oz, bx, bz]);
      const g0 = groundAt(ox, oz), g1 = groundAt(bx, bz);
      // panel as a thin wall both ways
      wallInto(FB, ox, oz, bx, bz, Math.min(g0, g1) - 0.3, Math.max(g0, g1) + 1.6, -sz, sx, FENCE_COL);
      wallInto(FB, ox, oz, bx, bz, Math.min(g0, g1) - 0.3, Math.max(g0, g1) + 1.6, sz, -sx, FENCE_COL);
    }
  }
  GRIDS.splice(GRIDS.indexOf(temp), 1);
  if (FB.pos.length) { const g = toGeometry(FB), m = new THREE.Mesh(g, buildingMats.plain); m.castShadow = true; T.meshes.push(m); T.disposables.push(g); }
  // door panels: one instance each, swung open when used
  const all = []; for (const H of T.houses) for (const d of H.doors) { d.house = H; all.push(d); }
  if (!all.length) return;
  const im = new THREE.InstancedMesh(DOOR_GEO, DOOR_MAT, all.length);
  all.forEach((d, k) => { d.inst = k; d.mesh = im; doorMatrix(d); im.setColorAt(k, DOOR_COLS[(((d.house.seed + k) % DOOR_COLS.length) + DOOR_COLS.length) % DOOR_COLS.length]); });
  im.castShadow = true; im.frustumCulled = false; T.meshes.push(im); T.disposables.push(im); T.doorMesh = im; // instances span the tile
}
const _dm = new THREE.Matrix4(), _dq = new THREE.Quaternion(), _de = new THREE.Euler(), _dv = new THREE.Vector3(), _ds = new THREE.Vector3();
function doorMatrix(d) {
  // hinge on one side of the opening; it swings inwards
  const hx = d.x - d.ex * d.w / 2, hz = d.z - d.ez * d.w / 2, a = Math.atan2(-d.ez, d.ex) + d.open * 1.75 * (d.nx * -d.ez + d.nz * d.ex > 0 ? -1 : 1);
  _de.set(0, a, 0); _dq.setFromEuler(_de);
  _dm.compose(_dv.set(hx, d.y, hz), _dq, _ds.set(d.w, 1, 1)); d.mesh.setMatrixAt(d.inst, _dm); d.mesh.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------- interiors
const FLOOR_COLS = ['#b98a5c', '#c9a77c', '#d8d2c6', '#9c7a58', '#e2dccf'].map(col);
const WALL_IN = ['#f3efe6', '#ece6d8', '#e8eef0', '#f1e9dc', '#e4e9e1'].map(col);
const FURN = { couch: ['#5b6670', '#7a5b4a', '#3f4f5f', '#8b8b7a'].map(col), wood: col('#8a6a4a'), white: col('#f4f4f2'), steel: col('#b8bcc0'),
  dark: col('#1d2125'), bed: ['#e9e4da', '#cfd8e0', '#e6d7cf'].map(col), rug: ['#a2563f', '#4f6d7a', '#c2a46a'].map(col), tile: col('#e8eaec') };
const LOOT_KINDS = [
  { name: 'cash', col: '#3f9b4e', min: 20, max: 160, w: 0.22, h: 0.06 }, { name: 'jewellery', col: '#e2c25a', min: 80, max: 400, w: 0.16, h: 0.08 },
  { name: 'phone', col: '#15181b', min: 60, max: 220, w: 0.09, h: 0.02 }, { name: 'laptop', col: '#9aa0a6', min: 150, max: 420, w: 0.36, h: 0.03 },
  { name: 'watch', col: '#c0c4c8', min: 50, max: 300, w: 0.07, h: 0.03 }, { name: 'gaming console', col: '#222', min: 120, max: 300, w: 0.3, h: 0.07 },
];
const LOOT_MATS = new Map();
function lootMat(c) { if (!LOOT_MATS.has(c)) LOOT_MATS.set(c, new THREE.MeshStandardMaterial({ color: col(c), emissive: col(c), emissiveIntensity: 0.35, roughness: 0.4 })); return LOOT_MATS.get(c); }
const LOOT_GEO = new THREE.BoxGeometry(1, 1, 1);

function buildHouseInterior(H) {
  const f = H.f, n = f.length / 2, y0 = H.floorY, top = Math.min(y0 + 2.7, H.base + H.top - 0.05), r = mulberry32(H.seed);
  const fd = H.doors.find((d) => d.type === 'front') || H.doors[0];
  const B = newBuf(), segs = [];
  const floorC = FLOOR_COLS[Math.floor(r() * FLOOR_COLS.length)], wallC = WALL_IN[Math.floor(r() * WALL_IN.length)];
  // floor and ceiling
  const contour = []; for (let q = 0; q < n; q++) contour.push(new THREE.Vector2(f[2 * q], f[2 * q + 1]));
  let tris = []; try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { /* odd outline */ }
  for (const t of tris) {
    const P = t.map((k) => [f[2 * k], 0, f[2 * k + 1]]);
    triInto(B, [P[0][0], y0, P[0][2]], [P[1][0], y0, P[1][2]], [P[2][0], y0, P[2][2]], 1); for (let v = 0; v < 3; v++) { B.nor.push(0, 1, 0); B.col.push(floorC.r, floorC.g, floorC.b); }
    triInto(B, [P[0][0], top, P[0][2]], [P[1][0], top, P[1][2]], [P[2][0], top, P[2][2]], -1); for (let v = 0; v < 3; v++) { B.nor.push(0, -1, 0); B.col.push(0.95, 0.95, 0.94); }
  }
  // lining just inside the outer walls (the outside walls only face out), with the door gaps and a window per long wall
  let cx = 0, cz = 0; for (let q = 0; q < n; q++) { cx += f[2 * q]; cz += f[2 * q + 1]; } cx /= n; cz /= n;
  const glass = col('#bcd7e6');
  for (let q = 0; q < n; q++) {
    const ax = f[2 * q], az = f[2 * q + 1], bx = f[(2 * q + 2) % (2 * n)], bz = f[(2 * q + 3) % (2 * n)], L = Math.hypot(bx - ax, bz - az); if (L < 0.05) continue;
    const ex = (bx - ax) / L, ez = (bz - az) / L; let nx = -ez, nz = ex;
    if (!inRing((ax + bx) / 2 + nx * 0.3, (az + bz) / 2 + nz * 0.3, f)) { nx = -nx; nz = -nz; } // inward
    const ix = nx * 0.08, iz = nz * 0.08;
    const gaps = H.doors.filter((d) => Math.abs((d.x - ax) * nx + (d.z - az) * nz) < 0.2 && (d.x - ax) * ex + (d.z - az) * ez > 0 && (d.x - ax) * ex + (d.z - az) * ez < L)
      .map((d) => { const t = (d.x - ax) * ex + (d.z - az) * ez; return [t - d.w / 2, t + d.w / 2]; });
    let from = 0;
    const piece = (t0, t1, ya, yb) => { if (t1 - t0 > 0.01) wallInto(B, ax + ex * t0 + ix, az + ez * t0 + iz, ax + ex * t1 + ix, az + ez * t1 + iz, ya, yb, nx, nz, wallC); };
    for (const [t0, t1] of gaps) { piece(from, t0, y0, top); piece(t0, t1, y0 + DOOR_H, top); from = t1; }
    piece(from, L, y0, top);
    if (!gaps.length && L > 3) quadInto(B, ax + ex * L / 2 + nx * 0.1, y0 + 1.5, az + ez * L / 2 + nz * 0.1, nx, nz, Math.min(1.6, L - 1.2), 1.0, null, glass);
  }
  // rooms: a cross wall splits the living area (front) from the bedrooms (back); the back splits into 2-3 rooms
  const ux = -fd.nz, uz = fd.nx, vx = -fd.nx, vz = -fd.nz; // u along the front, v from front to back
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (let q = 0; q < n; q++) { const u = f[2 * q] * ux + f[2 * q + 1] * uz, v = f[2 * q] * vx + f[2 * q + 1] * vz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const W = (u, v) => [u * ux + v * vx, u * uz + v * vz];
  const partition = (pa, pb, doorsAt) => { // an inside wall from pa to pb (u,v), clipped to the outline, with 0.9 m doorways at the given fractions
    const [ax, az] = W(...pa), [bx, bz] = W(...pb), L = Math.hypot(bx - ax, bz - az); if (L < 0.5) return;
    const ex = (bx - ax) / L, ez = (bz - az) / L, nx = -ez, nz = ex;
    for (const [s0, s1] of clipToRing(ax, az, bx, bz, f)) {
      const cuts = doorsAt.map((d) => d * L).filter((t) => t > s0 * L + 0.6 && t < s1 * L - 0.6).map((t) => [t - 0.45, t + 0.45]);
      let from = s0 * L;
      const piece = (t0, t1, ya, yb) => {
        if (t1 - t0 < 0.02) return;
        const px = ax + ex * t0, pz = az + ez * t0, qx = ax + ex * t1, qz = az + ez * t1;
        wallInto(B, px, pz, qx, qz, ya, yb, nx, nz, wallC); wallInto(B, px, pz, qx, qz, ya, yb, -nx, -nz, wallC);
        if (ya === y0) segs.push(px, pz, qx, qz, 2.6);
      };
      for (const [t0, t1] of cuts) { piece(from, t0, y0, top); piece(t0, t1, y0 + DOOR_H, top); from = t1; }
      piece(from, s1 * L, y0, top);
    }
  };
  const depth = v1 - v0, width = u1 - u0, rooms = [];
  if (depth > 7.5 && width > 5) {
    const vs = v0 + depth * (0.48 + r() * 0.08), nb = width > 13 ? 3 : 2, splits = [];
    for (let k = 1; k < nb; k++) splits.push(u0 + (width * k) / nb);
    partition([u0 - 1, vs], [u1 + 1, vs], [...Array(nb).keys()].map((k) => (0.5 + k) / nb * (width / (width + 2)) + 1 / (width + 2)));
    for (const us of splits) partition([us, vs], [us, v1 + 1], []);
    rooms.push({ kind: 'living', ua: u0, ub: u1, va: v0, vb: vs });
    const edges = [u0, ...splits, u1];
    for (let k = 0; k < nb; k++) rooms.push({ kind: k === nb - 1 && nb === 3 ? 'bath' : 'bed', ua: edges[k], ub: edges[k + 1], va: vs, vb: v1 });
  } else rooms.push({ kind: 'living', ua: u0, ub: u1, va: v0, vb: v1 });
  // furniture: kept inside the outline, a little off the walls
  const props = [], loot = [];
  const place = (u, v, sx, sy, sz, c, solid = true) => {
    const [x, z] = W(u, v);
    if (!inRing(x, z, f)) return null;
    for (const [ox, oz] of [[sx / 2, sz / 2], [-sx / 2, sz / 2], [sx / 2, -sz / 2], [-sx / 2, -sz / 2]]) { const [px, pz] = W(u + ox, v + oz); if (!inRing(px, pz, f)) return null; }
    // boxInto is axis-aligned, so build the box in u/v and rotate it into place
    const s0 = B.pos.length; boxInto(B, 0, 0, 0, sx, sy, sz, c);
    for (let k = s0; k < B.pos.length; k += 3) { const pu = B.pos[k], pv = B.pos[k + 2]; B.pos[k] = x + pu * ux + pv * vx; B.pos[k + 1] += y0; B.pos[k + 2] = z + pu * uz + pv * vz; const nu = B.nor[k], nv = B.nor[k + 2]; B.nor[k] = nu * ux + nv * vx; B.nor[k + 2] = nu * uz + nv * vz; }
    if (solid) { const c4 = [[-sx / 2, -sz / 2], [sx / 2, -sz / 2], [sx / 2, sz / 2], [-sx / 2, sz / 2]].map(([a, b]) => W(u + a, v + b)); for (let k = 0; k < 4; k++) segs.push(c4[k][0], c4[k][1], c4[(k + 1) % 4][0], c4[(k + 1) % 4][1], sy); }
    return { x, z, top: y0 + sy };
  };
  const lootOn = (spot, chance) => {
    if (!spot || r() > chance) return;
    const L = LOOT_KINDS[Math.floor(r() * LOOT_KINDS.length)];
    loot.push({ x: spot.x + (r() - 0.5) * 0.3, z: spot.z + (r() - 0.5) * 0.3, y: spot.top, kind: L, value: Math.round((L.min + r() * (L.max - L.min)) / 5) * 5 });
  };
  for (const R of rooms) {
    const um = (R.ua + R.ub) / 2, vm = (R.va + R.vb) / 2, w = R.ub - R.ua, d = R.vb - R.va;
    if (R.kind === 'living') {
      place(um, R.va + d * 0.62, Math.min(2.4, w * 0.4), 0.85, 0.9, FURN.couch[Math.floor(r() * 4)]);
      lootOn(place(um, R.va + d * 0.42, 1.1, 0.45, 0.6, FURN.wood), 0.8);           // coffee table
      lootOn(place(um, R.va + 0.7, 1.8, 0.55, 0.45, FURN.dark), 0.7);               // TV unit
      place(um, R.va + 0.7, 1.3, 0.75, 0.06, FURN.dark, false);
      place(um, R.va + d * 0.42, Math.min(2.6, w * 0.5), 0.01, 1.8, FURN.rug[Math.floor(r() * 3)], false);
      lootOn(place(R.ub - 1.0, R.vb - 0.45, 2.2, 0.92, 0.65, FURN.white), 0.8);     // kitchen bench
      place(R.ub - 0.45, R.vb - 1.3, 0.8, 1.8, 0.75, FURN.steel);                    // fridge
      lootOn(place(R.ua + 1.2, R.vb - 1.2, 1.4, 0.75, 0.9, FURN.wood), 0.6);        // dining table
    } else if (R.kind === 'bed') {
      lootOn(place(um, vm + d * 0.1, Math.min(1.6, w * 0.6), 0.55, Math.min(2.0, d * 0.6), FURN.bed[Math.floor(r() * 3)]), 0.5);
      lootOn(place(R.ub - 0.35, R.va + 0.5, 0.45, 0.55, 0.45, FURN.wood), 0.9);     // bedside table
      lootOn(place(R.ua + 0.35, vm, 0.6, 2.0, Math.min(1.8, d * 0.5), FURN.wood), 0.5); // wardrobe
    } else {
      place(um, R.vb - 0.45, Math.min(1.6, w * 0.7), 0.55, 0.75, FURN.tile);         // bath
      lootOn(place(R.ua + 0.4, R.va + 0.5, 0.6, 0.85, 0.45, FURN.white), 0.4);      // vanity
    }
  }
  if (LOOTED.has(H.id)) loot.length = 0;
  // indoors the sun can't reach: lit evenly like the shop rooms, with soft shading baked in per face direction
  for (let k = 0; k < B.col.length; k += 3) {
    const nx = B.nor[k], ny = B.nor[k + 1], nz = B.nor[k + 2];
    const sh = ny > 0.5 ? 0.9 : ny < -0.5 ? 1.0 : 0.74 + 0.16 * Math.abs(nx) + 0.08 * Math.abs(nz);
    B.col[k] *= sh; B.col[k + 1] *= sh; B.col[k + 2] *= sh;
  }
  const geo = toGeometry(B), mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
  scene.add(mesh);
  for (const L of loot) {
    const m = new THREE.Mesh(LOOT_GEO, lootMat(L.kind.col)); m.scale.set(L.kind.w, L.kind.h, L.kind.w * 0.7); m.position.set(L.x, L.y + L.kind.h / 2, L.z); scene.add(m); L.mesh = m;
  }
  const grid = makeGrid(segs, H.x0, H.z0, H.x1, H.z1); GRIDS.push(grid);
  H.inside = { mesh, geo, grid, loot, top };
}
function disposeHouseInterior(H) {
  const I = H.inside; if (!I) return;
  scene.remove(I.mesh); I.geo.dispose(); I.mesh.material.dispose();
  for (const L of I.loot) if (L.mesh) scene.remove(L.mesh);
  const gi = GRIDS.indexOf(I.grid); if (gi >= 0) GRIDS.splice(gi, 1);
  H.inside = null;
  const k = HOUSE_ACTIVE.indexOf(H); if (k >= 0) HOUSE_ACTIVE.splice(k, 1);
}

// ---------------------------------------------------------------- the player and houses
function houseAt(x, z) {
  for (const H of HOUSE_ACTIVE) if (x > H.x0 && x < H.x1 && z > H.z0 && z < H.z1 && inRing(x, z, H.f)) return H;
  return null;
}
// where your feet are: a house floor when inside one, otherwise the ground
function standAt(x, z) { if (TOWER && inRing(x, z, TOWER.f)) return TOWER.y; const H = houseAt(x, z); return H ? H.floorY : groundAt(x, z); }
// indoors (a house or a tower level): the ceiling the camera stays under, or null outside
function indoorAt(x, z) { if (TOWER && inRing(x, z, TOWER.f)) return TOWER.level > TOWER.floors ? null : { top: TOWER.ceil }; const H = houseAt(x, z); return H && H.inside ? { top: H.inside.top } : null; }
function nearestDoor(x, z, maxD) {
  let best = null, bd = maxD;
  for (const H of houseCandidates(x, z, 30)) for (const d of H.doors) { if (!d.mesh) continue; const dd = Math.hypot(d.x - x, d.z - z); if (dd < bd) { bd = dd; best = d; } }
  return best;
}
function houseCandidates(x, z, r) {
  const T = tileAt(x, z); if (!T || !T.houses) return [];
  return T.houses.filter((H) => x > H.x0 - r && x < H.x1 + r && z > H.z0 - r && z < H.z1 + r);
}
let houseHintT = 0, houseSeq = null;
function witnessed(x, z, r) {
  for (const p of peds) if (!p.cop && p.state !== 'down' && Math.hypot(p.x - x, p.z - z) < r && rayWalls(p.x, p.z, x, z, 1.5) >= 1) return p;
  return null;
}
function updateHouses(dt) {
  if (!REGION) return;
  // build the interior of the house you're about to enter; drop ones you've left behind
  if (player.state === 'foot') {
    const d = nearestDoor(player.x, player.z, 16);
    if (d && !d.house.inside) { buildHouseInterior(d.house); HOUSE_ACTIVE.push(d.house); }
  }
  for (const H of HOUSE_ACTIVE.slice()) if (Math.hypot((H.x0 + H.x1) / 2 - player.x, (H.z0 + H.z1) / 2 - player.z) > 60) disposeHouseInterior(H);
  while (HOUSE_ACTIVE.length > 4) disposeHouseInterior(HOUSE_ACTIVE[0]);
  // doors swing
  for (const H of HOUSE_ACTIVE) for (const d of H.doors) if (d.open !== d.target) { d.open += clamp(d.target - d.open, -dt * 3, dt * 3); if (d.mesh) doorMatrix(d); }
  // a lock being picked at a back door
  if (houseSeq) {
    houseSeq.t += dt;
    if (player.state !== 'foot' || Math.hypot(player.x - houseSeq.x, player.z - houseSeq.z) > 0.6) { houseSeq = null; toast('Stopped'); }
    else if (houseSeq.t > 1.6) {
      const d = houseSeq.door; houseSeq = null; d.target = 1; d.locked = false; sfxTone([660], 0.08, 0.04);
      const w = witnessed(d.x, d.z, 12);
      if (w && rand() < 0.5) { addCrime(1, 'breakin'); toast('A neighbour saw you sneak in — cops called!'); } else toast('You slipped in the back door');
    }
  }
  // hints
  houseHintT -= dt;
  if (player.state === 'foot' && houseHintT <= 0) {
    const d = nearestDoor(player.x, player.z, 1.8);
    if (d && d.target === 0) { toast(d.type === 'front' ? 'E: kick in the front door (the neighbours will call the cops)' : 'E: sneak in the back door'); houseHintT = 6; }
    else if (nearFence(1.0)) { toast('Space: jump the fence'); houseHintT = 6; }
  }
}
// E near a door or loot; returns true if it did something
function houseUse() {
  if (player.state !== 'foot') return false;
  const H = houseAt(player.x, player.z) || (HOUSE_ACTIVE.length ? HOUSE_ACTIVE.find((h) => Math.hypot((h.x0 + h.x1) / 2 - player.x, (h.z0 + h.z1) / 2 - player.z) < 25) : null);
  if (H && H.inside) {
    let best = null, bd = 1.4;
    for (const L of H.inside.loot) { const dd = Math.hypot(L.x - player.x, L.z - player.z); if (!L.taken && dd < bd) { bd = dd; best = L; } }
    if (best) {
      best.taken = true; scene.remove(best.mesh); player.money += best.value; sfxTone([880, 1320], 0.12, 0.05);
      toast(`Took ${best.kind.name === 'cash' ? 'cash' : 'a ' + best.kind.name}: +$${best.value}`);
      if (H.inside.loot.every((L) => L.taken)) { LOOTED.add(H.id); saveLooted(); }
      if (typeof saveGame === 'function') saveGame();
      return true;
    }
  }
  const d = nearestDoor(player.x, player.z, 1.6); if (!d) return false;
  if (d.target > 0) { d.target = 0; return true; } // close it behind you
  if (d.type === 'front' && !d.kicked) {
    d.kicked = true; d.target = 1; player.punchT = 0.32; shake = Math.min(1, shake + 0.4); sfxNoise(0.25, 500, 0.6);
    addCrime(2, 'breakin'); toast('You kicked the front door in — the neighbours called the cops!');
    return true;
  }
  if (d.type === 'front') { d.target = 1; return true; }
  if (d.locked === false) { d.target = 1; return true; }
  houseSeq = { door: d, t: 0, x: player.x, z: player.z }; toast('Picking the back door lock…');
  return true;
}
// closed doors block like walls
function pushDoors(x, z, r) {
  for (const H of HOUSE_ACTIVE) for (const d of H.doors) {
    if (d.open > 0.35) continue;
    const ax = d.x - d.ex * d.w / 2, az = d.z - d.ez * d.w / 2, bx = d.x + d.ex * d.w / 2, bz = d.z + d.ez * d.w / 2;
    const t = clamp((x - ax) * d.ex + (z - az) * d.ez, 0, d.w), px = ax + d.ex * t, pz = az + d.ez * t, dx = x - px, dz = z - pz, dd = Math.hypot(dx, dz);
    if (dd < r) { const s = dd > 1e-4 ? 1 : 0; const nx = s ? dx / dd : d.nx, nz = s ? dz / dd : d.nz; x = px + nx * r; z = pz + nz * r; }
    void bx; void bz;
  }
  return [x, z];
}
function nearFence(maxD) {
  const T = tileAt(player.x, player.z); if (!T || !T.fences) return null;
  const hx = Math.sin(player.h), hz = Math.cos(player.h);
  let best = null, bd = maxD;
  for (const [ax, az, bx, bz] of T.fences) {
    const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1, t = clamp(((player.x - ax) * ex + (player.z - az) * ez) / L2, 0.02, 0.98);
    const px = ax + ex * t, pz = az + ez * t, dx = px - player.x, dz = pz - player.z, dd = Math.hypot(dx, dz);
    if (dd < bd && (dx * hx + dz * hz) > 0.3 * dd) { bd = dd; best = { px, pz, dx: dx / (dd || 1), dz: dz / (dd || 1) }; }
  }
  return best;
}
// Space at a fence: climb over it
function tryVault() {
  const F = nearFence(0.9); if (!F) return false;
  player.vault = { t: 0, fx: player.x, fz: player.z, tx: F.px + F.dx * 0.75, tz: F.pz + F.dz * 0.75 };
  sfxNoise(0.15, 900, 0.15);
  const w = witnessed(F.px, F.pz, 14);
  if (w && rand() < 0.4) { addCrime(1, 'trespass'); toast('Someone saw you jump the fence — cops called!'); }
  return true;
}
function updateVault(dt) {
  const V = player.vault; V.t += dt / 0.6; const k = Math.min(1, V.t);
  player.x = lerp(V.fx, V.tx, k); player.z = lerp(V.fz, V.tz, k); player.y = Math.sin(k * Math.PI) * 1.75; player.vy = 0;
  const P = player.model; P.legL.rotation.x = -1.1 * Math.sin(k * Math.PI); P.legR.rotation.x = -0.6 * Math.sin(k * Math.PI); P.armR.rotation.x = P.armL.rotation.x = -2.2 * Math.sin(k * Math.PI);
  P.root.position.set(player.x, standAt(player.x, player.z) + player.y, player.z); P.root.rotation.set(0, player.h, 0);
  if (k >= 1) { player.vault = null; player.y = 0; }
}
