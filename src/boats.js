// ============================================================================
// Gold Coast Streets — boats. Jet skis and speedboats are tied up along the canals, the Broadwater and the
// beaches near you: walk (or swim) up and press E. W/S throttle, A/D steer, E to hop off (onto the bank if you're
// close, otherwise into the water). They plane up at speed, throw a wake, and run aground on the sand.
// ============================================================================
const BOAT_TYPES = {
  jetski: { name: 'Jet ski', L: 2.9, W: 1.1, max: 24, accel: 10, turn: 2.4, color: ['#e23b2a', '#f2c230', '#2a7de2', '#1d1d1d'] },
  speedboat: { name: 'Speedboat', L: 6.6, W: 2.3, max: 27, accel: 7, turn: 1.25, color: ['#f4f4f2', '#1d3b6b', '#c43a2a'] },
};
const BOATS = [];
const WATER_Y = -0.55;
function makeBoatModel(sp, hue) {
  const g = new THREE.Group(), hull = new THREE.MeshStandardMaterial({ color: col(hue), roughness: 0.3, metalness: 0.2 }), white = new THREE.MeshStandardMaterial({ color: col('#f4f4f2'), roughness: 0.35 }), dark = new THREE.MeshStandardMaterial({ color: col('#1d1d1d'), roughness: 0.6 });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  const L = sp.L, W = sp.W;
  add(new THREE.BoxGeometry(W, 0.55, L * 0.75), hull, 0, 0.1, -L * 0.1); // hull
  add(new THREE.CylinderGeometry(0.01, W / 2, L * 0.3, 4, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).scale(1, 0.55, 1), hull, 0, 0.1, L * 0.38); // pointed bow
  if (sp === BOAT_TYPES.jetski) { add(new THREE.BoxGeometry(0.42, 0.22, 1.1), dark, 0, 0.48, -0.25); add(new THREE.BoxGeometry(0.7, 0.06, 0.06), dark, 0, 0.72, 0.45); add(new THREE.BoxGeometry(W * 0.95, 0.12, L * 0.5), white, 0, 0.38, -0.1); }
  else { add(new THREE.BoxGeometry(W * 0.96, 0.12, L * 0.62), white, 0, 0.38, -L * 0.12); add(new THREE.BoxGeometry(W * 0.9, 0.5, 0.06), new THREE.MeshStandardMaterial({ color: col('#9fc3d6'), transparent: true, opacity: 0.5 }), 0, 0.68, L * 0.12); add(new THREE.BoxGeometry(W * 0.8, 0.4, 0.8), dark, 0, 0.6, -L * 0.15); add(new THREE.BoxGeometry(0.4, 0.6, 0.5), dark, 0, 0.35, -L * 0.48); }
  const rider = new THREE.Group(); rider.position.set(0, 0.42, sp === BOAT_TYPES.jetski ? -0.35 : -L * 0.12); g.add(rider);
  scene.add(g); return { g, rider };
}
class Boat {
  constructor(type, x, z, h) {
    this.type = type; this.sp = BOAT_TYPES[type]; const M = makeBoatModel(this.sp, pick(this.sp.color)); this.model = M.g; this.riderG = M.rider;
    this.x = x; this.z = z; this.h = h; this.v = 0; this.steer = 0; this.input = { t: 0, s: 0 }; this.pitch = 0; this.roll = 0; this.driven = false;
    BOATS.push(this); this.sync(0);
  }
  step(dt) {
    const sp = this.sp, I = this.input;
    this.v += (I.t > 0 ? sp.accel * I.t * (1 - this.v / sp.max) : I.t < 0 ? -sp.accel * 0.5 : 0) * dt;
    this.v -= this.v * (I.t ? 0.12 : 0.6) * dt; // water drag: coasting boats slow down quickly
    this.v = clamp(this.v, -5, sp.max);
    this.steer += clamp(I.s - this.steer, -4 * dt, 4 * dt);
    this.h += this.steer * sp.turn * clamp(Math.abs(this.v) / 8, 0, 1) * Math.sign(this.v || 1) * dt;
    const fx = Math.sin(this.h), fz = Math.cos(this.h), nx = this.x + fx * this.v * dt, nz = this.z + fz * this.v * dt;
    const bowX = nx + fx * sp.L * 0.5 * Math.sign(this.v || 1), bowZ = nz + fz * sp.L * 0.5 * Math.sign(this.v || 1);
    if (isLand(bowX, bowZ) && !isLand(this.x, this.z)) { // aground: stop with a scrape (a hull already on the sand can still back off)
      if (Math.abs(this.v) > 5 && this.driven) { shake = Math.min(1, shake + 0.3); sfxNoise(0.3, 400, 0.4); toast('Run aground — back off with S'); }
      this.v = -this.v * 0.15;
    } else { this.x = nx; this.z = nz; }
    if (this.driven && Math.abs(this.v) > 4 && rand() < dt * 40) emit(this.x - fx * sp.L * 0.5 + rr(-0.5, 0.5), WATER_Y + 0.2, this.z - fz * sp.L * 0.5 + rr(-0.5, 0.5), rr(-1, 1) - fx * 2, 1.2, rr(-1, 1) - fz * 2, 0.9, 0.5, 1.6, '#f4fbff', 0.8); // wake
    this.sync(dt);
  }
  sync(dt) {
    const plane = clamp(this.v / this.sp.max, 0, 1);
    this.pitch = lerp(this.pitch, -0.12 * plane + Math.sin(elapsed * 2.2 + this.x) * 0.02, Math.min(1, dt * 4)); // bow lifts as it planes
    this.roll = lerp(this.roll, -this.steer * 0.25 * plane + Math.sin(elapsed * 1.7 + this.z) * 0.03, Math.min(1, dt * 4));
    this.model.position.set(this.x, WATER_Y + Math.sin(elapsed * 2 + this.x * 0.3) * 0.06 + plane * 0.12, this.z);
    this.model.rotation.set(this.pitch, this.h, this.roll, 'YXZ');
  }
  remove() { scene.remove(this.model); this.model.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); const i = BOATS.indexOf(this); if (i >= 0) BOATS.splice(i, 1); }
}
// moored boats along the water's edge near you
let boatSpawnT = 0;
function spawnBoats(dt) {
  boatSpawnT -= dt; if (boatSpawnT > 0) return; boatSpawnT = 2;
  for (const b of BOATS.slice()) if (!b.driven && !b.story && Math.hypot(b.x - player.x, b.z - player.z) > 450) b.remove();
  if (BOATS.filter((b) => Math.hypot(b.x - player.x, b.z - player.z) < 300).length >= 5) return;
  for (let tries = 0; tries < 30; tries++) {
    const a = rand() * TAU, r = 25 + rand() * 160, x = player.x + Math.cos(a) * r, z = player.z + Math.sin(a) * r;
    if (isLand(x, z)) continue;
    let shore = null; for (let k = 0; k < 8; k++) { const t = k / 8 * TAU; if (isLand(x + Math.cos(t) * 5, z + Math.sin(t) * 5)) { shore = t; break; } } // right by the bank...
    if (shore === null || isLand(x - Math.cos(shore) * 12, z - Math.sin(shore) * 12)) continue; // ...with open water off it
    if (BOATS.some((b) => Math.hypot(b.x - x, b.z - z) < 12)) continue;
    new Boat(rand() < 0.65 ? 'jetski' : 'speedboat', x, z, Math.atan2(-Math.cos(shore), -Math.sin(shore)) + rr(-0.6, 0.6)); break; // nosed out towards open water
  }
}
function nearestBoat(maxD) { let best = null, bd = maxD; for (const b of BOATS) { const d = Math.hypot(b.x - player.x, b.z - player.z) - b.sp.L * 0.3; if (d < bd && !b.driven) { bd = d; best = b; } } return best; }
function boardBoat(b) {
  player.boat = b; player.state = 'boat'; player.mode = 'car'; b.driven = true; player.model.root.visible = false;
  const R = makePerson(player.look); R.legL.rotation.x = R.legR.rotation.x = -1.3; R.armL.rotation.x = R.armR.rotation.x = -1.2; R.root.position.y = -0.55; b.riderG.add(R.root); b.rider = R;
  toast(`${b.sp.name}: W throttle · A/D steer · S slow/reverse · E to hop off`); addCrime(1, 'jack');
}
function leaveBoat() {
  const b = player.boat; if (!b) return;
  if (b.rider) { b.riderG.remove(b.rider.root); disposePerson(b.rider); b.rider = null; }
  b.driven = false; b.input.t = 0; b.input.s = 0; player.boat = null; player.state = 'foot'; player.mode = 'foot'; player.model.root.visible = true;
  // step onto the bank if it's close, otherwise into the water beside the boat
  let spot = null; for (let r = 1; r <= 8 && !spot; r += 1) for (let k = 0; k < 12; k++) { const t = k / 12 * TAU, x = b.x + Math.cos(t) * r, z = b.z + Math.sin(t) * r; if (isLand(x, z) && !resolveCircle(x, z, 0.4)) { spot = [x, z]; break; } }
  const s = spot || [b.x + Math.cos(b.h) * 1.6, b.z - Math.sin(b.h) * 1.6]; player.x = s[0]; player.z = s[1]; player.y = 0;
}
function updateBoatControls() {
  const b = player.boat; if (!b) return;
  b.input.t = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  b.input.s = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
  player.x = b.x; player.z = b.z; player.h = b.h; player.speed = b.v;
}
function updateBoats(dt) { spawnBoats(dt); for (const b of BOATS) b.step(dt); }
