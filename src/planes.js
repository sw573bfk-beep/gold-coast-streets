// Gold Coast Streets — planes you can fly. Parked at the Gold Coast Airport (Coolangatta): walk up and press E.
// Arcade handling: W/S throttle (S brakes on the ground), A/D turn (steer on the ground, bank in the air),
// ↑/Space climb, ↓ dive, or the mouse for the nose. Let go and it levels out and holds its height.
// Lift needs speed: too slow and the nose drops (a stall). Come down gently with the wings level to land.
// Airliners also take off and land on their own.

const PLANE_TYPES = {
  cessna: { name: 'Cessna 172', len: 8.3, span: 11, fus: 1.4, gear: 1.1, maxV: 66, vr: 27, thrust: 7, color: '#f4f4f2', stripe: '#c62828', prop: true },
  jet: { name: 'Airliner', len: 37, span: 34, fus: 4.0, gear: 2.6, maxV: 250, vr: 78, thrust: 13, color: '#ffffff', stripe: '#1d4e89', prop: false },
};
const PLANES = [];
const PLANE_MATS = {};
function planeMat(c) { return PLANE_MATS[c] || (PLANE_MATS[c] = new THREE.MeshStandardMaterial({ color: col(c), roughness: 0.45, metalness: 0.2 })); }
function makePlaneModel(sp) {
  const g = new THREE.Group(), body = planeMat(sp.color), stripe = planeMat(sp.stripe), dark = planeMat('#2b3036'), geos = [];
  const box = (w, h, d, x, y, z, m) => { const geo = new THREE.BoxGeometry(w, h, d); geos.push(geo); const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; g.add(mesh); return mesh; };
  const L = sp.len, F = sp.fus;
  box(F, F, L * 0.82, 0, 0, 0, body);                                    // fuselage
  box(F * 0.8, F * 0.8, L * 0.12, 0, 0, L * 0.46, body);                 // nose
  box(F * 1.02, F * 0.25, L * 0.8, 0, -F * 0.05, 0, stripe);             // cheat line
  box(F * 0.9, F * 0.3, L * 0.08, 0, F * 0.28, L * 0.36, dark);          // cockpit windows
  box(sp.span, F * 0.12, L * 0.16, 0, sp.prop ? F * 0.5 : -F * 0.25, L * 0.02, body); // wings
  box(sp.span * 0.36, F * 0.1, L * 0.1, 0, F * 0.2, -L * 0.42, body);    // tailplane
  box(F * 0.12, F * 1.4, L * 0.12, 0, F * 1.0, -L * 0.42, stripe);       // fin
  if (sp.prop) { const p = box(F * 0.12, F * 1.3, 0.1, 0, 0, L * 0.53, dark); g.userData.prop = p; }
  else for (const s of [-1, 1]) box(F * 0.55, F * 0.55, L * 0.12, s * sp.span * 0.22, -F * 0.7, L * 0.08, dark); // engines
  for (const [x, z] of [[-F * 0.9, -L * 0.05], [F * 0.9, -L * 0.05], [0, L * 0.35]]) box(0.25, sp.gear, 0.25, x, -F * 0.5 - sp.gear / 2, z, dark); // landing gear
  g.userData.geos = geos; return g;
}
class Plane {
  constructor(type, x, z, h, ai) {
    this.type = type; this.sp = PLANE_TYPES[type]; this.model = makePlaneModel(this.sp); scene.add(this.model);
    this.x = x; this.z = z; this.h = h; this.y = groundAt(x, z) + this.sp.gear + this.sp.fus / 2;
    this.v = 0; this.pitch = 0; this.roll = 0; this.throttle = 0; this.ground = true; this.dead = false; this.ai = ai || null; this.input = { t: 0, p: 0, r: 0, brake: 0 };
    PLANES.push(this); this.sync();
  }
  get alt() { return this.y - groundAt(this.x, this.z) - this.sp.gear - this.sp.fus / 2; }
  step(dt) {
    if (this.dead) return;
    const sp = this.sp, inp = this.input, g = 9.81;
    this.throttle = clamp(this.throttle + inp.t * dt * 0.8, 0, 1);
    const drag = (sp.thrust / (sp.maxV * sp.maxV)) * this.v * this.v;
    this.v += (sp.thrust * this.throttle - drag - g * Math.sin(this.pitch) * (this.ground ? 0 : 1)) * dt;
    this.stall = !this.ground && this.v < sp.vr * 0.78;
    if (this.ground) {
      if (inp.brake) this.v = Math.max(0, this.v - 7 * dt);
      this.v = Math.max(0, this.v - 0.4 * dt);
      this.h += inp.r * Math.min(1, this.v / 8) * 0.55 * dt;                 // steer while taxiing: A left, D right
      this.roll = lerp(this.roll, 0, Math.min(1, dt * 4));
      const canRotate = this.v > sp.vr * 0.92;
      this.pitch = lerp(this.pitch, canRotate && inp.p > 0 ? 0.16 : 0, Math.min(1, dt * 2.5));
      if (this.v > sp.vr && this.pitch > 0.08) { this.ground = false; if (!this.ai) toast('Airborne! Let go to level out · A/D to turn'); }
    } else {
      // bank to turn, and level out by itself when you let go
      const rollT = this.stall ? 0 : inp.r * 0.7;
      this.roll += clamp(rollT - this.roll, -1.6 * dt, 1.6 * dt);
      this.h += (g * Math.tan(this.roll) / Math.max(20, this.v)) * dt;
      const glide = !inp.p && this.throttle < 0.4 ? -0.09 * (1 - this.throttle / 0.4) : 0; // power off, hands off: a gentle glide down to land
      const pitchT = this.stall ? -0.22 : inp.p ? inp.p * 0.38 : glide;
      this.pitch += clamp(pitchT - this.pitch, -0.9 * dt, 0.9 * dt);
      this.v = Math.max(0, this.v);
    }
    const fx = Math.sin(this.h) * Math.cos(this.pitch), fz = Math.cos(this.h) * Math.cos(this.pitch);
    const nx = this.x + fx * this.v * dt, nz = this.z + fz * this.v * dt;
    let vy = Math.sin(this.pitch) * this.v;
    if (!this.ground) { const lift = Math.min(1.2, (this.v / sp.vr) ** 2) * Math.cos(this.roll); vy -= g * (1 - Math.min(1, lift)) * 2.2; } // too slow: it sinks
    // landing help: close to the ground and coming down at a sensible rate, it flares and settles
    const alt0 = this.alt;
    if (!this.ground && alt0 < 8 && vy < 0 && vy > -10 && Math.abs(this.roll) < 0.5) vy = Math.max(vy, -2.2 - alt0 * 0.4);
    this.vy = vy;
    // flying into a building that's taller than you are high
    const altHere = this.y - groundAt(nx, nz);
    if (!this.ground && altHere < 260 && rayWalls(this.x, this.z, nx, nz, Math.max(2, altHere)) < 1) return this.crash('hit a building');
    this.x = nx; this.z = nz; this.y += vy * dt;
    const floor = groundAt(this.x, this.z) + sp.gear + sp.fus / 2;
    if (!this.ground && this.y <= floor) {
      if (!isLand(this.x, this.z)) return this.crash('ditched in the water');
      if (vy < -10 || Math.abs(this.roll) > 0.55 || this.pitch < -0.3) return this.crash('came down too hard');
      this.ground = true; this.y = floor; this.pitch = 0; if (!this.ai) toast('Touchdown! Hold S to brake');
    }
    if (this.ground) this.y = floor;
    this.x = clamp(this.x, WORLD.x0 - 3000, WORLD.x1 + 3000); this.z = clamp(this.z, WORLD.z0 - 3000, WORLD.z1 + 3000);
    if (this.model.userData.prop) this.model.userData.prop.rotation.z += this.throttle * 60 * dt;
    this.sync();
  }
  crash(why) {
    this.dead = true; this.v = 0; shake = 1.5; sfxNoise(1.2, 120, 0.9);
    for (let i = 0; i < 60; i++) emit(this.x + rr(-4, 4), this.y + rr(-1, 3), this.z + rr(-4, 4), rr(-3, 3), rr(1, 6), rr(-3, 3), 1.6, 1.2, 4, rand() < 0.5 ? '#ff7a1a' : '#333', 0.9);
    if (player.plane === this) { leavePlane(true); damagePlayer(100); toast(`Crashed — you ${why}`); }
    setTimeout(() => this.remove(), 8000);
  }
  sync() { this.model.position.set(this.x, this.y, this.z); this.model.rotation.set(-this.pitch, this.h, -this.roll, 'YXZ'); }
  remove() { scene.remove(this.model); for (const g of this.model.userData.geos) g.dispose(); const i = PLANES.indexOf(this); if (i >= 0) PLANES.splice(i, 1); if (player.plane === this) leavePlane(true); }
}

// ---------------------------------------------------------------- getting in and out
function nearestPlane(maxD) { let best = null, bd = maxD; for (const p of PLANES) { if (p.dead || p.ai || p.v > 3) continue; const d = Math.hypot(p.x - player.x, p.z - player.z) - p.sp.len * 0.3; if (d < bd) { bd = d; best = p; } } return best; }
function boardPlane(p) {
  player.plane = p; player.state = 'plane'; player.mode = 'car'; player.model.root.visible = false;
  addCrime(1, 'jack'); $('flighthud').hidden = false; toast(`${p.sp.name}: hold W for full power, then ↑ or Space past ${Math.round(p.sp.vr * 3.6)} km/h to lift off`);
}
function leavePlane(force) {
  const p = player.plane; if (!p) return;
  if (!force && (p.v > 2 || !p.ground)) { toast('Land and stop first'); return; }
  player.plane = null; player.state = 'foot'; player.mode = 'foot'; player.model.root.visible = true; $('flighthud').hidden = true;
  const s = sidewalkNear(p.x + Math.cos(p.h) * p.sp.span * 0.5, p.z - Math.sin(p.h) * p.sp.span * 0.5); player.x = s.x; player.z = s.z; player.y = 0;
}
function updatePlaneControls() {
  const p = player.plane, inp = p.input;
  inp.t = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  inp.brake = keys.KeyS && p.ground ? 1 : 0;
  inp.p = clamp((keys.ArrowUp || keys.Space ? 1 : 0) - (keys.ArrowDown ? 1 : 0) + PLANE_MOUSE.y, -1, 1); PLANE_MOUSE.y *= 0.9;
  inp.r = clamp((keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0) + PLANE_MOUSE.x, -1, 1); PLANE_MOUSE.x *= 0.9; // +1 turns left, like a car
  player.x = p.x; player.z = p.z; player.h = p.h; player.speed = p.v;
  // the flight panel: speed, height, climb, power and what to do next
  const kmh = Math.round(p.v * 3.6), vr = Math.round(p.sp.vr * 3.6), alt = Math.max(0, Math.round(p.alt));
  let tip;
  if (p.ground) tip = p.v < 1 && p.throttle < 0.05 ? 'Hold W for full power' : p.v < p.sp.vr * 0.92 ? `Building speed… lift off at ${vr} km/h` : 'Now! Hold ↑ or Space to lift off';
  else if (p.stall) tip = '⚠ STALL — too slow! W for power, let the nose drop';
  else if (alt < 40 && (p.vy || 0) < -4) tip = '⚠ Too low — pull up (↑)';
  else if (alt < 60) tip = 'To land: power down (S) and keep the wings level — it glides in · S brakes on the ground';
  else tip = 'A/D turn · ↑/Space climb · ↓ dive · let go to level out';
  $('fh-spd').textContent = kmh; $('fh-alt').textContent = alt; $('fh-vs').textContent = (p.vy > 0 ? '+' : '') + (p.vy || 0).toFixed(1);
  $('fh-thr').style.width = Math.round(p.throttle * 100) + '%'; $('fh-tip').textContent = tip; $('fh-tip').className = /⚠/.test(tip) ? 'warn' : '';
}
const PLANE_MOUSE = { x: 0, y: 0 };

// ---------------------------------------------------------------- the airport: parked planes and scheduled airliners
let AIRPORT = null, OVERVIEW_MESH = null;
function setupAirport() {
  AIRPORT = REGION && REGION.airport;
  if (!AIRPORT || !AIRPORT.runways.length) return;
  const [x1, z1, x2, z2] = AIRPORT.runways[0], h = Math.atan2(x2 - x1, z2 - z1), ex = Math.sin(h), ez = Math.cos(h), nx = ez, nz = -ex;
  AIRPORT.rw = { x1, z1, x2, z2, h, ex, ez, nx, nz, len: Math.hypot(x2 - x1, z2 - z1) };
  // parked planes beside the runway near its start: two Cessnas and an airliner
  AIRPORT.parked = [['cessna', 120, 70], ['cessna', 140, 70], ['jet', 260, 95]];
}
function updatePlanes(dt) {
  if (AIRPORT && AIRPORT.rw) {
    const R = AIRPORT.rw, near = Math.hypot((R.x1 + R.x2) / 2 - player.x, (R.z1 + R.z2) / 2 - player.z) < 2500;
    if (near && !AIRPORT.spawned) {
      AIRPORT.spawned = true;
      for (const [t, along, side] of AIRPORT.parked) { const x = R.x1 + R.ex * along + R.nx * side, z = R.z1 + R.ez * along + R.nz * side; new Plane(t, x, z, R.h + Math.PI / 2); }
      AIRPORT.nextAI = 20;
    }
    if (near) { // an airliner takes off every couple of minutes
      AIRPORT.nextAI -= dt;
      if (AIRPORT.nextAI <= 0 && !PLANES.some((p) => p.ai)) { AIRPORT.nextAI = 120; const p = new Plane('jet', R.x1 + R.ex * 40, R.z1 + R.ez * 40, R.h, { phase: 'roll' }); p.throttle = 1; }
    }
    if (!near && AIRPORT.spawned && !player.plane) { for (const p of PLANES.slice()) if (!p.ai || Math.hypot(p.x - player.x, p.z - player.z) > 3000) p.remove(); AIRPORT.spawned = false; }
  }
  for (const p of PLANES.slice()) {
    if (p.ai) { // the scripted airliner: full power, rotate, climb out and leave
      p.input.t = 1; p.input.r = 0; p.input.p = p.ground ? (p.v > p.sp.vr * 0.95 ? 1 : 0) : 0.5;
      if (p.alt > 900 || Math.hypot(p.x - player.x, p.z - player.z) > 6000) { p.remove(); continue; }
    }
    p.step(dt);
  }
  // from up high, show the whole map's low-detail ground and push the haze back
  const flying = player.plane && !player.plane.ground ? player.plane.alt : 0;
  if (flying > 60 && OVERVIEW && !OVERVIEW_MESH) {
    const tex = new THREE.CanvasTexture(OVERVIEW.canvas); tex.encoding = THREE.sRGBEncoding;
    const w = OVERVIEW.canvas.width / OV_PPM, hgt = OVERVIEW.canvas.height / OV_PPM, geo = new THREE.PlaneGeometry(w, hgt); geo.rotateX(-Math.PI / 2);
    OVERVIEW_MESH = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex })); OVERVIEW_MESH.position.set(OVERVIEW.x0 + w / 2, -0.3, OVERVIEW.z0 + hgt / 2); scene.add(OVERVIEW_MESH);
  }
  if (OVERVIEW_MESH) OVERVIEW_MESH.visible = flying > 60;
  scene.fog.near = lerp(scene.fog.near, flying > 60 ? 2500 : 480, 0.05); scene.fog.far = lerp(scene.fog.far, flying > 60 ? 9000 : 1350, 0.05);
}
