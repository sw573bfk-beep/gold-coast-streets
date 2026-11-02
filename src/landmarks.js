// ============================================================================
// Gold Coast Streets — the landmarks people know by sight, built by hand on top of the map:
// Q1 (the tower stops at its 245 m roof, then the glass crown, the SkyPoint deck band and the spire to 322.5 m),
// HOTA's white gallery, The Star's name on its tower, and the two stadiums as real bowls with a pitch
// (Cbus Super Stadium at Robina, People First Stadium at Carrara).
// ============================================================================
const LANDMARK = {
  q1: { name: 'Q1 Tower', roof: 245, crown: 275, top: 322.5, deck: 230 },
  stadiums: [{ name: 'Cbus Super Stadium', x: -4415, z: 7454 }, { name: 'People First Stadium', x: -5580, z: 836 }],
  star: { x: 498, z: 3640 },
  hota: { x: -594, z: 68 },
};
// ---------------------------------------------------------------- skyline: towers whose height is a matter of public record
// (only where the map's height was clearly off; the core's heights come from data/map.json)
const SKYLINE = [['Q1 Tower', LANDMARK.q1.roof]];
(function fixSkyline() {
  const names = (MAP.details && MAP.details.bnames) || {};
  for (const [i, nm] of Object.entries(names)) { const fix = SKYLINE.find((s) => s[0] === nm); if (fix && MAP.buildings[+i]) { MAP.buildings[+i][0] = fix[1]; if (nm === 'Q1 Tower') LANDMARK.q1.idx = +i; } }
})();
const LM_MATS = {
  glass: new THREE.MeshStandardMaterial({ color: col('#8fb4c9'), roughness: 0.15, metalness: 0.6, envMapIntensity: 1.0 }),
  gold: new THREE.MeshStandardMaterial({ color: col('#d8b45a'), emissive: col('#ffd27a'), emissiveIntensity: 0, roughness: 0.35, metalness: 0.6 }),
  white: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, envMapIntensity: 0.4 }),
  deck: new THREE.MeshStandardMaterial({ color: col('#f6f2e4'), emissive: col('#bfe2ff'), emissiveIntensity: 0, roughness: 0.4 }),
  roof: new THREE.MeshStandardMaterial({ color: col('#f2f2ee'), roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
};
// ---------------------------------------------------------------- Q1: crown, SkyPoint and spire, on the core's tower
function buildFamousTowers() {
  const Q = LANDMARK.q1, b = Q.idx != null && MAP.buildings[Q.idx]; if (!b) return;
  const f = b.slice(3), n = f.length / 2; let cx = 0, cz = 0; for (let q = 0; q < n; q++) { cx += f[2 * q] / n; cz += f[2 * q + 1] / n; }
  const ring = (s, y) => { const out = []; for (let q = 0; q < n; q++) out.push([cx + (f[2 * q] - cx) * s, y, cz + (f[2 * q + 1] - cz) * s]); return out; };
  const B = newBuf();
  const band = (s0, y0, s1, y1) => { const A = ring(s0, y0), C = ring(s1, y1); for (let q = 0; q < n; q++) { const k = (q + 1) % n; B.pos.push(...A[q], ...A[k], ...C[k], ...A[q], ...C[k], ...C[q]); } };
  band(1.0, Q.roof, 0.82, Q.roof + 12); band(0.82, Q.roof + 12, 0.55, Q.roof + 22); band(0.55, Q.roof + 22, 0.25, Q.crown); // the tapering glass crown
  const g = toGeometry(B); g.computeVertexNormals(); const crown = new THREE.Mesh(g, LM_MATS.glass); crown.material.side = THREE.DoubleSide; scene.add(crown);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.9, Q.top - Q.crown + 4, 8), LM_MATS.gold); spire.position.set(cx, Q.crown - 2 + (Q.top - Q.crown + 4) / 2, cz); scene.add(spire);
  const D = newBuf(); band(1.035, Q.deck, 1.035, Q.deck + 3.4); const dg = toGeometry(D); dg.computeVertexNormals(); // the SkyPoint observation deck: a glowing band
  const deck = new THREE.Mesh(dg, LM_MATS.deck); deck.material.side = THREE.DoubleSide; scene.add(deck);
  LANDMARK.q1.built = { cx, cz };
}
function updateFamousLights() { LM_MATS.deck.emissiveIntensity = smooth(0.3, 0.8, nightLevel) * 1.2; LM_MATS.gold.emissiveIntensity = smooth(0.3, 0.8, nightLevel) * 0.6; }
// ---------------------------------------------------------------- on streamed tiles: stadiums and The Star
function landmarkSkip(T, data) { // the stadium's own box would poke through the bowl: hide it before the buildings are made
  const S = REGION.tile;
  for (const st of LANDMARK.stadiums) {
    if (st.x < T.x0 - 200 || st.x > T.x0 + S + 200 || st.z < T.z0 - 200 || st.z > T.z0 + S + 200) continue;
    let best = null;
    data.buildings.forEach((b, bi) => { const f = b.slice(3); let cx = 0, cz = 0; const n = f.length / 2; for (let q = 0; q < n; q++) { cx += f[2 * q] / n; cz += f[2 * q + 1] / n; } const d = Math.hypot(cx - st.x, cz - st.z); if (d < 140) { const a = Math.abs(polyArea(f)); if (a > 3000 && (!best || a > best.a)) best = { b, a, f }; if (a > 300 && d < 110) b.skip = true; } });
    if (best) { best.b.skip = true; st.foot = best.f; }
  }
}
function landmarkTile(T, data, segs) {
  storyBridgeTile(T, data); // Brisbane's Story Bridge (brisbane.js)
  const S = REGION.tile, inT = (x, z) => x >= T.x0 && z >= T.z0 && x < T.x0 + S && z < T.z0 + S;
  for (const st of LANDMARK.stadiums) if (inT(st.x, st.z)) stadiumBowl(T, st, segs);
  const sr = LANDMARK.star; if (inT(sr.x, sr.z)) { // THE STAR in gold on its tallest tower
    let best = null; for (const b of data.buildings) { const f = b.slice(3); let cx = 0, cz = 0; const n = f.length / 2; for (let q = 0; q < n; q++) { cx += f[2 * q] / n; cz += f[2 * q + 1] / n; } if (Math.hypot(cx - sr.x, cz - sr.z) < 260 && (!best || b[0] > best.b[0])) best = { b, f, cx, cz }; }
    if (best && best.b[0] > 40) towerSign(T, best, 'THE STAR', '#ffd27a');
  }
  const ho = LANDMARK.hota; if (inT(ho.x, ho.z) && !inCore(ho.x, ho.z)) { /* the gallery is in the core: done by buildLandmarks' core pass */ }
}
function towerSign(T, B, text, colr) {
  const f = B.f, n = f.length / 2; let best = null;
  for (let q = 0; q < n; q++) { const ax = f[2 * q], az = f[2 * q + 1], bx = f[(2 * q + 2) % (2 * n)], bz = f[(2 * q + 3) % (2 * n)], L = Math.hypot(bx - ax, bz - az); if (!best || L > best.L) best = { L, ax, az, bx, bz }; }
  const c = document.createElement('canvas'); c.width = 1024; c.height = 160; const x = c.getContext('2d'); fitFont(x, text, 1000, 140, '800', FONT.cond); x.fillStyle = colr; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 512, 84);
  const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, emissiveMap: tex, emissive: col('#ffffff'), emissiveIntensity: 0, roughness: 0.4 });
  const top = groundAt(B.cx, B.cz) + B.b[0], G = newBuf(), { L, ax, az, bx, bz } = best, nx = (bz - az) / L, nz = -(bx - ax) / L, w = Math.min(L * 0.85, 40);
  for (const s of [1, -1]) quadInto(G, (ax + bx) / 2 + nx * 0.4 * s, top - w / 12, (az + bz) / 2 + nz * 0.4 * s, nx * s, nz * s, w, w / 6.4, s > 0 ? { u0: 0, u1: 1, v0: 0, v1: 1 } : { u0: 1, u1: 0, v0: 0, v1: 1 });
  const g = toGeometry(G), m = new THREE.Mesh(g, mat); T.meshes.push(m); T.disposables.push(g, mat, tex); T.nightMats = (T.nightMats || []).concat([mat]);
}
// a stadium: oval stands rising from the pitch, a roof over the upper tier, the playing field with its lines
function stadiumBowl(T, st, segs) {
  let ux = 1, uz = 0, a = 92, b = 74; // half-lengths of the outside of the stands (metres)
  if (st.foot) { // fit the oval to the stadium's real outline
    const f = st.foot, n = f.length / 2; let bestA = null;
    for (let q = 0; q < n; q++) { const ex = f[(2 * q + 2) % (2 * n)] - f[2 * q], ez = f[(2 * q + 3) % (2 * n)] - f[2 * q + 1], L = Math.hypot(ex, ez); if (L < 4) continue; const tx = ex / L, tz = ez / L; let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for (let k = 0; k < n; k++) { const u = (f[2 * k] - st.x) * tx + (f[2 * k + 1] - st.z) * tz, v = -(f[2 * k] - st.x) * tz + (f[2 * k + 1] - st.z) * tx; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); } const A = (u1 - u0) * (v1 - v0); if (!bestA || A < bestA.A) bestA = { A, tx, tz, u0, u1, v0, v1 }; }
    if (bestA) { const B = bestA; ux = B.tx; uz = B.tz; let du = (B.u1 - B.u0) / 2, dv = (B.v1 - B.v0) / 2; if (du < dv) { [ux, uz] = [-uz, ux]; [du, dv] = [dv, du]; } a = clamp(du, 70, 125); b = clamp(dv, 55, 105); const cu = (B.u0 + B.u1) / 2, cv = (B.v0 + B.v1) / 2; st.x += B.tx * cu - B.tz * cv; st.z += B.tz * cu + B.tx * cv; }
  }
  const g0 = groundAt(st.x, st.z), N = 48, P = (s, ang, y) => { const ca = Math.cos(ang) * a * s, sa = Math.sin(ang) * b * s; return [st.x + ux * ca - uz * sa, g0 + y, st.z + uz * ca + ux * sa]; };
  const W = newBuf(), seat = col('#2f6fb0'), seat2 = col('#e7e3d8'), conc = col('#bdb8ad'), grass = col('#3f8a3c');
  const quad = (A, B, C, D, c) => { const st0 = W.pos.length; W.pos.push(...A, ...B, ...C, ...A, ...C, ...D); const ax = B[0] - A[0], ay = B[1] - A[1], az = B[2] - A[2], bx = C[0] - A[0], by = C[1] - A[1], bz = C[2] - A[2]; let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1; for (let v = st0; v < W.pos.length; v += 3) { W.nor.push(nx / l, ny / l, nz / l); W.col.push(c.r, c.g, c.b); } };
  for (let k = 0; k < N; k++) {
    const a0 = k / N * TAU, a1 = (k + 1) / N * TAU, c = k % 2 ? seat : seat2;
    quad(P(0.72, a0, 1.2), P(0.72, a1, 1.2), P(0.86, a1, 10), P(0.86, a0, 10), seat);   // lower tier
    quad(P(0.86, a0, 10), P(0.86, a1, 10), P(0.88, a1, 12), P(0.88, a0, 12), conc);   // the concourse
    quad(P(0.88, a0, 12), P(0.88, a1, 12), P(1.0, a1, 24), P(1.0, a0, 24), c === seat ? seat : seat2); // upper tier
    quad(P(1.0, a1, 0), P(1.0, a0, 0), P(1.0, a0, 26), P(1.0, a1, 26), conc);         // the outside wall
    quad(P(0.72, a1, 0), P(0.72, a0, 0), P(0.72, a0, 1.2), P(0.72, a1, 1.2), conc);  // the fence round the field
    const A0 = P(1.0, a0, 0), A1 = P(1.0, a1, 0); segs.push(A0[0], A0[2], A1[0], A1[2], 26);
  }
  for (let k = 0; k < N; k++) { const a0 = k / N * TAU, a1 = (k + 1) / N * TAU; quad(P(0, 0, 0.05), P(0.72, a0, 0.05), P(0.72, a1, 0.05), P(0, 0, 0.05), grass); } // the field
  const m = new THREE.Mesh(toGeometry(W), LM_MATS.white); m.castShadow = m.receiveShadow = true; m.material.side = THREE.DoubleSide; T.meshes.push(m); T.disposables.push(m.geometry);
  const R = newBuf(); for (let k = 0; k < N; k++) { const a0 = k / N * TAU, a1 = (k + 1) / N * TAU; const A = P(1.02, a0, 30), B = P(1.02, a1, 30), C = P(0.8, a1, 27), D = P(0.8, a0, 27); R.pos.push(...A, ...B, ...C, ...A, ...C, ...D); }
  const rg = toGeometry(R); rg.computeVertexNormals(); const roof = new THREE.Mesh(rg, LM_MATS.roof); T.meshes.push(roof); T.disposables.push(rg);
  // pitch lines: a rectangle and halfway line (rugby league at Cbus, AFL oval at Carrara is close enough)
  const L = newBuf(), fl = a * 0.62, fw = b * 0.58, line = (x0, z0, x1, z1) => { const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz); groundRect(L, st.x + ux * (x0 + x1) / 2 - uz * (z0 + z1) / 2, st.z + uz * (x0 + x1) / 2 + ux * (z0 + z1) / 2, (ux * dx - uz * dz) / len, (uz * dx + ux * dz) / len, len, 0.25, 0.1); };
  line(-fl, -fw, fl, -fw); line(-fl, fw, fl, fw); line(-fl, -fw, -fl, fw); line(fl, -fw, fl, fw); line(0, -fw, 0, fw);
  const lg = toGeometry(L), lm = new THREE.Mesh(lg, STREET_MATS.paint); T.meshes.push(lm); T.disposables.push(lg);
}
// ---------------------------------------------------------------- HOTA's gallery: the big white building with its name (core)
function buildHota() {
  const H = LANDMARK.hota; let best = null;
  MAP.buildings.forEach((b) => { const f = b.slice(3), n = f.length / 2; let cx = 0, cz = 0; for (let q = 0; q < n; q++) { cx += f[2 * q] / n; cz += f[2 * q + 1] / n; } const d = Math.hypot(cx - H.x, cz - H.z); const ar = Math.abs(polyArea(f)); if (d < 160 && ar > 1500 && b[0] > 14 && (!best || b[0] > best.b[0])) best = { b, f, cx, cz }; });
  if (!best) return;
  const f = best.f, n = f.length / 2, h = best.b[0], B = newBuf(), white = col('#f5f4ef'), fin = col('#dcdad2');
  for (let q = 0; q < n; q++) { // a white skin just outside the walls, with upright fins
    const ax = f[2 * q], az = f[2 * q + 1], bx = f[(2 * q + 2) % (2 * n)], bz = f[(2 * q + 3) % (2 * n)], L = Math.hypot(bx - ax, bz - az); if (L < 1) continue;
    const nx = (bz - az) / L, nz = -(bx - ax) / L; wallInto(B, ax + nx * 0.15, az + nz * 0.15, bx + nx * 0.15, bz + nz * 0.15, 0, h + 0.3, nx, nz, white);
    for (let t = 1.5; t < L; t += 3) { const px = ax + (bx - ax) * t / L + nx * 0.5, pz = az + (bz - az) * t / L + nz * 0.5; boxInto(B, px, 0, pz, 0.25, h * (0.55 + 0.45 * Math.abs(Math.sin(t * 0.37))), 0.6, fin); }
  }
  const m = new THREE.Mesh(toGeometry(B), LM_MATS.white); m.castShadow = m.receiveShadow = true; scene.add(m);
  const holder = { meshes: [], disposables: [], nightMats: null }; towerSign(holder, { f, b: best.b, cx: best.cx, cz: best.cz }, 'HOTA', '#1d1d1d'); for (const s of holder.meshes) scene.add(s);
}
