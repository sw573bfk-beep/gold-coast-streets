// ============================================================================
// Gold Coast Streets — helicopters you can fly. One waits on the pad at Sea World (where the joy flights go from),
// one on the Gold Coast University Hospital helipad and one at the airport: walk up and press E.
// Space climbs, Shift descends, W tips the nose down to fly forward (S back), A/D bank and turn, Q/E spin on the spot.
// Let go of everything and it settles into a hover. Land gently on anything flat; E to get out once you're down.
// ============================================================================
const CHOPPERS = [];
const HELI_PADS = [['Sea World Helicopters', /^Sea World$/i, 50, -4294, 60, 40], ['Gold Coast University Hospital helipad', /^Gold Coast University Hospital$/i, -2600, -2400, 0, 0], ['Gold Coast Airport', null, 11000, 20000, 0, 0]];
function makeChopper(colA, colB) {
  const g = new THREE.Group(), a = new THREE.MeshStandardMaterial({ color: col(colA), roughness: 0.35, metalness: 0.3 }), b = new THREE.MeshStandardMaterial({ color: col(colB), roughness: 0.4 }), dark = new THREE.MeshStandardMaterial({ color: col('#1d1d1d') }), glass = new THREE.MeshStandardMaterial({ color: col('#9fc3d6'), roughness: 0.08, metalness: 0.6 });
  const add = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  add(1.7, 1.5, 3.6, 0, 1.55, 0.3, a); add(1.72, 0.4, 3.62, 0, 1.1, 0.3, b); add(1.45, 0.95, 1.0, 0, 1.75, 2.2, glass);
  add(0.3, 0.35, 4.6, 0, 1.75, -3.3, a); add(0.08, 1.0, 0.7, 0, 2.2, -5.5, b);
  for (const s of [-1, 1]) { add(0.1, 0.1, 3.2, s * 0.9, 0.05, 0.3, dark); add(0.08, 0.7, 0.08, s * 0.9, 0.4, 1.2, dark); add(0.08, 0.7, 0.08, s * 0.9, 0.4, -0.6, dark); }
  const rotor = add(9.5, 0.05, 0.3, 0, 2.45, 0.3, dark), rotor2 = add(0.3, 0.05, 9.5, 0, 2.45, 0.3, dark), tail = add(0.05, 1.4, 0.18, 0.18, 2.2, -5.5, dark);
  scene.add(g); return { g, rotor, rotor2, tail };
}
class Chopper {
  constructor(x, z, h, name) {
    this.name = name; this.M = makeChopper(pick(['#f4f4f2', '#d6302a', '#1d3b6b', '#f2c230']), '#2b2e33');
    this.x = x; this.z = z; this.y = groundAt(x, z); this.h = h; this.vx = 0; this.vy = 0; this.vz = 0; this.pitch = 0; this.roll = 0; this.col = 0.42; this.spin = 0; this.ground = true; this.dead = false;
    this.input = { c: 0, p: 0, r: 0, y: 0 }; CHOPPERS.push(this); this.sync(0);
  }
  get alt() { return this.y - standAt(this.x, this.z); }
  step(dt) {
    if (this.dead) return; const I = this.input, flying = this === player.chopper;
    this.spin = lerp(this.spin, flying ? 1 : 0, Math.min(1, dt * 0.6)); // the rotor spools up before it'll lift
    this.col = flying ? clamp(0.5 + I.c * 0.5, 0, 1) : 0;
    this.pitch += (I.p * 0.32 - this.pitch) * Math.min(1, dt * 2.5); this.roll += (I.r * 0.32 - this.roll) * Math.min(1, dt * 2.5);
    this.h += (I.y * 1.1 + this.roll * 1.6) * dt * (this.ground ? 0.3 : 1);
    const lift = (this.col - 0.5) * 16 * this.spin + (this.spin > 0.9 && !this.ground ? 0 : -9.8 * (1 - this.spin) * 0.2);
    this.vy += (lift - this.vy * 1.4) * dt;
    const fx = Math.sin(this.h), fz = Math.cos(this.h), rx = Math.cos(this.h), rz = -Math.sin(this.h); // forward and left
    if (!this.ground) { const ax = (fx * this.pitch + rx * this.roll) * 22, az = (fz * this.pitch + rz * this.roll) * 22; this.vx += (ax - this.vx * 0.35) * dt; this.vz += (az - this.vz * 0.35) * dt; }
    else { this.vx *= Math.exp(-6 * dt); this.vz *= Math.exp(-6 * dt); }
    const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt, floor = standAt(nx, nz), sp = Math.hypot(this.vx, this.vz);
    if (!this.ground && this.y - floor < 300 && sp > 2 && rayWalls(this.x, this.z, nx, nz, Math.max(1.5, this.y - floor)) < 1) return this.crash('flew into a building');
    this.x = nx; this.z = nz; this.y += this.vy * dt;
    if (this.y <= floor) {
      if (!this.ground && (this.vy < -7 || sp > 14 || Math.abs(this.roll) > 0.45)) return this.crash(this.vy < -7 ? 'came down too hard' : 'clipped the ground');
      if (!this.ground && !isLand(this.x, this.z)) return this.crash('ditched in the water');
      this.y = floor; this.vy = Math.max(0, this.vy); if (!this.ground && flying) toast('Landed · E to get out');
      this.ground = true;
    } else if (this.y > floor + 0.3) this.ground = false;
    this.sync(dt);
  }
  crash(why) {
    this.dead = true; shake = 1.5; sfxNoise(1.2, 140, 0.9);
    for (let i = 0; i < 50; i++) emit(this.x + rr(-3, 3), this.y + rr(0, 3), this.z + rr(-3, 3), rr(-3, 3), rr(1, 6), rr(-3, 3), 1.6, 1.2, 4, rand() < 0.5 ? '#ff7a1a' : '#333', 0.9);
    if (player.chopper === this) { leaveChopper(true); damagePlayer(100); toast(`Crashed — you ${why}`); }
    setTimeout(() => this.remove(), 8000);
  }
  sync(dt) {
    this.M.g.position.set(this.x, this.y, this.z); this.M.g.rotation.set(this.pitch * 0.7, this.h, -this.roll * 0.7, 'YXZ');
    this.M.rotor.rotation.y += dt * 45 * this.spin; this.M.rotor2.rotation.y += dt * 45 * this.spin; this.M.tail.rotation.x += dt * 60 * this.spin;
  }
  remove() { scene.remove(this.M.g); this.M.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); const i = CHOPPERS.indexOf(this); if (i >= 0) CHOPPERS.splice(i, 1); if (player.chopper === this) leaveChopper(true); }
}
function nearestChopper(maxD) { let best = null, bd = maxD; for (const c of CHOPPERS) { if (c.dead || !c.ground) continue; const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < bd) { bd = d; best = c; } } return best; }
function boardChopper(c) { player.chopper = c; player.state = 'heli'; player.mode = 'car'; player.model.root.visible = false; $('flighthud').hidden = false; addCrime(1, 'jack'); toast(`${c.name || 'Helicopter'}: Space to lift off · W/S fly forward/back · A/D bank · Q/E spin · Shift down`); }
function leaveChopper(force) {
  const c = player.chopper; if (!c) return;
  if (!force && (!c.ground || Math.hypot(c.vx, c.vz) > 1.5)) { toast('Land first (Shift to come down gently)'); return; }
  player.chopper = null; player.state = 'foot'; player.mode = 'foot'; player.model.root.visible = true; $('flighthud').hidden = true;
  const s = freeSpotNear(c.x + Math.cos(c.h) * 3, c.z - Math.sin(c.h) * 3, 20) || [c.x + 3, c.z]; player.x = s[0]; player.z = s[1]; player.y = 0;
}
function updateHeliControls() {
  const c = player.chopper; if (!c) return; const I = c.input;
  I.c = (keys.Space ? 1 : 0) - (keys.ShiftLeft || keys.ShiftRight ? 1 : 0);
  I.p = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  I.r = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
  I.y = (keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0);
  player.x = c.x; player.z = c.z; player.h = c.h; player.speed = Math.hypot(c.vx, c.vz);
  $('fh-spd').textContent = Math.round(player.speed * 3.6); $('fh-alt').textContent = Math.max(0, Math.round(c.alt)); $('fh-vs').textContent = (c.vy > 0 ? '+' : '') + c.vy.toFixed(1);
  $('fh-thr').style.width = Math.round(c.col * 100) + '%';
  $('fh-tip').textContent = c.spin < 0.9 ? 'Rotor spooling up…' : c.ground ? 'Hold Space to lift off' : c.alt < 8 && c.vy < -4 ? '⚠ Coming down fast — Space!' : 'W/S forward/back · A/D bank · Q/E spin · Space/Shift up/down';
  $('fh-tip').className = /⚠/.test($('fh-tip').textContent) ? 'warn' : '';
}
let padT = 0;
function updateChoppers(dt) {
  padT -= dt;
  if (padT <= 0) { padT = 3;
    for (const [name, re, fx, fz, ox, oz] of HELI_PADS) {
      const P = re ? venue(name, re, fx, fz) : AIRPORT && AIRPORT.rw ? { x: AIRPORT.rw.x1 + AIRPORT.rw.nx * 120, z: AIRPORT.rw.z1 + AIRPORT.rw.nz * 120 } : { x: fx, z: fz };
      const x = P.x + ox, z = P.z + oz, d = Math.hypot(x - player.x, z - player.z);
      const here = CHOPPERS.find((c) => c.pad === name);
      if (d < 600 && !here) { const s = freeSpotNear(x, z, 60) || [x, z]; const c = new Chopper(s[0], s[1], rand() * TAU, name); c.pad = name; }
      else if (d > 900 && here && player.chopper !== here) here.remove();
    }
  }
  for (const c of CHOPPERS.slice()) c.step(dt);
}
