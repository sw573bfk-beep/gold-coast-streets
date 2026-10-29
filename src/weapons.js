// ============================================================================
// Gold Coast Streets — weapons: aiming, shooting, cops shooting back, hold-ups
// Cartoon style: people get knocked down, no blood.
// ============================================================================
const WEAPONS = {
  fist: { name: 'Fists' },
  pistol: { name: 'Pistol', dmg: 1, rate: 0.3, spread: 0.01, range: 80, sound: [0.14, 2600, 0.32] },
  smg: { name: 'SMG', dmg: 1, rate: 0.085, spread: 0.032, range: 65, auto: true, sound: [0.07, 3000, 0.22] },
  shotgun: { name: 'Shotgun', dmg: 1, rate: 0.85, spread: 0.085, range: 32, pellets: 8, sound: [0.3, 900, 0.5] },
};
const WEAPON_ORDER = ['fist', 'pistol', 'smg', 'shotgun'];
let fireCool = 0, aiming = false;

// tracers (short-lived lines from the muzzle to whatever got hit)
const tracerGeo = new THREE.BufferGeometry();
tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 6), 3));
const tracerMesh = new THREE.LineSegments(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, toneMapped: false }));
tracerMesh.frustumCulled = false; scene.add(tracerMesh);
const tracerLife = new Float32Array(40); let tracerIdx = 0;
function addTracer(a, b) {
  const i = (tracerIdx = (tracerIdx + 1) % 40), arr = tracerGeo.attributes.position.array;
  arr.set([a[0], a[1], a[2], b[0], b[1], b[2]], i * 6); tracerLife[i] = 0.07;
  tracerGeo.attributes.position.needsUpdate = true;
}
function updateTracers(dt) {
  const arr = tracerGeo.attributes.position.array; let dirty = false;
  for (let i = 0; i < 40; i++) if (tracerLife[i] > 0) { tracerLife[i] -= dt; if (tracerLife[i] <= 0) { arr.fill(0, i * 6, i * 6 + 6); dirty = true; } }
  if (dirty) tracerGeo.attributes.position.needsUpdate = true;
}

// a gun in the player's right hand (it hangs down the arm, so it points forward when the arm is raised)
let gunMesh = null;
function attachGun() {
  if (gunMesh && gunMesh.parent) gunMesh.parent.remove(gunMesh);
  const w = player.weapon;
  if (w === 'fist' || !player.model) { gunMesh = null; return; }
  const len = w === 'pistol' ? 0.26 : w === 'smg' ? 0.42 : 0.7;
  gunMesh = new THREE.Mesh(mergeGeos([box(0.06, len, 0.1, 0, -0.66 - len / 2, 0.05, '#1b1b1b'), box(0.05, 0.08, 0.14, 0, -0.7, -0.03, '#2b2b2b')]), personMat);
  player.model.armR.add(gunMesh);
}
function selectWeapon(w) {
  if (w !== 'fist' && player.weapons[w] === undefined) return;
  player.weapon = w; attachGun(); toast(WEAPONS[w].name);
}
function cycleWeapon(dir) {
  const owned = WEAPON_ORDER.filter((w) => w === 'fist' || player.weapons[w] !== undefined);
  const i = owned.indexOf(player.weapon);
  selectWeapon(owned[(i + dir + owned.length) % owned.length]);
}

// ---------------------------------------------------------------- hit testing
// returns { t, kind: 'ped'|'car'|'player'|'wall'|'ground', obj }
function castShot(o, d, maxD, shooterPed) {
  let best = maxD, hit = { t: maxD, kind: 'none' };
  const ex = o[0] + d[0] * maxD, ez = o[2] + d[2] * maxD;
  const fw = rayWalls(o[0], o[2], ex, ez, 2.5);
  if (fw < 1 && fw * maxD < best) { best = fw * maxD; hit = { t: best, kind: 'wall' }; }
  if (d[1] < -1e-4) { const tg = -o[1] / d[1]; if (tg < best) { best = tg; hit = { t: tg, kind: 'ground' }; } }
  const hd2 = d[0] * d[0] + d[2] * d[2] || 1e-6;
  const body = (x, z, top, r, kind, obj) => {
    const t = ((x - o[0]) * d[0] + (z - o[2]) * d[2]) / hd2;
    if (t < 0.3 || t > best) return;
    const hx = o[0] + d[0] * t - x, hz = o[2] + d[2] * t - z, y = o[1] + d[1] * t;
    if (hx * hx + hz * hz < r * r && y > 0 && y < top) { best = t; hit = { t, kind, obj }; }
  };
  for (const p of peds) {
    if (p === shooterPed || Math.abs(p.x - o[0]) > maxD || Math.abs(p.z - o[2]) > maxD) continue;
    body(p.x, p.z, p.state === 'down' ? 0.45 : 1.9, p.state === 'down' ? 0.7 : 0.42, 'ped', p);
  }
  for (const sh of SHOPS) if (sh.keeper) body(sh.kx, sh.kz, 1.9, 0.42, 'keeper', sh);
  if (shooterPed && player.deadT === 0) body(player.x, player.z, player.state === 'car' ? 1.5 : 1.9, player.state === 'car' ? 1.0 : 0.42, 'player', null);
  for (const c of cars) {
    if (c === player.car && !shooterPed) continue;
    if (Math.abs(c.x - o[0]) > maxD + 4 || Math.abs(c.z - o[2]) > maxD + 4) continue;
    const s = Math.sin(c.h), co = Math.cos(c.h), rx = o[0] - c.x, rz = o[2] - c.z;
    const lx = rx * co - rz * s, lz = rx * s + rz * co, ly = o[1] - c.y;
    const dx = d[0] * co - d[2] * s, dz = d[0] * s + d[2] * co, dy = d[1];
    let t0 = 0, t1 = best;
    for (const [p0, dd, lo, hi] of [[lx, dx, -c.spec.W / 2, c.spec.W / 2], [ly, dy, 0.15, c.spec.roof + 0.05], [lz, dz, -c.spec.L / 2, c.spec.L / 2]]) {
      if (Math.abs(dd) < 1e-6) { if (p0 < lo || p0 > hi) { t0 = 1e9; break; } continue; }
      let a = (lo - p0) / dd, b = (hi - p0) / dd; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 > 0.3 && t0 < best) { best = t0; hit = { t: t0, kind: 'car', obj: c }; }
  }
  return hit;
}

// ---------------------------------------------------------------- the player shooting
function muzzlePoint() {
  const fx = Math.sin(player.h), fz = Math.cos(player.h), rx = -Math.cos(player.h), rz = Math.sin(player.h);
  return [player.x + fx * 0.75 + rx * 0.22, player.y + 1.42, player.z + fz * 0.75 + rz * 0.22];
}
function aimDirection() {
  if (aiming) { const v = new THREE.Vector3(); camera.getWorldDirection(v); return { o: [camera.position.x, camera.position.y, camera.position.z], d: [v.x, v.y, v.z] }; }
  // hip fire: snap to the closest person in front
  const fx = Math.sin(player.h), fz = Math.cos(player.h), o = [player.x, player.y + 1.4, player.z];
  let best = null, bs = 0.82;
  for (const p of peds) {
    if (p.state === 'down') continue;
    const dx = p.x - o[0], dz = p.z - o[2], d = Math.hypot(dx, dz); if (d > 30 || d < 0.5) continue;
    const dot = (dx * fx + dz * fz) / d; if (dot > bs) { bs = dot; best = p; }
  }
  if (best) { const dx = best.x - o[0], dy = 1.2 - o[1], dz = best.z - o[2], l = Math.hypot(dx, dy, dz); return { o, d: [dx / l, dy / l, dz / l] }; }
  return { o, d: [fx, -0.02, fz] };
}
function shoot() {
  const W = WEAPONS[player.weapon];
  if (!W || player.weapon === 'fist') return;
  if ((player.weapons[player.weapon] || 0) <= 0) { if (fireCool <= 0) { sfxTone([180], 0.05, 0.05); fireCool = 0.3; toast('Out of ammo — find a dealer'); } return; }
  player.weapons[player.weapon]--;
  fireCool = W.rate;
  const { o, d } = aimDirection(), mz = muzzlePoint();
  for (let k = 0; k < (W.pellets || 1); k++) {
    const dd = [d[0] + rr(-1, 1) * W.spread, d[1] + rr(-1, 1) * W.spread, d[2] + rr(-1, 1) * W.spread], l = Math.hypot(...dd);
    dd[0] /= l; dd[1] /= l; dd[2] /= l;
    const hit = castShot(o, dd, W.range, null), hp = [o[0] + dd[0] * hit.t, o[1] + dd[1] * hit.t, o[2] + dd[2] * hit.t];
    addTracer(mz, hp);
    applyHit(hit, hp, dd, W.dmg, true);
  }
  emit(mz[0], mz[1], mz[2], 0, 0, 0, 0.05, 0.25, 0.5, '#ffd36a', 1);
  sfxNoise(...W.sound);
  shake = Math.min(1, shake + (player.weapon === 'shotgun' ? 0.25 : 0.05));
  scareNear(player.x, player.z, 45);
  if (peds.some((p) => !p.cop && Math.hypot(p.x - player.x, p.z - player.z) < 30)) addCrime(1, 'shots');
}
function applyHit(hit, hp, d, dmg, byPlayer) {
  if (hit.kind === 'ped') {
    const p = hit.obj;
    p.hp -= dmg;
    if (p.hp <= 0) p.knock(d[0] * 3.5, 1.4, d[2] * 3.5, true);
    else { p.state = 'stagger'; p.t = 0.4; p.vx = d[0] * 2; p.vz = d[2] * 2; }
    for (let i = 0; i < 4; i++) emit(hp[0], hp[1], hp[2], rr(-1, 1), rr(0, 2), rr(-1, 1), 0.25, 0.15, 0.05, '#f2e0c8', 1);
    if (byPlayer) addCrime(p.cop ? 2 : 1, p.cop ? 'shootCop' : 'shootPed', p.cop);
  } else if (hit.kind === 'keeper') {
    if (byPlayer) { hit.obj.robbedAt = elapsed; addCrime(1, 'shootPed'); }
  } else if (hit.kind === 'car') {
    const c = hit.obj; c.health -= dmg * 7;
    for (let i = 0; i < 5; i++) emit(hp[0], hp[1], hp[2], rr(-2, 2), rr(0.5, 3), rr(-2, 2), 0.3, 0.12, 0.04, '#ffd27a', 1);
    if (byPlayer && c.kind === 'police') addCrime(1, 'shootCop', true);
    if (c.ai && c.kind === 'traffic') { c.ai.shock = 0; c.ai.mul = 1.6; } // drivers floor it away from gunfire
  } else if (hit.kind === 'player') {
    damagePlayer(6); shake = Math.min(1, shake + 0.2);
  } else if (hit.kind === 'wall' || hit.kind === 'ground') {
    for (let i = 0; i < 3; i++) emit(hp[0], hp[1] + 0.05, hp[2], rr(-1, 1), rr(0.5, 2), rr(-1, 1), 0.35, 0.2, 0.5, '#bdb6a8', 0.8);
  }
}

// ---------------------------------------------------------------- cops shoot back at 3 stars and up
function copShoots(cop, dt) {
  cop.gunCool = (cop.gunCool || rr(0.4, 1.2)) - dt;
  if (cop.gunCool > 0) return;
  cop.gunCool = rr(0.7, 1.2);
  const o = [cop.x + Math.sin(cop.h) * 0.6, 1.42, cop.z + Math.cos(cop.h) * 0.6];
  const tx = player.x, ty = player.state === 'car' ? 1.0 : player.y + 1.2, tz = player.z;
  let dx = tx - o[0], dy = ty - o[1], dz = tz - o[2]; const dist = Math.hypot(dx, dy, dz);
  const miss = clamp(0.06 + player.speed * 0.012 + dist * 0.004, 0.05, 0.3);
  dx = dx / dist + rr(-1, 1) * miss; dy = dy / dist + rr(-1, 1) * miss * 0.5; dz = dz / dist + rr(-1, 1) * miss;
  const l = Math.hypot(dx, dy, dz), d = [dx / l, dy / l, dz / l];
  const hit = castShot(o, d, 60, cop), hp = [o[0] + d[0] * hit.t, o[1] + d[1] * hit.t, o[2] + d[2] * hit.t];
  addTracer(o, hp);
  emit(o[0], o[1], o[2], 0, 0, 0, 0.05, 0.2, 0.4, '#ffd36a', 1);
  sfxNoise(0.12, 2400, 0.25 * clamp(1 - dist / 80, 0.1, 1));
  if (hit.kind === 'player') { if (player.state === 'car' && player.car) player.car.health -= 4; else damagePlayer(7); }
  else applyHit(hit, hp, d, 1, false);
  cop.m.armR.rotation.x = -Math.PI / 2;
}

// ---------------------------------------------------------------- hold-ups (point a gun at a shopkeeper or bank teller)
let robbing = null, robLost = 0;
function updateRobbery(dt) {
  const el = $('rob');
  let target = null;
  if (aiming && player.weapon !== 'fist' && player.state === 'foot') {
    const v = new THREE.Vector3(); camera.getWorldDirection(v);
    for (const sh of SHOPS) {
      if (!sh.keeper || elapsed - sh.robbedAt < 300) continue;
      const dx = sh.kx - player.x, dz = sh.kz - player.z, d = Math.hypot(dx, dz);
      if (d > 9) continue;
      const dot = (dx * v.x + dz * v.z) / (d * Math.hypot(v.x, v.z) || 1);
      if (dot > 0.93) { target = sh; break; }
    }
  }
  if (target) {
    if (robbing !== target) { robbing = target; target.robT = 0; addCrime(1, 'rob'); scareNear(target.kx, target.kz, 20); }
    robLost = 0;
    const need = target.kind === 'bank' ? 10 : 4.5;
    target.robT += dt;
    el.hidden = false;
    $('rob-text').textContent = target.kind === 'bank' ? `ROBBING ${target.name.toUpperCase()} — keep your aim on the teller` : `HOLD-UP AT ${target.name.toUpperCase()}`;
    $('rob-bar').style.width = Math.round(Math.min(1, target.robT / need) * 100) + '%';
    if (target.robT >= need) {
      const cash = target.kind === 'bank' ? Math.round(rr(25, 60)) * 100 : Math.round(rr(15, 45)) * 10;
      player.money += cash; target.robbedAt = elapsed; target.robT = 0; robbing = null; el.hidden = true;
      addCrime(target.kind === 'bank' ? 4 : 2, 'robDone', true); player.stars = Math.max(player.stars, target.kind === 'bank' ? 4 : 2);
      toast(`${target.kind === 'bank' ? 'Bank job done' : 'Cash register emptied'} · +$${cash} — get out of there!`); sfxTone([523, 659, 784], 0.4, 0.08, 'triangle');
      saveGame();
    }
  } else if (robbing) {
    robLost += dt;
    if (robLost > 1.2) {
      robbing.robT = 0; robbing.robbedAt = elapsed - 280; robbing = null; el.hidden = true;
      addCrime(1, 'alarm', true); toast('The alarm went off!');
    }
  } else el.hidden = true;
}

function updateWeapons(dt) {
  fireCool -= dt;
  updateTracers(dt);
  aiming = mouse.aim && player.state === 'foot' && player.weapon !== 'fist' && player.deadT === 0 && !uiOpen;
  $('cross').hidden = !aiming;
  if (mouse.fire && player.state === 'foot' && player.deadT === 0 && player.weapon !== 'fist' && fireCool <= 0 && (WEAPONS[player.weapon].auto || !mouse.fired)) { shoot(); mouse.fired = true; }
  const w = player.weapon;
  $('weapon').textContent = w === 'fist' ? 'FISTS' : `${WEAPONS[w].name.toUpperCase()}  ${player.weapons[w] || 0}`;
  if (gunMesh) gunMesh.visible = player.state === 'foot' || player.state === 'getup';
  for (const p of peds) if (p.cop && player.stars >= 3 && p.state === 'chase' && p.copCanShoot) copShoots(p, dt);
  updateRobbery(dt);
  // illusion specs from Ripley's
  if (player.effects.specs > 0) {
    player.effects.specs -= dt;
    renderer.domElement.style.filter = player.effects.specs > 0 ? `hue-rotate(${(elapsed * 120) % 360}deg) saturate(1.8) contrast(1.1)` : '';
  }
  if (player.effects.energy > 0) player.effects.energy -= dt;
}
