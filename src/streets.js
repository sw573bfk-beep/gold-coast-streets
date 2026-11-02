// ============================================================================
// Gold Coast Streets — the street details, from OpenStreetMap where it's mapped (tools/fetch_details.py):
// zebra crossings, stop and give-way lines, bike lanes, painted car park bays, grassy medians with palms on divided
// roads, roundabout islands, bus stops and shelters, power poles and wires, benches, bins and barbecues, lifeguard
// towers with their flags, channel markers and lighthouses, mangroves, piers on piles, pontoons and moored boats
// behind canal houses, driveways and letterboxes, street-name signs on the corners, and dune grass on the beaches.
// ============================================================================
const STREET_MATS = {
  paint: new THREE.MeshStandardMaterial({ color: col('#f2f0e8'), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -10, envMapIntensity: 0.3 }),
  bike: new THREE.MeshStandardMaterial({ color: col('#3f8f4f'), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8, envMapIntensity: 0.3 }),
  concrete: new THREE.MeshStandardMaterial({ color: col('#c4bfb3'), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, envMapIntensity: 0.3 }),
  solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, envMapIntensity: 0.35 }),
  wire: new THREE.LineBasicMaterial({ color: col('#2a2a2a') }),
  glow: new THREE.MeshBasicMaterial({ color: col('#ffd9a0'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 }),
};
WET_MATS.push(STREET_MATS.paint);
const SC = (h) => col(h); // vertex colours
const SCOL = { pole: SC('#6e5a43'), steel: SC('#8d9499'), dark: SC('#2e3236'), green: SC('#2f5d3a'), bin: SC('#3a5a3e'), wood: SC('#8b6a48'), brick: SC('#a0573f'),
  white: SC('#f1f1ee'), blue: SC('#2c6fb3'), red: SC('#d23a2c'), yellow: SC('#f2c230'), glass: SC('#5e7480'), roof: SC('#d9d9d4'), grass: SC('#5f7f3f'), kerb: SC('#b9b4a8'),
  hull: SC('#f4f4f2'), cabin: SC('#c9d3d9'), deck: SC('#8a7158'), sand: SC('#d9c79a'), mangrove: SC('#2f4a28'), dune: SC('#8fa25a') };
// the nearest driveable road to a point (tile roads, and the Surfers core's roads near it)
function streetRoad(data, x, z, maxD, pred) {
  let best = null;
  const scan = (roads) => {
    for (const r of roads) {
      if (pred ? !pred(r[0]) : !DRIVE.has(r[0])) continue;
      for (let q = 4; q < r.length - 2; q += 2) {
        const ax = r[q], az = r[q + 1], ex = r[q + 2] - ax, ez = r[q + 3] - az;
        if (Math.abs(x - ax) > maxD + Math.abs(ex) + 2 || Math.abs(z - az) > maxD + Math.abs(ez) + 2) continue;
        const L2 = ex * ex + ez * ez || 1, t = clamp(((x - ax) * ex + (z - az) * ez) / L2, 0, 1), cx = ax + ex * t, cz = az + ez * t, d = Math.hypot(x - cx, z - cz);
        if (d < maxD && (!best || d < best.d)) { const L = Math.sqrt(L2); best = { d, cx, cz, tx: ex / L, tz: ez / L, w: r[1], r }; }
      }
    }
  };
  scan(data.roads); if (inCore(x, z) || Math.abs(x) < 1700 && Math.abs(z) < 2000) scan(MAP.roads);
  return best;
}
// a flat rectangle on the ground: centre, direction along its length, length and width
function groundRect(B, cx, cz, ux, uz, len, wid, lift) {
  const vx = -uz, vz = ux, hl = len / 2, hw = wid / 2, y = (px, pz) => groundAt(px, pz) + lift;
  const p = (a, b) => { const px = cx + ux * a + vx * b, pz = cz + uz * a + vz * b; return [px, y(px, pz), pz]; };
  const A = p(-hl, -hw), Bp = p(hl, -hw), C = p(hl, hw), D = p(-hl, hw);
  triInto(B, A, Bp, C, 1); triInto(B, A, C, D, 1); for (let k = 0; k < 6; k++) B.nor.push(0, 1, 0);
}
function streetMesh(T, B, mat, shadow) { if (!B.pos.length) return null; const g = toGeometry(B), m = new THREE.Mesh(g, mat); m.receiveShadow = true; if (shadow) m.castShadow = true; T.meshes.push(m); T.disposables.push(g); return m; }
// a box turned to face a direction (boxInto only does axis-aligned ones)
function boxAt(B, x, y, z, sx, sy, sz, c, a) {
  const s0 = B.pos.length, n0 = B.nor.length; boxInto(B, 0, y, 0, sx, sy, sz, c);
  const ca = Math.cos(a), sa = Math.sin(a);
  for (let k = s0; k < B.pos.length; k += 3) { const px = B.pos[k], pz = B.pos[k + 2]; B.pos[k] = x + px * ca + pz * sa; B.pos[k + 2] = z - px * sa + pz * ca; }
  for (let k = n0; k < B.nor.length; k += 3) { const nx = B.nor[k], nz = B.nor[k + 2]; B.nor[k] = nx * ca + nz * sa; B.nor[k + 2] = -nx * sa + nz * ca; }
}
const ringOf = (poly) => (Array.isArray(poly[0]) ? poly[0] : poly);
const pipRing = (x, z, f) => { let c = false; for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) if ((f[i + 1] > z) !== (f[j + 1] > z) && x < ((f[j] - f[i]) * (z - f[i + 1])) / (f[j + 1] - f[i + 1]) + f[i]) c = !c; return c; };
const inTile = (T, x, z) => x >= T.x0 && z >= T.z0 && x < T.x0 + REGION.tile && z < T.z0 + REGION.tile;
const tileWater = (T, x, z) => T.mask && inTile(T, x, z) && T.mask[clamp(Math.floor((z - T.z0) * 0.5), 0, 499) * 500 + clamp(Math.floor((x - T.x0) * 0.5), 0, 499)] === 0;

function tileStreets(T, data, segs) {
  const r = mulberry32(T.i * 6151 + T.j * 3571), paint = newBuf(), bike = newBuf(), conc = newBuf(), solid = newBuf();
  // ---------------------------------------------------------------- crossings, stop lines, give-way lines
  const sig = data.signals || [];
  for (const [x, z] of data.cross || []) {
    const R = streetRoad(data, x, z, 5); if (!R || R.w < 5) continue;
    const nx = -R.tz, nz = R.tx;
    if (sig.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 30)) { for (const s of [-1.6, 1.6]) groundRect(paint, R.cx + R.tx * s, R.cz + R.tz * s, nx, nz, R.w, 0.3, 0.085); } // lights: two lines across
    else for (let k = -R.w / 2 + 0.6; k <= R.w / 2 - 0.5; k += 1.05) groundRect(paint, R.cx + nx * k, R.cz + nz * k, R.tx, R.tz, 3.0, 0.5, 0.085); // a zebra
  }
  const stopBar = (cx, cz, dx, dz, w, dashed) => { // across the lanes coming towards (cx, cz) from direction (dx, dz); we drive on the left
    const lx = -dz, lz = dx; // left of the traffic heading in (-dx, -dz)
    if (dashed) for (let k = 0.4; k < w / 2; k += 0.9) groundRect(paint, cx + lx * k, cz + lz * k, dx, dz, 0.35, 0.5, 0.086);
    else groundRect(paint, cx + lx * w / 4, cz + lz * w / 4, lx, lz, w / 2 - 0.2, 0.45, 0.086);
  };
  const legs = (x, z, back, fn) => { // each road leaving a point: the spot `back` metres along it
    for (const rd of data.roads) {
      if (!DRIVE.has(rd[0]) || rd[1] < 5) continue;
      for (let q = 4; q < rd.length; q += 2) {
        if (Math.hypot(rd[q] - x, rd[q + 1] - z) > 4) continue;
        for (const dir of [-2, 2]) { // walk away from the junction along the road
          let px = rd[q], pz = rd[q + 1], left = back, k = q;
          while (left > 0 && k + dir >= 4 && k + dir < rd.length - 1) { const nx = rd[k + dir], nz = rd[k + dir + 1], L = Math.hypot(nx - px, nz - pz); if (L >= left) { px += (nx - px) * left / L; pz += (nz - pz) * left / L; left = 0; break; } left -= L; px = nx; pz = nz; k += dir; }
          if (left > 0) continue;
          const L = Math.hypot(px - rd[q], pz - rd[q + 1]) || 1; fn(px, pz, (px - rd[q]) / L, (pz - rd[q + 1]) / L, rd[1]);
        }
        break;
      }
    }
  };
  for (const [x, z] of sig) legs(x, z, 8.5, (px, pz, dx, dz, w) => stopBar(px, pz, dx, dz, w, false));
  for (const [x, z, stop] of data.stopl || []) { const R = streetRoad(data, x, z, 5); if (R) { const s = Math.sign((x - R.cx) * -R.tz + (z - R.cz) * R.tx) || 1; stopBar(R.cx, R.cz, R.tx * s, R.tz * s, R.w, !stop); } }
  // ---------------------------------------------------------------- bike lanes (green strip and a line, on the side(s) mapped)
  for (const b of data.bike || []) {
    const side = b[0], w = b[1], p = b.slice(2);
    for (const s of side === 1 ? [1, -1] : side === 2 ? [1] : [-1]) { ribbonInto(bike, p, s * (w / 2 - 0.85), 0.7, 0.08, 6, 1); ribbonInto(paint, p, s * (w / 2 - 1.65), 0.06, 0.085, 6, 1); }
  }
  // ---------------------------------------------------------------- car park bays
  let bays = 0;
  for (const poly of (data.areas && data.areas.parking) || []) {
    const f = ringOf(poly), n = f.length / 2; if (n < 4 || bays > 7000) continue;
    let A = 0; for (let q = 0; q < n; q++) A += f[2 * q] * f[(2 * q + 3) % (2 * n)] - f[(2 * q + 2) % (2 * n)] * f[2 * q + 1]; A = Math.abs(A / 2);
    if (A < 250 || A > 60000) continue;
    let ux = 1, uz = 0, best = 0; for (let q = 0; q < n; q++) { const ex = f[(2 * q + 2) % (2 * n)] - f[2 * q], ez = f[(2 * q + 3) % (2 * n)] - f[2 * q + 1], L = Math.hypot(ex, ez); if (L > best) { best = L; ux = ex / L; uz = ez / L; } }
    const vx = -uz, vz = ux; let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (let q = 0; q < n; q++) { const u = f[2 * q] * ux + f[2 * q + 1] * uz, v = f[2 * q] * vx + f[2 * q + 1] * vz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const at = (u, v) => [ux * u + vx * v, uz * u + vz * v];
    for (let v = v0 + 0.5; v + 5.4 < v1; v += 17.3) for (const row of [0, 5.4]) for (let u = u0 + 1; u < u1 - 1; u += 2.6) {
      const [ax, az] = at(u, v + row), [bx, bz] = at(u, v + row + 5.4), [mx, mz] = at(u, v + row + 2.7);
      if (!pipRing(ax, az, f) || !pipRing(bx, bz, f) || !pipRing(mx, mz, f)) continue;
      groundRect(paint, mx, mz, vx, vz, 5.0, 0.12, 0.07); if (++bays > 7000) break;
    }
  }
  // ---------------------------------------------------------------- medians and roundabout islands
  const seen = new Set(), med = [];
  for (const m of data.med || []) { const k = Math.round((m[0] + m[2]) / 8) + ',' + Math.round((m[1] + m[3]) / 8); if (seen.has(k)) continue; seen.add(k); med.push(m); }
  const palms = [], shrubs = [];
  for (const [ax, az, bx, bz, gap] of med) {
    const L = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / L, uz = (bz - az) / L, w = Math.max(1, gap - 0.5), cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const nx = -uz, nz = ux, g = groundAt(cx, cz), top = g + 0.18;
    for (const s of [1, -1]) wallInto(solid, ax + nx * w / 2 * s, az + nz * w / 2 * s, bx + nx * w / 2 * s, bz + nz * w / 2 * s, g - 0.1, top, nx * s, nz * s, SCOL.kerb);
    const c0 = [ax + nx * w / 2, top, az + nz * w / 2], c1 = [bx + nx * w / 2, top, bz + nz * w / 2], c2 = [bx - nx * w / 2, top, bz - nz * w / 2], c3 = [ax - nx * w / 2, top, az - nz * w / 2];
    triInto(solid, c0, c1, c2, 1); triInto(solid, c0, c2, c3, 1); for (let k = 0; k < 6; k++) { solid.nor.push(0, 1, 0); solid.col.push(SCOL.grass.r, SCOL.grass.g, SCOL.grass.b); }
    if (gap > 3 && r() < 0.75) palms.push([cx, cz, top]); else if (gap > 2 && r() < 0.5) shrubs.push([cx, cz, top]);
    segs.push(cx - ux * L / 2, cz - uz * L / 2, cx + ux * L / 2, cz + uz * L / 2, 0.4);
  }
  for (const [x, z, rad] of data.rbt || []) {
    const g = groundAt(x, z), top = g + 0.22, N = 18;
    for (let k = 0; k < N; k++) {
      const a0 = k / N * TAU, a1 = (k + 1) / N * TAU, ax = x + Math.cos(a0) * rad, az = z + Math.sin(a0) * rad, bx = x + Math.cos(a1) * rad, bz = z + Math.sin(a1) * rad;
      const am = (a0 + a1) / 2; wallInto(solid, ax, az, bx, bz, g - 0.1, top, Math.cos(am), Math.sin(am), SCOL.kerb);
      triInto(solid, [x, top + 0.15, z], [ax, top, az], [bx, top, bz], 1); for (let q = 0; q < 3; q++) { solid.nor.push(0, 1, 0); solid.col.push(SCOL.grass.r, SCOL.grass.g, SCOL.grass.b); }
      segs.push(ax, az, bx, bz, 0.5);
    }
    if (rad > 3) palms.push([x, z, top]); if (rad > 6) for (let k = 0; k < 3; k++) { const a = r() * TAU, d = rad * 0.55; shrubs.push([x + Math.cos(a) * d, z + Math.sin(a) * d, top]); }
  }
  // ---------------------------------------------------------------- bus stops
  T.busStops = [];
  for (const [x, z, shelter] of data.bus || []) {
    const R = streetRoad(data, x, z, 14); if (!R) continue;
    T.busStops.push([x, z]);
    const s = Math.sign((x - R.cx) * -R.tz + (z - R.cz) * R.tx) || 1, nx = -R.tz * s, nz = R.tx * s, off = R.w / 2 + 1.7;
    const px = R.cx + nx * off, pz = R.cz + nz * off, g = groundAt(px, pz), a = Math.atan2(nx, nz); // faces away from the road: its back to the footpath
    if (shelter || r() < 0.5) {
      const bx = px + nx * 0.9, bz = pz + nz * 0.9;
      boxAt(solid, bx, g + 2.45, bz, 3.6, 0.1, 1.7, SCOL.roof, a);                 // roof
      boxAt(solid, bx + nx * 0.75, g + 0.25, bz + nz * 0.75, 3.4, 2.1, 0.06, SCOL.glass, a); // back panel
      for (const e of [-1.7, 1.7]) boxAt(solid, bx + nx * 0.75 + R.tx * e, g, bz + nz * 0.75 + R.tz * e, 0.08, 2.45, 0.08, SCOL.steel, a);
      boxAt(solid, bx + nx * 0.4, g + 0.45, bz + nz * 0.4, 2.4, 0.06, 0.4, SCOL.wood, a);   // seat
      segs.push(bx + nx * 0.75 - R.tx * 1.7, bz + nz * 0.75 - R.tz * 1.7, bx + nx * 0.75 + R.tx * 1.7, bz + nz * 0.75 + R.tz * 1.7, 2.4);
    }
    const sx = px - R.tx * 2.6, sz = pz - R.tz * 2.6; boxAt(solid, sx, g, sz, 0.07, 2.6, 0.07, SCOL.steel, a); boxAt(solid, sx, g + 2.25, sz, 0.45, 0.6, 0.05, SCOL.yellow, a); // the stop sign
  }
  // ---------------------------------------------------------------- power poles and wires
  const wires = [], poles = [];
  const S = REGION.tile;
  for (const [x, z, tower] of data.poles || []) if (inTile(T, x, z)) poles.push([x, z, tower, null]);
  for (const w of data.wires || []) {
    const big = w[0] === 1, p = w.slice(1), sag = big ? 3 : 0.7, top = big ? 26 : 8.6;
    for (let q = 0; q < p.length - 2; q += 2) {
      const ax = p[q], az = p[q + 1], bx = p[q + 2], bz = p[q + 3], mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (!inTile(T, mx, mz)) continue;
      const L = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / L, nz = (bx - ax) / L, ga = groundAt(ax, az), gb = groundAt(bx, bz);
      for (const o of big ? [-4, 0, 4] : [-0.8, 0, 0.8]) {
        let px = ax + nx * o, pz = az + nz * o, py = ga + top;
        for (let k = 1; k <= 6; k++) { const t = k / 6, qx = ax + (bx - ax) * t + nx * o, qz = az + (bz - az) * t + nz * o, qy = ga + (gb - ga) * t + top - sag * 4 * t * (1 - t); wires.push(px, py, pz, qx, qy, qz); px = qx; py = qy; pz = qz; }
      }
      if (inTile(T, ax, az) && !poles.some((P) => Math.abs(P[0] - ax) < 4 && Math.abs(P[1] - az) < 4)) poles.push([ax, az, big ? 1 : 0, Math.atan2(bx - ax, bz - az)]);
      if (q + 4 >= p.length && inTile(T, bx, bz) && !poles.some((P) => Math.abs(P[0] - bx) < 4 && Math.abs(P[1] - bz) < 4)) poles.push([bx, bz, big ? 1 : 0, Math.atan2(bx - ax, bz - az)]);
    }
  }
  for (const [x, z, tower, dir] of poles.slice(0, 900)) {
    const g = groundAt(x, z), a = dir == null ? r() * TAU : dir;
    if (tower) { for (let k = 0; k < 4; k++) boxAt(solid, x, g + k * 7, z, 3.2 - k * 0.6, 7, 3.2 - k * 0.6, SCOL.steel, a); boxAt(solid, x, g + 25.6, z, 10, 0.4, 0.6, SCOL.steel, a); segs.push(x - 1.6, z - 1.6, x + 1.6, z + 1.6, 28); }
    else { boxAt(solid, x, g, z, 0.26, 9.2, 0.26, SCOL.pole, a); boxAt(solid, x, g + 8.4, z, 2.2, 0.12, 0.12, SCOL.pole, a); segs.push(x - 0.13, z - 0.13, x + 0.13, z + 0.13, 9); }
  }
  if (wires.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3)); const m = new THREE.LineSegments(g, STREET_MATS.wire); T.meshes.push(m); T.disposables.push(g); }
  // ---------------------------------------------------------------- benches, bins, bubblers, barbecues, picnic tables
  for (const [x, z, k] of (data.furn || []).slice(0, 600)) {
    if (!inTile(T, x, z) && !inCore(x, z)) continue;
    const R = streetRoad(data, x, z, 8, (t) => true), a = R ? Math.atan2(R.tx, R.tz) : r() * TAU, g = groundAt(x, z);
    if (k === 0) { boxAt(solid, x, g + 0.42, z, 1.8, 0.06, 0.45, SCOL.wood, a); boxAt(solid, x - Math.cos(a) * 0.2, g + 0.45, z + Math.sin(a) * 0.2, 1.8, 0.4, 0.05, SCOL.wood, a); for (const e of [-0.75, 0.75]) boxAt(solid, x + Math.sin(a + Math.PI / 2) * e, g, z + Math.cos(a + Math.PI / 2) * e, 0.06, 0.42, 0.42, SCOL.dark, a); }
    else if (k === 1) boxAt(solid, x, g, z, 0.55, 0.95, 0.55, SCOL.bin, a);
    else if (k === 2) boxAt(solid, x, g, z, 0.3, 1.0, 0.3, SCOL.steel, a);
    else if (k === 3) { boxAt(solid, x, g, z, 1.4, 0.85, 0.8, SCOL.brick, a); boxAt(solid, x, g + 0.85, z, 1.3, 0.05, 0.7, SCOL.dark, a); }
    else { boxAt(solid, x, g + 0.72, z, 1.8, 0.06, 0.8, SCOL.wood, a); for (const e of [-0.75, 0.75]) boxAt(solid, x + Math.cos(a) * e, g + 0.42, z - Math.sin(a) * e, 1.8, 0.05, 0.3, SCOL.wood, a); }
    segs.push(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0.9);
  }
  // ---------------------------------------------------------------- lifeguard towers and the red-and-yellow flags
  for (const [x, z] of data.guards || []) {
    if (inCore(x, z) || !inTile(T, x, z)) continue; // the core has its own (world.js)
    const g = groundAt(x, z), Sh = typeof nearestShore === 'function' && nearestShore(x, z), a = Sh ? Math.atan2(Sh.nx, Sh.nz) : 0;
    for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]]) boxAt(solid, x + dx, g, z + dz, 0.14, 2.8, 0.14, SCOL.steel, 0);
    boxAt(solid, x, g + 2.8, z, 2.6, 2.2, 2.6, SCOL.white, a); boxAt(solid, x, g + 4.0, z, 2.62, 0.5, 2.62, SCOL.blue, a); boxAt(solid, x, g + 5.0, z, 3.2, 0.12, 3.2, SCOL.red, a);
    segs.push(x - 1, z - 1, x + 1, z + 1, 5);
    if (Sh && Sh.d < 160) for (const e of [-22, 22]) { // the flags in front, between them is where to swim
      const fx = Sh.px - Sh.nx * 12 + Sh.tx * e, fz = Sh.pz - Sh.nz * 12 + Sh.tz * e, fg = groundAt(fx, fz);
      boxAt(solid, fx, fg, fz, 0.06, 3.4, 0.06, SCOL.steel, 0);
      boxAt(solid, fx + Sh.tx * 0.45, fg + 3.05, fz + Sh.tz * 0.45, 0.9, 0.3, 0.02, SCOL.red, Math.atan2(Sh.nx, Sh.nz));
      boxAt(solid, fx + Sh.tx * 0.45, fg + 2.75, fz + Sh.tz * 0.45, 0.9, 0.3, 0.02, SCOL.yellow, Math.atan2(Sh.nx, Sh.nz));
    }
  }
  // ---------------------------------------------------------------- channel markers and lighthouses
  for (const [x, z, c, major] of data.marks || []) {
    if (!inTile(T, x, z)) continue;
    const base = Math.max(WATER_Y - 0.6, groundAt(x, z)), colr = { r: SCOL.red, g: SCOL.green, y: SCOL.yellow, w: SCOL.white }[c] || SCOL.yellow;
    if (major) { boxAt(solid, x, base, z, 2.4, 12, 2.4, SCOL.white, 0); boxAt(solid, x, base + 12, z, 2.8, 2, 2.8, SCOL.red, 0); segs.push(x - 1.2, z - 1.2, x + 1.2, z + 1.2, 14); continue; }
    boxAt(solid, x, base, z, 0.32, 4.4, 0.32, SCOL.steel, 0); boxAt(solid, x, base + 3.4, z, 0.9, 1.0, 0.9, colr, Math.PI / 4);
    if (c === 'g') boxAt(solid, x, base + 4.4, z, 0.5, 0.5, 0.5, colr, 0);
    segs.push(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 4.4);
  }
  // ---------------------------------------------------------------- piers on piles (the deck is the painted ground; this adds the edge and the piles)
  for (const poly of (data.areas && data.areas.pier) || []) {
    const f = ringOf(poly), n = f.length / 2;
    for (let q = 0; q < n; q++) {
      const ax = f[2 * q], az = f[2 * q + 1], bx = f[(2 * q + 2) % (2 * n)], bz = f[(2 * q + 3) % (2 * n)], L = Math.hypot(bx - ax, bz - az); if (L < 0.5) continue;
      const nx = (bz - az) / L, nz = -(bx - ax) / L; if (!tileWater(T, (ax + bx) / 2 + nx * 2, (az + bz) / 2 + nz * 2) && !tileWater(T, (ax + bx) / 2 - nx * 2, (az + bz) / 2 - nz * 2)) continue;
      wallInto(solid, ax, az, bx, bz, -0.35, 0.02, nx, nz, SCOL.deck); wallInto(solid, ax, az, bx, bz, -0.35, 0.02, -nx, -nz, SCOL.deck);
      for (let t = 0; t < L; t += 4) { const px = ax + (bx - ax) * t / L - nx * 0.3, pz = az + (bz - az) * t / L - nz * 0.3; boxAt(solid, px, WATER_Y - 1.2, pz, 0.3, 1.2 + Math.abs(WATER_Y) - 0.3, 0.3, SCOL.deck, 0); boxAt(solid, px, 0.02, pz, 0.08, 1.0, 0.08, SCOL.white, 0); }
    }
  }
  // ---------------------------------------------------------------- mangroves along the Broadwater and the creeks
  const mang = [];
  for (const poly of (data.areas && data.areas.mangrove) || []) {
    const f = ringOf(poly); let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let q = 0; q < f.length; q += 2) { x0 = Math.min(x0, f[q]); x1 = Math.max(x1, f[q]); z0 = Math.min(z0, f[q + 1]); z1 = Math.max(z1, f[q + 1]); }
    const want = Math.min(1600 - mang.length, Math.round((x1 - x0) * (z1 - z0) / 14));
    for (let k = 0; k < want; k++) { const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0); if (inTile(T, x, z) && pipRing(x, z, f)) mang.push([x, z]); }
  }
  // ---------------------------------------------------------------- canal houses: a pontoon at the water and often a boat
  let pont = 0;
  for (const H of T.houses || []) {
    if (pont >= 180) break;
    const cx = (H.x0 + H.x1) / 2, cz = (H.z0 + H.z1) / 2, rad = Math.max(H.x1 - H.x0, H.z1 - H.z0) / 2;
    let hit = null; // the closest water behind the house (canal frontage), if it's right there
    for (let k = 0; k < 24; k++) { const a = k / 24 * TAU, dx = Math.cos(a), dz = Math.sin(a); for (let d = rad * 0.6; d < rad + 13 && (!hit || d < hit.d); d += 1) if (tileWater(T, cx + dx * d, cz + dz * d)) { hit = { a, dx, dz, d }; break; } }
    if (!hit || streetRoad(data, cx + hit.dx * hit.d, cz + hit.dz * hit.d, 6)) continue; // not a road bridge or the street side
    let d = hit.d; while (d < hit.d + 6 && !tileWater(T, cx + hit.dx * (d + 1), cz + hit.dz * (d + 1))) d += 0.5; // a little further, clear of the bank
    const px = cx + hit.dx * (d + 1.6), pz = cz + hit.dz * (d + 1.6), a = Math.atan2(hit.dx, hit.dz), tx = -hit.dz, tz = hit.dx, top = WATER_Y + 0.45;
    boxAt(solid, px, top - 0.35, pz, 2.4, 0.35, 7, SCOL.deck, a);
    for (const e of [-3.2, 3.2]) for (const s of [-1.1, 1.1]) boxAt(solid, px + tx * e + hit.dx * s, WATER_Y - 1, pz + tz * e + hit.dz * s, 0.22, 2.2, 0.22, SCOL.white, 0);
    if (r() < 0.45) { // a boat tied up alongside
      const bx = px + hit.dx * 2.6, bz = pz + hit.dz * 2.6, L = 6 + r() * 4;
      boxAt(solid, bx, WATER_Y - 0.15, bz, 2.3, 0.9, L, SCOL.hull, a); boxAt(solid, bx - tx * 0, WATER_Y + 0.75, bz, 1.7, 0.9, L * 0.4, SCOL.cabin, a);
      segs.push(bx - tx * L / 2, bz - tz * L / 2, bx + tx * L / 2, bz + tz * L / 2, 1.5);
    }
    pont++;
  }
  // ---------------------------------------------------------------- driveways and letterboxes
  for (const H of T.houses || []) {
    const d = H.doors.find((q) => q.type === 'front'); if (!d) continue;
    const R = streetRoad(data, d.x, d.z, 32); if (!R || R.d < 3) continue;
    const kx = R.cx, kz = R.cz, dx = (d.x - kx) / R.d, dz = (d.z - kz) / R.d, ex = R.tx, ez = R.tz;
    const side = (H.seed % 2 ? 1 : -1) * 3.6, sx = d.x + ex * side, sz = d.z + ez * side, ax = kx + ex * side + dx * R.w / 2, az = kz + ez * side + dz * R.w / 2;
    const L = Math.hypot(sx - ax, sz - az); if (L < 2 || L > 30) continue;
    if (!inTile(T, ax, az)) continue;
    groundRect(conc, (sx + ax) / 2, (sz + az) / 2, (sx - ax) / L, (sz - az) / L, L, 3.0, 0.03);
    const lx = kx + dx * (R.w / 2 + 1.0) - ex * side * 0.5, lz = kz + dz * (R.w / 2 + 1.0) - ez * side * 0.5, g = groundAt(lx, lz), a = Math.atan2(dx, dz);
    boxAt(solid, lx, g, lz, 0.1, 0.95, 0.1, SCOL.steel, a); boxAt(solid, lx, g + 0.95, lz, 0.35, 0.3, 0.45, (H.seed >> 3) % 3 ? SCOL.dark : SCOL.red, a);
  }
  // ---------------------------------------------------------------- dune grass on the higher sand behind the beach
  const tufts = [];
  for (const poly of (data.areas && data.areas.beach) || []) {
    const f = ringOf(poly); let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let q = 0; q < f.length; q += 2) { x0 = Math.min(x0, f[q]); x1 = Math.max(x1, f[q]); z0 = Math.min(z0, f[q + 1]); z1 = Math.max(z1, f[q + 1]); }
    const want = Math.min(2400 - tufts.length, Math.round((x1 - x0) * (z1 - z0) / 18));
    for (let k = 0; k < want; k++) { const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0); if (inTile(T, x, z) && !tileWater(T, x, z) && pipRing(x, z, f) && groundAt(x, z) > 1.6) tufts.push([x, z]); }
  }
  // ---------------------------------------------------------------- street-name signs on the corners
  streetSigns(T, data);
  // ---------------------------------------------------------------- the meshes
  streetMesh(T, paint, STREET_MATS.paint); streetMesh(T, bike, STREET_MATS.bike); streetMesh(T, conc, STREET_MATS.concrete);
  const sm = streetMesh(T, solid, STREET_MATS.solid, true); if (sm) sm.receiveShadow = true;
  const inst = (geo, mat, list, place) => { if (!list.length) return; const m = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(); list.forEach((it, k) => { place(it, k, m4, q, e, v, s); m.setMatrixAt(k, m4); }); m.castShadow = true; T.meshes.push(m); T.disposables.push(m); return m; };
  const [palmT] = palmGeometries();
  inst(palmT, TREE_MATS.trunk, palms, ([x, z, y], k, m4, q, e, v, s) => { m4.compose(v.set(x, y, z), q.identity(), s.set(1, 6 + r() * 4, 1)); });
  inst(LIGHT_CROWN, TREE_MATS.crown, palms, ([x, z, y], k, m4, q, e, v, s) => { const h = 6 + (k * 7919 % 40) / 10; e.set(0, r() * TAU, 0); q.setFromEuler(e); m4.compose(v.set(x, y + h, z), q, s.set(0.9, 0.9, 0.9)); });
  inst(LEAFY_GEO.ico, TREE_MATS.leaf, shrubs.concat(mang.map(([x, z]) => [x, z, Math.max(WATER_Y + 0.2, groundAt(x, z))]), tufts.map(([x, z]) => [x, z, groundAt(x, z), 1])), ([x, z, y, dune], k, m4, q, e, v, s) => {
    const R = dune ? 0.35 + r() * 0.3 : 0.9 + r() * 1.1; e.set(r(), r() * TAU, 0); q.setFromEuler(e); m4.compose(v.set(x, y + R * 0.4, z), q, s.set(R, R * (dune ? 0.45 : 0.75), R));
  });
  const last = T.meshes[T.meshes.length - 1];
  if (last && last.isInstancedMesh && last.material === TREE_MATS.leaf) { // colour them: shrubs green, mangroves dark, dune grass pale
    const nS = shrubs.length, nM = mang.length; for (let k = 0; k < last.count; k++) last.setColorAt(k, k < nS ? GREENS[k % GREENS.length] : k < nS + nM ? SCOL.mangrove : SCOL.dune);
  }
  // light pools under the street lights after dark
  const lamps = data.lamps || [];
  if (lamps.length) inst(STREET_GLOW_GEO, STREET_MATS.glow, lamps, ([x, z, a], k, m4, q, e, v, s) => { const lx = x + Math.sin(a) * 1.9, lz = z + Math.cos(a) * 1.9; m4.compose(v.set(lx, groundAt(lx, lz) + 0.12, lz), q.identity(), s.set(1, 1, 1)); }).castShadow = false;
}
// a real bus stop just ahead of a bus, beside its road (buses pull in at them)
function realBusStopNear(car) {
  const fx = Math.sin(car.h), fz = Math.cos(car.h);
  for (const T of TILES.values()) for (const [x, z] of T.busStops || []) {
    const dx = x - car.x, dz = z - car.z; if (Math.abs(dx) > 14 || Math.abs(dz) > 14) continue;
    const ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx); if (ahead > -2 && ahead < 6 && side < 11) return true;
  }
  return false;
}
const STREET_GLOW_GEO = (() => { const g = new THREE.CircleGeometry(7, 20); g.rotateX(-Math.PI / 2); return g; })();
function updateStreetLights() { STREET_MATS.glow.opacity = smooth(0.35, 0.8, nightLevel) * 0.28; }
// ---------------------------------------------------------------- street-name signs (blue, white letters, like the Gold Coast's)
function streetSigns(T, data) {
  const ends = new Map(); // node -> [{edge, name, tx, tz, w}]
  for (const e of data.edges || []) {
    const name = e[4] >= 0 ? data.names[e[4]] : null; if (!name || !DRIVE.has(e[5])) continue;
    const p = e.slice(7); if (p.length < 4) continue;
    for (const [node, px, pz, qx, qz] of [[e[0], p[0], p[1], p[2], p[3]], [e[1], p[p.length - 2], p[p.length - 1], p[p.length - 4], p[p.length - 3]]]) {
      const L = Math.hypot(qx - px, qz - pz) || 1; if (!ends.has(node)) ends.set(node, []);
      ends.get(node).push({ name, x: px, z: pz, tx: (qx - px) / L, tz: (qz - pz) / L, w: e[6] });
    }
  }
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const x = c.getContext('2d'); const B = newBuf(), posts = newBuf(); let n = 0;
  for (const list of ends.values()) {
    if (n >= 60 || list.length < 3) continue;
    const a = list[0], b = list.find((q) => q.name !== a.name); if (!b || !inTile(T, a.x, a.z)) continue;
    // the corner between the two streets
    let bx = a.tx + b.tx, bz = a.tz + b.tz; const bl = Math.hypot(bx, bz); if (bl < 0.2) { bx = -a.tz; bz = a.tx; } else { bx /= bl; bz /= bl; }
    const off = Math.max(a.w, b.w) / 2 + 2.2, px = a.x + bx * off, pz = a.z + bz * off, g = groundAt(px, pz);
    boxInto(posts, px, g, pz, 0.08, 3.1, 0.08, SCOL.steel);
    [a, b].forEach((s, k) => {
      const slot = n++, sx = (slot % 2) * 512, sy = Math.floor(slot / 2) * 32, text = s.name.toUpperCase();
      x.fillStyle = '#1f4f9a'; x.fillRect(sx, sy, 512, 32); x.strokeStyle = '#ffffff'; x.lineWidth = 2; x.strokeRect(sx + 2, sy + 2, 508, 28);
      fitFont(x, text, 480, 24, '700', FONT.cond); x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, sx + 256, sy + 17);
      const uv = { u0: sx / 1024, u1: (sx + 512) / 1024, v0: 1 - (sy + 32) / 1024, v1: 1 - sy / 1024 }, w = Math.min(2.4, 0.6 + text.length * 0.12), y = g + 2.85 - k * 0.24;
      const nx = -s.tz, nz = s.tx; // the blade runs along its street, readable from both sides
      quadInto(B, px + s.tx * w / 2, y, pz + s.tz * w / 2, nx, nz, w, 0.2, uv);
      quadInto(B, px + s.tx * w / 2, y, pz + s.tz * w / 2, -nx, -nz, w, 0.2, { u0: uv.u1, u1: uv.u0, v0: uv.v0, v1: uv.v1 });
    });
  }
  if (!n) return;
  const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = MAX_ANISO;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, envMapIntensity: 0.3 }), g = toGeometry(B), m = new THREE.Mesh(g, mat);
  T.meshes.push(m); T.disposables.push(g, mat, tex);
  const pg = toGeometry(posts), pm = new THREE.Mesh(pg, STREET_MATS.solid); T.meshes.push(pm); T.disposables.push(pg);
}
