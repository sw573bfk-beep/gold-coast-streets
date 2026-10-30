// ============================================================================
// Gold Coast Streets — the police step it up at three stars and above:
// roadblocks (two cruisers across the road ahead of you, officers out), spike strips laid in front of them
// (they shred your tyres: you limp along at half speed), and the POLAIR helicopter overhead, which keeps you in
// sight unless you get under cover (indoors, in a car park, under a building) — with a spotlight at night.
// ============================================================================
const ROADBLOCKS = [], SPIKES = [];
let roadblockT = 12, HELI = null;
const SPIKE_GEO = (() => {
  const parts = [box(1, 0.04, 0.5, 0, 0.02, 0, '#2b2b2b')];
  for (let k = -0.45; k <= 0.45; k += 0.1) parts.push(box(0.03, 0.08, 0.03, k, 0.08, -0.12, '#c9ced2'), box(0.03, 0.08, 0.03, k + 0.05, 0.08, 0.12, '#c9ced2'));
  return mergeGeos(parts);
})();
const SPIKE_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 });

// a roadblock 160-240 m along the road ahead of you
function placeRoadblock() {
  const c = player.car, sp = c.speed; if (sp < 8) return false;
  const ux = c.vx / sp, uz = c.vz / sp;
  for (const ahead of [200, 240, 160]) {
    const ne = nearestEdge(c.x + ux * ahead, c.z + uz * ahead); if (ne.e < 0 || !EDGES[ne.e]) continue;
    const E = EDGES[ne.e]; if (E.len < 30) continue;
    edgePoint(E, 1, clamp(ne.s, 12, E.len - 12), tmpA);
    const x = tmpA.x, z = tmpA.z; let tx = tmpA.tx, tz = tmpA.tz;
    if (tx * ux + tz * uz < 0) { tx = -tx; tz = -tz; } // the way you're coming
    if (Math.hypot(x - c.x, z - c.z) < 120) continue;
    const across = Math.atan2(tz, -tx), w = E.width, rb = { x, z, cars: [], cops: [], t: 0 };
    for (const side of [-1, 1]) { // two cruisers nose to nose across the lanes
      const px = x + tz * side * w * 0.28, pz = z - tx * side * w * 0.28;
      if (resolveCircle(px, pz, 1.2)) continue;
      const pc = new Car('police', null, px, pz, across + (side > 0 ? 0 : Math.PI)); pc.kind = 'roadblock'; pc.siren = true; pc.setDriver(null); cars.push(pc); rb.cars.push(pc);
      const ox = px + tx * 3, oz = pz + tz * 3; const cop = new Ped(ox, oz, 0, 1, 0, 1, COP_LOOK); cop.cop = true; cop.state = 'chase'; cop.hp = 3; peds.push(cop); rb.cops.push(cop);
    }
    if (!rb.cars.length) continue;
    // the stinger across the road in front of them
    const sx = x - tx * 22, sz = z - tz * 22, m = new THREE.Mesh(SPIKE_GEO, SPIKE_MAT);
    m.position.set(sx, groundAt(sx, sz) + 0.01, sz); m.rotation.y = Math.atan2(tx, tz) + Math.PI / 2; m.scale.x = w; scene.add(m);
    SPIKES.push({ x: sx, z: sz, tx, tz, w, m, t: 0 });
    ROADBLOCKS.push(rb); toast('Roadblock ahead!'); sfxTone([660, 520, 660], 0.4, 0.05, 'square');
    return true;
  }
  return false;
}
function updateRoadblocks(dt) {
  roadblockT -= dt;
  if (player.stars >= 3 && player.state === 'car' && player.car && roadblockT <= 0 && ROADBLOCKS.length < 2) roadblockT = placeRoadblock() ? 28 : 4;
  for (const rb of ROADBLOCKS.slice()) {
    rb.t += dt;
    if (player.stars === 0 || rb.t > 120 || Math.hypot(rb.x - player.x, rb.z - player.z) > 420) {
      for (const c of rb.cars) if (cars.includes(c) && c !== player.car) c.remove();
      ROADBLOCKS.splice(ROADBLOCKS.indexOf(rb), 1);
    }
  }
  for (const S of SPIKES.slice()) {
    S.t += dt;
    if (player.stars === 0 || S.t > 120 || Math.hypot(S.x - player.x, S.z - player.z) > 420) { scene.remove(S.m); SPIKES.splice(SPIKES.indexOf(S), 1); continue; }
    for (const c of cars) { // any car crossing the stinger loses its tyres
      if (c.flat || c.speed < 2) continue;
      const along = (c.x - S.x) * S.tx + (c.z - S.z) * S.tz, across = (c.x - S.x) * -S.tz + (c.z - S.z) * S.tx;
      if (Math.abs(along) < 1.2 && Math.abs(across) < S.w / 2) { c.flat = true; if (c === player.car) { toast('Spikes! Your tyres are shredded'); shake = Math.min(1, shake + 0.5); sfxNoise(0.6, 2200, 0.5); } }
    }
  }
}
// flat tyres: a top speed of about 55 km/h and a wobble; a mechanic (phone) fixes them
function flatTyres(c, dt) {
  if (!c.flat) return;
  const sp = c.speed; if (sp > 15) { const k = 15 / sp; c.vx *= k; c.vz *= k; }
  if (sp > 3) { c.h += Math.sin(elapsed * 9 + c.x) * 0.25 * dt; if (rand() < dt * 20) emit(c.x + rr(-1, 1), 0.2, c.z + rr(-1, 1), rr(-1, 1), 1.5, rr(-1, 1), 0.25, 0.1, 0.05, '#ffcf5a', 1); }
}

// ---------------------------------------------------------------- POLAIR
function makeHeli() {
  const g = new THREE.Group(), body = new THREE.MeshStandardMaterial({ color: col('#1f3f8f'), roughness: 0.4, metalness: 0.3 }), white = new THREE.MeshStandardMaterial({ color: col('#f2f2f2'), roughness: 0.4 }), dark = new THREE.MeshStandardMaterial({ color: col('#1d1d1d') });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(1.8, 1.7, 4.2), body, 0, 0, 0.4); add(new THREE.BoxGeometry(1.82, 0.5, 4.22), white, 0, -0.3, 0.4);
  add(new THREE.BoxGeometry(1.5, 1.0, 1.0), new THREE.MeshStandardMaterial({ color: col('#9fc3d6'), roughness: 0.1, metalness: 0.5 }), 0, 0.2, 2.4);
  add(new THREE.BoxGeometry(0.35, 0.4, 5), body, 0, 0.3, -3.6); add(new THREE.BoxGeometry(0.1, 1.2, 0.8), body, 0, 0.8, -6);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.12, 0.12, 3.4), dark, s * 1.0, -1.2, 0.4);
  const rotor = add(new THREE.BoxGeometry(10, 0.06, 0.35), dark, 0, 1.05, 0.3), rotor2 = add(new THREE.BoxGeometry(0.35, 0.06, 10), dark, 0, 1.05, 0.3);
  const tail = add(new THREE.BoxGeometry(0.06, 1.6, 0.2), dark, 0.25, 0.6, -6);
  const light = new THREE.SpotLight(0xf4f6ff, 0, 120, 0.22, 0.4, 1.2); light.position.set(0, -1, 1.5); g.add(light); g.add(light.target);
  const cone = add(new THREE.ConeGeometry(4.5, 45, 20, 1, true).translate(0, -22.5, 0), new THREE.MeshBasicMaterial({ color: col('#e8f0ff'), transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), 0, -1, 1.5);
  cone.castShadow = false;
  scene.add(g);
  return { g, rotor, rotor2, tail, light, cone, x: player.x + 300, z: player.z + 300, y: 80, h: 0, leaving: false };
}
function heliSees() {
  if (!HELI || HELI.leaving) return false;
  if (indoorAt(player.x, player.z) || shopAt(player.x, player.z) || insideSolid(player.x, player.z, solidBuildingsNear(player.x, player.z, 2))) return false;
  return Math.hypot(HELI.x - player.x, HELI.z - player.z) < 140;
}
function updateHeli(dt) {
  if (player.stars >= 3 && !HELI) { HELI = makeHeli(); toast('POLAIR is overhead — get under cover to shake it'); }
  if (!HELI) return;
  const H = HELI;
  if (player.stars < 3) H.leaving = true;
  // circle above you, a little behind; fly off and vanish when the chase is over
  const orbit = elapsed * 0.25, tx = H.leaving ? H.x + 60 : player.x + Math.cos(orbit) * 30, tz = H.leaving ? H.z + 60 : player.z + Math.sin(orbit) * 30;
  const ty = (H.leaving ? 140 : 45) + groundAt(player.x, player.z);
  const k = Math.min(1, dt * (H.leaving ? 0.4 : 0.8)); H.x += (tx - H.x) * k; H.z += (tz - H.z) * k; H.y += (ty - H.y) * Math.min(1, dt * 0.6);
  H.h += angDiff(H.h, Math.atan2(player.x - H.x, player.z - H.z)) * Math.min(1, dt * 1.5);
  H.g.position.set(H.x, H.y, H.z); H.g.rotation.set(0.08, H.h, Math.sin(elapsed * 0.7) * 0.05);
  H.rotor.rotation.y += dt * 40; H.rotor2.rotation.y += dt * 40; H.tail.rotation.x += dt * 50;
  const night = nightLevel > 0.4 && !H.leaving;
  H.light.intensity = night ? 6 : 0; H.cone.visible = night;
  if (night) { H.light.target.position.set(0, -40, 0); H.light.target.updateMatrixWorld(); H.cone.lookAt(player.x, groundAt(player.x, player.z), player.z); H.cone.rotateX(-Math.PI / 2); }
  if (H.leaving && Math.hypot(H.x - player.x, H.z - player.z) > 350) { scene.remove(H.g); H.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); HELI = null; }
}
function updatePolice(dt) { updateRoadblocks(dt); updateHeli(dt); for (const c of cars) flatTyres(c, dt); }
