// ============================================================================
// Gold Coast Streets — surfing. On a beach (or swimming off one) press E to hire a board. Paddle out with W and
// A/D, Space to duck-dive under white water. Sets of waves roll in parallel to the sand; turn to face the beach
// and paddle as one reaches you to catch it. Then: A/D carve along the wave, W drops down the face for speed,
// S climbs back up, Space near the lip for an air. Each wave breaks from one end (the peel): stay ahead of the
// white water on the clean shoulder. Points for time, speed and tricks, paid out in cash when the ride ends.
// ============================================================================
const SURF = { on: false, mode: 'paddle', waves: [], frame: null, board: null, meshes: [], t: 0, nextWave: 3, set: 0, pts: 0, best: 0, ride: null, wipeT: 0, duck: 0, air: 0, h: 0, x: 0, z: 0, hint: 0 };
const WAVE_C = 6.5, WAVE_START = 230, WAVE_HALF = 160, WAVE_SEGS = 64, WAVE_ROWS = 14;
let SURF_SEGS = null;
// every stretch of ocean shoreline, with the side the sea is on
function surfSegments() {
  if (SURF_SEGS) return SURF_SEGS;
  SURF_SEGS = [];
  const add = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az); if (L < 1) return;
    let nx = (bz - az) / L, nz = -(bx - ax) / L; const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (isLand(mx + nx * 25, mz + nz * 25) && !isLand(mx - nx * 25, mz - nz * 25)) { nx = -nx; nz = -nz; } // point the normal out to sea
    SURF_SEGS.push([ax, az, bx, bz, nx, nz]);
  };
  for (const p of (REGION && REGION.coast) || []) for (let i = 0; i + 3 < p.length; i += 2) add(p[i], p[i + 1], p[i + 2], p[i + 3]);
  for (let i = 0; i + 3 < coastPts.length; i += 2) if (Math.hypot(coastPts[i + 2] - coastPts[i], coastPts[i + 3] - coastPts[i + 1]) < 80) add(coastPts[i], coastPts[i + 1], coastPts[i + 2], coastPts[i + 3]);
  return SURF_SEGS;
}
// the nearest beach: closest point on the shoreline, the way out to sea, and how far you are from it
function nearestShore(x, z) {
  let best = null, bd = 1e9;
  for (const S of surfSegments()) {
    const [ax, az, bx, bz] = S, ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez, t = clamp(((x - ax) * ex + (z - az) * ez) / L2, 0, 1);
    const px = ax + ex * t, pz = az + ez * t, d = Math.hypot(x - px, z - pz);
    if (d < bd) { bd = d; best = { px, pz, nx: S[4], nz: S[5], d }; }
  }
  if (best) { best.tx = -best.nz; best.tz = best.nx; best.off = (x - best.px) * best.nx + (z - best.pz) * best.nz; } // off: metres out to sea (negative = on land)
  return best;
}
// local wave frame: s along the beach, d out to sea, from a fixed point on the shore
function setSurfFrame(x, z) { const S = nearestShore(x, z); if (!S) return false; SURF.frame = { ox: S.px, oz: S.pz, nx: S.nx, nz: S.nz, tx: S.tx, tz: S.tz }; SURF.waves.length = 0; SURF.nextWave = 1; return true; }
const toLocal = (x, z) => { const F = SURF.frame, rx = x - F.ox, rz = z - F.oz; return [rx * F.tx + rz * F.tz, rx * F.nx + rz * F.nz]; };
const toWorld = (s, d) => { const F = SURF.frame; return [F.ox + F.tx * s + F.nx * d, F.oz + F.tz * s + F.nz * d]; };
// sets: a few bigger waves together, then a lull; each wave peels from one end
function spawnWave() {
  if (SURF.set <= 0) SURF.set = 3 + Math.floor(rand() * 3);
  const big = SURF.set >= 3 ? 1.1 : 0.85, h = (1.1 + rand() * 0.9) * big * (1 + WEATHER.storm * 0.6 + WEATHER.rain * 0.15), dir = rand() < 0.5 ? 1 : -1; // storms bring bigger surf
  SURF.waves.push({ d: WAVE_START, h, breakD: 55 + h * 22, peel: null, dir, peelV: 6 + rand() * 3 });
  SURF.set--; SURF.nextWave = SURF.set > 0 ? 9 + rand() * 3 : 22 + rand() * 10;
}
// height of the sea at a point (s, d), and whether it's broken white water there
function waveAt(s, d) {
  let y = 0, foam = 0, face = null;
  for (const W of SURF.waves) {
    const k = d - W.d, broken = W.peel !== null && (s - W.peel) * W.dir < 0;
    const amp = W.h * (broken ? 0.55 : 1) * clamp((WAVE_START - W.d) / 40, 0, 1) * clamp(W.d / 15, 0, 1);
    let hgt;
    if (k >= 0) hgt = amp * Math.exp(-(k * k) / (W.peel !== null || W.d < W.breakD + 20 ? 30 : 60)); // the back slopes gently
    else hgt = amp * Math.exp(-(k * k) / (W.d < W.breakD + 20 ? 6 : 40)); // the face steepens as it nears breaking
    if (hgt > y) { y = hgt; face = W; }
    if (broken && k > -4 && k < 6) foam = Math.max(foam, 1 - Math.abs(k - 1) / 5);
  }
  return [y, foam, face];
}
const SURF_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.05, envMapIntensity: 0.55, transparent: true, opacity: 0.96 }); // less sky in it than the flat sea, so the faces read
const BOARD_MAT = new THREE.MeshStandardMaterial({ color: col('#f4f1ea'), roughness: 0.35 });
function ensureWaveMeshes() {
  if (SURF.meshes.length) return;
  for (let k = 0; k < 5; k++) {
    const g = new THREE.PlaneGeometry(1, 1, WAVE_SEGS, WAVE_ROWS); g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
    const m = new THREE.Mesh(g, SURF_MAT); m.frustumCulled = false; m.visible = false; m.receiveShadow = true; scene.add(m); SURF.meshes.push(m);
  }
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 2.1), BOARD_MAT); b.castShadow = true; b.visible = false; scene.add(b); SURF.board = b;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.22), BOARD_MAT); fin.position.set(0, -0.12, -0.85); b.add(fin);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.085, 2.0), new THREE.MeshStandardMaterial({ color: col('#e23b2a') })); b.add(stripe);
}
// each wave as a strip along the beach; colour goes from deep blue to white foam where it has broken
const _wc = new THREE.Color(), DEEP = col('#0b4a63'), FACE = col('#0f8a96'), FOAM = col('#ffffff');
function drawWaves(ps) {
  ensureWaveMeshes();
  SURF.meshes.forEach((m, i) => {
    const W = SURF.waves[i]; m.visible = !!W; if (!W) return;
    const P = m.geometry.attributes.position, C = m.geometry.attributes.color, cols = WAVE_SEGS + 1;
    for (let r = 0; r <= WAVE_ROWS; r++) for (let c = 0; c <= WAVE_SEGS; c++) {
      const q = r * cols + c, s = ps + (c / WAVE_SEGS - 0.5) * 2 * WAVE_HALF, d = W.d - 9 + (r / WAVE_ROWS) * 26;
      const [y, foam] = waveAt(s, d), [x, z] = toWorld(s, d);
      P.setXYZ(q, x, -0.5 + y, z);
      const steep = clamp(y / Math.max(0.3, W.h), 0, 1);
      _wc.copy(DEEP).lerp(FACE, steep * 0.8).lerp(FOAM, clamp(foam * 1.2 + (steep > 0.85 && W.d < W.breakD + 6 ? (steep - 0.85) * 4 : 0), 0, 1));
      const glow = 1 + clamp(foam, 0, 1) * 0.35; C.setXYZ(q, _wc.r * glow, _wc.g * glow, _wc.b * glow);
    }
    P.needsUpdate = true; C.needsUpdate = true; m.geometry.computeVertexNormals();
  });
}
function updateWaves(dt) {
  if (!SURF.frame) return;
  SURF.nextWave -= dt; if (SURF.nextWave <= 0) spawnWave();
  for (const W of SURF.waves) {
    W.d -= WAVE_C * dt;
    if (W.peel === null && W.d < W.breakD) W.peel = toLocal(player.x, player.z)[0] + (rand() * 60 - 30) - W.dir * 40; // starts breaking a little to one side of you
    if (W.peel !== null) W.peel += W.dir * W.peelV * dt;
  }
  for (let i = SURF.waves.length - 1; i >= 0; i--) if (SURF.waves[i].d < 6) SURF.waves.splice(i, 1);
  drawWaves(toLocal(player.x, player.z)[0]);
}
// ---------------------------------------------------------------- the surfer
function surfUse() { // E: grab a board on the sand or in the water off a beach, or hand it back
  if (SURF.on) { if (SURF.mode === 'paddle' && toLocal(player.x, player.z)[1] < 25) { endSurf(); toast('Board back — thanks for surfing'); } else toast('Paddle back in towards the beach to hand the board back'); return true; }
  if (player.state !== 'foot' || !REGION) return false;
  const S = nearestShore(player.x, player.z); if (!S || S.off < -60 || S.off > 120) return false;
  if (!(onBeach(player.x, player.z) || onBeachSand(player.x, player.z) || !isLand(player.x, player.z))) return false;
  if (!pay(10, 'board hire')) return true;
  setSurfFrame(player.x, player.z); SURF.on = true; SURF.mode = 'paddle'; SURF.pts = 0; SURF.ride = null; SURF.h = Math.atan2(S.nx, S.nz); SURF.t = 0;
  const [sx, sz] = toWorld(toLocal(player.x, player.z)[0], Math.max(6, S.off)); SURF.x = sx; SURF.z = sz;
  player.state = 'surf'; ensureWaveMeshes(); SURF.board.visible = true; for (let k = 0; k < 3; k++) spawnWave(); SURF.waves.forEach((W, i) => { W.d = 120 + i * 60; });
  toast('Board hired ($10). W paddle out · A/D turn · Space duck-dive · turn to the beach and paddle to catch a wave'); return true;
}
function endSurf() {
  SURF.on = false; player.state = 'foot'; if (SURF.board) SURF.board.visible = false;
  for (const m of SURF.meshes) m.visible = false; SURF.waves.length = 0; $('jobhud').hidden = true;
  player.x = SURF.x; player.z = SURF.z; player.y = 0; player.model.root.rotation.set(0, player.h, 0, 'XYZ');
}
function finishRide(wiped) {
  const R = SURF.ride; SURF.ride = null; SURF.mode = wiped ? 'wipe' : 'paddle'; SURF.wipeT = wiped ? 2.2 : 0;
  if (!R) return;
  const pts = Math.round(R.pts), cash = Math.round(pts / 25);
  SURF.best = Math.max(SURF.best, pts);
  if (wiped) { toast(`Wipeout! ${pts} pts${cash ? ` · +$${cash}` : ''}`); sfxNoise(0.6, 600, 0.4); }
  else toast(`Nice ride — ${R.t.toFixed(1)} s · ${pts} pts · +$${cash}`);
  player.money += cash; if (cash) saveGame();
}
function updateSurf(dt) {
  const P = player.model, steer = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
  let [s, d] = toLocal(SURF.x, SURF.z);
  if (Math.abs(s) > 120) { setSurfFrame(SURF.x, SURF.z); [s, d] = toLocal(SURF.x, SURF.z); } // follow the coast round as you move along it
  updateWaves(dt);
  const [sea, foam, face] = waveAt(s, d), F = SURF.frame;
  if (SURF.mode === 'wipe') { // tumbling under the white water, then back on the board
    SURF.wipeT -= dt; SURF.duck = 0;
    const [x, z] = toWorld(s, d - WAVE_C * 0.6 * dt); SURF.x = x; SURF.z = z;
    P.root.position.set(x, -0.5 + sea - 0.6, z); P.root.rotation.set(elapsed * 6, SURF.h, elapsed * 4, 'YXZ');
    if (SURF.wipeT <= 0) SURF.mode = 'paddle';
  } else if (SURF.mode === 'paddle') {
    SURF.h += steer * 1.7 * dt;
    const fx = Math.sin(SURF.h), fz = Math.cos(SURF.h), sp = keys.KeyW || keys.ArrowUp ? (keys.ShiftLeft ? 2.6 : 1.9) : 0;
    if (keys.Space && SURF.duck <= 0) { SURF.duck = 0.9; keys.Space = false; }
    SURF.duck -= dt;
    let x = SURF.x + fx * sp * dt, z = SURF.z + fz * sp * dt;
    if (foam > 0.3 && SURF.duck <= 0) { x -= F.nx * WAVE_C * 0.55 * foam * dt; z -= F.nz * WAVE_C * 0.55 * foam * dt; } // white water shoves you back in unless you duck under it
    const [s2, d2] = toLocal(x, z); if (d2 < 3) { [x, z] = toWorld(s2, 3); }
    SURF.x = x; SURF.z = z;
    // a wave about to pass under you, facing the beach and paddling: you're on it
    const toBeach = -(fx * F.nx + fz * F.nz);
    for (const W of SURF.waves) {
      const k = d2 - W.d, broken = W.peel !== null && (s2 - W.peel) * W.dir < 0;
      if (k > -1.5 && k < 4 && toBeach > 0.3 && sp > 0 && W.d < W.breakD + 30) { // white water can be caught too (a beginner's ride, fewer points)
        SURF.mode = 'ride'; SURF.ride = { W, face: broken ? 2 : 3.5, vs: (fx * F.tx + fz * F.tz) * 4, t: 0, pts: 0, lastDir: 0 }; sfxNoise(0.4, 900, 0.25);
        toast(broken ? 'Riding the white water — carve (A/D) along to the clean face for more points' : 'Up and riding! A/D carve · W drop down the face · S climb · Space near the lip for an air'); break;
      }
      if (k > 4 && k < 30 && SURF.hint <= 0 && W.d < W.breakD + 40) { SURF.hint = 6; toast(toBeach > 0.3 ? 'Wave coming — paddle (W) now!' : 'Wave coming — turn to face the beach and paddle'); }
    }
    SURF.hint -= dt;
    const lineup = SURF.waves.length ? Math.round(Math.max(...SURF.waves.map((W) => W.breakD)) - 10) : 80;
    $('jobhud').hidden = false; $('jobhud').textContent = d2 < lineup - 15 ? `Surfing · ${Math.round(d2)} m out · the waves break about ${lineup} m out — paddle out (W), Space to duck-dive` : `Surfing · in the line-up (${Math.round(d2)} m out) · face the beach and paddle as a wave reaches you · best ${SURF.best}`;
    const bob = Math.sin(elapsed * 2.2) * 0.04, dy = SURF.duck > 0 ? -0.7 : 0;
    P.root.position.set(SURF.x, -0.5 + sea + 0.18 + bob + dy, SURF.z); P.root.rotation.set(1.45, SURF.h, 0, 'YXZ'); // lying along the board, head to the nose
    animatePerson(P, elapsed * (sp ? 3.2 : 0.8), sp ? 0.9 : 0.2, 'swim');
    SURF.board.position.set(SURF.x, -0.5 + sea + 0.03 + bob + dy, SURF.z); SURF.board.rotation.set(0, SURF.h, 0);
  } else { // riding
    const R = SURF.ride, W = R.W; R.t += dt;
    const carve = steer; // A: along +s (left as you face the beach), D: the other way
    R.vs = clamp(R.vs + carve * 9 * dt, -11, 11); R.vs *= Math.exp(-0.25 * dt);
    if (keys.KeyW || keys.ArrowUp) R.face = Math.min(7, R.face + 3 * dt); // drop down the face: faster, further from the lip
    if (keys.KeyS || keys.ArrowDown) R.face = Math.max(0.4, R.face - 3 * dt); // climb towards the lip
    const speedGain = (R.face - 2) * 0.35; R.vs += Math.sign(R.vs || 1) * speedGain * dt * (Math.abs(R.vs) < 11 ? 1 : 0);
    const s2 = s + R.vs * dt, d2 = W.d - R.face, broken = W.peel !== null && (s2 - W.peel) * W.dir < 0;
    const [x, z] = toWorld(s2, d2); SURF.x = x; SURF.z = z;
    const speed = Math.hypot(R.vs, WAVE_C);
    R.pts += speed * dt * (broken ? 1 : 3);
    if (Math.sign(R.vs) !== R.lastDir && Math.abs(R.vs) > 4 && R.lastDir) { R.pts += 100; toast('Cutback! +100'); }
    if (Math.abs(R.vs) > 2) R.lastDir = Math.sign(R.vs);
    if (keys.Space && SURF.air <= 0 && R.face < 1.8 && speed > 8) { SURF.air = 0.9; R.pts += 250; keys.Space = false; toast('Air! +250'); sfxTone([660, 990], 0.15, 0.05); }
    SURF.air -= dt;
    const air = SURF.air > 0 ? Math.sin((SURF.air / 0.9) * Math.PI) * 1.6 : 0;
    const heading = Math.atan2(F.tx * R.vs - F.nx * WAVE_C, F.tz * R.vs - F.nz * WAVE_C);
    SURF.h = heading;
    const [yy] = waveAt(s2, d2);
    SURF.board.position.set(x, -0.5 + yy + 0.05 + air, z); SURF.board.rotation.set(0, heading, -carve * 0.35 + (air ? elapsed * 8 : 0) * 0);
    P.root.position.set(x, -0.5 + yy + 0.12 + air, z); P.root.rotation.set(0, heading + Math.PI / 2, -carve * 0.25, 'YXZ'); // side-on, leaning into the turn
    animatePerson(P, 0, 0); P.legL.rotation.x = 0.35; P.legR.rotation.x = -0.35; P.armL.rotation.z = 1.2; P.armR.rotation.z = -1.2;
    $('jobhud').hidden = false; $('jobhud').textContent = `Surfing · ${R.t.toFixed(1)} s · ${Math.round(R.pts)} pts${broken ? ' · in the white water — carve ahead of it!' : ''} · best ${SURF.best}`;
    // ends: over the falls at the lip as it breaks, buried in the white water, or a clean kick-out near the sand
    if (R.face < 0.6 && W.d < W.breakD && !air) return finishRide(true);
    R.foamT = broken ? (R.foamT || 0) + dt : 0; if (broken) R.vs *= Math.exp(-0.6 * dt); // the white water slows you down
    if (broken && R.foamT > 2.5 && Math.abs(R.vs) < 2.5) return finishRide(true); // ...and buries you if you stall in it
    if (W.d < 18) { finishRide(false); $('jobhud').hidden = true; }
  }
  player.x = SURF.x; player.z = SURF.z; player.h = SURF.h;
}
