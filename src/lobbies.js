// ============================================================================
// Gold Coast Streets — tower lobbies you can see into. Walk (or drive slowly) up to an apartment, office or hotel
// tower and its ground floor turns to glass with a lit lobby behind it: marble floor, reception desk and staff,
// lifts, sofas and plants. The glass is cut into the outside walls the same way as the house windows (houses.js).
// Press E at the wall to go in, like always.
// ============================================================================
const LOBBIES = [];
const LOBBY_COLS = { floor: [col('#e9e5dc'), col('#d8d2c6'), col('#2b2e33')], wall: col('#f1ede4'), desk: col('#6b4a2b'), lift: col('#9aa3aa'), sofa: col('#3f4f5f'), plant: col('#3d6b2e'), panel: col('#fffaf0') };
function buildLobby(B) {
  const f = B.f, n = f.length / 2; let gmin = Infinity, cx = 0, cz = 0;
  for (let q = 0; q < n; q++) { gmin = Math.min(gmin, groundAt(f[2 * q], f[2 * q + 1])); cx += f[2 * q]; cz += f[2 * q + 1]; } cx /= n; cz /= n;
  const y0 = gmin + 0.06, top = y0 + 4.2, Bf = newBuf(), windows = [], r = mulberry32(Math.round(cx * 7 + cz * 13));
  const fc = LOBBY_COLS.floor[Math.floor(r() * 3)];
  const contour = []; for (let q = 0; q < n; q++) contour.push(new THREE.Vector2(f[2 * q], f[2 * q + 1]));
  let tris = []; try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { return null; }
  for (const t of tris) { const P = t.map((k) => [f[2 * k], f[2 * k + 1]]);
    triInto(Bf, [P[0][0], y0, P[0][1]], [P[1][0], y0, P[1][1]], [P[2][0], y0, P[2][1]], 1); for (let v = 0; v < 3; v++) { Bf.nor.push(0, 1, 0); Bf.col.push(fc.r, fc.g, fc.b); }
    triInto(Bf, [P[0][0], top, P[0][1]], [P[1][0], top, P[1][1]], [P[2][0], top, P[2][1]], -1); for (let v = 0; v < 3; v++) { Bf.nor.push(0, -1, 0); Bf.col.push(0.98, 0.97, 0.94); } }
  // the inside of the outer walls, with a long window in every wall worth one (the longest dozen, the glass budget)
  const edges = []; for (let q = 0; q < n; q++) { const ax = f[2 * q], az = f[2 * q + 1], bx = f[(2 * q + 2) % (2 * n)], bz = f[(2 * q + 3) % (2 * n)]; edges.push({ ax, az, bx, bz, L: Math.hypot(bx - ax, bz - az) }); }
  const glassy = new Set(edges.filter((e) => e.L > 4).sort((a, b) => b.L - a.L).slice(0, 12));
  for (const e of edges) {
    if (e.L < 0.05) continue; const ex = (e.bx - e.ax) / e.L, ez = (e.bz - e.az) / e.L; let nx = -ez, nz = ex;
    if (!inRing((e.ax + e.bx) / 2 + nx * 0.3, (e.az + e.bz) / 2 + nz * 0.3, f)) { nx = -nx; nz = -nz; } // inward
    const ix = nx * 0.1, iz = nz * 0.1, piece = (t0, t1, ya, yb) => { if (t1 - t0 > 0.01) wallInto(Bf, e.ax + ex * t0 + ix, e.az + ez * t0 + iz, e.ax + ex * t1 + ix, e.az + ez * t1 + iz, ya, yb, nx, nz, LOBBY_COLS.wall); };
    if (!glassy.has(e)) { piece(0, e.L, y0, top); continue; }
    const w0 = 0.6, w1 = e.L - 0.6, sill = y0 + 0.35, head = y0 + 3.6;
    piece(0, w0, y0, top); piece(w1, e.L, y0, top); piece(w0, w1, y0, sill); piece(w0, w1, head, top);
    windows.push({ x: e.ax + ex * e.L / 2, z: e.az + ez * e.L / 2, nx: -nx, nz: -nz, hw: (w1 - w0) / 2, y0: sill, y1: head });
  }
  // furniture: a desk in the middle, lifts on the far side, sofas and planters, light panels in the ceiling
  const box = (x, z, w, d, h, c, y = y0) => boxInto(Bf, x, y + h / 2, z, w, h, d, c);
  box(cx, cz, 3.2, 1.0, 1.1, LOBBY_COLS.desk);
  const far = edges.reduce((a, e) => { const d = Math.hypot((e.ax + e.bx) / 2 - cx, (e.az + e.bz) / 2 - cz); return d > a.d && e.L > 3 ? { e, d } : a; }, { d: 0 }).e;
  if (far) { const mx = (far.ax + far.bx) / 2, mz = (far.az + far.bz) / 2, k = 0.82; for (const s of [-1.2, 1.2]) { const ex = (far.bx - far.ax) / far.L, ez = (far.bz - far.az) / far.L; box(cx + (mx - cx) * k + ex * s, cz + (mz - cz) * k + ez * s, 1.1, 0.3, 2.3, LOBBY_COLS.lift); } }
  for (let k = 0; k < 4; k++) { const a = r() * TAU, d = 2.5 + r() * 3, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; if (!inRing(x, z, f)) continue; if (k < 2) box(x, z, 2.0, 0.9, 0.7, LOBBY_COLS.sofa); else { box(x, z, 0.6, 0.6, 0.5, LOBBY_COLS.desk); box(x, z, 0.5, 0.5, 1.1, LOBBY_COLS.plant, y0 + 0.5); } }
  for (let k = 0; k < 6; k++) { const x = cx + (r() - 0.5) * 8, z = cz + (r() - 0.5) * 8; if (inRing(x, z, f)) box(x, z, 1.2, 1.2, 0.04, LOBBY_COLS.panel, top - 0.05); }
  for (let k = 0; k < Bf.col.length; k += 3) { const ny = Bf.nor[k + 1], sh = ny > 0.5 ? 0.95 : ny < -0.5 ? 1.0 : 0.82; Bf.col[k] *= sh; Bf.col[k + 1] *= sh; Bf.col[k + 2] *= sh; }
  const mesh = new THREE.Mesh(toGeometry(Bf), new THREE.MeshBasicMaterial({ vertexColors: true })); scene.add(mesh);
  const G = newBuf(); for (const w of windows) quadInto(G, w.x + w.nx * 0.03, (w.y0 + w.y1) / 2, w.z + w.nz * 0.03, w.nx, w.nz, w.hw * 2, w.y1 - w.y0, null, col('#cfe3ee'));
  const glass = windows.length ? new THREE.Mesh(toGeometry(G), HOUSE_GLASS) : null; if (glass) scene.add(glass);
  const staff = makePerson({ shirt: '#1d1d1d' }); staff.root.position.set(cx + 0.9, y0, cz); staff.root.rotation.y = rand() * TAU; scene.add(staff.root);
  return { B, mesh, glass, staff, windows, cx, cz };
}
function dropLobby(L) { scene.remove(L.mesh); L.mesh.geometry.dispose(); L.mesh.material.dispose(); if (L.glass) { scene.remove(L.glass); L.glass.geometry.dispose(); } disposePerson(L.staff); }
let lobbyT = 0;
function updateLobbies(dt) {
  lobbyT -= dt; if (lobbyT > 0) return; lobbyT = 0.7;
  const slow = player.state === 'foot' || (player.state === 'car' && player.car && player.car.speed < 10);
  for (const L of LOBBIES.slice()) if (!slow || Math.hypot(L.cx - player.x, L.cz - player.z) > 120 || (TOWER && TOWER.b === L.B.b)) { dropLobby(L); LOBBIES.splice(LOBBIES.indexOf(L), 1); }
  if (!slow || TOWER || LOBBIES.length >= 2) return;
  const cands = bigBuildingsNear(player.x, player.z, 45).filter((B) => ['apartments', 'offices', 'hotel'].includes(B.kind) && B.b[0] >= 14 && B.f.length >= 6 && B.f.length <= 240 && !LOBBIES.some((L) => L.B.b === B.b));
  const B = cands.sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - player.x, (a.z0 + a.z1) / 2 - player.z) - Math.hypot((b.x0 + b.x1) / 2 - player.x, (b.z0 + b.z1) / 2 - player.z))[0];
  if (B) { const L = buildLobby(B); if (L) LOBBIES.push(L); }
}
