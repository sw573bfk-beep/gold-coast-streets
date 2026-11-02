// Gold Coast Streets — jumping off things. Take a tower's lift to the Roof, walk to the ledge and press Space to jump.
// In free fall W A S D steer; Space opens the parachute (then A/D turn, W dives faster, S flares to slow down). Hit the
// ground hard without a chute and you're wasted; land in the water and you just swim. You can also bail out of a
// flying helicopter (E) or plane (F) and float down. Landing on a big building's roof puts you up there (lift down).

const SKY = { alt: 0, top: 0, vx: 0, vz: 0, vy: 0, t: 0, open: false, chute: 0, from: '', mesh: null, hud: null, hintT: 0, last: null };
function skyStart(x, z, alt, vx, vz, vy, from) {
  player.state = 'sky'; player.mode = 'foot'; player.vault = null; player.model.root.visible = true;
  player.x = x; player.z = z; player.y = 0; player.vy = 0;
  Object.assign(SKY, { alt, top: alt, vx, vz, vy, t: 0, open: false, chute: 0, from });
  player.model.root.rotation.order = 'YXZ'; // pitch the body about its own shoulders, whichever way it faces
  stat('jumps'); sfxNoise(0.5, 500, 0.18);
  refreshKeyHints();
}
// on a tower roof right by the ledge: where the ledge is and which way is out
function roofEdge() {
  if (!TOWER || TOWER.level <= TOWER.floors || player.state !== 'foot') return null;
  const f = TOWER.f, n = f.length / 2; let best = null, bd = 1.4;
  for (let q = 0; q < n; q++) {
    const ax = f[2 * q], az = f[2 * q + 1], bx = f[(2 * q + 2) % (2 * n)], bz = f[(2 * q + 3) % (2 * n)], ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez; if (L2 < 1) continue;
    const t = clamp(((player.x - ax) * ex + (player.z - az) * ez) / L2, 0, 1), px = ax + ex * t, pz = az + ez * t, d = Math.hypot(player.x - px, player.z - pz);
    if (d < bd) { const L = Math.sqrt(L2); let nx = ez / L, nz = -ex / L; if (inRing(px + nx * 0.5, pz + nz * 0.5, f)) { nx = -nx; nz = -nz; } bd = d; best = { px, pz, nx, nz }; }
  }
  return best;
}
// Space at the ledge: over it and off
function tryLedgeJump() {
  const E = roofEdge(); if (!E) return false;
  const name = TOWER.name, y = TOWER.y + 1.2;
  disposeTowerLevel(); TOWER = null;
  player.h = Math.atan2(E.nx, E.nz);
  skyStart(E.px + E.nx * 1.3, E.pz + E.nz * 1.3, y, E.nx * 4.5, E.nz * 4.5, 3.5, 'roof');
  toast(`You jumped off ${name}! Space to open your parachute`);
  return true;
}
// E in a flying helicopter, F in a flying plane: jump out
function skyBail() {
  const c = player.chopper || player.plane; if (!c) return false;
  const heli = !!player.chopper, alt = heli ? c.alt : c.y - groundAt(c.x, c.z);
  if (alt < 15) return false;
  const vx = heli ? c.vx : Math.sin(c.h) * c.v * 0.6, vz = heli ? c.vz : Math.cos(c.h) * c.v * 0.6, x = c.x + Math.cos(c.h) * 2.5, z = c.z - Math.sin(c.h) * 2.5, y = c.y - 1;
  if (heli) leaveChopper(true); else leavePlane(true);
  player.h = c.h; skyStart(x, z, y, vx, vz, 0, heli ? 'heli' : 'plane');
  toast(`You jumped out of the ${heli ? 'helicopter' : 'plane'}! Space to open your parachute`);
  return true;
}
// the top of whatever building is under (x, z): { top, f } or null
function roofUnder(x, z) {
  let best = null;
  const look = (blds, bb) => {
    for (let i = 0; i < blds.length; i++) {
      const b = blds[i], r = bb[i]; if (b.skip || x < r[0] || x > r[2] || z < r[1] || z > r[3]) continue;
      const f = b.slice(3); if (!inRing(x, z, f)) continue;
      const top = groundAt(x, z) + b[0]; if (!best || top > best.top) best = { top, f, b };
    }
  };
  const boxes = (blds) => blds.map((b) => { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let q = 3; q < b.length; q += 2) { x0 = Math.min(x0, b[q]); x1 = Math.max(x1, b[q]); z0 = Math.min(z0, b[q + 1]); z1 = Math.max(z1, b[q + 1]); } return [x0, z0, x1, z1]; });
  if (inCore(x, z)) look(MAP.buildings, MAP._bb || (MAP._bb = boxes(MAP.buildings)));
  const T = REGION && tileAt(x, z); if (T && T.blds) look(T.blds, T._bb || (T._bb = boxes(T.blds)));
  return best;
}
// walls taller than you are stop you (you slide down the side of a tower)
function skyWalls(x, z, alt) {
  if (!_rc) resolveCircle(x, z, 0.1);
  const g = groundAt(x, z), st = _rc, r = 0.5; st.px = x; st.pz = z; st.nx = 0; st.nz = 0; st.hit = false; st.r = r;
  forSegs(x - r, z - r, x + r, z + r, (S, o) => { if (g + S[o + 4] > alt) pushOut(S, o); });
  return st.hit ? [st.px, st.pz] : null;
}
function chuteMesh() {
  if (SKY.mesh) return SKY.mesh;
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(1, 20, 6, 0, TAU, 0, 0.8), cols = [];
  for (let v = 0; v < geo.attributes.position.count; v++) { const x = geo.attributes.position.getX(v), z = geo.attributes.position.getZ(v), s = Math.floor((Math.atan2(z, x) + Math.PI) / TAU * 8) % 2; cols.push(...(s ? [1, 0.36, 0.2] : [1, 0.82, 0.25])); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const dome = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
  dome.scale.set(4.2, 1.5, 2.1); dome.position.y = 3.6; g.add(dome);
  const p = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const k of [0.45, 1]) p.push(sx * 3.9 * k, 3.7 - 0.4 * k, sz * 1.1, sx * 0.25, 1.45, 0);
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(p, 3)), new THREE.LineBasicMaterial({ color: 0x2b2b2b })));
  g.visible = false; scene.add(g); return (SKY.mesh = g);
}
function skyHud(text) {
  let el = SKY.hud; if (!el) { el = SKY.hud = document.createElement('div'); el.id = 'skyhud'; el.className = 'hud'; el.style.cssText = 'position:fixed;left:50%;top:33%;transform:translateX(-50%);background:rgba(10,14,20,.72);color:#fff;padding:8px 14px;border-radius:10px;font:600 17px "Barlow Condensed",sans-serif;letter-spacing:.03em;text-align:center;pointer-events:none;z-index:6'; document.body.appendChild(el); }
  el.hidden = !text; if (text) el.textContent = text;
}
function updateSkyControls(dt) {
  const S = SKY, P = player.model; S.t += dt;
  const kF = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const kR = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  if (keys.Space) { keys.Space = false; if (!S.open && S.t > 0.25) { S.open = true; S.chute = 0; sfxNoise(0.45, 700, 0.3); toast('Parachute open · A/D turn · W dive · S slow down'); refreshKeyHints(); } }
  if (!S.open) { // free fall: steer the way the camera looks; drag holds you at about 55 m/s
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
    S.vx += ((fx * kF + rx * kR) * 10 - S.vx * 0.22) * dt; S.vz += ((fz * kF + rz * kR) * 10 - S.vz * 0.22) * dt;
    S.vy -= (9.81 + Math.sign(S.vy) * S.vy * S.vy * 0.0032) * dt;
    if (kF || kR) player.h += angDiff(player.h, Math.atan2(S.vx, S.vz)) * Math.min(1, dt * 3);
  } else { // under the canopy: it flies forward, you turn it and choose how fast it comes down
    S.chute = Math.min(1, S.chute + dt * 1.5); const k = S.chute;
    player.h -= kR * 1.2 * dt;
    const fwd = kF > 0 ? 14 : kF < 0 ? 4 : 9, sink = kF > 0 ? -8 : kF < 0 ? -2.6 : -4.4;
    S.vx = lerp(S.vx, Math.sin(player.h) * fwd, Math.min(1, dt * 1.4 * k)); S.vz = lerp(S.vz, Math.cos(player.h) * fwd, Math.min(1, dt * 1.4 * k));
    S.vy = lerp(S.vy - 9.81 * dt * (1 - k), sink, Math.min(1, dt * 2.4 * k));
    if (elapsed - mouse.last > 1) camYaw += angDiff(camYaw, player.h) * Math.min(1, dt * 1.5);
  }
  let nx = clamp(player.x + S.vx * dt, WORLD.x0 + 1, WORLD.x1 - 1), nz = clamp(player.z + S.vz * dt, WORLD.z0 + 1, WORLD.z1 - 1); const na = S.alt + S.vy * dt;
  const w = skyWalls(nx, nz, na); if (w) { nx = w[0]; nz = w[1]; S.vx *= 0.3; S.vz *= 0.3; }
  player.x = nx; player.z = nz;
  const land = isLand(nx, nz), floor = land ? groundAt(nx, nz) : WATER_Y, R = land ? roofUnder(nx, nz) : null;
  if (R && S.alt >= R.top - 0.3 && na <= R.top) { S.alt = R.top; return skyLand('roof', R); }
  if (na <= floor) { S.alt = floor; return skyLand(land ? 'ground' : 'water'); }
  S.alt = na; player.speed = Math.hypot(S.vx, S.vz);
  // the body: spread out face-down falling, upright under the canopy
  const M = chuteMesh(); M.visible = S.open; M.scale.setScalar(0.25 + 0.75 * S.chute); M.position.set(player.x, S.alt, player.z); M.rotation.set(0, player.h, 0);
  animatePerson(P, 0, 0);
  if (S.open) { P.root.rotation.set(0, player.h, 0); P.armL.rotation.set(-2.7, 0, 0.2); P.armR.rotation.set(-2.7, 0, -0.2); P.legL.rotation.x = 0.25; P.legR.rotation.x = 0.1; }
  else { P.root.rotation.set(1.25, player.h, 0); P.armL.rotation.set(-1.2, 0, 1.0); P.armR.rotation.set(-1.2, 0, -1.0); P.legL.rotation.set(0.35, 0, 0.25); P.legR.rotation.set(0.35, 0, -0.25); }
  if (S.open) P.root.position.set(player.x, S.alt, player.z);
  else P.root.position.set(player.x - Math.sin(player.h) * 0.85, S.alt + 0.35, player.z - Math.cos(player.h) * 0.85); // tipped over at the feet: shift back so the middle of you is over the spot
  const h = Math.max(0, Math.round(S.alt - (R ? Math.max(R.top, floor) : floor)));
  skyHud(`${S.open ? '🪂' : '⬇'} ${h} m · ${Math.round(-S.vy * 3.6)} km/h${S.open ? '' : h < 60 ? ' · SPACE — PARACHUTE NOW!' : ' · Space: parachute'}`);
}
function skyLand(where, R) {
  const S = SKY, P = player.model, v = -S.vy, safe = S.open && S.chute > 0.6;
  if (SKY.mesh) SKY.mesh.visible = false; skyHud(null);
  player.state = 'foot'; player.mode = 'foot'; player.y = 0; player.vy = 0; player.kx = player.kz = 0;
  P.root.rotation.set(0, player.h, 0, 'XYZ'); animatePerson(P, 0, 0);
  S.last = { x: player.x, z: player.z, where, ok: true, fell: Math.round(S.top - S.alt), chute: S.open, t: elapsed };
  if (where === 'roof') {
    const B = bigBuildingsNear(player.x, player.z, 2).find((q) => inRing(player.x, player.z, q.f));
    const at = [player.x, player.z];
    if (B && v < 16) { // up on a tower or a centre: that roof, with its lift down
      const f = B.f, n = f.length / 2; let E = null, bd = 1e9;
      for (let q = 0; q < n; q++) {
        const ax = f[2 * q], az = f[2 * q + 1], bx = f[(2 * q + 2) % (2 * n)], bz = f[(2 * q + 3) % (2 * n)], ex = bx - ax, ez = bz - az, L = Math.hypot(ex, ez); if (L < 3) continue;
        const t = clamp(((at[0] - ax) * ex + (at[1] - az) * ez) / (L * L), 0.1, 0.9), px = ax + ex * t, pz = az + ez * t, d = Math.hypot(at[0] - px, at[1] - pz);
        let nx = ez / L, nz = -ex / L; if (inRing(px + nx * 0.5, pz + nz * 0.5, f)) { nx = -nx; nz = -nz; }
        if (d < bd) { bd = d; E = { B, q, px, pz, nx, nz, ex: ex / L, ez: ez / L, d }; }
      }
      if (E) {
        enterTower(E); rideLift(TOWER.floors + 1);
        if (inRing(at[0], at[1], TOWER.f)) { player.x = at[0]; player.z = at[1]; }
        toast(`Landed on the roof of ${TOWER.name} · the lift goes back down (E)`); sfxNoise(0.2, 400, 0.2);
        return conJumpLanded(S.last);
      }
    }
    // a house or a small building: you slide off the roof to the ground beside it
    const s = freeSpotNear(player.x, player.z, 40); if (s) { player.x = s[0]; player.z = s[1]; }
    if (v >= 16 && !safe) { S.last.ok = false; damagePlayer(200); toast('You hit the roof far too fast'); shake = 1.2; return conJumpLanded(S.last); }
    toast('You bounced off a roof and slid down to the ground'); damagePlayer(10); return conJumpLanded(S.last);
  }
  if (where === 'water') {
    for (let i = 0; i < 24; i++) emit(player.x + rr(-1, 1), WATER_Y + 0.2, player.z + rr(-1, 1), rr(-2, 2), rr(3, 8), rr(-2, 2), 1.1, 0.4, 1.4, '#ffffff', 0.8);
    sfxNoise(0.6, 900, 0.35);
    if (v > 40) { S.last.ok = false; damagePlayer(200); toast('You hit the water far too fast'); }
    else toast(safe ? 'Splashdown! Swim for the shore' : 'SPLASH! You dropped into the water');
    return conJumpLanded(S.last);
  }
  if (safe && v < 9) { toast('Nice landing! 🪂'); sfxTone([523, 784], 0.2, 0.05, 'triangle'); }
  else if (v < 9) toast('Landed');
  else if (v < 16) { damagePlayer(Math.round((v - 9) * 12)); knockPlayer(S.vx * 0.3, S.vz * 0.3); shake = 0.6; toast('Ouch — hard landing. Open the parachute sooner!'); }
  else { S.last.ok = false; shake = 1.4; sfxNoise(0.5, 160, 0.6); damagePlayer(200); toast('You hit the ground without opening your parachute'); }
  conJumpLanded(S.last);
}
function updateSkydive(dt) {
  if (player.state !== 'sky' && SKY.hud && !SKY.hud.hidden) skyHud(null);
  SKY.hintT -= dt;
  if (SKY.hintT <= 0 && roofEdge()) { toast('SPACE: jump off the edge — then SPACE again to open your parachute'); SKY.hintT = 8; }
}
