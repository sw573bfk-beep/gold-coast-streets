// ============================================================================
// Gold Coast Streets — stunts. Kicker ramps on the open ground at The Spit (the stunt park) and a few on the sand up
// and down the beaches: hit them fast and fly. Air time and spins score points (shown as you land). On a motorbike or
// e-bike, hold Shift at speed to pull a wheelie. The stunt park session (Activities) is 90 seconds for a high score.
// ============================================================================
// ramps: [x, z, heading, length, height] — the deck rises from nothing to its height over its length, then drops away
function rampAt(x, z) { // how much ramp is under a point (added to the ground by groundAt)
  for (const R of RAMPS) {
    const dx = x - R.x, dz = z - R.z; if (dx * dx + dz * dz > R.r2) continue;
    const along = dx * R.fx + dz * R.fz, across = dx * R.fz - dz * R.fx;
    if (along > -R.L / 2 && along < R.L / 2 && Math.abs(across) < R.W / 2) return R.H * (along + R.L / 2) / R.L;
  }
  return 0;
}
function addRamp(x, z, h, L, H, W = 4) {
  const R = { x, z, fx: Math.sin(h), fz: Math.cos(h), L, H, W, r2: (L * L + W * W) / 4 + 1 };
  const g = new THREE.BufferGeometry(), l = L / 2, w = W / 2; // a wedge: sloping deck, sides and the back wall
  const P = [[-w, 0, -l], [w, 0, -l], [w, H, l], [-w, H, l], [-w, 0, l], [w, 0, l]];
  const tri = [0, 2, 1, 0, 3, 2, 3, 4, 5, 3, 5, 2, 0, 4, 3, 1, 2, 5];
  g.setAttribute('position', new THREE.Float32BufferAttribute(tri.flatMap((k) => P[k]), 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, RAMP_MAT); m.position.set(x, groundAt(x, z), z); m.rotation.y = h; m.castShadow = true; m.receiveShadow = true; scene.add(m); R.m = m;
  RAMPS.push(R); return R;
}
const RAMP_MAT = new THREE.MeshStandardMaterial({ color: col('#d9b84a'), roughness: 0.7, side: THREE.DoubleSide });
let rampsBuilt = false;
function buildRamps() { // the stunt park at The Spit, and kickers on the sand
  if (rampsBuilt || !REGION) return; rampsBuilt = true;
  const P = venue('The Spit stunt park', /^The Spit Beach/i, 583, -5040), S = sidewalkNear(P.x - 120, P.z), cx = S.x, cz = S.z;
  for (const [ox, oz, h, L, H] of [[0, 0, 0, 7, 1.6], [0, 40, 0, 9, 2.4], [25, 20, Math.PI / 2, 8, 1.8], [-25, 20, -Math.PI / 2, 8, 1.8], [0, 80, Math.PI, 10, 3.2], [40, 60, 0.7, 6, 1.2]]) addRamp(cx + ox, cz + oz, h, L, H);
  for (const B of BEACHES) { const Sh = nearestShore(B[1], B[2]); if (!Sh) continue; const x = Sh.px - Sh.nx * 25, z = Sh.pz - Sh.nz * 25; addRamp(x, z, Math.atan2(Sh.tx, Sh.tz), 7, 1.5); }
  STUNT.park = { x: cx, z: cz + 40 };
}
// scoring: air time and spins, a wheelie meter on bikes
const STUNT = { air: 0, spin: 0, lastH: 0, wheelie: 0, total: 0, park: null, combo: 0 };
function updateStunts(dt) {
  if (!rampsBuilt && REGION && TILES.size) buildRamps();
  const c = player.state === 'car' && player.car; if (!c) { STUNT.air = 0; STUNT.wheelie = 0; return; }
  const up = c.air > 0.05 && c.speed > 4; // airborne (the car's own crest/jump physics)
  if (up) { if (!STUNT.air) STUNT.lastH = c.h; STUNT.air += dt; STUNT.spin += Math.abs(angDiff(c.h, STUNT.lastH)); STUNT.lastH = c.h; }
  else if (STUNT.air > 0.45) {
    const spins = Math.floor(STUNT.spin / Math.PI), pts = Math.round(STUNT.air * 120 + spins * 150) * (STUNT.combo + 1);
    STUNT.total += pts; STUNT.combo = Math.min(4, STUNT.combo + 1); stat('stuntPts', pts);
    toast(`🤸 ${STUNT.air.toFixed(1)} s air${spins ? ` · ${spins * 180}° spin` : ''} · +${pts}${STUNT.combo > 1 ? ` (×${STUNT.combo})` : ''}`); sfxTone([523, 784], 0.12, 0.05);
    STUNT.air = 0; STUNT.spin = 0;
  } else { if (STUNT.air) STUNT.combo = Math.max(0, STUNT.combo - 1); STUNT.air = 0; STUNT.spin = 0; }
  // wheelies: Shift on a bike at speed lifts the front
  const M = c.model, wheelie = M && M.bike && (keys.ShiftLeft || keys.ShiftRight) && c.speed > 4 && !up;
  STUNT.wheelie = wheelie ? STUNT.wheelie + dt : (STUNT.wheelie > 1 ? (STUNT.total += Math.round(STUNT.wheelie * 60), toast(`🏍️ ${STUNT.wheelie.toFixed(1)} s wheelie · +${Math.round(STUNT.wheelie * 60)}`), stat('stuntPts', Math.round(STUNT.wheelie * 60)), 0) : 0);
  if (M && M.bike) M.bodyG.rotation.x = lerp(M.bodyG.rotation.x, wheelie ? -0.45 : 0, Math.min(1, dt * 6));
}
