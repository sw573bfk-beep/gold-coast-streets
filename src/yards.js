// Gold Coast Streets — backyards, garages and pools. Every house's backyard reaches back to halfway to whatever is behind
// it (the next house, a fence, a road) and gets what its household would have: a Hills hoist, a trampoline and swing
// set for a family, a veggie patch and shed for retirees, a surfboard rack and a boat for surfers, a patio and barbecue
// for the ones who entertain, a water tank, a kennel, a Colorbond back fence. Chosen from the house's own number, so
// no two yards are the same and each stays the same every visit. Pools come from the map (OpenStreetMap and the aerial
// photos): water, a stone edge and the pool fence Queensland requires, glass or black aluminium. Long front walls get
// a garage door. All of it is one mesh per tile, shown only on the few tiles right around you (yards are small).

const YARD_COLS = {
  fence: ['#5d6457', '#8a8d82', '#b5ad98', '#3f4a3c', '#7a6a55', '#a7a196', '#4a4f55', '#9b8c74'],
  shed: ['#6b6f5f', '#8a8d82', '#c9c3b2', '#4f5b4f', '#a9a59a', '#7d6a55', '#d8d2c2'],
  tank: ['#4f5b4f', '#8a8d82', '#c9c3b2', '#3f4a3c', '#e2ded2'],
  garage: ['#f2f0ea', '#cfcac0', '#5d6457', '#8a8d82', '#3a3f44', '#a58a6a', '#e9e3d6', '#6a5a48'],
  play: ['#d8433a', '#2f7fd0', '#f2c531', '#3aa45a', '#e46fa8', '#ff8a2a'],
  umbrella: ['#f2efe6', '#2f4a6b', '#c4623f', '#3f7f7a', '#e2c46a', '#8a2f2f'],
};
// the props, built once each per colour: local x across the yard, z away from the house, y up, the base on the ground
const YARD_GEO = new Map();
function yardGeo(kind, c) {
  const key = kind + (c || ''); if (YARD_GEO.has(key)) return YARD_GEO.get(key);
  const cyl = (rt, rb, h, seg, x, y, z, colr, open) => paintGeo(new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!open).translate(x, y + h / 2, z), colr);
  const bx = (w, h, d, x, y, z, colr) => box(w, h, d, x, y + h / 2, z, colr);
  const steel = '#c7cbcf', wood = '#8a6a4a', dark = '#2b2e31', P = [];
  if (kind === 'hoist') { // the Hills hoist: a pole, four arms at the top and the lines strung square between them
    P.push(cyl(0.04, 0.05, 2.1, 6, 0, 0, 0, steel));
    for (const a of [0.785, 2.356]) { const g = bx(3.4, 0.04, 0.04, 0, 2.05, 0, steel); g.rotateY(a); P.push(g); }
    for (const s of [0.6, 1.15]) for (const sg of [-1, 1]) { P.push(bx(2 * s, 0.015, 0.015, 0, 2.06, sg * s, '#e8e8e2'), bx(0.015, 0.015, 2 * s, sg * s, 2.06, 0, '#e8e8e2')); }
  } else if (kind === 'trampoline') {
    P.push(cyl(1.75, 1.75, 0.12, 12, 0, 0.78, 0, c, true), cyl(1.6, 1.6, 0.03, 12, 0, 0.8, 0, '#16181a'), cyl(1.75, 1.75, 0.04, 12, 0, 2.4, 0, c, true));
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.785; P.push(bx(0.06, 0.8, 0.06, Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6, steel)); }
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; P.push(cyl(0.025, 0.025, 1.6, 3, Math.cos(a) * 1.75, 0.85, Math.sin(a) * 1.75, dark)); }
  } else if (kind === 'swing') { // an A-frame swing set with two seats
    for (const sx of [-1.4, 1.4]) for (const sz of [-0.6, 0.6]) { const g = bx(0.07, 2.3, 0.07, 0, 0, 0, c); g.rotateX(sz > 0 ? -0.26 : 0.26); g.translate(sx, 0, sz); P.push(g); }
    P.push(bx(2.9, 0.08, 0.08, 0, 2.2, 0, c));
    for (const x of [-0.6, 0.6]) { P.push(bx(0.45, 0.04, 0.2, x, 0.45, 0, '#222'), bx(0.015, 1.75, 0.015, x - 0.2, 0.47, 0, '#999'), bx(0.015, 1.75, 0.015, x + 0.2, 0.47, 0, '#999')); }
  } else if (kind === 'shed') {
    P.push(bx(2.3, 1.95, 1.7, 0, 0, 0, c), bx(2.5, 0.08, 1.9, 0, 1.95, 0, c), bx(0.95, 1.75, 0.03, 0.4, 0, -0.86, '#e8e4dc'));
  } else if (kind === 'tank') {
    P.push(cyl(0.85, 0.85, 1.9, 10, 0, 0, 0, c), cyl(0.3, 0.85, 0.18, 10, 0, 1.9, 0, c));
  } else if (kind === 'patio') { // a concrete slab, an outdoor table for six and a market umbrella
    P.push(bx(4.2, 0.1, 3.2, 0, -0.02, 0, '#bdb7ab'), bx(1.8, 0.05, 0.9, 0, 0.72, 0, wood));
    for (const x of [-0.8, 0.8]) for (const z of [-0.38, 0.38]) P.push(bx(0.06, 0.72, 0.06, x, 0, z, wood));
    for (const x of [-0.45, 0.45]) for (const z of [-0.8, 0.8]) P.push(bx(0.45, 0.9, 0.45, x, 0, z, '#3a3f44'));
    P.push(cyl(0.03, 0.03, 2.3, 4, 0, 0, 0, steel), cyl(0.02, 1.35, 0.45, 8, 0, 2.05, 0, c, true));
  } else if (kind === 'pergola') { // a timber pergola over a deck, a lounge setting under it
    P.push(bx(4.4, 0.15, 3.4, 0, 0, 0, '#9c7a58'));
    for (const x of [-2, 2]) for (const z of [-1.5, 1.5]) P.push(bx(0.12, 2.5, 0.12, x, 0.15, z, '#7a5a3c'));
    for (const z of [-1.5, 1.5]) P.push(bx(4.4, 0.18, 0.1, 0, 2.6, z, '#7a5a3c'));
    for (let k = 0; k < 5; k++) P.push(bx(0.06, 0.12, 3.4, -1.8 + k * 0.9, 2.78, 0, '#7a5a3c'));
    P.push(bx(2.2, 0.45, 0.85, 0, 0.15, 0.9, c), bx(2.2, 0.4, 0.15, 0, 0.6, 1.3, c), bx(0.9, 0.38, 0.6, 0, 0.15, -0.2, wood));
  } else if (kind === 'bbq') {
    P.push(bx(1.3, 0.85, 0.6, 0, 0, 0, '#3a3d40'), bx(0.9, 0.3, 0.55, 0, 0.85, 0, '#9aa0a6'), cyl(0.15, 0.15, 0.45, 8, 0.85, 0, 0, '#c9d1d6'));
  } else if (kind === 'veggie') { // two raised timber beds, something growing in each
    for (const x of [-0.75, 0.75]) P.push(bx(1.1, 0.4, 2.4, x, 0, 0, wood), bx(0.95, 0.25, 2.25, x, 0.4, 0, '#4f8a3a'));
  } else if (kind === 'kennel') {
    P.push(bx(0.8, 0.65, 1.0, 0, 0, 0, c), bx(0.95, 0.07, 1.15, 0, 0.65, 0, '#6b3d2e'), bx(0.35, 0.4, 0.02, 0, 0, -0.51, '#1b1b1b'));
  } else if (kind === 'boat') { // a tinny on its trailer
    P.push(bx(1.9, 0.7, 4.4, 0, 0.45, 0, '#e9ecee'), bx(1.92, 0.12, 4.42, 0, 0.9, 0, c), bx(1.6, 0.4, 1.4, 0, 1.0, -0.6, '#1f2a33'), bx(0.12, 0.3, 1.8, 0, 0.2, -2.6, steel));
    for (const x of [-0.95, 0.95]) P.push(bx(0.2, 0.6, 0.6, x, 0, 0.3, '#151515')); // the trailer's wheels
  } else if (kind === 'surf') { // a rack of boards
    for (const x of [-0.9, 0.9]) P.push(bx(0.08, 1.6, 0.08, x, 0, 0, wood));
    for (let k = 0; k < 4; k++) P.push(bx(2.1, 0.06, 0.55, 0, 0.35 + k * 0.32, 0, YARD_COLS.play[(k + (c ? c.length : 0)) % YARD_COLS.play.length]));
  } else if (kind === 'sandpit') {
    P.push(bx(1.7, 0.22, 1.7, 0, 0, 0, wood), bx(1.5, 0.2, 1.5, 0, 0.04, 0, '#e3cf9a'), bx(0.25, 0.2, 0.25, 0.3, 0.24, 0.2, c));
  } else if (kind === 'paddle') {
    P.push(cyl(1.0, 1.0, 0.28, 14, 0, 0, 0, c), cyl(0.9, 0.9, 0.02, 14, 0, 0.22, 0, '#6fc6e6'));
  } else if (kind === 'firepit') {
    P.push(cyl(0.55, 0.6, 0.35, 10, 0, 0, 0, '#5a524a'), cyl(0.42, 0.42, 0.02, 10, 0, 0.3, 0, '#1a1a1a'));
    for (let k = 0; k < 3; k++) { const a = k * 2.09; P.push(bx(1.0, 0.4, 0.4, Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4, '#9c7a58').rotateY(-a)); }
  }
  const g = mergeGeos(P); YARD_GEO.set(key, g); return g;
}
// copy a prop into the tile's buffer: turned by rot inside the yard, the yard's axes U (across) and V (away from the house)
function stampProp(B, g, x, z, U, V, rot) {
  const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color, y0 = groundAt(x, z), cr = Math.cos(rot), sr = Math.sin(rot);
  for (let k = 0; k < p.count; k++) {
    if (k % 3 === 0 && n.getY(k) < -0.9 && n.getY(k + 1) < -0.9 && n.getY(k + 2) < -0.9) { k += 2; continue; } // undersides: nobody sees them
    const lx = p.getX(k) * cr - p.getZ(k) * sr, lz = p.getX(k) * sr + p.getZ(k) * cr, nlx = n.getX(k) * cr - n.getZ(k) * sr, nlz = n.getX(k) * sr + n.getZ(k) * cr;
    B.pos.push(x + lx * U[0] + lz * V[0], y0 + p.getY(k), z + lx * U[1] + lz * V[1]);
    B.nor.push(nlx * U[0] + nlz * V[0], n.getY(k), nlx * U[1] + nlz * V[1]);
    B.col.push(c.getX(k), c.getY(k), c.getZ(k));
  }
}
const YARD_PROPS = { // footprint radius of each, for keeping them apart
  hoist: 1.5, trampoline: 1.9, swing: 1.7, shed: 1.4, tank: 1.0, patio: 2.4, pergola: 2.5, bbq: 0.8, veggie: 1.5, kennel: 0.7, boat: 2.5, surf: 1.2, sandpit: 1.0, paddle: 1.1, firepit: 1.8,
};
const HOUSEHOLDS = [ // who lives there, and how likely each thing is in their yard
  { hoist: 0.85, trampoline: 0.8, swing: 0.5, sandpit: 0.4, paddle: 0.3, patio: 0.5, shed: 0.5, kennel: 0.45, bbq: 0.4 },        // a family with kids
  { patio: 0.7, pergola: 0.35, bbq: 0.75, veggie: 0.45, hoist: 0.55, shed: 0.4, tank: 0.35, firepit: 0.35 },                   // a couple who entertain
  { surf: 0.85, boat: 0.4, hoist: 0.5, bbq: 0.6, patio: 0.45, kennel: 0.3, firepit: 0.3 },                                      // surfers
  { veggie: 0.85, shed: 0.8, tank: 0.65, hoist: 0.9, patio: 0.55, bbq: 0.3 },                                                   // retirees
  { shed: 0.7, boat: 0.45, tank: 0.5, hoist: 0.7, kennel: 0.5, bbq: 0.35 },                                                     // a tradie
  { hoist: 0.4, patio: 0.3 },                                                                                                   // renters: not much out the back
];
const POOL_MAT = new THREE.MeshStandardMaterial({ color: col('#3fb4d8'), roughness: 0.08, metalness: 0.1, emissive: col('#0d4a63'), emissiveIntensity: 0.35, envMapIntensity: 1.2 });
function tileYards(T, data, segs) {
  if (!T.houses || !T.houses.length) return;
  const CH = new Map(), GB = newBuf(), WB = newBuf(), pools = []; // the props in 250 m chunks, so the ones off-screen aren't drawn
  const cb = (x, z) => { const k = Math.floor((x - T.x0) / 250) + ',' + Math.floor((z - T.z0) / 250); if (!CH.has(k)) CH.set(k, newBuf()); return CH.get(k); };
  // pools from the map: kept clear of props, and given their water, edge and fence
  for (const poly of (data.areas && data.areas.pool) || []) {
    const f = Array.isArray(poly[0]) ? poly[0] : poly; if (f.length < 6) continue;
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let q = 0; q < f.length; q += 2) { x0 = Math.min(x0, f[q]); x1 = Math.max(x1, f[q]); z0 = Math.min(z0, f[q + 1]); z1 = Math.max(z1, f[q + 1]); }
    pools.push({ f, x0, z0, x1, z1 });
  }
  const inPool = (x, z, m) => pools.some((P) => x > P.x0 - m && x < P.x1 + m && z > P.z0 - m && z < P.z1 + m);
  const treeAt = new Map(); for (const t of data.trees || []) { const k = Math.floor(t[0] / 8) + ',' + Math.floor(t[1] / 8); if (!treeAt.has(k)) treeAt.set(k, []); treeAt.get(k).push(t); }
  const nearTree = (x, z, r) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const t of treeAt.get((Math.floor(x / 8) + i) + ',' + (Math.floor(z / 8) + j)) || []) if (Math.hypot(t[0] - x, t[1] - z) < r + 0.8) return true; return false; };
  const roadOK = (x, z) => tileIsLand(x, z) && !onCarriageway(data.roads, x, z, 2);
  // a new fence that would cross one already standing (a side fence, the neighbour's back fence) isn't built
  const crossesFence = (ax, az, bx, bz) => { const x0 = Math.min(ax, bx) - 1, x1 = Math.max(ax, bx) + 1, z0 = Math.min(az, bz) - 1, z1 = Math.max(az, bz) + 1; return T.fences.some(([cx, cz, dx, dz]) => Math.max(cx, dx) > x0 && Math.min(cx, dx) < x1 && Math.max(cz, dz) > z0 && Math.min(cz, dz) < z1 && segIntersect(ax, az, bx, bz, cx, cz, dx, dz) > 0.02 && segIntersect(cx, cz, dx, dz, ax, az, bx, bz) > 0.02); };
  for (const H of T.houses) {
    const fd = H.doors.find((d) => d.type === 'front'); if (!fd) continue;
    const r = mulberry32((H.seed ^ 0x5bd1e995) >>> 0), pk = (a) => a[Math.floor(r() * a.length)], f = H.f, n = f.length / 2; // the house's own numbers: the same yard every visit
    const U = [-fd.nz, fd.nx], V = [-fd.nx, -fd.nz]; // across the house, and from the front towards the back
    let u0 = 1e9, u1 = -1e9, v1 = -1e9;
    for (let q = 0; q < n; q++) { const u = f[2 * q] * U[0] + f[2 * q + 1] * U[1], v = f[2 * q] * V[0] + f[2 * q + 1] * V[1]; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v1 = Math.max(v1, v); }
    const W = (u, v) => [u * U[0] + v * V[0], u * U[1] + v * V[1]], um = (u0 + u1) / 2;
    // the garage: a door on the long front wall, at the end away from the front door
    let q0 = -1, bd = 1e9; for (let q = 0; q < n; q++) { const mx = (f[2 * q] + f[(2 * q + 2) % (2 * n)]) / 2, mz = (f[2 * q + 1] + f[(2 * q + 3) % (2 * n)]) / 2, d = Math.hypot(mx - fd.x, mz - fd.z); if (d < bd) { bd = d; q0 = q; } }
    if (q0 >= 0) {
      const ax = f[2 * q0], az = f[2 * q0 + 1], bx = f[(2 * q0 + 2) % (2 * n)], bz = f[(2 * q0 + 3) % (2 * n)], L = Math.hypot(bx - ax, bz - az), ex = (bx - ax) / L, ez = (bz - az) / L;
      const td = (fd.x - ax) * ex + (fd.z - az) * ez, gw = L >= 13 ? 5.0 : 2.7, side = td > L / 2 ? 0 : 1, room = side ? L - td - 0.8 : td - 0.8;
      if (L >= 8.5 && room >= gw + 0.6 && r() < 0.85) {
        const t0 = side ? L - 0.4 - gw : 0.4, gc = col(YARD_COLS.garage[Math.floor(r() * YARD_COLS.garage.length)]), lines = gc.clone().multiplyScalar(0.82), y = H.floorY - 0.1;
        const px = ax + ex * t0 + fd.nx * 0.04, pz = az + ez * t0 + fd.nz * 0.04, qx = px + ex * gw, qz = pz + ez * gw;
        const YB = cb(px, pz); wallInto(YB, px, pz, qx, qz, y, y + 2.15, fd.nx, fd.nz, gc);
        for (let k = 1; k < 5; k++) wallInto(YB, px + fd.nx * 0.01, pz + fd.nz * 0.01, qx + fd.nx * 0.01, qz + fd.nz * 0.01, y + k * 0.43 - 0.02, y + k * 0.43 + 0.02, fd.nx, fd.nz, lines); // the panel lines
      }
    }
    // the backyard: back to halfway to whatever is behind (a house, a fence), short of a road or the water
    const sx = W(um, v1 + 0.4), ex = W(um, v1 + 30), t = rayWalls(sx[0], sx[1], ex[0], ex[1], 1);
    let reach = t < 1 ? t * 29.6 : 30;
    for (let v = 1; v < reach; v += 1) { const p = W(um, v1 + v); if (!roadOK(p[0], p[1])) { reach = Math.max(0, v - 2); break; } }
    const D = t < 1 && reach >= t * 29.6 - 0.01 ? reach * 0.5 - 0.15 : Math.min(reach, 15);
    if (D < 2.2) continue;
    const half = (u1 - u0) / 2 + 0.8, hold = HOUSEHOLDS[Math.floor(r() * HOUSEHOLDS.length)], placed = [];
    const back = H.doors.find((d) => d.type === 'back'); if (back) placed.push([back.x - back.nx * -1.5, back.z - back.nz * -1.5, 1.4]);
    const fits = (x, z, rad) => {
      for (const [k, s] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const px = x + k * rad * 0.8, pz = z + s * rad * 0.8; if (!roadOK(px, pz)) return false; }
      if (inPool(x, z, rad + 0.5) || nearTree(x, z, rad * 0.6) || resolveCircle(x, z, rad)) return false;
      return !placed.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < pr + rad + 0.3);
    };
    const want = Object.entries(hold).filter(([, p]) => r() < p).map(([k]) => k).sort((a, b) => YARD_PROPS[b] - YARD_PROPS[a]);
    for (const k of want) {
      const rad = YARD_PROPS[k]; if (rad * 2 > D + 1) continue;
      for (let tries = 0; tries < 8; tries++) {
        const nearHouse = (k === 'patio' || k === 'pergola' || k === 'bbq') && tries < 4;
        const u = um + (r() * 2 - 1) * Math.max(0, half - rad), v = v1 + (nearHouse ? rad + 0.3 : rad + 0.6 + r() * Math.max(0, D - 2 * rad - 0.8));
        const [x, z] = W(u, v); if (!fits(x, z, rad)) continue;
        const c = k === 'shed' ? pk(YARD_COLS.shed) : k === 'tank' ? pk(YARD_COLS.tank) : k === 'patio' ? pk(YARD_COLS.umbrella) : k === 'kennel' ? pk(YARD_COLS.shed) : k === 'pergola' ? pk(['#d9d2c3', '#3a3f44', '#8fb0c0', '#7a5b4a']) : k === 'boat' ? pk(['#2f4a6b', '#c43a2a', '#2a7a5a']) : pk(YARD_COLS.play);
        stampProp(cb(x, z), yardGeo(k, c), x, z, U, V, k === 'patio' || k === 'pergola' || k === 'veggie' || k === 'shed' ? (r() < 0.5 ? 0 : Math.PI) : r() * TAU);
        placed.push([x, z, rad]);
        if (['shed', 'tank', 'boat', 'pergola'].includes(k)) segs.push(...(() => { const o = []; for (let a = 0; a < 4; a++) { const p0 = [x + Math.cos(a * 1.571) * rad * 0.7, z + Math.sin(a * 1.571) * rad * 0.7], p1 = [x + Math.cos((a + 1) * 1.571) * rad * 0.7, z + Math.sin((a + 1) * 1.571) * rad * 0.7]; o.push(p0[0], p0[1], p1[0], p1[1], 1.8); } return o; })());
        break;
      }
    }
    // the back fence along the far end of the yard (a little short of the middle, so the neighbour's doesn't sit in the same place)
    if (t < 1 || reach < 30) {
      const fc = col(pk(YARD_COLS.fence)), a = W(um - half - 0.6, v1 + D), b = W(um + half + 0.6, v1 + D);
      if (roadOK(a[0], a[1]) && roadOK(b[0], b[1]) && roadOK((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) && !nearRealBarrier(T, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 2.5) && rayWalls(a[0], a[1], b[0], b[1], 2) >= 1 && !crossesFence(a[0], a[1], b[0], b[1])) {
        const g0 = groundAt(a[0], a[1]), g1 = groundAt(b[0], b[1]), lo = Math.min(g0, g1) - 0.3, hi = Math.max(g0, g1) + 1.8;
        const YB = cb(a[0], a[1]); wallInto(YB, a[0], a[1], b[0], b[1], lo, hi, V[0], V[1], fc); wallInto(YB, a[0], a[1], b[0], b[1], lo, hi, -V[0], -V[1], fc);
        segs.push(a[0], a[1], b[0], b[1], 1.8); T.fences.push([a[0], a[1], b[0], b[1]]);
      }
    }
  }
  // pools: water a touch below the ground, a stone edge, and a fence 1.2 m out (glass or black aluminium)
  for (const P of pools) {
    const f = P.f, n = f.length / 2, cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2, g = groundAt(cx, cz), r = mulberry32(((cx * 73856093) ^ (cz * 19349663)) >>> 0), pk = (a) => a[Math.floor(r() * a.length)];
    const contour = []; for (let q = 0; q < n; q++) contour.push(new THREE.Vector2(f[2 * q], f[2 * q + 1]));
    let tris = []; try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { /* odd outline */ }
    for (const t of tris) { triInto(WB, [f[2 * t[0]], g + 0.04, f[2 * t[0] + 1]], [f[2 * t[1]], g + 0.04, f[2 * t[1] + 1]], [f[2 * t[2]], g + 0.04, f[2 * t[2] + 1]], 1); for (let v = 0; v < 3; v++) WB.nor.push(0, 1, 0); }
    const stone = col(pk(['#e8e2d4', '#d9d2c3', '#c9c3b5', '#efece4'])), YB = cb(cx, cz);
    for (let q = 0; q < n; q++) { const ax = f[2 * q], az = f[2 * q + 1], bx = f[(2 * q + 2) % (2 * n)], bz = f[(2 * q + 3) % (2 * n)], L = Math.hypot(bx - ax, bz - az); if (L < 0.2) continue; let nx = (bz - az) / L, nz = -(bx - ax) / L; if (inRing((ax + bx) / 2 + nx * 0.2, (az + bz) / 2 + nz * 0.2, f)) { nx = -nx; nz = -nz; } wallInto(YB, ax + nx * 0.3, az + nz * 0.3, bx + nx * 0.3, bz + nz * 0.3, g - 0.1, g + 0.1, nx, nz, stone); wallInto(YB, ax, az, bx, bz, g - 0.1, g + 0.1, -nx, -nz, stone); }
    // the fence: the pool's box, 1.2 m out, side by side (a side that would run through a wall is left off)
    const glass = r() < 0.65, fx0 = P.x0 - 1.2, fz0 = P.z0 - 1.2, fx1 = P.x1 + 1.2, fz1 = P.z1 + 1.2;
    for (const [ax, az, bx, bz] of [[fx0, fz0, fx1, fz0], [fx1, fz0, fx1, fz1], [fx1, fz1, fx0, fz1], [fx0, fz1, fx0, fz0]]) {
      if (rayWalls(ax, az, bx, bz, 1.5) < 1 || !roadOK((ax + bx) / 2, (az + bz) / 2) || crossesFence(ax, az, bx, bz)) continue;
      const L = Math.hypot(bx - ax, bz - az), ex = (bx - ax) / L, ez = (bz - az) / L, gy = groundAt((ax + bx) / 2, (az + bz) / 2);
      if (glass) { wallInto(GB, ax, az, bx, bz, gy + 0.05, gy + 1.25, -ez, ex, null); wallInto(GB, ax, az, bx, bz, gy + 0.05, gy + 1.25, ez, -ex, null); for (let s = 0; s <= L; s += 1.3) boxInto(YB, ax + ex * s, gy, az + ez * s, 0.06, 0.12, 0.06, col('#c7cbcf')); }
      else { const blk = col('#1d2023'); for (const yy of [0.1, 1.15]) boxInto(YB, (ax + bx) / 2, gy + yy, (az + bz) / 2, Math.abs(ex) * L + 0.03, 0.04, Math.abs(ez) * L + 0.03, blk); for (let s = 0; s <= L; s += 0.9) boxInto(YB, ax + ex * s, gy + 0.1, az + ez * s, 0.03, 1.05, 0.03, blk); }
      segs.push(ax, az, bx, bz, 1.2); T.fences.push([ax, az, bx, bz]);
    }
  }
  const add = (B, mat, shadow) => { if (!B.pos.length) return; const geo = toGeometry(B), m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; m.userData.yard = true; m.visible = T.yardVis !== false; T.meshes.push(m); T.disposables.push(geo); };
  const shadows = GFX.level === 'ultra' || GFX.level === 'hyper'; // little shadows cost a lot on the slower settings
  for (const B of CH.values()) add(B, buildingMats.plain, shadows); add(WB, POOL_MAT, false); add(GB, HOUSE_GLASS, false);
}
