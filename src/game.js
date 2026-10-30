// ============================================================================
// Gold Coast Streets — gameplay: player, cars, traffic, police, pedestrians, HUD
// ============================================================================
const $ = (id) => document.getElementById(id);
window.__gcsErrors = [];
window.addEventListener('error', (e) => window.__gcsErrors.push(String(e.message)));
const keys = {};
const mouse = { locked: false, dragging: false, last: -10, wasLocked: false, aim: false, fire: false, fired: false };
let ready = false, started = false, paused = true, bigMapOpen = false, uiOpen = false;
let gameHour = 14.0, timeScale = 1, elapsed = 0;
let camYaw = Math.PI / 2, camPitch = 0.2, camIdx = 1, camDist = 6, shake = 0;
const CAM_CAR = [6.5, 9.5, 14];
const cars = [], peds = [], pickups = [];
const tmpA = { x: 0, z: 0, tx: 0, tz: 1 }, tmpB = { x: 0, z: 0, tx: 0, tz: 1 }, tmpC = { x: 0, z: 0, tx: 0, tz: 1 };
const ROAD_SPEED = { [RT.motorway]: 27, [RT.trunk]: 16.5, [RT.primary]: 15, [RT.secondary]: 13.5, [RT.tertiary]: 12, [RT.residential]: 9, [RT.unclassified]: 9, [RT.living_street]: 6 };
const PADJ = new Map(); // pedestrian adjacency: every edge, both directions
EDGES.forEach((E, i) => {
  for (const [n, dir] of [[E.a, 1], [E.b, -1]]) { let a = PADJ.get(n); if (!a) PADJ.set(n, (a = [])); a.push({ e: i, dir }); }
});
const COP_LOOK = { shirt: '#5a8fc4', shorts: '#1e2a3a', hair: '#2a2a2a', skin: '#e0ac85', shoe: '#111111', singlet: false };
const DEFAULT_LOOK = { skin: '#e0ac85', hair: '#3b2a1e', shirt: '#ffffff', shorts: '#1aa3a8', singlet: true, shoe: '#e8e8e8' };

// player.state: foot | enter | car | exit | down | getup | tackled | cuffed
const player = {
  x: 0, z: 0, y: 0, vy: 0, vx: 0, vz: 0, h: Math.PI / 2, mode: 'foot', state: 'foot', car: null, health: 100, money: 250,
  stars: 0, starCool: 0, punchT: 0, punchArm: 0, phase: 0, kx: 0, kz: 0, deadT: 0, speed: 0, model: null, seq: null, t: 0,
  look: Object.assign({}, DEFAULT_LOOK),
  items: {}, weapons: {}, weapon: 'fist', effects: { energy: 0, specs: 0 },
};
try { const saved = JSON.parse(localStorage.getItem('gcs-look') || 'null'); if (saved) Object.assign(player.look, saved); } catch (e) { /* storage blocked */ }

// ---------------------------------------------------------------- particles (smoke, fire, sparks)
const puffTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const parts = [];
for (let i = 0; i < 260; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, color: 0xffffff }));
  s.visible = false; scene.add(s);
  parts.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 1, s1: 2, a: 1 });
}
let partIdx = 0;
function emit(x, y, z, vx, vy, vz, life, s0, s1, color, alpha = 0.8) {
  const p = parts[partIdx = (partIdx + 1) % parts.length];
  p.s.position.set(x, y, z); p.vx = vx; p.vy = vy; p.vz = vz; p.life = 0; p.max = life; p.s0 = s0; p.s1 = s1; p.a = alpha;
  p.s.material.color.set(color); p.s.visible = true;
}
function updateParticles(dt) {
  for (const p of parts) {
    if (!p.s.visible) continue;
    p.life += dt; if (p.life >= p.max) { p.s.visible = false; continue; }
    const t = p.life / p.max;
    p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
    const sc = lerp(p.s0, p.s1, t); p.s.scale.set(sc, sc, sc);
    p.s.material.opacity = p.a * (1 - t);
  }
}

// ---------------------------------------------------------------- skid marks (ring buffer of quads on the road)
const SKID_N = 2400;
const skidGeo = new THREE.BufferGeometry();
skidGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SKID_N * 18), 3));
const skidMesh = new THREE.Mesh(skidGeo, new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 }));
skidMesh.frustumCulled = false; skidMesh.renderOrder = 1;
scene.add(skidMesh);
let skidIdx = 0;
function addSkid(ax, az, bx, bz, w) {
  const L = Math.hypot(bx - ax, bz - az); if (L < 0.05 || L > 3) return;
  const nx = (bz - az) / L * w / 2, nz = -(bx - ax) / L * w / 2, y = 0.09;
  const a = skidGeo.attributes.position.array, o = (skidIdx = (skidIdx + 1) % SKID_N) * 18;
  a.set([ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz, ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz], o);
  skidGeo.attributes.position.needsUpdate = true;
}

// ---------------------------------------------------------------- audio
const AU = { ctx: null, on: true };
function initAudio() {
  if (AU.ctx) return;
  try {
    const C = new (window.AudioContext || window.webkitAudioContext)();
    AU.ctx = C; AU.master = C.createGain(); AU.master.gain.value = 0.55; AU.master.connect(C.destination);
    AU.e1 = C.createOscillator(); AU.e1.type = 'sawtooth'; AU.e2 = C.createOscillator(); AU.e2.type = 'square';
    AU.ef = C.createBiquadFilter(); AU.ef.type = 'lowpass'; AU.ef.frequency.value = 500;
    AU.eg = C.createGain(); AU.eg.gain.value = 0;
    AU.e1.connect(AU.ef); AU.e2.connect(AU.ef); AU.ef.connect(AU.eg); AU.eg.connect(AU.master); AU.e1.start(); AU.e2.start();
    AU.s = C.createOscillator(); AU.s.type = 'triangle'; AU.sg = C.createGain(); AU.sg.gain.value = 0; AU.s.connect(AU.sg); AU.sg.connect(AU.master); AU.s.start();
    const nb = C.createBuffer(1, C.sampleRate * 2, C.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    AU.noise = nb;
    const ws = C.createBufferSource(); ws.buffer = nb; ws.loop = true;
    const wf = C.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 420;
    AU.wg = C.createGain(); AU.wg.gain.value = 0; ws.connect(wf); wf.connect(AU.wg); AU.wg.connect(AU.master); ws.start();
    const ts = C.createBufferSource(); ts.buffer = nb; ts.loop = true; // tyre squeal
    const tf = C.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 1700; tf.Q.value = 6;
    AU.tg = C.createGain(); AU.tg.gain.value = 0; ts.connect(tf); tf.connect(AU.tg); AU.tg.connect(AU.master); ts.start();
  } catch (e) { AU.ctx = null; }
}
function sfxNoise(dur, freq, vol) {
  if (!AU.ctx || !AU.on) return;
  const C = AU.ctx, s = C.createBufferSource(), f = C.createBiquadFilter(), g = C.createGain();
  s.buffer = AU.noise; f.type = 'lowpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, C.currentTime); g.gain.exponentialRampToValueAtTime(0.001, C.currentTime + dur);
  s.connect(f); f.connect(g); g.connect(AU.master); s.start(); s.stop(C.currentTime + dur + 0.05);
}
function sfxTone(freqs, dur, vol, type = 'square') {
  if (!AU.ctx || !AU.on) return;
  const C = AU.ctx, g = C.createGain();
  g.gain.setValueAtTime(vol, C.currentTime); g.gain.setValueAtTime(vol, C.currentTime + dur * 0.8); g.gain.linearRampToValueAtTime(0, C.currentTime + dur);
  g.connect(AU.master);
  for (const f of freqs) { const o = C.createOscillator(); o.type = type; o.frequency.value = f; o.connect(g); o.start(); o.stop(C.currentTime + dur + 0.02); }
}
let coastPts = [], squeal = 0;
function updateAudio(dt) {
  if (!AU.ctx) return;
  const C = AU.ctx, t = C.currentTime, on = AU.on && !paused && !uiOpen;
  const car = player.mode === 'car' ? player.car : null;
  if (car && !car.dead) {
    const v = Math.abs(car.vf), gear = Math.min(4, Math.floor(v / 12)), within = (v - gear * 12) / 12;
    const rpm = 800 + within * 4400 + (gear > 0 ? 1200 : 0) + car.input.t * 700 + car.spinR * 2500;
    AU.e1.frequency.setTargetAtTime(rpm / 30, t, 0.05); AU.e2.frequency.setTargetAtTime(rpm / 60, t, 0.05);
    AU.ef.frequency.setTargetAtTime(300 + rpm * 0.25 + car.input.t * 500, t, 0.05);
    AU.eg.gain.setTargetAtTime(on ? 0.045 + car.input.t * 0.03 : 0, t, 0.08);
  } else AU.eg.gain.setTargetAtTime(0, t, 0.1);
  AU.tg.gain.setTargetAtTime(on ? squeal * 0.07 : 0, t, 0.05);
  let sd = 1e9;
  for (const c of cars) if (c.siren) sd = Math.min(sd, Math.hypot(c.x - player.x, c.z - player.z));
  AU.s.frequency.setTargetAtTime(760 + 440 * Math.sin(elapsed * 2.4), t, 0.02);
  AU.sg.gain.setTargetAtTime(on ? 0.05 * clamp(1 - sd / 160, 0, 1) : 0, t, 0.1);
  let cd = 1e9;
  for (let i = 0; i < coastPts.length; i += 2) cd = Math.min(cd, Math.hypot(coastPts[i] - player.x, coastPts[i + 1] - player.z));
  AU.wg.gain.setTargetAtTime(on ? 0.16 * clamp(1 - cd / 240, 0, 1) * (0.7 + 0.3 * Math.sin(elapsed * 0.6)) : 0, t, 0.3);
}

// ---------------------------------------------------------------- cars
// how deep the water is: none on land, then about a metre for every 9 m out from the nearest shore
const WATER_SINK = 1.1; // metres: deeper than this floods a car
function waterDepth(x, z) {
  if (isLand(x, z)) return 0;
  for (let r = 2; r <= 12; r += 2) for (let a = 0; a < 8; a++) if (isLand(x + Math.cos(a * TAU / 8) * r, z + Math.sin(a * TAU / 8) * r)) return r / 9;
  return 2;
}
class Car {
  constructor(type, color, x, z, h) {
    this.type = type; this.spec = CAR_TYPES[type];
    this.model = makeCarModel(type, color || pick(CAR_COLORS)); scene.add(this.model.root);
    this.x = x; this.z = z; this.y = 0; this.h = h; this.vx = 0; this.vz = 0; this.steer = 0; this.yaw = 0; this.ax = 0;
    this.health = 100; this.driver = null; this.ai = null; this.input = { t: 0, b: 0, s: 0, hb: 0 };
    this.sink = 0; this.burn = -1; this.dead = false; this.deadT = 0; this.spin = 0; this.roll = 0; this.pitch = 0; this.prevVf = 0;
    this.kind = 'traffic'; this.siren = false; this.spot = null; this.hitCool = 0; this.look = null; this.copOut = null;
    this.doorTarget = [0, 0]; this.spinR = 0; this.slip = 0; this.skidPrev = [null, null];
    this.offs = [-this.spec.L / 2 + this.spec.W / 2, 0, this.spec.L / 2 - this.spec.W / 2]; this.r = this.spec.W / 2 + 0.02;
    this.sync();
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get vf() { return this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h); }
  setDriver(kind, look) { this.driver = kind; this.look = look || null; setDriverLook(this.model, look || null); }
  step(dt) {
    if (this.driver === 'player') this.stepTyres(dt); else this.stepSimple(dt);
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.spin += (this.vf / this.spec.wr) * dt;
    hitBreakables(this);
    this.collideWorld();
    this.stepGround(dt);
    // the shallow edge of the water can be driven through, slowly; out where it's deep the engine floods and the car is lost
    const wd = this.sink === 0 ? waterDepth(this.x, this.z) : 0;
    if (wd > 0) {
      const d = Math.exp(-wd * 2.4 * dt); this.vx *= d; this.vz *= d; this.y = -wd * 0.7;
      if (!this.wet) { this.wet = true; sfxNoise(0.5, 900, 0.3); if (this === player.car) toast('Shallow water — any deeper and the car is gone'); }
      if (rand() < dt * 25 * Math.min(1, this.speed / 5)) emit(this.x + rr(-1, 1), 0.1, this.z + rr(-1, 1), rr(-1.5, 1.5), 2.6, rr(-1.5, 1.5), 0.7, 0.35, 1.1, '#e8f4f8', 0.7);
      if (wd >= WATER_SINK) { this.sink = 0.001; if (this === player.car) toast('Too deep! The car is swamped — swim back to shore'); sfxNoise(1.2, 900, 0.5); }
    } else if (this.wet && this.sink === 0) { this.wet = false; this.y = 0; }
    if (this.sink > 0) {
      this.sink += dt; this.y = -Math.min(2.4, this.sink * 0.9); this.vx *= Math.exp(-2 * dt); this.vz *= Math.exp(-2 * dt);
      if (this.sink > 1.2 && this === player.car && player.state === 'car') bailOut();
      if (this.sink > 2) this.dead = true;
    }
    const fx = Math.sin(this.h), fz = Math.cos(this.h), sp = this.spec;
    if (this.health < 35 && this.health > 0 && rand() < dt * 8) emit(this.x + fx * sp.L * 0.38, 1.1, this.z + fz * sp.L * 0.38, rr(-0.3, 0.3), 1.5, rr(-0.3, 0.3), 1.6, 0.6, 2.4, this.health < 15 ? '#333' : '#bbb', 0.55);
    if (this.health <= 0 && this.burn < 0 && !this.dead) { this.burn = 0; if (this === player.car) toast('Get out — it’s going to blow!'); }
    if (this.burn >= 0 && !this.dead) {
      this.burn += dt;
      if (rand() < dt * 30) emit(this.x + fx * sp.L * 0.35 + rr(-0.4, 0.4), 1.0, this.z + fz * sp.L * 0.35 + rr(-0.4, 0.4), 0, 2.5, 0, 0.7, 0.8, 1.6, rand() < 0.5 ? '#ff7a1a' : '#ffc23a', 0.9);
      if (this.burn > 5) this.explode();
    }
    if (this.dead) { this.deadT += dt; if (this.burn >= 0 && rand() < dt * 6) emit(this.x, 1.2, this.z, rr(-0.2, 0.2), 2, rr(-0.2, 0.2), 3, 1, 4, '#222', 0.5); }
    if (this.hitCool > 0) this.hitCool -= dt;
  }
  // hills: gravity pulls along the slope; the car follows the ground unless a crest is sharp enough to throw it into the air
  stepGround(dt) {
    const gy = groundAt(this.x, this.z);
    if (this.alt === undefined) { this.alt = gy; this.vy = 0; this.prevG = gy; this.air = 0; }
    const rise = (gy - this.prevG) / Math.max(dt, 1e-3); this.prevG = gy;
    if (!this.air) {
      if (rise < this.vy - 9.81 * dt - 2.5 && this.speed > 10) this.air = 1e-3; // over the crest faster than gravity can follow
      else {
        this.alt = gy; this.vy = clamp(rise, -25, 25);
        const [sx, sz] = groundSlope(this.x, this.z);
        this.vx -= 9.81 * sx * dt; this.vz -= 9.81 * sz * dt;
      }
    }
    if (this.air) {
      this.air += dt; this.vy -= 9.81 * dt; this.alt += this.vy * dt;
      if (this.alt <= gy) {
        const hit = rise - this.vy;
        if (hit > 6) { // a hard landing
          this.health -= Math.min(30, (hit - 6) * 4);
          if (this === player.car) { shake = Math.min(1.5, shake + hit * 0.06); sfxNoise(0.25, 260, 0.5); }
        }
        this.alt = gy; this.vy = rise; this.air = 0;
      }
    }
  }
  // AI and empty cars: simple, stable handling
  stepSimple(dt) {
    const sp = this.spec, inp = this.input;
    const fx = Math.sin(this.h), fz = Math.cos(this.h), lx = Math.cos(this.h), lz = -Math.sin(this.h);
    let vf = this.vx * fx + this.vz * fz, vl = this.vx * lx + this.vz * lz;
    const live = !this.dead && this.sink === 0 && this.driver;
    const t = live ? inp.t : 0, b = live ? inp.b : 0, hb = live ? inp.hb : 0;
    if (t > 0) vf += vf < -0.5 ? 15 * dt * t : sp.accel * t * Math.max(0.12, 1 - vf / sp.max) * dt;
    if (b > 0) { if (vf > 0.5) vf -= 17 * dt * b; else vf -= sp.accel * 0.65 * b * Math.max(0, 1 + vf / 13) * dt; }
    let drag = 0.3 + 0.0011 * vf * vf + (t === 0 && b === 0 ? 1.3 : 0);
    if (!live) drag += 7;
    if (hb) drag += 6.5;
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), drag * dt);
    const sMax = 0.6 / (1 + Math.abs(vf) / 22);
    this.steer += clamp((live ? inp.s : 0) * sMax - this.steer, -3.2 * dt, 3.2 * dt);
    const yaw = (vf * Math.tan(this.steer)) / sp.wb;
    vl *= Math.exp(-sp.grip * dt);
    this.vx = fx * vf + lx * vl; this.vz = fz * vf + lz * vl;
    this.h += yaw * dt; this.yaw = yaw; this.spinR = 0; this.slip = 0;
    const acc = (vf - this.prevVf) / Math.max(dt, 1e-3); this.prevVf = vf;
    this.pitch = lerp(this.pitch, clamp(-acc * 0.006, -0.06, 0.06), Math.min(1, dt * 6));
    this.roll = lerp(this.roll, clamp(-yaw * vf * 0.004, -0.09, 0.09), Math.min(1, dt * 6));
  }
  // the player's car: tyre forces from slip angles, weight transfer, traction circle.
  // Rear-wheel-drive cars break traction under power and slide; the handbrake kicks the rear out.
  stepTyres(dt) {
    const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
    for (let i = 0; i < n; i++) this.tyreStep(h);
    const acc = this.ax;
    this.pitch = lerp(this.pitch, clamp(-acc * 0.008, -0.07, 0.07), Math.min(1, dt * 6));
    const lat = this.yaw * this.vf;
    this.roll = lerp(this.roll, clamp(-lat * 0.006, -0.1, 0.1), Math.min(1, dt * 6));
    // smoke and rubber when the rear tyres are sliding or spinning
    const sp = this.spec, fx = Math.sin(this.h), fz = Math.cos(this.h), lx = Math.cos(this.h), lz = -Math.sin(this.h);
    for (let k = 0; k < 2; k++) {
      const side = k ? 1 : -1, wx = this.x - fx * sp.wb / 2 + lx * side * (sp.W / 2 - 0.2), wz = this.z - fz * sp.wb / 2 + lz * side * (sp.W / 2 - 0.2);
      if (this.slip > 0.28 && this.sink === 0) {
        const pv = this.skidPrev[k]; if (pv) addSkid(pv[0], pv[1], wx, wz, 0.24);
        this.skidPrev[k] = [wx, wz];
        if (rand() < this.slip * dt * 40) emit(wx, 0.35, wz, rr(-0.6, 0.6) - this.vx * 0.05, rr(0.4, 1.2), rr(-0.6, 0.6) - this.vz * 0.05, rr(1.2, 2.2), 0.6, 3.4, '#d9d9d9', 0.45 * this.slip);
      } else this.skidPrev[k] = null;
    }
  }
  tyreStep(dt) {
    const sp = this.spec, inp = this.input, g = 9.81, m = sp.mass, L = sp.wb;
    const b = L * sp.frontBias, a = L - b; // centre of mass to front axle (a) and rear axle (b)
    const sin = Math.sin(this.h), cos = Math.cos(this.h);
    let vf = this.vx * sin + this.vz * cos, vl = this.vx * cos - this.vz * sin, r = this.yaw;
    const live = !this.dead && this.sink === 0;
    const thr = live ? inp.t : 0, brk = live ? inp.b : 0, hb = live ? inp.hb : 0;
    const speed = Math.hypot(vf, vl);
    const beta = speed > 1.5 ? Math.atan2(vl, Math.abs(vf)) : 0;
    let target = (live ? inp.s : 0) * 0.62 / (1 + Math.max(0, vf) / 26);
    // drift assist: in a slide the front wheels follow the direction of travel (what a drifter's hands do),
    // so A/D hold or widen the angle instead of spinning you out
    if (vf > 3 && Math.abs(beta) > 0.08) {
      const fa = Math.atan2(vl + r * (L * (1 - sp.frontBias)), Math.max(Math.abs(vf), 1));
      target = clamp(fa * 0.9 + (live ? inp.s : 0) * 0.32, -0.75, 0.75);
    }
    this.steer += clamp(target - this.steer, -3.6 * dt, 3.6 * dt);
    const d = this.steer;
    const Nf0 = m * g * b / L, Nr0 = m * g * a / L, dN = clamp(m * this.ax * 0.55 / L, -Nf0 * 0.45, Nf0 * 0.45);
    const Nf = Nf0 - dN, Nr = Nr0 + dN;
    const sand = onBeach(this.x, this.z) && !maskAt(plantMask, this.x, this.z);
    const mu = sp.mu * (sand ? 0.62 : 1);
    let Fdrive = 0, Fbrake = 0;
    // power-limited drive: big shove off the line, tapering through the 'gears'
    if (thr > 0) { if (vf < -0.5) Fbrake = thr * m * 10; else Fdrive = thr * m * sp.accel * 1.15 * Math.min(1, 11 / Math.max(vf, 1)) * Math.max(0.08, 1 - vf / sp.max); }
    if (brk > 0) { if (vf > 0.5) Fbrake = brk * m * 10; else Fdrive = -brk * m * sp.accel * 0.6 * Math.max(0, 1 + vf / 13); }
    const share = sp.drive === 'rwd' ? 0 : sp.drive === 'fwd' ? 1 : 0.4;
    let Fxf = Fdrive * share, Fxr = Fdrive * (1 - share);
    const bs = Math.abs(vf) > 0.05 ? Math.sign(vf) : 0;
    Fxf -= Fbrake * 0.6 * bs; Fxr -= Fbrake * 0.4 * bs;
    if (hb) Fxr -= m * 3.5 * bs;
    const maxF = mu * Nf * 0.86, maxR = mu * Nr; // fronts give up first: understeer at the limit unless you provoke the rear
    let spinR = 0;
    if (Math.abs(Fxr) > maxR * 0.9) { spinR = Math.min(1, (Math.abs(Fxr) - maxR * 0.9) / (maxR * 0.45)); Fxr = Math.sign(Fxr) * maxR * 0.9; }
    Fxf = clamp(Fxf, -maxF * 0.95, maxF * 0.95);
    const vfa = Math.max(Math.abs(vf), 0.6), sgn = vf < -0.3 ? -1 : 1;
    const af = Math.atan2(vl + r * a, vfa) - d * sgn, ar = Math.atan2(vl - r * b, vfa);
    let latR = Math.sqrt(Math.max(0, maxR * maxR - Fxr * Fxr)) * (1 - spinR * 0.35);
    if (!hb) latR = Math.max(latR, maxR * (spinR > 0.6 ? 0.45 : 0.62)); // rear lets go progressively, not all at once
    if (hb) latR *= 0.3;
    const latF = Math.sqrt(Math.max(0, maxF * maxF - Fxf * Fxf));
    // stiffer rear tyres = mild understeer at the limit; the rear only lets go under power or handbrake
    const Fyf = clamp(-maxF * 8 * af, -latF, latF), Fyr = clamp(-maxR * 11 * ar, -latR, latR);
    const coast = thr === 0 && brk === 0 ? m * 0.9 * Math.min(1, Math.abs(vf)) * bs : 0;
    const drag = 0.42 * vf * Math.abs(vf) + m * 0.15 * bs + coast;
    const cd = Math.cos(d), sd = Math.sin(d);
    const Flong = Fxf * cd - Fyf * sd + Fxr - drag, Flat = Fyf * cd + Fxf * sd + Fyr;
    const I = m * (a * a + b * b) * 0.55, torque = a * (Fyf * cd + Fxf * sd) - b * Fyr;
    const axl = Flong / m;
    vf += (axl + r * vl) * dt;
    vl += (Flat / m - r * vf) * dt;
    r += (torque / I) * dt;
    if (speed < 4) { const k = 1 - speed / 4; r = lerp(r, (vf * Math.tan(d)) / L, k); vl *= Math.exp(-7 * k * dt); }
    if (Math.abs(vf) < 0.25 && thr === 0 && brk === 0) vf *= Math.exp(-4 * dt);
    this.ax = lerp(this.ax, axl, Math.min(1, dt * 8));
    this.yaw = r; this.h += r * dt;
    const s2 = Math.sin(this.h), c2 = Math.cos(this.h);
    this.vx = s2 * vf + c2 * vl; this.vz = c2 * vf - s2 * vl;
    this.spinR = lerp(this.spinR, spinR, Math.min(1, dt * 10));
    this.slip = clamp((Math.abs(vl - r * b) - 1.8) / 5, 0, 1) * (speed > 3 ? 1 : 0) + this.spinR * (Math.abs(vf) > 1 ? 0.8 : 0.5) * (thr > 0 ? 1 : 0);
    this.slip = clamp(this.slip + (hb && speed > 4 ? 0.3 : 0), 0, 1);
  }
  collideWorld() {
    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    let impact = 0;
    for (const s of this.offs) {
      const cx = this.x + fx * s, cz = this.z + fz * s;
      if (!resolveCircle(cx, cz, this.r)) continue;
      this.x += hitRes.x - cx; this.z += hitRes.z - cz;
      const vn = this.vx * hitRes.nx + this.vz * hitRes.nz;
      if (vn < 0) {
        this.vx -= 1.3 * vn * hitRes.nx; this.vz -= 1.3 * vn * hitRes.nz;
        this.vx *= 0.9; this.vz *= 0.9; impact = Math.max(impact, -vn);
        const kick = clamp(s * (fx * hitRes.nz - fz * hitRes.nx) * vn * 0.012, -0.15, 0.15);
        this.h += kick; this.yaw *= 0.5;
      }
    }
    this.x = clamp(this.x, WORLD.x0 + 2, WORLD.x1 - 2); this.z = clamp(this.z, WORLD.z0 + 2, WORLD.z1 - 2);
    if (impact > 3) this.crash(impact);
  }
  crash(impact) {
    if (this.hitCool > 0) return;
    this.hitCool = 0.25;
    this.health -= (impact - 2.5) * 2.2;
    const loud = this === player.car || Math.hypot(this.x - player.x, this.z - player.z) < 40;
    if (loud) sfxNoise(0.35, 700 + impact * 60, Math.min(0.6, impact * 0.04));
    if (this === player.car) { shake = Math.min(1, shake + impact * 0.04); if (impact > 6) driftCrash(); }
    for (let i = 0; i < Math.min(8, impact); i++) emit(this.x, 0.8, this.z, rr(-3, 3), rr(1, 4), rr(-3, 3), 0.35, 0.12, 0.05, '#ffd27a', 1);
  }
  explode() {
    this.dead = true; this.health = 0;
    this.model.paintMat.color.set('#1b1a19'); this.model.paintMat.metalness = 0; this.model.paintMat.roughness = 1;
    setDriverLook(this.model, null);
    for (let i = 0; i < 40; i++) emit(this.x + rr(-1, 1), rr(0.5, 2), this.z + rr(-1, 1), rr(-6, 6), rr(2, 9), rr(-6, 6), rr(0.5, 1.3), 1.5, 5, rand() < 0.6 ? '#ff8a1a' : '#ffd05a', 1);
    for (let i = 0; i < 20; i++) emit(this.x + rr(-1, 1), rr(1, 3), this.z + rr(-1, 1), rr(-2, 2), rr(2, 5), rr(-2, 2), rr(2, 4), 2, 7, '#2a2a2a', 0.7);
    const d = Math.hypot(this.x - player.x, this.z - player.z);
    sfxNoise(1.6, 400, clamp(1 - d / 150, 0.05, 0.9));
    if (d < 60) shake = Math.min(1.5, shake + (1 - d / 60) * 1.2);
    if (this === player.car && player.state === 'car') { damagePlayer(100); bailOut(); }
    else if (player.mode === 'foot' && d < 8) { damagePlayer(70 * (1 - d / 8)); knockPlayer((player.x - this.x) / d * 8, (player.z - this.z) / d * 8); }
    for (const c of cars) {
      if (c === this) continue;
      const dd = Math.hypot(c.x - this.x, c.z - this.z);
      if (dd < 9) { c.vx += ((c.x - this.x) / dd) * 8; c.vz += ((c.z - this.z) / dd) * 8; c.health -= 40 * (1 - dd / 9); }
    }
    for (const p of peds) { const dd = Math.hypot(p.x - this.x, p.z - this.z); if (dd < 8) p.knock((p.x - this.x) / dd * 9, 6, (p.z - this.z) / dd * 9, true); }
  }
  sync(dt = 0) {
    const M = this.model;
    // body follows the slope: nose up on climbs, leaning on side slopes; in the air it tips with the arc
    const alt = this.alt === undefined ? groundAt(this.x, this.z) : this.alt, [sx, sz] = groundSlope(this.x, this.z);
    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    const tp = this.air ? clamp(-Math.atan2(this.vy, Math.max(4, Math.abs(this.vf))), -0.5, 0.5) : -Math.atan(sx * fx + sz * fz), tr = this.air ? this.tr || 0 : Math.atan(sx * fz - sz * fx);
    const k = dt ? Math.min(1, dt * 10) : 1; this.tp = lerp(this.tp || 0, tp, k); this.tr = lerp(this.tr || 0, tr, k);
    M.root.position.set(this.x, alt + this.y, this.z); M.root.rotation.set(this.tp, this.h, this.tr, 'YXZ');
    M.bodyG.rotation.set(this.pitch, 0, this.roll);
    for (const w of M.wheels) { w.m.rotation.x = this.spin; if (w.front) w.pivot.rotation.y = this.steer; }
    M.doors.forEach((d, i) => { d.open += clamp(this.doorTarget[i] - d.open, -dt * 4, dt * 4); d.hinge.rotation.y = -d.side * d.open * 1.1; });
    const braking = this.driver && ((this.input.b > 0 && this.vf > 0.5) || this.input.hb);
    M.tailMat.color.set(braking ? '#ff2a2a' : nightLevel > 0.3 ? '#a51010' : '#5a0606');
    if (M.siren) {
      const on = this.siren && !this.dead, ph = Math.floor(elapsed * 6) % 2;
      M.siren.r.material = on && ph ? sirenRed : sirenOff; M.siren.b.material = on && !ph ? sirenBlue : sirenOff;
    }
  }
  remove() {
    disposeCarModel(this.model);
    if (this.spot) this.spot.used = false;
    const i = cars.indexOf(this); if (i >= 0) cars.splice(i, 1);
  }
}
function onBeach(x, z) {
  for (let i = 0; i < coastPts.length; i += 2) if (Math.abs(coastPts[i + 1] - z) < 60 && x > coastPts[i] - 70) return true;
  return false;
}
// world positions around a car (the driver sits on the right, local -x)
function carLocal(c, lx, lz) { const s = Math.sin(c.h), co = Math.cos(c.h); return { x: c.x + co * lx + s * lz, z: c.z - s * lx + co * lz }; }
const carDoorPoint = (c) => carLocal(c, -(c.spec.W / 2 + 0.65), c.spec.cf - 0.7);
const carSeat = (c) => carLocal(c, -c.spec.W * 0.2, (c.spec.cr + c.spec.cf) / 2 - 0.05);

function collideCars() {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      if (dx * dx + dz * dz > 49) continue;
      let best = 0, bnx = 0, bnz = 0;
      const afx = Math.sin(a.h), afz = Math.cos(a.h), bfx = Math.sin(b.h), bfz = Math.cos(b.h);
      for (const sa of a.offs) for (const sb of b.offs) {
        const ax = a.x + afx * sa, az = a.z + afz * sa, bx = b.x + bfx * sb, bz = b.z + bfz * sb;
        const ddx = bx - ax, ddz = bz - az, d = Math.hypot(ddx, ddz), pen = a.r + b.r - d;
        if (pen > best && d > 1e-4) { best = pen; bnx = ddx / d; bnz = ddz / d; }
      }
      if (best <= 0) continue;
      const ma = a.spec.mass, mb = b.spec.mass, tot = ma + mb;
      a.x -= bnx * best * (mb / tot); a.z -= bnz * best * (mb / tot); b.x += bnx * best * (ma / tot); b.z += bnz * best * (ma / tot);
      const rv = (b.vx - a.vx) * bnx + (b.vz - a.vz) * bnz;
      if (rv < 0) {
        const jimp = (-1.25 * rv) / (1 / ma + 1 / mb);
        a.vx -= (jimp / ma) * bnx; a.vz -= (jimp / ma) * bnz; b.vx += (jimp / mb) * bnx; b.vz += (jimp / mb) * bnz;
        const impact = -rv;
        if (impact > 3) {
          a.crash(impact); b.crash(impact);
          for (const [me, other] of [[a, b], [b, a]]) {
            if (me.ai && me.kind === 'traffic') me.ai.shock = 2.5;
            if (other === player.car && me.kind === 'police') addCrime(1, 'police', true);
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------- AI driving
function laneOffset(E, ai, chase) {
  if (chase) return 0;
  if (E.oneway) { const n = E.lanes, idx = Math.min(ai.lane, n - 1), lw = E.width / n; return ((n - 1) / 2 - idx) * lw; }
  return Math.max(1.7, E.width / 4); // keep left (Australia)
}
function aiPoint(car, ahead, out) {
  const a = car.ai; let E = EDGES[a.e], s = a.s + ahead, dir = a.dir;
  const chase = car.kind === 'police' && player.stars > 0;
  if (s > E.len && a.next) { s -= E.len; E = EDGES[a.next.e]; dir = a.next.dir; }
  edgePoint(E, dir, Math.min(s, E.len), out);
  const off = laneOffset(E, a, chase);
  out.x += out.tz * off; out.z -= out.tx * off;
  return out;
}
function chooseNext(e, dir) {
  const E = EDGES[e], node = dir > 0 ? E.b : E.a;
  const opts = (ADJ.get(node) || []).filter((o) => o.e !== e && EDGES[o.e]);
  if (!opts.length) return E.oneway ? null : { e, dir: -dir };
  edgePoint(E, dir, E.len, tmpC);
  const ix = tmpC.tx, iz = tmpC.tz;
  let best = null, bw = -1e9;
  for (const o of opts) {
    const O = EDGES[o.e];
    edgePoint(O, o.dir, Math.min(5, O.len), tmpC);
    const turn = ix * tmpC.tx + iz * tmpC.tz;
    const w = (turn < -0.6 ? -2 : turn + 1.3) * (0.3 + rand()) * (MAJOR.has(O.type) ? 1.25 : 1);
    if (w > bw) { bw = w; best = o; }
  }
  return best;
}
// police routing: road distance from every junction to the player (police ignore one-way signs)
let copDist = null, copEdge = -1, copFieldT = 0;
function updateCopField(dt) {
  copFieldT -= dt;
  if (copFieldT > 0 || player.stars === 0) return;
  copFieldT = 1;
  const ne = nearestEdge(player.x, player.z); if (ne.e < 0) return;
  const E = EDGES[ne.e], N = GN.length / 2, d = new Float64Array(N).fill(1e9), done = new Uint8Array(N);
  d[E.a] = ne.s; d[E.b] = E.len - ne.s;
  const heap = [[d[E.a], E.a], [d[E.b], E.b]];
  const hpush = (it) => { heap.push(it); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const hpop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  for (;;) {
    if (!heap.length) break;
    const [du, u] = hpop();
    if (done[u] || du > d[u]) continue;
    done[u] = 1;
    for (const o of PADJ.get(u) || []) { const O = EDGES[o.e]; if (!O) continue; const v = o.dir > 0 ? O.b : O.a, nd = d[u] + O.len; if (nd < d[v]) { d[v] = nd; hpush([nd, v]); } }
  }
  copDist = d; copEdge = ne.e;
}
function chooseNextChase(e, dir) {
  const E = EDGES[e], node = dir > 0 ? E.b : E.a;
  const opts = (PADJ.get(node) || []).filter((o) => o.e !== e && EDGES[o.e]);
  if (!opts.length || !copDist) return opts.length ? pick(opts) : { e, dir: -dir };
  let best = null, bc = 1e18;
  for (const o of opts) { const O = EDGES[o.e], c = o.e === copEdge ? 0 : O.len + copDist[o.dir > 0 ? O.b : O.a]; if (c < bc) { bc = c; best = o; } }
  return best;
}
function obstacleAhead(car, maxD) {
  const fx = Math.sin(car.h), fz = Math.cos(car.h), lx = Math.cos(car.h), lz = -Math.sin(car.h);
  let best = maxD;
  const test = (x, z, w) => {
    const dx = x - car.x, dz = z - car.z, al = dx * fx + dz * fz;
    if (al <= 0 || al >= best) return;
    if (Math.abs(dx * lx + dz * lz) < w) best = al;
  };
  for (const o of cars) if (o !== car && Math.abs(o.x - car.x) < maxD + 3 && Math.abs(o.z - car.z) < maxD + 3) test(o.x, o.z, 2.0);
  for (const p of peds) if (p.state !== 'down' && Math.abs(p.x - car.x) < maxD && Math.abs(p.z - car.z) < maxD) test(p.x, p.z, 1.6);
  if (player.mode === 'foot') test(player.x, player.z, 1.6);
  for (const t of trams) for (const md of t.mods) if (Math.abs(md.x - car.x) < maxD + 5 && Math.abs(md.z - car.z) < maxD + 5) test(md.x, md.z, 2.6);
  return best;
}
function attachToRoad(car) {
  const ne = nearestEdge(car.x, car.z);
  if (ne.e < 0) return false;
  const E = EDGES[ne.e];
  edgePoint(E, 1, ne.s, tmpA);
  let dir = tmpA.tx * Math.sin(car.h) + tmpA.tz * Math.cos(car.h) >= 0 ? 1 : -1;
  if (E.oneway && car.kind !== 'police') dir = 1;
  car.ai.e = ne.e; car.ai.dir = dir; car.ai.s = dir > 0 ? ne.s : E.len - ne.s; car.ai.next = null;
  return true;
}
function driveAI(car, dt) {
  const a = car.ai, chase = car.kind === 'police' && player.stars > 0;
  const tgt = player.mode === 'car' && player.car ? player.car : player;
  if (!EDGES[a.e]) { if (car.kind === 'police' && attachToRoad(car)) return; car.despawn = true; return; }
  if (a.next && !EDGES[a.next.e]) a.next = null;
  let E = EDGES[a.e];
  a.s = projectOnEdge(E, a.dir, car.x, car.z);
  edgePoint(E, a.dir, a.s, tmpA);
  if (Math.hypot(tmpA.x - car.x, tmpA.z - car.z) > 18) { attachToRoad(car); E = EDGES[a.e]; }
  if (chase && copDist && (a.route = (a.route || 0) - dt) <= 0) {
    a.route = 1;
    const fwd = a.e === copEdge ? 0 : E.len - a.s + copDist[a.dir > 0 ? E.b : E.a];
    const back = a.e === copEdge ? 0 : a.s + copDist[a.dir > 0 ? E.a : E.b];
    if (back + 30 < fwd) { a.dir = -a.dir; a.s = E.len - a.s; }
    a.next = chooseNextChase(a.e, a.dir);
  }
  if (!a.next) a.next = chase ? chooseNextChase(a.e, a.dir) : chooseNext(a.e, a.dir);
  if (a.s > E.len - 1.0) {
    if (a.next) {
      a.e = a.next.e; a.dir = a.next.dir; a.next = null; E = EDGES[a.e];
      a.s = projectOnEdge(E, a.dir, car.x, car.z);
      a.next = chase ? chooseNextChase(a.e, a.dir) : chooseNext(a.e, a.dir);
    } else if (car.kind !== 'police' && Math.hypot(car.x - player.x, car.z - player.z) > 90) { car.despawn = true; return; }
  }
  const spd = car.speed, inp = car.input;
  let tx, tz, vt;
  const dT = Math.hypot(tgt.x - car.x, tgt.z - car.z);
  const direct = chase && dT < 60 && rayWalls(car.x, car.z, tgt.x, tgt.z, 2) >= 1;
  if (direct) {
    const lead = clamp(dT / 25, 0, 1);
    tx = tgt.x + (tgt.vx || 0) * lead; tz = tgt.z + (tgt.vz || 0) * lead;
    vt = player.mode === 'foot' ? clamp((dT - 9) * 1.6, 0, 22) : 34;
  } else {
    const look = 4.5 + spd * 0.5;
    aiPoint(car, look, tmpA); tx = tmpA.x; tz = tmpA.z;
    aiPoint(car, look + 16, tmpB);
    const a1 = Math.abs(angDiff(car.h, Math.atan2(tx - car.x, tz - car.z))), a2 = Math.abs(angDiff(car.h, Math.atan2(tmpB.x - car.x, tmpB.z - car.z)));
    vt = (chase ? Math.max(32, (ROAD_SPEED[E.type] || 9) * 2.7) : (ROAD_SPEED[E.type] || 9) * a.mul) * clamp(1 - Math.max(a1, a2 * 0.8) * 1.1, 0.28, 1);
    if (!chase) { const rl = redLightAhead(car); if (rl < Infinity) vt = Math.min(vt, Math.max(0, (rl - 7) * 0.8)); }
  }
  const ang = angDiff(car.h, Math.atan2(tx - car.x, tz - car.z));
  if (a.rev > 0) { a.rev -= dt; inp.t = 0; inp.b = 1; inp.s = -Math.sign(ang); inp.hb = 0; return; }
  inp.s = clamp(ang * 2.4, -1, 1);
  if (a.shock > 0) { a.shock -= dt; vt = 0; }
  const lookD = chase ? 16 : 26, ahead = obstacleAhead(car, lookD);
  if (a.ignore > 0) a.ignore -= dt;
  else if (ahead < lookD) vt = Math.min(vt, Math.max(0, (ahead - (chase ? 3.5 : 6.5)) * 1.1));
  const vf = car.vf;
  if (vf < vt - 0.4) { inp.t = clamp((vt - vf) * 0.45, 0.25, 1); inp.b = 0; }
  else if (vf > vt + 0.8) { inp.t = 0; inp.b = clamp((vf - vt) * 0.25, 0.15, 1); }
  else { inp.t = 0.12; inp.b = 0; }
  inp.hb = 0;
  if (spd < 0.6 && vt > 2) a.stuck += dt; else a.stuck = Math.max(0, a.stuck - dt);
  if (a.stuck > 2.2) { a.stuck = 0; if (Math.abs(ang) > 1.2 || ahead > 10) a.rev = 1.4; else a.ignore = 2.5; }
  if (spd < 0.3 && vt < 0.5 && ahead < 10) { a.wait += dt; if (a.wait > 6) { a.ignore = 2.5; a.wait = 0; } } else a.wait = 0;
}

// ---------------------------------------------------------------- pedestrians (and cops on foot)
// states: walk, flee, down, getup, stagger, fight | cops: chase, dive, kneel, toCar
class Ped {
  constructor(x, z, e, dir, s, side, look) {
    this.look = look || { skin: pick(SKIN), hair: pick(HAIR), shirt: pick(SHIRT), shorts: pick(SHORTS) };
    this.m = makePerson(this.look); scene.add(this.m.root);
    this.x = x; this.z = z; this.y = 0; this.h = 0;
    this.e = e; this.dir = dir; this.s = s; this.side = side;
    this.speed = rr(1.1, 1.6); this.state = 'walk'; this.phase = rand() * TAU;
    this.vx = 0; this.vy = 0; this.vz = 0; this.flee = 0; this.downT = 0; this.downDur = 4; this.hard = false; this.faceDown = false;
    this.fx = 0; this.fz = 0; this.spin = 0; this.t = 0; this.hp = 2; this.cool = 0; this.punchT = 0;
    this.brave = rand() < 0.25; this.cop = false; this.car = null;
    this.m.root.position.set(x, groundAt(x, z), z);
  }
  knock(vx, vy, vz, hard, dur) {
    this.vx = vx; this.vy = vy; this.vz = vz; this.downT = 0; this.spin = rr(-5, 5);
    this.hard = this.hard || !!hard; this.downDur = dur || rr(2.5, 4.5); this.faceDown = false;
    if (this.state !== 'down') sfxNoise(0.25, 500, 0.35);
    this.state = 'down';
  }
  scare(fromX, fromZ, t) {
    if (this.state === 'down' || this.state === 'getup' || this.cop) return;
    const dx = this.x - fromX, dz = this.z - fromZ, d = Math.hypot(dx, dz) || 1;
    this.state = 'flee'; this.fx = dx / d; this.fz = dz / d; this.flee = t;
  }
  punched(hx, hz) {
    this.hp--;
    if (this.cop) addCrime(1, 'copPunch', true); else addCrime(1, 'punch');
    if (this.hp <= 0 || this.state === 'down') { this.knock(hx * 4, 2.5, hz * 4, false, rr(3, 5)); return; }
    this.state = 'stagger'; this.t = 0.45; this.vx = hx * 2.5; this.vz = hz * 2.5;
  }
  move(mx, mz, sp, dt) {
    this.x += mx * sp * dt; this.z += mz * sp * dt;
    if (resolveCircle(this.x, this.z, 0.32)) { this.x = hitRes.x; this.z = hitRes.z; if (this.state === 'flee') { this.fx += hitRes.nx; this.fz += hitRes.nz; const l = Math.hypot(this.fx, this.fz) || 1; this.fx /= l; this.fz /= l; } }
    if (mx || mz) this.h += angDiff(this.h, Math.atan2(mx, mz)) * Math.min(1, dt * 9);
    this.phase += dt * sp * 3.2;
    animatePerson(this.m, this.phase, Math.min(1.3, sp / 1.4));
  }
  update(dt) {
    const R = this.m.root, P = this.m;
    R.rotation.z = 0;
    if (this.state === 'down') {
      this.downT += dt;
      if (this.y > 0 || this.vy > 0) {
        this.vy -= 22 * dt; this.y += this.vy * dt;
        if (this.y <= 0) { this.y = 0; this.vy = 0; this.vx *= 0.35; this.vz *= 0.35; }
      } else { const k = Math.exp(-5 * dt); this.vx *= k; this.vz *= k; }
      this.x += this.vx * dt; this.z += this.vz * dt;
      if (resolveCircle(this.x, this.z, 0.3)) { this.x = hitRes.x; this.z = hitRes.z; this.vx *= -0.3; this.vz *= -0.3; }
      R.rotation.x = lerp(R.rotation.x, this.faceDown ? Math.PI / 2 : -Math.PI / 2, Math.min(1, dt * 7));
      R.rotation.y += this.spin * dt * (this.y > 0 ? 1 : 0);
      R.position.set(this.x, this.feet() + this.y + 0.13, this.z);
      animatePerson(P, 0, 0);
      if (!this.hard && this.downT > this.downDur) { this.state = 'getup'; this.t = 0; this.h = R.rotation.y; }
      if (this.hard && this.downT > 16) this.gone = true;
      return;
    }
    if (this.state === 'getup') {
      this.t += dt; const k = Math.min(1, this.t / 0.75);
      R.rotation.x = lerp(this.faceDown ? Math.PI / 2 : -Math.PI / 2, 0, k * k);
      R.position.set(this.x, this.feet() + 0.13 * (1 - k), this.z);
      animatePerson(P, 0, 0); P.legL.rotation.x = P.legR.rotation.x = -1.2 * (1 - k); P.armL.rotation.x = P.armR.rotation.x = -0.8 * (1 - k);
      if (k >= 1) { R.rotation.x = 0; if (this.cop) this.state = 'chase'; else if (this.brave && player.mode === 'foot') this.state = 'fight'; else this.scare(player.x, player.z, rr(4, 7)); }
      return;
    }
    if (this.state === 'stagger') {
      this.t -= dt; this.x += this.vx * dt; this.z += this.vz * dt; this.vx *= 0.9; this.vz *= 0.9;
      R.rotation.x = -0.3 * Math.sin(Math.max(0, this.t) / 0.45 * Math.PI);
      if (this.t <= 0) { R.rotation.x = 0; this.state = this.cop ? 'chase' : this.brave ? 'fight' : 'flee'; if (this.state === 'flee') this.scare(player.x, player.z, rr(4, 7)); }
      R.position.set(this.x, this.feet() + 0, this.z); R.rotation.y = this.h;
      return;
    }
    if (this.cop) { this.updateCop(dt); return; }
    let mx = 0, mz = 0, sp = this.speed;
    if (this.state === 'fight') {
      const dx = player.x - this.x, dz = player.z - this.z, d = Math.hypot(dx, dz) || 1;
      if (player.mode !== 'foot' || d > 25 || player.deadT > 0) { this.scare(player.x, player.z, 5); }
      else if (d > 1.1) { mx = dx / d; mz = dz / d; sp = 3.6; }
      else {
        this.h += angDiff(this.h, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
        this.cool -= dt;
        if (this.cool <= 0 && player.state === 'foot') { this.cool = 1.1; this.punchT = 0.35; }
      }
      if (this.punchT > 0) {
        const before = this.punchT; this.punchT -= dt;
        if (before > 0.17 && this.punchT <= 0.17 && d < 1.5 && player.state === 'foot') { damagePlayer(6); sfxNoise(0.08, 1800, 0.18); shake = Math.min(1, shake + 0.15); player.kx = dx / d * 1.5; player.kz = dz / d * 1.5; }
      }
    } else if (this.state === 'flee') {
      this.flee -= dt; sp = this.home ? 3.4 : 4.8; mx = this.fx; mz = this.fz;
      if (this.home && this.calling > 0) { this.updateHome(dt); sp = 1.6; } // backing away with the phone out
      if (this.flee <= 0 && this.home) this.state = 'walk';
      else if (this.flee <= 0) {
        const ne = nearestEdge(this.x, this.z);
        if (ne.e >= 0) { this.e = ne.e; this.dir = rand() < 0.5 ? 1 : -1; this.s = this.dir > 0 ? ne.s : EDGES[ne.e].len - ne.s; }
        this.state = 'walk';
      }
    } else if (this.home) {
      const m = this.updateHome(dt); if (m === 0) return;
      if (!m) { R.position.set(this.x, this.feet(), this.z); R.rotation.set(0, this.h, 0); return; }
      [mx, mz] = m; sp = 0.9;
    } else {
      const E = EDGES[this.e];
      if (!E) { this.gone = true; return; }
      this.s += sp * dt;
      if (this.s >= E.len) {
        const node = this.dir > 0 ? E.b : E.a, opts = (PADJ.get(node) || []).filter((o) => o.e !== this.e && EDGES[o.e]);
        const o = opts.length ? pick(opts) : { e: this.e, dir: -this.dir };
        if (!opts.length) this.side = -this.side;
        this.e = o.e; this.dir = o.dir; this.s = 0;
      }
      const E2 = EDGES[this.e];
      edgePoint(E2, this.dir, Math.min(this.s + 1.5, E2.len), tmpA);
      const off = (E2.width / 2 + 1.7) * this.side;
      const tx = tmpA.x + tmpA.tz * off, tz = tmpA.z - tmpA.tx * off;
      const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz) || 1;
      mx = dx / d; mz = dz / d;
      if (d > 4) this.s -= sp * dt * 0.8;
      const pc = player.mode === 'car' ? player.car : null;
      if (pc && pc.speed > 6) {
        const rx = this.x - pc.x, rz = this.z - pc.z, rd = Math.hypot(rx, rz);
        if (rd < 14 && (rx * pc.vx + rz * pc.vz) / (pc.speed * rd) > 0.85) this.scare(pc.x, pc.z, 1.5);
      }
    }
    this.move(mx, mz, sp, dt);
    if (this.punchT > 0) P.armR.rotation.x = -1.5 * Math.sin((1 - this.punchT / 0.35) * Math.PI);
    R.position.set(this.x, this.feet() + 0, this.z); R.rotation.set(0, this.h, 0);
  }
  updateCop(dt) {
    const R = this.m.root, P = this.m;
    const tgt = player.mode === 'car' && player.car ? player.car : player;
    const dx = tgt.x - this.x, dz = tgt.z - this.z, d = Math.hypot(dx, dz) || 1;
    if (this.state === 'dive') {
      this.t -= dt;
      this.x += this.fx * 7 * dt; this.z += this.fz * 7 * dt;
      if (resolveCircle(this.x, this.z, 0.32)) { this.x = hitRes.x; this.z = hitRes.z; }
      const k = 1 - Math.max(0, this.t) / 0.45;
      R.rotation.set(Math.min(1.45, k * 2.2), this.h, 0); R.position.set(this.x, groundAt(this.x, this.z) + 0.15 + Math.sin(k * Math.PI) * 0.5, this.z);
      P.armL.rotation.x = P.armR.rotation.x = -2.8; P.legL.rotation.x = P.legR.rotation.x = 0.3;
      if (this.t <= 0) {
        if (player.state === 'foot' && player.deadT === 0 && Math.hypot(player.x - this.x, player.z - this.z) < 1.9) startTackle(this);
        else { this.faceDown = true; this.state = 'down'; this.downT = 0; this.downDur = 1.0; this.vx = this.vy = this.vz = 0; this.y = 0; R.rotation.x = Math.PI / 2; }
      }
      return;
    }
    if (this.state === 'kneel') return; // posed by the arrest code
    let mx = 0, mz = 0, sp = 0;
    this.copCanShoot = false;
    if (this.state === 'toCar') {
      const c = this.car;
      if (!c || c.dead || cars.indexOf(c) < 0) { this.state = 'chase'; return; }
      const cx = c.x - this.x, cz = c.z - this.z, cd = Math.hypot(cx, cz) || 1;
      if (cd < 2.6) { c.setDriver('cop', COP_LOOK); c.copOut = null; c.doorTarget[0] = 1; setTimeout(() => (c.doorTarget[0] = 0), 500); this.gone = true; return; }
      mx = cx / cd; mz = cz / cd; sp = 6.6;
      const pc = player.mode === 'car' ? player.car : null;
      if (player.stars > 0 && (!pc || pc.speed < 3) && d < 40) this.state = 'chase';
    } else { // chase
      if (player.stars === 0) { this.state = 'toCar'; return; }
      const pc = player.mode === 'car' ? player.car : null;
      if ((pc && pc.speed > 5 && d > 6) || d > 70) { if (this.car && !this.car.dead) { this.state = 'toCar'; return; } }
      if (player.state === 'tackled' || player.state === 'cuffed') { if (d > 2.2) { mx = dx / d; mz = dz / d; sp = 4; } }
      else if (pc && player.state === 'car' && pc.speed < 1.5 && d < 2.8) { dragOut(this); }
      else if (player.stars >= 3 && d < 26 && d > 2.3 && player.deadT === 0 && rayWalls(this.x, this.z, tgt.x, tgt.z, 2) >= 1) {
        this.copCanShoot = true; this.h += angDiff(this.h, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
        if (d > 11) { mx = dx / d; mz = dz / d; sp = 3.5; }
      }
      else if (player.state === 'foot' && d < 2.3 && player.deadT === 0) { this.state = 'dive'; this.t = 0.45; this.fx = dx / d; this.fz = dz / d; this.h = Math.atan2(dx, dz); sfxNoise(0.15, 600, 0.2); return; }
      else { mx = dx / d; mz = dz / d; sp = 6.6; }
    }
    this.move(mx, mz, sp, dt);
    R.position.set(this.x, groundAt(this.x, this.z) + 0, this.z); R.rotation.set(0, this.h, 0);
  }
  feet() { return this.home && inRing(this.x, this.z, this.home.f) ? this.home.floorY : groundAt(this.x, this.z); }
  // people at home: potter between rooms; a stranger inside makes them fight or run and phone the police
  updateHome(dt) {
    const H = this.home, dx = player.x - this.x, dz = player.z - this.z, d = Math.hypot(dx, dz);
    const intruder = player.state === 'foot' && (houseAt(player.x, player.z) === H ? d < 9 : d < 4 && rayWalls(this.x, this.z, player.x, player.z, 1.5) >= 1);
    if (intruder && !this.alerted) {
      this.alerted = true; sfxNoise(0.3, 1400, 0.25);
      if (this.brave) { this.state = 'fight'; toast('“Get out of my house!”'); return 0; }
      this.scare(player.x, player.z, rr(2, 4)); if (!H.called) { this.calling = 3.5; toast('Someone inside is phoning the police — stop them!'); }
    }
    if (this.calling > 0) {
      this.calling -= dt;
      if (this.calling <= 0 && !H.called) { H.called = true; addCrime(1, 'breakin', true); toast('The resident called the cops!'); }
    }
    if (this.idle > 0) { this.idle -= dt; animatePerson(this.m, this.phase, 0); return null; }
    if (!this.goal || Math.hypot(this.goal[0] - this.x, this.goal[1] - this.z) < 0.5) {
      this.idle = rr(1.5, 6);
      for (let k = 0; k < 12; k++) { const x = rr(H.x0, H.x1), z = rr(H.z0, H.z1); if (inRing(x, z, H.f)) { this.goal = [x, z]; break; } }
      return null;
    }
    const gx = this.goal[0] - this.x, gz = this.goal[1] - this.z, gd = Math.hypot(gx, gz) || 1;
    if (rand() < dt * 0.15) this.goal = null; // a wall in the way: pick somewhere else now and then
    return [gx / gd, gz / gd];
  }
  remove() { disposePerson(this.m); const i = peds.indexOf(this); if (i >= 0) peds.splice(i, 1); }
}
function carsVsPeople() {
  for (const c of cars) {
    const sp = c.speed; if (sp < 0.5) continue;
    const fx = Math.sin(c.h), fz = Math.cos(c.h), lx = Math.cos(c.h), lz = -Math.sin(c.h), hl = c.spec.L / 2 + 0.3, hw = c.spec.W / 2 + 0.3;
    const hit = (px, pz) => { const dx = px - c.x, dz = pz - c.z; if (Math.abs(dx) > 4 || Math.abs(dz) > 4) return null; const al = dx * fx + dz * fz, la = dx * lx + dz * lz; return Math.abs(al) < hl && Math.abs(la) < hw ? { al, la } : null; };
    for (const p of peds) {
      if (p.state === 'down' && p.y > 0) continue;
      if (p.state === 'kneel') continue;
      const h = hit(p.x, p.z); if (!h) continue;
      if (sp > 3.5) {
        p.knock(c.vx * 0.85 + lx * Math.sign(h.la) * 2, 2 + sp * 0.22, c.vz * 0.85 + lz * Math.sign(h.la) * 2, sp > 11);
        c.vx *= 0.93; c.vz *= 0.93;
        if (c === player.car) {
          scareNear(p.x, p.z, 25);
          if (sp > 7) { // under ~25 km/h it's an accident: they fall over and swear at you
            pedHits = pedHits.filter((t) => elapsed - t < 6); pedHits.push(elapsed);
            if (pedHits.length >= 3) addCrime(2, 'crowd', true); else addCrime(1, p.cop ? 'copHit' : 'ped', p.cop);
          } else if (rand() < 0.5) toast(pick(['"Watch where you\'re going!"', '"Oi! Learn to drive!"', '"Are you serious?!"']));
        }
      } else { const push = hw - Math.abs(h.la) + 0.05; p.x += lx * Math.sign(h.la) * push; p.z += lz * Math.sign(h.la) * push; }
    }
    if (player.state === 'foot' && c !== player.car && player.deadT === 0) {
      const h = hit(player.x, player.z);
      if (h) {
        if (sp > 5) {
          damagePlayer((sp - 4) * 4.5);
          knockPlayer(c.vx * 0.7 + lx * Math.sign(h.la) * 3, c.vz * 0.7 + lz * Math.sign(h.la) * 3);
          sfxNoise(0.3, 450, 0.45); shake = Math.min(1, shake + 0.4);
        } else { const push = hw - Math.abs(h.la) + 0.05; player.x += lx * Math.sign(h.la) * push; player.z += lz * Math.sign(h.la) * push; }
      }
    }
  }
}
function scareNear(x, z, r) { for (const p of peds) if (Math.hypot(p.x - x, p.z - z) < r) p.scare(x, z, rr(3, 6)); }

// ---------------------------------------------------------------- spawning
const PARK_SPOTS = [];
function buildParkSpots() {
  for (const E of EDGES) {
    if (E.oneway || !(E.type === RT.residential || E.type === RT.tertiary || E.type === RT.unclassified) || E.width < 6) continue;
    for (const side of [1, -1]) {
      for (let s = rr(8, 20); s < E.len - 8; s += rr(14, 42)) {
        edgePoint(E, 1, s, tmpA);
        const off = (E.width / 2 - 1.0) * side, x = tmpA.x + tmpA.tz * off, z = tmpA.z - tmpA.tx * off;
        if (!isLand(x, z) || resolveCircle(x, z, 1.2)) continue;
        PARK_SPOTS.push({ x, z, h: Math.atan2(tmpA.tx * side, tmpA.tz * side), used: false });
      }
    }
  }
}
function randomCarType() {
  const r = rand();
  return r < 0.24 ? 'sedan' : r < 0.4 ? 'hatch' : r < 0.55 ? 'suv' : r < 0.69 ? 'ute' : r < 0.77 ? 'taxi' : r < 0.85 ? 'muscle' : r < 0.93 ? 'coupe' : 'sports';
}
function spawnTraffic(minD, maxD, kind) {
  for (let tries = 0; tries < 40; tries++) {
    const ei = LIVE_EDGES[Math.floor(rand() * LIVE_EDGES.length)], E = EDGES[ei];
    if (!E || E.len < 10) continue;
    const s = rr(2, E.len - 2);
    edgePoint(E, 1, s, tmpA);
    const d = Math.hypot(tmpA.x - player.x, tmpA.z - player.z);
    if (d < minD || d > maxD) continue;
    const dir = E.oneway ? 1 : rand() < 0.5 ? 1 : -1;
    const ai = { e: ei, dir, s: dir > 0 ? s : E.len - s, next: null, lane: Math.floor(rand() * 3), mul: rr(0.85, 1.12), stuck: 0, wait: 0, rev: 0, ignore: 0, shock: 0 };
    edgePoint(E, dir, ai.s, tmpB);
    const off = kind === 'police' ? 0 : laneOffset(E, ai, false);
    const x = tmpB.x + tmpB.tz * off, z = tmpB.z - tmpB.tx * off;
    if (!isLand(x, z) || insideSolid(x, z, solidBuildingsNear(x, z, 2))) continue; // not on a road that runs through a car park or under a building
    if (cars.some((c) => Math.abs(c.x - x) < 9 && Math.abs(c.z - z) < 9)) continue;
    const c = new Car(kind === 'police' ? 'police' : randomCarType(), null, x, z, Math.atan2(tmpB.tx, tmpB.tz));
    c.kind = kind; c.setDriver(kind === 'police' ? 'cop' : 'ai', kind === 'police' ? COP_LOOK : randomLook()); c.ai = ai; c.siren = kind === 'police' && player.stars > 0;
    const v = (ROAD_SPEED[E.type] || 9) * 0.7; c.vx = tmpB.tx * v; c.vz = tmpB.tz * v;
    cars.push(c);
    return c;
  }
  return null;
}
function spawnParked(maxD, minD) {
  let n = cars.filter((c) => c.kind === 'parked').length;
  for (const sp of PARK_SPOTS) {
    if (n >= 34) break;
    if (sp.used) continue;
    const d = Math.hypot(sp.x - player.x, sp.z - player.z);
    if (d > maxD || d < minD) continue;
    if (rand() < 0.5) continue;
    if (cars.some((c) => Math.abs(c.x - sp.x) < 5 && Math.abs(c.z - sp.z) < 5)) continue;
    const t = randomCarType();
    const c = new Car(t === 'taxi' ? 'sedan' : t, null, sp.x, sp.z, sp.h);
    c.kind = 'parked'; c.spot = sp; sp.used = true; cars.push(c); n++;
  }
}
function spawnPed(minD, maxD) {
  for (let tries = 0; tries < 30; tries++) {
    const ei = LIVE_EDGES[Math.floor(rand() * LIVE_EDGES.length)], E = EDGES[ei];
    if (!E) continue;
    const s = rr(0, E.len), side = rand() < 0.5 ? 1 : -1;
    edgePoint(E, 1, s, tmpA);
    const off = (E.width / 2 + 1.7) * side, x = tmpA.x + tmpA.tz * off, z = tmpA.z - tmpA.tx * off;
    const d = Math.hypot(x - player.x, z - player.z);
    if (d < minD || d > maxD || !isLand(x, z) || insideSolid(x, z, solidBuildingsNear(x, z, 2))) continue;
    const dir = rand() < 0.5 ? 1 : -1;
    const p = new Ped(x, z, ei, dir, dir > 0 ? s : E.len - s, side * dir);
    peds.push(p); return p;
  }
  return null;
}
let spawnT = 0;
function manageWorld(dt) {
  spawnT -= dt; if (spawnT > 0) return; spawnT = 0.4;
  for (const c of cars.slice()) {
    const d = Math.hypot(c.x - player.x, c.z - player.z);
    if (c === player.car || (player.seq && player.seq.car === c)) continue;
    if (c.despawn ||
      (c.kind === 'traffic' && d > 430) || (c.kind === 'parked' && d > 250) || (c.kind === 'abandoned' && d > 360) ||
      (c.kind === 'police' && player.stars === 0 && d > 200 && !c.copOut) || (c.kind === 'police' && d > 600) || (c.dead && c.deadT > 30 && d > 70)) c.remove();
  }
  for (const p of peds.slice()) if (p.gone || Math.hypot(p.x - player.x, p.z - player.z) > (p.cop ? 160 : 190)) { if (p.cop && p.car) p.car.copOut = null; p.remove(); }
  if (cars.filter((c) => c.kind === 'traffic').length < 40) spawnTraffic(150, 330, 'traffic');
  spawnParked(190, 70);
  if (peds.filter((p) => !p.cop).length < 46) { spawnPed(60, 150); spawnPed(60, 150); }
  const want = [0, 1, 2, 4, 6, 8][player.stars];
  if (cars.filter((c) => c.kind === 'police' && !c.dead).length < want) spawnTraffic(110, 240, 'police');
  for (const c of cars) if (c.kind === 'police') c.siren = player.stars > 0 && (c.driver === 'cop' || !!c.copOut);
}

// ---------------------------------------------------------------- cash pickups
const coinMat = new THREE.MeshStandardMaterial({ color: col('#f6c445'), emissive: col('#8a5a00'), emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.25 });
const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.09, 24).rotateX(Math.PI / 2);
function placePickup(pk) {
  for (let t = 0; t < 50; t++) {
    const E = EDGES[pick(LIVE_EDGES)]; if (!E) continue; edgePoint(E, 1, rr(0, E.len), tmpA);
    const side = rand() < 0.5 ? 1 : -1, off = (E.width / 2 + 1.6) * side, x = tmpA.x + tmpA.tz * off, z = tmpA.z - tmpA.tx * off;
    if (isLand(x, z) && !resolveCircle(x, z, 0.6)) { pk.x = x; pk.z = z; pk.value = Math.round(rr(5, 30)) * 10; pk.m.position.set(x, groundAt(x, z) + 1, z); return; }
  }
}
function buildPickups() {
  for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(coinGeo, coinMat); m.castShadow = true; scene.add(m); const pk = { m, x: 0, z: 0, value: 0 }; placePickup(pk); pickups.push(pk); }
}
function updatePickups(dt) {
  for (const pk of pickups) {
    pk.m.rotation.y += dt * 2.5; pk.m.position.y = groundAt(pk.x, pk.z) + 1 + Math.sin(elapsed * 2 + pk.x) * 0.15;
    const r = player.mode === 'car' ? 2.6 : 1.3;
    if (player.deadT === 0 && Math.abs(pk.x - player.x) < r && Math.abs(pk.z - player.z) < r) {
      player.money += pk.value; toast(`+$${pk.value}`); sfxTone([988, 1319], 0.18, 0.08, 'triangle');
      placePickup(pk);
    }
  }
}

// ---------------------------------------------------------------- drifting
const drift = { score: 0, timer: 0, active: false };
function updateDrift(dt) {
  const c = player.state === 'car' ? player.car : null;
  const el = $('drift');
  if (c && !c.dead) {
    const sin = Math.sin(c.h), cos = Math.cos(c.h), vf = c.vx * sin + c.vz * cos, vl = c.vx * cos - c.vz * sin, sp = Math.hypot(vf, vl);
    const beta = Math.abs(Math.atan2(vl, Math.max(0.1, vf)));
    if (sp > 8 && beta > 0.28 && beta < 1.7 && vf > 2) { drift.score += dt * sp * beta * 9; drift.timer = 0.8; drift.active = true; }
  }
  if (drift.active) {
    drift.timer -= dt;
    el.textContent = 'DRIFT ' + Math.floor(drift.score).toLocaleString();
    el.style.opacity = 1;
    if (drift.timer <= 0) {
      drift.active = false;
      if (drift.score >= 150) { const cash = Math.round(drift.score / 25); player.money += cash; toast(`Drift ${Math.floor(drift.score).toLocaleString()} · +$${cash}`); sfxTone([660, 880], 0.2, 0.06, 'triangle'); }
      drift.score = 0; el.style.opacity = 0;
    }
  }
}
function driftCrash() { if (drift.active && drift.score > 100) { toast('Drift ruined!'); } drift.score = 0; drift.timer = 0; drift.active = false; $('drift').style.opacity = 0; }

// ---------------------------------------------------------------- wanted level and arrests
// How serious each crime is (the stars it brings). During a chase only serious crimes push the level up:
// shooting, attacking police, or ploughing through a crowd. Five stars come only from fighting the police at four.
const CRIME_LEVEL = { ped: 1, punch: 1, breakin: 1, trespass: 1, jack: 1, rob: 1, alarm: 1, police: 1, resist: 1, copHit: 3, copPunch: 3,
  shots: 2, robDone: 2, crowd: 2, shootPed: 3, shootCop: 3 };
const CRIME_TEXT = { ped: 'you hit someone with your car', punch: 'you punched someone', breakin: 'breaking into a house', trespass: 'jumping a fence',
  jack: 'stealing a car', rob: 'robbing a shop', alarm: 'setting off an alarm', police: 'ramming a police car', resist: 'resisting arrest', copHit: 'running down a cop',
  copPunch: 'attacking a cop', shots: 'firing a gun near people', robDone: 'a robbery', crowd: 'hitting a crowd of people', shootPed: 'shooting someone', shootCop: 'shooting at the police' };
const WITNESS_CRIMES = new Set(['ped', 'punch', 'breakin', 'trespass', 'jack', 'shots', 'shootPed', 'rob']); // someone has to see these and phone them in
const COP_ATTACK = new Set(['copHit', 'copPunch', 'shootCop']);
let crimeCool = {}, reports = [], searchArea = null, wantedT = 0, lastSeen = { x: 0, z: 0 }, pedHits = [];
function copCanSee(x, z) {
  for (const p of peds) if (p.cop && p.state !== 'down' && Math.hypot(p.x - x, p.z - z) < 40 && rayWalls(p.x, p.z, x, z, 1.5) >= 1) return true;
  for (const c of cars) if (c.kind === 'police' && !c.dead && c.driver === 'cop' && Math.hypot(c.x - x, c.z - z) < 55 && rayWalls(c.x, c.z, x, z, 1.5) >= 1) return true;
  return false;
}
function addCrime(stars, what, direct) {
  if ((crimeCool[what] || 0) > elapsed) return;
  crimeCool[what] = elapsed + (what === 'ped' ? 1.5 : 3);
  const level = Math.max(stars, CRIME_LEVEL[what] || 1);
  // not wanted yet and no cop saw it: it only counts if a witness phones it in
  if (!direct && player.stars === 0 && WITNESS_CRIMES.has(what) && !copCanSee(player.x, player.z)) {
    let w = null, bd = 30;
    for (const p of peds) if (!p.cop && p.state !== 'down' && !reports.some((r) => r.p === p)) { const d = Math.hypot(p.x - player.x, p.z - player.z); if (d < bd && rayWalls(p.x, p.z, player.x, player.z, 1.5) >= 1) { bd = d; w = p; } }
    if (!w) return; // nobody saw it
    reports.push({ p: w, t: 4, level, what, icon: phoneIcon() });
    toast('Someone saw that and is phoning the cops — get away or stop them!');
    return;
  }
  raiseWanted(level, what);
}
function raiseWanted(level, what) {
  const before = player.stars;
  let next = before;
  if (level > before) next = level;
  else if (before > 0 && (level >= 3 || what === 'crowd')) next = before + 1; // only serious crimes stack during a chase
  if (next >= 5 && !(before >= 4 && COP_ATTACK.has(what))) next = Math.min(next, 4); // five stars: fighting the police at four
  next = clamp(next, 0, 5);
  wantedT = 0; player.starCool = 0; searchArea = null;
  if (next > before) { player.stars = next; sfxTone([220, 180], 0.25, 0.05, 'sawtooth'); toast(`Wanted ${'★'.repeat(next)} — ${CRIME_TEXT[what] || 'a crime'}`); }
}
let PHONE_TEX = null;
function phoneIcon() {
  if (!PHONE_TEX) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#ffcf3f'; x.beginPath(); x.arc(32, 32, 30, 0, TAU); x.fill(); x.font = '40px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('📞', 32, 35); PHONE_TEX = new THREE.CanvasTexture(c); }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: PHONE_TEX, depthTest: false })); s.scale.set(0.7, 0.7, 1); s.renderOrder = 15; scene.add(s); return s;
}
// hands up (G) at one or two stars with police nearby: pay a fine instead of being busted
function surrender() {
  if (player.stars === 0) return;
  if (player.stars > 2) { toast('Too serious for a fine — you have to lose them'); return; }
  const copNear = cars.some((c) => c.kind === 'police' && !c.dead && Math.hypot(c.x - player.x, c.z - player.z) < 60) || peds.some((p) => p.cop && Math.hypot(p.x - player.x, p.z - player.z) < 60);
  if (!copNear) { toast('No police nearby to give yourself up to'); return; }
  const fine = 75 * player.stars, fromWallet = Math.min(player.money, fine), fromBank = Math.min(ECON.bank, fine - fromWallet);
  player.money -= fromWallet; ECON.bank -= fromBank; player.stars = 0; searchArea = null; saveGame();
  toast(`Hands up. You paid a $${fromWallet + fromBank} fine and walked away.`);
}
function updateWanted(dt) {
  // witnesses on the phone: get far away, or knock them down / scare them off, before they finish the call
  for (const r of reports.slice()) {
    r.t -= dt; const p = r.p, gone = !peds.includes(p) || p.state === 'down' || Math.hypot(p.x - player.x, p.z - player.z) > 55;
    if (!gone) r.icon.position.set(p.x, standAt(p.x, p.z) + 2.4 + Math.sin(elapsed * 6) * 0.06, p.z);
    if (gone || r.t <= 0) {
      scene.remove(r.icon); r.icon.material.dispose(); reports.splice(reports.indexOf(r), 1);
      if (gone && r.t > 0) toast('The call never went through'); else raiseWanted(r.level, r.what);
    }
  }
  if (player.stars === 0) { searchArea = null; return; }
  wantedT += dt;
  let near = 1e9;
  for (const c of cars) if (c.kind === 'police' && !c.dead && c.driver === 'cop') { const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < near && (d < 25 || rayWalls(c.x, c.z, player.x, player.z, 2) >= 1)) near = d; }
  for (const p of peds) if (p.cop && p.state !== 'down') { const d = Math.hypot(p.x - player.x, p.z - player.z); if (d < 25 || rayWalls(p.x, p.z, player.x, player.z, 1.5) >= 1) near = Math.min(near, d); }
  const seen = near < 80 || player.state === 'tackled' || player.state === 'cuffed';
  $('stars').classList.toggle('flash', !seen);
  if (seen) { lastSeen = { x: player.x, z: player.z }; searchArea = null; player.starCool = 0; }
  else {
    // the police search around where they last saw you: leave the circle and stay hidden (indoors counts double)
    if (!searchArea) searchArea = { x: lastSeen.x, z: lastSeen.z, r: 70 + 45 * player.stars };
    const out = Math.hypot(player.x - searchArea.x, player.z - searchArea.z) > searchArea.r;
    const indoors = !!(indoorAt(player.x, player.z) || shopAt(player.x, player.z));
    if (out || indoors) player.starCool += dt * (indoors ? 2 : 1);
    if (player.starCool > [0, 5, 8, 12, 16, 22][player.stars]) { player.stars = 0; searchArea = null; toast('You lost the cops'); return; }
  }
  if (player.stars === 1 && wantedT > 30 && player.state !== 'tackled' && player.state !== 'cuffed') { player.stars = 0; searchArea = null; toast('The cops gave up'); return; }
  // backup on foot only for serious chases, and never appearing right in front of you
  if (near > 45) player.noCopT = (player.noCopT || 0) + dt; else player.noCopT = 0;
  if (player.stars >= 3 && player.noCopT > 15 && peds.filter((p) => p.cop).length < player.stars) {
    player.noCopT = 0;
    for (let i = 0; i < player.stars - 2; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const a = rand() * TAU, r = rr(45, 65), x = player.x + Math.cos(a) * r, z = player.z + Math.sin(a) * r;
        if (!isLand(x, z) || resolveCircle(x, z, 0.5) || rayWalls(x, z, player.x, player.z, 1.5) >= 1) continue; // out of your sight
        const cop = new Ped(x, z, 0, 1, 0, 1, COP_LOOK); cop.cop = true; cop.state = 'chase'; cop.hp = 3; peds.push(cop);
        break;
      }
    }
  }
  // cops get out of stopped cars near you and come on foot
  const onFoot = peds.filter((p) => p.cop).length;
  if (onFoot < 4) for (const c of cars) {
    if (c.kind !== 'police' || c.driver !== 'cop' || c.copOut || c.dead) continue;
    const d = Math.hypot(c.x - player.x, c.z - player.z);
    const pc = player.mode === 'car' ? player.car : null;
    if (d < 45 && c.speed < 3 && (!pc || pc.speed < 4)) {
      const dp = carDoorPoint(c);
      const cop = new Ped(dp.x, dp.z, 0, 1, 0, 1, COP_LOOK);
      cop.cop = true; cop.car = c; cop.state = 'chase'; cop.hp = 3; cop.h = c.h - Math.PI / 2;
      peds.push(cop);
      c.copOut = cop; c.setDriver(null); c.doorTarget[0] = 1; setTimeout(() => { if (c.model) c.doorTarget[0] = 0; }, 700);
      break;
    }
  }
}
function dragOut(cop) {
  if (player.state !== 'car') return;
  toast('The cops pulled you out!');
  startExit(cop);
}
function startTackle(cop) {
  player.state = 'tackled'; player.t = 0; player.seq = { cop, p: 0.3, time: 3.4 };
  player.kx = player.kz = 0; player.vy = 0; player.y = 0;
  cop.state = 'kneel';
  sfxNoise(0.35, 300, 0.5); shake = Math.min(1, shake + 0.5);
  $('struggle').hidden = false;
}
function updateTackled(dt) {
  const q = player.seq, P = player.model, cop = q.cop;
  player.t += dt; q.time -= dt; q.p = Math.max(0, q.p - 0.2 * dt);
  P.root.rotation.set(Math.min(Math.PI / 2, player.t * 7), player.h, 0); P.root.position.set(player.x, standAt(player.x, player.z) + 0.13, player.z);
  animatePerson(P, 0, 0); P.armL.rotation.x = P.armR.rotation.x = -0.6 + Math.sin(elapsed * 18) * 0.25;
  if (cop && cop.m) { // cop kneels on your back
    const rx = Math.cos(player.h), rz = -Math.sin(player.h);
    cop.x = player.x + rx * 0.55; cop.z = player.z + rz * 0.55; cop.h = player.h - Math.PI / 2;
    const R = cop.m.root; R.position.set(cop.x, groundAt(cop.x, cop.z) - 0.42, cop.z); R.rotation.set(0.35, cop.h, 0);
    cop.m.legL.rotation.x = -1.5; cop.m.legR.rotation.x = 0.2; cop.m.armL.rotation.x = cop.m.armR.rotation.x = -1.0;
  }
  $('struggle-bar').style.width = Math.round(q.p * 100) + '%';
  $('struggle-time').style.width = Math.round(clamp(q.time / 3.4, 0, 1) * 100) + '%';
  if (q.p >= 1) { // broke free
    $('struggle').hidden = true;
    if (cop) { cop.state = 'down'; cop.knock(Math.cos(player.h) * 5, 2, -Math.sin(player.h) * 5, false, 3); }
    player.state = 'getup'; player.t = 0; addCrime(1, 'resist', true); toast('You broke free — run!');
  } else if (q.time <= 0) {
    $('struggle').hidden = true;
    player.state = 'cuffed'; player.t = 0; sfxTone([2400, 3100], 0.08, 0.06, 'square'); toast('Cuffed');
  }
}
function struggleTap() { if (player.state === 'tackled') { player.seq.p += 0.12; shake = Math.min(1, shake + 0.05); } }
function updateCuffed(dt) {
  const P = player.model, q = player.seq; player.t += dt;
  P.root.rotation.set(Math.PI / 2, player.h, 0); P.root.position.set(player.x, standAt(player.x, player.z) + 0.13, player.z);
  animatePerson(P, 0, 0); P.armL.rotation.set(0.9, 0, -0.5); P.armR.rotation.set(0.9, 0, 0.5);
  if (q.cop && q.cop.m) { q.cop.m.armL.rotation.x = q.cop.m.armR.rotation.x = -0.4 - Math.sin(player.t * 6) * 0.3; }
  if (player.t > 2.6) endLife('busted');
}

// ---------------------------------------------------------------- player
let playerSpot = null;
function rebuildPlayer() {
  const vis = player.model ? player.model.root.visible : true;
  if (player.model) disposePerson(player.model);
  player.model = makePerson(player.look); scene.add(player.model.root);
  player.model.root.visible = vis;
  if (player.car && player.state === 'car') setDriverLook(player.car.model, player.look);
  attachGun();
}
function sidewalkNear(x, z) {
  const ne = nearestEdge(x, z); const E = EDGES[ne.e];
  edgePoint(E, 1, ne.s, tmpA);
  for (const side of [1, -1]) {
    const off = (E.width / 2 + 1.8) * side, px = tmpA.x + tmpA.tz * off, pz = tmpA.z - tmpA.tx * off;
    if (isLand(px, pz) && !resolveCircle(px, pz, 0.5) && !insideSolid(px, pz, solidBuildingsNear(px, pz, 2))) return { x: px, z: pz, h: Math.atan2(tmpA.tx, tmpA.tz) };
  }
  const P = freeSpotNear(tmpA.x, tmpA.z, 120);
  return P ? { x: P[0], z: P[1], h: Math.atan2(tmpA.tx, tmpA.tz) } : { x: tmpA.x, z: tmpA.z, h: 0 };
}
function damagePlayer(n) {
  if (player.deadT > 0) return;
  player.health -= n;
  if (player.health <= 0) { player.health = 0; endLife('wasted'); }
}
function knockPlayer(vx, vz) {
  if (player.deadT > 0 || player.state === 'tackled' || player.state === 'cuffed') return;
  if (player.state !== 'foot' && player.state !== 'getup' && player.state !== 'down') return;
  player.state = 'down'; player.t = 0; player.kx = vx; player.kz = vz; player.vy = 3.5;
}
function endLife(kind) {
  if (player.deadT > 0) return;
  player.deadT = 0.001; player.endKind = kind;
  const big = $('big'); big.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED'; big.className = 'hud ' + kind; big.style.opacity = 1;
  $('struggle').hidden = true;
  if (player.state === 'car') bailOut();
  if (kind === 'wasted') { player.model.root.rotation.x = -Math.PI / 2; player.model.root.position.y = 0.13; }
}
function respawn() {
  const kind = player.endKind, lm = MAP.landmarks;
  const at = kind === 'busted' && lm['Surfers Paradise Police Centre'] ? lm['Surfers Paradise Police Centre'] : [playerSpot.x, playerSpot.z];
  const s = sidewalkNear(at[0], at[1]);
  player.x = s.x; player.z = s.z; player.y = 0; player.h = s.h; camYaw = s.h;
  player.health = 100; player.stars = 0; player.deadT = 0; player.state = 'foot'; player.mode = 'foot'; player.car = null; player.seq = null;
  const fee = Math.min(player.money, 100); player.money -= fee;
  if (kind === 'busted' && Object.keys(player.weapons).length) { player.weapons = {}; player.weapon = 'fist'; attachGun(); }
  saveGame();
  player.model.root.rotation.set(0, player.h, 0); player.model.root.visible = true;
  $('big').style.opacity = 0;
  toast(kind === 'busted' ? `Released from Surfers Paradise Police Centre · -$${fee}${player.weapon === 'fist' ? ' · weapons confiscated' : ''}` : `Back on Cavill Mall · hospital bill -$${fee}`);
  for (const c of cars.slice()) if (c.kind === 'police') c.remove();
  for (const p of peds.slice()) if (p.cop) p.remove();
}
function nearestEnterableCar() {
  let best = null, bd = 3.6;
  for (const c of cars) {
    if (c.dead || c.sink > 0 || c.speed > 4) continue;
    const d = Math.hypot(c.x - player.x, c.z - player.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function startEnter(c) {
  player.state = 'enter'; player.seq = { car: c, ph: 0, t: 0, jacked: false };
  if (c.ai) c.ai.shock = 8;
}
// pull the driver out of the driver's door
function jackDriver(c) {
  const dp = carDoorPoint(c), out = carLocal(c, -(c.spec.W / 2 + 1.6), c.spec.cf - 0.9);
  const cop = c.driver === 'cop';
  const p = new Ped(dp.x, dp.z, 0, 1, 0, 1, c.look || randomLook());
  p.knock((out.x - dp.x) * 2.2, 2.2, (out.z - dp.z) * 2.2, false, rr(1.2, 2));
  if (cop) { p.cop = true; p.hp = 3; p.car = null; }
  peds.push(p);
  addCrime(cop ? 2 : 1, 'jack'); scareNear(c.x, c.z, 18);
  c.setDriver(null);
  toast(cop ? 'You stole a police car!' : 'Carjacked!');
}
function updateEnter(dt) {
  const q = player.seq, c = q.car, P = player.model; q.t += dt;
  if (!c || c.dead || c.sink > 0 || cars.indexOf(c) < 0) { player.state = 'foot'; return; }
  const dp = carDoorPoint(c);
  animatePerson(P, 0, 0);
  if (q.ph === 0) { // walk to the driver's door
    const dx = dp.x - player.x, dz = dp.z - player.z, d = Math.hypot(dx, dz);
    if (d > 6 || q.t > 2) { player.state = 'foot'; return; }
    const step = Math.min(d, 4.2 * dt);
    if (d > 0.05) { player.x += (dx / d) * step; player.z += (dz / d) * step; player.h += angDiff(player.h, Math.atan2(dx, dz)) * Math.min(1, dt * 12); }
    player.phase += dt * 11; animatePerson(P, player.phase, 0.9);
    if (d < 0.12) { q.ph = 1; q.t = 0; c.doorTarget[0] = 1; sfxNoise(0.12, 1400, 0.15); }
  } else if (q.ph === 1) { // open up (and yank the driver out)
    player.x = dp.x; player.z = dp.z;
    player.h += angDiff(player.h, c.h + Math.PI / 2) * Math.min(1, dt * 10);
    P.armR.rotation.x = -1.3 * Math.min(1, q.t / 0.25);
    if (!q.jacked && q.t > 0.3 && c.driver && c.driver !== 'player') { jackDriver(c); q.jacked = true; P.armL.rotation.x = -1.6; }
    if (q.t > (q.jacked ? 0.95 : 0.4)) { q.ph = 2; q.t = 0; q.fx = player.x; q.fz = player.z; }
  } else if (q.ph === 2) { // climb in and sit
    const s = carSeat(c), k = Math.min(1, q.t / 0.45);
    player.x = lerp(q.fx, s.x, k); player.z = lerp(q.fz, s.z, k); player.y = 0.2 * k;
    player.h += angDiff(player.h, c.h) * Math.min(1, dt * 9);
    P.legL.rotation.x = P.legR.rotation.x = -1.4 * k;
    if (k >= 1) {
      q.ph = 3; q.t = 0; P.root.visible = false;
      c.setDriver('player', player.look); c.kind = 'player'; c.ai = null; c.siren = false;
      if (c.spot) { c.spot.used = false; c.spot = null; }
      c.doorTarget[0] = 0; player.car = c; player.mode = 'car'; camIdx = 1;
    }
  } else if (q.ph === 3) {
    player.x = c.x; player.z = c.z;
    if (q.t > 0.3) { player.state = 'car'; player.seq = null; sfxNoise(0.12, 900, 0.25); }
  }
  if (P.root.visible) { P.root.position.set(player.x, standAt(player.x, player.z) + player.y, player.z); P.root.rotation.set(0, player.h, 0); }
}
function startExit(dragger) {
  const c = player.car; if (!c) return;
  if (c.speed > 9 && !dragger) return bailOut();
  player.state = 'exit'; player.seq = { car: c, ph: 0, t: 0, dragger };
  c.doorTarget[0] = 1; c.setDriver(null); c.kind = 'abandoned'; c.input.t = c.input.b = c.input.s = 0;
  const s = carSeat(c); player.x = s.x; player.z = s.z; player.y = 0.2; player.h = c.h; player.mode = 'foot';
  player.model.root.visible = true;
  sfxNoise(0.12, 1400, 0.15);
}
function updateExit(dt) {
  const q = player.seq, c = q.car, P = player.model; q.t += dt;
  animatePerson(P, 0, 0);
  const s = carSeat(c), dp = carDoorPoint(c);
  if (q.ph === 0) { player.x = s.x; player.z = s.z; P.legL.rotation.x = P.legR.rotation.x = -1.4; if (q.t > (q.dragger ? 0.15 : 0.3)) { q.ph = 1; q.t = 0; } }
  else if (q.ph === 1) {
    const k = Math.min(1, q.t / (q.dragger ? 0.3 : 0.45));
    player.x = lerp(s.x, dp.x, k); player.z = lerp(s.z, dp.z, k); player.y = 0.2 * (1 - k);
    player.h += angDiff(player.h, c.h - Math.PI / 2) * Math.min(1, dt * 9);
    P.legL.rotation.x = P.legR.rotation.x = -1.4 * (1 - k);
    if (k >= 1) { q.ph = 2; q.t = 0; c.doorTarget[0] = 0; }
  } else {
    player.state = 'foot'; player.car = null; player.seq = null; player.y = 0;
    if (q.dragger && q.dragger.m && player.deadT === 0) startTackle(q.dragger);
  }
  P.root.position.set(player.x, standAt(player.x, player.z) + player.y, player.z); P.root.rotation.set(0, player.h, 0);
}
function bailOut() {
  const c = player.car; if (!c) return;
  const rx = -Math.cos(c.h), rz = Math.sin(c.h);
  let px = c.x + rx * 1.7, pz = c.z + rz * 1.7;
  if (resolveCircle(px, pz, 0.4) || !isLand(px, pz)) { const ax = c.x - rx * 1.7, az = c.z - rz * 1.7; if (!resolveCircle(ax, az, 0.4)) { px = ax; pz = az; } }
  player.x = px; player.z = pz; player.y = Math.max(0, c.y); player.vy = 0; player.h = c.h;
  c.setDriver(null); c.kind = 'abandoned'; c.input.t = c.input.b = c.input.s = 0;
  player.mode = 'foot'; player.car = null; player.seq = null; player.state = 'foot';
  player.model.root.visible = !(player.deadT > 0 && player.endKind === 'busted');
  if (c.speed > 9 && player.deadT === 0) { damagePlayer(Math.min(30, c.speed)); knockPlayer(c.vx * 0.6, c.vz * 0.6); }
}
function nearShop() {
  for (const s of OUTFIT_SHOPS) if (Math.hypot(s.x - player.x, s.z - player.z) < 1.6) return s;
  return null;
}
function useKey() {
  if (player.deadT > 0) return;
  if (player.state === 'plane') return leavePlane(false);
  if (player.state === 'car') { if (player.car.speed > 9) toast('Slow down to get out'); else startExit(null); return; }
  if (player.state !== 'foot') return;
  if (towerUse() || houseUse()) return;
  const spot = serviceSpot(); if (spot) return openShop(spot);
  const shop = nearShop(); if (shop) return openWardrobe(shop);
  const pl = nearestPlane(9); if (pl) return boardPlane(pl);
  const c = nearestEnterableCar(); if (c) startEnter(c);
}
function updatePlayer(dt) {
  if (player.deadT > 0) {
    player.deadT += dt;
    if (player.deadT > 4) respawn();
    return;
  }
  const P = player.model;
  switch (player.state) {
    case 'car': {
      const c = player.car;
      const kF = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
      const kR = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      c.input.t = Math.max(0, kF); c.input.b = Math.max(0, -kF); c.input.s = -kR; c.input.hb = keys.Space ? 1 : 0;
      player.x = c.x; player.z = c.z; player.h = c.h; player.speed = c.speed; player.vx = c.vx; player.vz = c.vz;
      squeal = lerp(squeal, c.slip, Math.min(1, dt * 8));
      return;
    }
    case 'plane': squeal = 0; return updatePlaneControls();
    case 'enter': squeal = 0; return updateEnter(dt);
    case 'exit': return updateExit(dt);
    case 'tackled': return updateTackled(dt);
    case 'cuffed': return updateCuffed(dt);
    case 'down': {
      player.t += dt;
      player.x += player.kx * dt; player.z += player.kz * dt; player.kx *= Math.exp(-3 * dt); player.kz *= Math.exp(-3 * dt);
      player.vy -= 18 * dt; player.y = Math.max(0, player.y + player.vy * dt);
      if (resolveCircle(player.x, player.z, 0.34)) { player.x = hitRes.x; player.z = hitRes.z; }
      P.root.rotation.set(-Math.min(Math.PI / 2, player.t * 6), player.h, 0); P.root.position.set(player.x, standAt(player.x, player.z) + player.y + 0.13, player.z);
      animatePerson(P, 0, 0);
      if (player.t > 1.3 && player.y <= 0) { player.state = 'getup'; player.t = 0; }
      return;
    }
    case 'getup': {
      player.t += dt; const k = Math.min(1, player.t / 0.6);
      const from = player.seq && player.seq.cop ? Math.PI / 2 : -Math.PI / 2;
      P.root.rotation.set(lerp(from, 0, k * k), player.h, 0); P.root.position.set(player.x, standAt(player.x, player.z) + 0.13 * (1 - k), player.z);
      animatePerson(P, 0, 0); P.legL.rotation.x = P.legR.rotation.x = -1.2 * (1 - k);
      if (k >= 1) { player.state = 'foot'; player.seq = null; P.root.rotation.set(0, player.h, 0); }
      return;
    }
  }
  // on foot
  if (player.vault) return updateVault(dt);
  const kF = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const kR = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  squeal = 0;
  const swim = !isLand(player.x, player.z);
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rxv = -Math.cos(camYaw), rzv = Math.sin(camYaw);
  let mx = fx * kF + rxv * kR, mz = fz * kF + rzv * kR;
  const ml = Math.hypot(mx, mz);
  const sprint = (keys.ShiftLeft || keys.ShiftRight) && !aiming;
  const sp = swim ? (sprint ? 2.6 : 1.7) : aiming ? 2.6 : sprint ? (player.effects.energy > 0 ? 9.2 : 7.6) * fitnessSpeed() : 4.4;
  if (ml > 0) { mx /= ml; mz /= ml; if (!aiming) player.h += angDiff(player.h, Math.atan2(mx, mz)) * Math.min(1, dt * 12); }
  if (aiming) player.h += angDiff(player.h, camYaw) * Math.min(1, dt * 18);
  player.x += mx * sp * dt + player.kx * dt; player.z += mz * sp * dt + player.kz * dt;
  player.kx *= Math.exp(-6 * dt); player.kz *= Math.exp(-6 * dt);
  player.speed = ml > 0 ? sp : 0; player.vx = mx * sp; player.vz = mz * sp;
  if (keys.Space && player.y <= 0 && !swim) { if (!tryVault()) player.vy = 5.2; keys.Space = false; }
  player.vy -= 16 * dt; player.y += player.vy * dt;
  const floor = swim ? -1.05 : 0;
  if (player.y < floor) { player.y = swim ? lerp(player.y, floor, Math.min(1, dt * 6)) : floor; player.vy = 0; }
  if (resolveCircle(player.x, player.z, 0.34)) { player.x = hitRes.x; player.z = hitRes.z; }
  [player.x, player.z] = pushDoors(player.x, player.z, 0.34);
  for (const c of cars) {
    if (Math.abs(c.x - player.x) > 4 || Math.abs(c.z - player.z) > 4) continue;
    const cfx = Math.sin(c.h), cfz = Math.cos(c.h);
    for (const s of c.offs) {
      const cx = c.x + cfx * s, cz = c.z + cfz * s, dx = player.x - cx, dz = player.z - cz, d = Math.hypot(dx, dz), r = c.r + 0.3;
      if (d < r && d > 1e-4) { player.x = cx + (dx / d) * r; player.z = cz + (dz / d) * r; }
    }
  }
  player.x = clamp(player.x, WORLD.x0 + 1, WORLD.x1 - 1); player.z = clamp(player.z, WORLD.z0 + 1, WORLD.z1 - 1);
  if (player.punchT > 0) {
    const before = player.punchT; player.punchT -= dt;
    if (before > 0.16 && player.punchT <= 0.16) {
      const hx = Math.sin(player.h), hz = Math.cos(player.h);
      let hitSomeone = false;
      for (const p of peds) {
        if (p.state === 'down' || p.state === 'kneel') continue;
        const dx = p.x - player.x, dz = p.z - player.z;
        if (Math.hypot(dx, dz) < 1.5 && (dx * hx + dz * hz) > 0.2) { p.punched(hx, hz); scareNear(p.x, p.z, 20); hitSomeone = true; break; }
      }
      sfxNoise(0.08, hitSomeone ? 1200 : 2400, hitSomeone ? 0.3 : 0.1);
    }
  }
  player.phase += dt * sp * (swim ? 1.6 : sprint && ml > 0 ? 2.2 : 2.6);
  animatePerson(P, player.phase, ml > 0 ? Math.min(1.25, sp / 4.4) : 0, swim ? 'swim' : sprint && ml > 0 ? 'sprint' : undefined);
  if (aiming) { // arms up along the line of sight
    P.armR.rotation.set(-Math.PI / 2 + camPitch, 0, 0);
    if (player.weapon !== 'pistol') P.armL.rotation.set(-Math.PI / 2 + camPitch, 0, 0.55); else P.armL.rotation.set(-1.3 + camPitch, 0, 0.6);
  }
  if (player.punchT > 0) { const k = Math.sin((1 - player.punchT / 0.32) * Math.PI); (player.punchArm ? P.armL : P.armR).rotation.x = -1.55 * k; P.body.rotation.y = (player.punchArm ? 0.3 : -0.3) * k; } else P.body.rotation.y = 0;
  if (player.y > 0.05 && !swim) { P.legL.rotation.x = 0.5; P.legR.rotation.x = -0.3; }
  P.root.position.set(player.x, standAt(player.x, player.z) + player.y, player.z);
  P.root.rotation.set(swim ? -1.2 : sprint && ml > 0 ? 0.16 : 0, player.h, 0);
}

// ---------------------------------------------------------------- camera
function updateCamera(dt) {
  let tx, ty, tz, dist;
  if (player.state === 'plane' && player.plane) { // chase camera behind the plane
    const p = player.plane; tx = p.x; ty = p.y + p.sp.fus; tz = p.z; dist = p.sp.len * 1.4 + 8;
    camYaw += angDiff(camYaw, p.h) * Math.min(1, dt * 2.5); camPitch = lerp(camPitch, 0.18 + p.pitch * 0.5, Math.min(1, dt * 2));
    camera.fov = lerp(camera.fov, 62 + Math.min(14, p.v * 0.08), Math.min(1, dt * 3));
  } else if (player.state === 'car' && player.car) {
    const c = player.car;
    tx = c.x; ty = 1.6 + c.y + (c.alt || 0); tz = c.z; dist = CAM_CAR[camIdx];
    if (elapsed - mouse.last > 1.4 && c.speed > 1.5) {
      camYaw += angDiff(camYaw, c.vf >= -0.5 ? lerpAngle(c.h, Math.atan2(c.vx, c.vz), 0.55) : c.h) * Math.min(1, dt * 2.4);
      camPitch = lerp(camPitch, 0.2, Math.min(1, dt * 1.5));
    }
    camera.fov = lerp(camera.fov, 60 + Math.min(18, c.speed * 0.38), Math.min(1, dt * 3));
  } else {
    const low = player.state === 'tackled' || player.state === 'cuffed' || player.state === 'down';
    tx = player.x; ty = standAt(player.x, player.z) + player.y + (low ? 0.6 : 1.6); tz = player.z; dist = low ? 3.6 : 4.4;
    const inShop = shopAt(player.x, player.z), inHouse = indoorAt(player.x, player.z);
    if (inShop) dist = 3.0;
    if (inHouse) { dist = 2.6; camPitch = Math.min(camPitch, 0.35); tx += -Math.cos(camYaw) * 0.55; tz += Math.sin(camYaw) * 0.55; ty -= 0.25; } // over the shoulder
    if (aiming) { tx += -Math.cos(camYaw) * 0.6; tz += Math.sin(camYaw) * 0.6; ty += 0.05; dist = 2.2; }
    camera.fov = lerp(camera.fov, aiming ? 46 : 60, Math.min(1, dt * 8));
  }
  camera.updateProjectionMatrix();
  const cp = Math.cos(camPitch), fx = Math.sin(camYaw) * cp, fy = -Math.sin(camPitch), fz = Math.cos(camYaw) * cp;
  const cx = tx - fx * dist, cz = tz - fz * dist;
  const inside = player.state !== 'car' && indoorAt(player.x, player.z);
  const t = player.state === 'plane' ? 1 : rayWalls(tx, tz, cx, cz, inside ? 1 : 3); // in the air, buildings below don't block the camera
  const allowed = t < 1 ? Math.max(1.2, dist * t - 0.5) : dist;
  camDist = allowed < camDist ? allowed : lerp(camDist, allowed, Math.min(1, dt * 2.5));
  let px = tx - fx * camDist, py = ty - fy * camDist, pz = tz - fz * camDist;
  py = Math.max(py, isLand(px, pz) ? groundAt(px, pz) + 0.4 : -0.2);
  if (inside) py = Math.min(py, inside.top - 0.25); // under the ceiling
  if (shake > 0) { px += rr(-1, 1) * shake * 0.25; py += rr(-1, 1) * shake * 0.25; pz += rr(-1, 1) * shake * 0.25; shake = Math.max(0, shake - dt * 2); }
  camera.position.set(px, py, pz);
  camera.lookAt(tx, ty + 0.2, tz);
  sky.position.copy(camera.position);
  const snap = 220 / 2048;
  const sx = Math.round(tx / snap) * snap, sz = Math.round(tz / snap) * snap;
  sun.target.position.set(sx, 0, sz);
  sun.position.set(sx + lightDir.x * 400, lightDir.y * 400, sz + lightDir.z * 400);
}
function lerpAngle(a, b, t) { return a + angDiff(a, b) * t; }

// ---------------------------------------------------------------- day / night
let nightLevel = 0, envHour = -99;
const lightDir = new THREE.Vector3(0, 1, 0);
const C_DAY_TOP = col('#2a78cc'), C_DAY_HOR = col('#acd6ec'), C_SET_HOR = col('#f7a35c'), C_SET_TOP = col('#3c5a9a'), C_NIGHT_TOP = col('#03050c'), C_NIGHT_HOR = col('#141c30');
const headlight = new THREE.SpotLight(0xfff1d0, 0, 70, 0.55, 0.5, 1.2);
scene.add(headlight, headlight.target);
function updateSky(dt) {
  gameHour = (gameHour + (dt * timeScale) / 60) % 24;
  const a = ((gameHour - 6) / 12) * Math.PI, el = Math.sin(a);
  const sunDir = new THREE.Vector3(Math.cos(a), el, -0.42).normalize();
  const day = smooth(-0.1, 0.22, el), dusk = clamp(1 - Math.abs(el - 0.06) / 0.28, 0, 1) * smooth(-0.15, 0.0, el);
  nightLevel = 1 - day;
  const top = C_NIGHT_TOP.clone().lerp(C_DAY_TOP, day).lerp(C_SET_TOP, dusk * 0.6);
  const hor = C_NIGHT_HOR.clone().lerp(C_DAY_HOR, day).lerp(C_SET_HOR, dusk * 0.85);
  skyU.top.value.copy(top); skyU.horizon.value.copy(hor); skyU.bottom.value.copy(hor).multiplyScalar(0.75);
  skyU.sunDir.value.copy(sunDir); skyU.time.value = elapsed; skyU.cloud.value = 0.35 + 0.65 * day; TREE_WIND.value = elapsed;
  skyU.sunCol.value.set(dusk > 0.3 ? '#ffb070' : '#fff2d0').multiplyScalar(smooth(-0.08, 0.05, el));
  scene.fog.color.copy(hor);
  if (el > -0.04) { lightDir.copy(sunDir); sun.intensity = 2.2 * day; sun.color.set('#fff0d8').lerp(col('#ff9a50'), dusk * 0.8); }
  else { lightDir.set(-0.4, 0.8, 0.3).normalize(); sun.intensity = 0.28; sun.color.set('#8fa8ff'); }
  hemi.intensity = 0.14 + 0.36 * day; hemi.color.set('#cfe8ff').lerp(col('#2a3558'), nightLevel * 0.8);
  renderer.toneMappingExposure = 0.92 + nightLevel * 0.43;
  for (const k of ['low', 'tower', 'glass', 'grid', 'balcony', 'shop']) buildingMats[k].emissiveIntensity = smooth(0.35, 0.9, nightLevel) * (k === 'shop' ? 1.0 : 1.3);
  for (const m of NIGHT_MATS) m.mat.emissiveIntensity = m.day + smooth(0.3, 0.85, nightLevel) * m.night;
  lampMat.emissiveIntensity = smooth(0.4, 0.9, nightLevel) * 3;
  updateTileNightLights();
  if (Math.abs(gameHour - envHour) > 0.35) { envHour = gameHour; refreshEnvironment(); }
  const c = player.state === 'car' ? player.car : null;
  headlight.intensity = c && !c.dead && nightLevel > 0.4 ? 3.5 : 0;
  if (c) {
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    headlight.position.set(c.x + fx * 2.2, 1.0, c.z + fz * 2.2); headlight.target.position.set(c.x + fx * 20, 0, c.z + fz * 20);
  }
  if (waterMat.normalMap) { waterMat.normalMap.offset.x = elapsed * 0.004; waterMat.normalMap.offset.y = elapsed * 0.0025; }
  foamMat.map.offset.y = -((elapsed * 0.08) % 1);
  foamMat.opacity = 0.55 + 0.25 * day;
}

// ---------------------------------------------------------------- HUD
let toastT = 0, streetT = 0, lastStreet = '', streetShowT = 0, lastPlace = '';
function toast(msg) { const t = $('toast'); t.textContent = msg; t.style.opacity = 1; toastT = 2.6; }
function nearestStreet(x, z) {
  let best = 30 * 30, name = '';
  for (const r of ROADS) {
    if (!r.name) continue;
    const p = r.p;
    for (let i = 0; i < p.length - 2; i += 2) {
      const ax = p[i], az = p[i + 1];
      if (Math.abs(ax - x) > 200 || Math.abs(az - z) > 200) continue;
      const ex = p[i + 2] - ax, ez = p[i + 3] - az, L2 = ex * ex + ez * ez || 1, t = clamp(((x - ax) * ex + (z - az) * ez) / L2, 0, 1);
      const d = (x - ax - ex * t) ** 2 + (z - az - ez * t) ** 2;
      if (d < best) { best = d; name = r.name === 'Cavill Avenue' && r.type === RT.pedestrian ? 'Cavill Mall' : r.name; }
    }
  }
  if (!name && typeof tileStreetName === 'function' && REGION) name = tileStreetName(x, z).name;
  return name;
}
// the closest named place you're standing near (a shop, hotel, attraction), for the location text
function nearestPlace(x, z) {
  let best = 14, name = '';
  for (const s of SHOPS) { if (Math.abs(s.x - x) > 20 || Math.abs(s.z - z) > 20) continue; const d = Math.hypot(s.x - x, s.z - z); if (d < best) { best = d; name = s.name; } }
  for (const [n, p] of Object.entries(D.spots)) { const d = Math.hypot(p[0] - x, p[1] - z); if (d < best + 6) { best = d; name = n.replace('Observaton', 'Observation'); } }
  return name;
}
function district(x, z) {
  if (onBeach(x, z) && x > 700) return 'Surfers Paradise Beach';
  if (x < -40 && z > -520 && z < 160 && x > MINX) return 'Chevron Island';
  if (inCore(x, z)) return 'Surfers Paradise';
  return suburbAt(x, z) || 'Gold Coast';
}
const MINI_PAL = {
  base: '#2b3530', residential: '#2f3a33', commercial: '#33373a', construction: '#3a352c', grass: '#2f4a2c', scrub: '#2f402b', wood: '#29432a',
  park: '#2d5230', pitch: '#2f5a33', parking: '#3a3c3e', beach: '#8f7d52', wet: '#000', path: '#4a4f4c', plaza: '#5a5a55', kerb: '#2b3530',
  sidewalk: '#2b3530', pool: '#2f7fa6', water: '#1d4f73', pier: '#6b6455', building: '#4a5158', minor: '#9c988f', major: '#e8c86a',
};
let mapCanvas, MAPPPM = 0.6;
const mini = $('mini'), mctx = mini.getContext('2d');
function drawMinimap() {
  const S = mini.width, R = S / 2;
  const tx = player.x, tz = player.z;
  const zoomPx = player.mode === 'car' && player.car ? clamp(2.2 - player.car.speed * 0.03, 1.0, 2.2) : 2.6;
  const theta = -Math.PI / 2 - Math.atan2(Math.cos(camYaw), Math.sin(camYaw));
  mctx.save();
  mctx.clearRect(0, 0, S, S);
  mctx.beginPath(); mctx.arc(R, R, R, 0, TAU); mctx.clip();
  mctx.fillStyle = MINI_PAL.water; mctx.fillRect(0, 0, S, S);
  mctx.translate(R, R); mctx.rotate(theta);
  const k = zoomPx / MAPPPM; mctx.scale(k, k);
  if (OVERVIEW) mctx.drawImage(OVERVIEW.canvas, (OVERVIEW.x0 - tx) * MAPPPM, (OVERVIEW.z0 - tz) * MAPPPM, OVERVIEW.canvas.width * MAPPPM / OV_PPM, OVERVIEW.canvas.height * MAPPPM / OV_PPM);
  for (const T of TILES.values()) if (T.mini && Math.abs(T.x0 + 500 - tx) < 1400 && Math.abs(T.z0 + 500 - tz) < 1400) mctx.drawImage(T.mini, (T.x0 - tx) * MAPPPM, (T.z0 - tz) * MAPPPM);
  mctx.drawImage(mapCanvas, -(tx - GX0) * MAPPPM, -(tz - GZ0) * MAPPPM);
  const dot = (x, z, r, color) => { mctx.fillStyle = color; mctx.beginPath(); mctx.arc((x - tx) * MAPPPM, (z - tz) * MAPPPM, r / k, 0, TAU); mctx.fill(); };
  for (const pk of pickups) if (Math.abs(pk.x - tx) < 260 && Math.abs(pk.z - tz) < 260) dot(pk.x, pk.z, 5, '#7fdc6a');
  for (const s of OUTFIT_SHOPS) if (Math.abs(s.x - tx) < 300 && Math.abs(s.z - tz) < 300) dot(s.x, s.z, 6, '#ffd400');
  for (const d of DEALERS) if (Math.abs(d.x - tx) < 400 && Math.abs(d.z - tz) < 400) { dot(d.x, d.z, 9, '#000'); dot(d.x, d.z, 7, '#ff3030'); }
  for (const sh of SHOPS) if (sh.kind === 'bank' && Math.abs(sh.x - tx) < 400 && Math.abs(sh.z - tz) < 400) { dot(sh.x, sh.z, 9, '#000'); dot(sh.x, sh.z, 7, '#33d17a'); }
  for (const t of trams) for (const md of t.mods) if (Math.abs(md.x - tx) < 300 && Math.abs(md.z - tz) < 300) dot(md.x, md.z, 4, '#2ec4b6');
  for (const c of cars) if (c.kind === 'police' && !c.dead) dot(c.x, c.z, 7, Math.floor(elapsed * 4) % 2 ? '#ff3b3b' : '#3b7bff');
  for (const p of peds) if (p.cop) dot(p.x, p.z, 5, '#6aa8ff');
  if (player.mode === 'foot') { for (const c of cars) if (!c.dead && Math.hypot(c.x - tx, c.z - tz) < 40 && c.kind !== 'police') dot(c.x, c.z, 3, 'rgba(255,255,255,0.55)'); }
  strokeGPS(mctx, (x, z) => [(x - tx) * MAPPPM, (z - tz) * MAPPPM], 6 / k); // the yellow route
  if (searchArea && player.stars) { // the police search area: get out of it and stay hidden
    mctx.strokeStyle = 'rgba(90,150,255,0.9)'; mctx.fillStyle = 'rgba(60,110,255,0.12)'; mctx.lineWidth = 3 / k;
    mctx.beginPath(); mctx.arc((searchArea.x - tx) * MAPPPM, (searchArea.z - tz) * MAPPPM, searchArea.r * MAPPPM, 0, TAU); mctx.fill(); mctx.stroke();
  }
  mctx.restore();
  if (WAYPOINT) { // the waypoint, pinned to the rim when it's off the minimap
    const dx = (WAYPOINT.x - tx) * zoomPx, dz = (WAYPOINT.z - tz) * zoomPx;
    let sx = dx * Math.cos(theta) - dz * Math.sin(theta), sz = dx * Math.sin(theta) + dz * Math.cos(theta); const L = Math.hypot(sx, sz);
    if (L > R - 14) { sx *= (R - 14) / L; sz *= (R - 14) / L; }
    mctx.fillStyle = '#000'; mctx.beginPath(); mctx.arc(R + sx, R + sz, 10, 0, TAU); mctx.fill();
    mctx.fillStyle = '#c3a6ff'; mctx.beginPath(); mctx.arc(R + sx, R + sz, 7, 0, TAU); mctx.fill();
    if (Math.hypot(WAYPOINT.x - player.x, WAYPOINT.z - player.z) < 25) { toast(`You've arrived: ${WAYPOINT.name}`); WAYPOINT = null; clearGPS(); }
  }
  const nx = Math.cos(theta - Math.PI / 2) * (R - 18), nz = Math.sin(theta - Math.PI / 2) * (R - 18);
  mctx.fillStyle = '#0b1216'; mctx.beginPath(); mctx.arc(R + nx, R + nz, 15, 0, TAU); mctx.fill();
  mctx.fillStyle = '#f6c445'; mctx.font = '700 20px "Barlow Condensed", sans-serif'; mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
  mctx.fillText('N', R + nx, R + nz + 1);
  mctx.save(); mctx.translate(R, R); mctx.rotate(-angDiff(camYaw, player.h));
  mctx.fillStyle = '#f6c445'; mctx.strokeStyle = '#000'; mctx.lineWidth = 3;
  mctx.beginPath(); mctx.moveTo(0, -16); mctx.lineTo(11, 12); mctx.lineTo(0, 6); mctx.lineTo(-11, 12); mctx.closePath(); mctx.stroke(); mctx.fill();
  mctx.restore();
}
// the big map: zoom (wheel, + and -), drag to move, and search for any street or place
const MAPV = { cx: 0, cz: 0, zoom: 1, init: false };
let WAYPOINT = null;
const SEARCH_COLORS = ['#ffffff', '#ffd166', '#7bd88f', '#f4e3a1', '#ff6b6b', '#ff8ad8', '#9fd3ff', '#cfe8ef', '#c3a6ff', '#ffb000', '#ff9f43', '#5ee0c8', '#ffa8a8', '#b8c4cc', '#2ec4b6'];
function mapFit() { const B = REGION ? REGION.bounds : [GX0, GZ0, GX0 + GW, GZ0 + GH]; return Math.min((window.innerWidth * 0.96) / (B[2] - B[0]), (window.innerHeight * 0.92) / (B[3] - B[1])); }
function mapToWorld(px, py) { const S = mapFit() * MAPV.zoom; return [MAPV.cx + (px - window.innerWidth / 2) / S, MAPV.cz + (py - window.innerHeight / 2) / S]; }
function drawBigMap() {
  const c = $('bigc'), B = REGION ? REGION.bounds : [GX0, GZ0, GX0 + GW, GZ0 + GH];
  if (!MAPV.init) { MAPV.cx = player.x; MAPV.cz = player.z; MAPV.zoom = 3; MAPV.init = true; }
  const Wd = window.innerWidth, Ht = window.innerHeight, S = mapFit() * MAPV.zoom, dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(Wd * dpr); c.height = Math.round(Ht * dpr); c.style.width = Wd + 'px'; c.style.height = Ht + 'px';
  const x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = MINI_PAL.water; x.fillRect(0, 0, c.width, c.height); // ocean past the edges too
  x.setTransform(S * dpr, 0, 0, S * dpr, (Wd / 2 - MAPV.cx * S) * dpr, (Ht / 2 - MAPV.cz * S) * dpr);
  const vx0 = MAPV.cx - Wd / 2 / S, vx1 = MAPV.cx + Wd / 2 / S, vz0 = MAPV.cz - Ht / 2 / S, vz1 = MAPV.cz + Ht / 2 / S, inView = (wx, wz) => wx > vx0 && wx < vx1 && wz > vz0 && wz < vz1;
  x.fillStyle = MINI_PAL.water; x.fillRect(B[0], B[1], B[2] - B[0], B[3] - B[1]);
  x.imageSmoothingEnabled = MAPV.zoom < 6;
  if (OVERVIEW) x.drawImage(OVERVIEW.canvas, OVERVIEW.x0, OVERVIEW.z0, OVERVIEW.canvas.width / OV_PPM, OVERVIEW.canvas.height / OV_PPM);
  for (const T of TILES.values()) if (T.mini) x.drawImage(T.mini, T.x0, T.z0, T.mini.width / MAPPPM, T.mini.height / MAPPPM);
  x.drawImage(mapCanvas, GX0, GZ0, mapCanvas.width / MAPPPM, mapCanvas.height / MAPPPM);
  const label = (text, wx, wz, size, color) => {
    x.font = `700 ${size / S}px "Barlow Condensed", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 4 / S; x.strokeStyle = 'rgba(0,0,0,0.75)'; x.strokeText(text, wx, wz); x.fillStyle = color; x.fillText(text, wx, wz);
  };
  const dot = (wx, wz, r, color) => { x.fillStyle = color; x.beginPath(); x.arc(wx, wz, r / S, 0, TAU); x.fill(); };
  if (REGION) {
    // street names and places appear as you zoom in
    if (REGION.search) {
      // most important first; a label is skipped if it would overlap one already drawn
      const need = (k) => (k === 1 || k === 4 || k === 5 ? 2.5 : k === 0 ? 6 : k === 2 || k === 3 || k === 8 || k === 9 || k === 10 || k === 11 || k === 14 ? 7 : k === 7 ? 99 : 16);
      const order = [1, 5, 4, 3, 2, 9, 10, 14, 8, 11, 0, 12, 6, 13], taken = [];
      const free = (wx, wz, w) => { const px = (wx - vx0) * S, py = (wz - vz0) * S; for (const t of taken) if (Math.abs(t[0] - px) < (t[2] + w) / 2 && Math.abs(t[1] - py) < 15) return false; taken.push([px, py, w]); return true; };
      for (const k of order) {
        if (MAPV.zoom < need(k)) continue;
        for (const [nm, kk, sx, sz] of REGION.search) {
          if (kk !== k || !inView(sx, sz) || taken.length > 360) continue;
          if (!free(sx, sz - (k ? 11 / S : 0), nm.length * 6.2 + 8)) continue;
          if (k === 0) label(nm, sx, sz, 11, 'rgba(255,255,255,0.8)'); else { dot(sx, sz, 3.5, SEARCH_COLORS[k]); label(nm, sx, sz - 11 / S, 11, SEARCH_COLORS[k]); }
        }
      }
    }
    for (const [sx, sz, nm, place] of REGION.suburbs) if ((place === 'suburb' || place === 'town') && MAPV.zoom < 8) label(nm.toUpperCase(), sx, sz, 15, '#cfe8ef');
    const seen = new Set();
    for (const [lx, lz, nm] of REGION.landmarks) { if (seen.has(nm) || (MAPV.zoom >= 2.5 && REGION.search)) continue; seen.add(nm); dot(lx, lz, 3, '#ff8ad8'); label(nm, lx, lz - 14 / S, 11, '#ffc2ea'); }
  }
  label('Surfers Paradise', (MINX + MAXX) / 2, MINZ + 120, 16, '#f6c445');
  for (const n of ['Timezone', 'Ripleys Believe it or Not', "Surfer's Paradise Arch"]) if (D.spots[n]) dot(D.spots[n][0], D.spots[n][1], 3, '#ff8ad8');
  for (const sh of SHOPS) if (sh.kind === 'fuel') dot(sh.x, sh.z, 4, '#ffb000');
  for (const d of DEALERS) { dot(d.x, d.z, 5, '#ff3030'); }
  for (const sh of SHOPS) if (sh.kind === 'bank') dot(sh.x, sh.z, 5, '#33d17a');
  for (const s of OUTFIT_SHOPS) dot(s.x, s.z, 4, '#ffd400');
  label('PACIFIC OCEAN', B[2] - 700, (B[1] + B[3]) / 2, 22, '#8fd3e8');
  strokeGPS(x, (wx, wz) => [wx, wz], 4 / S);
  if (MAPV.pin) { // the pin you just dropped (not a destination until you press Go)
    const u = 1 / S; x.strokeStyle = '#ffd21f'; x.lineWidth = 3 * u; x.fillStyle = 'rgba(255,210,31,0.35)';
    x.beginPath(); x.arc(MAPV.pin.x, MAPV.pin.z, 9 * u, 0, TAU); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(MAPV.pin.x - 14 * u, MAPV.pin.z); x.lineTo(MAPV.pin.x + 14 * u, MAPV.pin.z); x.moveTo(MAPV.pin.x, MAPV.pin.z - 14 * u); x.lineTo(MAPV.pin.x, MAPV.pin.z + 14 * u); x.stroke();
  }
  if (WAYPOINT) { // a pin with the place's name
    const px = WAYPOINT.x, pz = WAYPOINT.z, u = 1 / S;
    x.fillStyle = '#c3a6ff'; x.strokeStyle = '#000'; x.lineWidth = 2.5 * u;
    x.beginPath(); x.moveTo(px, pz); x.lineTo(px - 9 * u, pz - 16 * u); x.arc(px, pz - 20 * u, 10 * u, Math.PI * 0.8, Math.PI * 0.2); x.closePath(); x.fill(); x.stroke();
    label(WAYPOINT.name, px, pz - 40 * u, 15, '#e6dcff');
  }
  x.save(); x.translate(player.x, player.z); x.rotate(Math.atan2(Math.cos(player.h), Math.sin(player.h)) + Math.PI / 2);
  const s = 1.4 / S; x.fillStyle = '#f6c445'; x.strokeStyle = '#000'; x.lineWidth = 3 * s;
  x.beginPath(); x.moveTo(0, -14 * s); x.lineTo(10 * s, 10 * s); x.lineTo(0, 5 * s); x.lineTo(-10 * s, 10 * s); x.closePath(); x.stroke(); x.fill();
  x.restore();
  if (MAPV.pin) { const el = $('mappin'); el.style.left = clamp(Wd / 2 + (MAPV.pin.x - MAPV.cx) * S, 150, Wd - 150) + 'px'; el.style.top = clamp(Ht / 2 + (MAPV.pin.z - MAPV.cz) * S, 150, Ht - 10) + 'px'; } // the card follows its pin
  // scale bar
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const metres = [50, 100, 200, 500, 1000, 2000, 5000].find((m) => m * S > 80) || 5000, bw = metres * S;
  x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(Wd - bw - 34, Ht - 70, bw + 20, 30);
  x.fillStyle = '#fff'; x.fillRect(Wd - bw - 24, Ht - 50, bw, 4);
  x.font = '600 14px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.fillText(metres >= 1000 ? metres / 1000 + ' km' : metres + ' m', Wd - bw / 2 - 24, Ht - 60);
}
function zoomMap(f, px, py) {
  const before = mapToWorld(px === undefined ? window.innerWidth / 2 : px, py === undefined ? window.innerHeight / 2 : py);
  MAPV.zoom = clamp(MAPV.zoom * f, 0.8, 60);
  const after = mapToWorld(px === undefined ? window.innerWidth / 2 : px, py === undefined ? window.innerHeight / 2 : py);
  MAPV.cx += before[0] - after[0]; MAPV.cz += before[1] - after[1]; drawBigMap();
}
function searchPlaces(q) {
  q = q.trim().toLowerCase(); if (q.length < 2 || !REGION || !REGION.search) return [];
  const words = q.split(/\s+/), out = [];
  for (const e of REGION.search) {
    const n = e[0].toLowerCase(); if (!words.every((w) => n.includes(w))) continue;
    const score = (n === q ? 0 : n.startsWith(q) ? 1 : n.split(/[\s-]/).some((w) => w.startsWith(words[0])) ? 2 : 3) + Math.hypot(e[2] - player.x, e[3] - player.z) / 40000;
    out.push([score, e]);
  }
  out.sort((p, q2) => p[0] - q2[0]);
  return out.slice(0, 9).map((o) => o[1]);
}
function renderSearch() {
  const list = $('mapres'); list.innerHTML = '';
  for (const e of searchPlaces($('mapq').value)) {
    const li = document.createElement('li'), d = Math.hypot(e[2] - player.x, e[3] - player.z);
    const kind = REGION.searchKinds[e[1]], sub = REGION.suburbs.length ? suburbAt(e[2], e[3]) : '';
    li.innerHTML = '<b></b><span></span>'; li.firstChild.textContent = e[0];
    li.lastChild.textContent = `${kind}${sub && kind !== 'suburb' ? ' · ' + sub : ''} · ${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km'}`;
    li.style.borderLeftColor = SEARCH_COLORS[e[1]];
    li.addEventListener('click', (ev) => { ev.stopPropagation(); goToPlace(e); });
    list.appendChild(li);
  }
}
function goToPlace(e) {
  WAYPOINT = { name: e[0], x: e[2], z: e[3] };
  MAPV.cx = e[2]; MAPV.cz = e[3]; MAPV.zoom = e[1] === 7 ? 4 : 10;
  $('mapres').innerHTML = ''; $('mapq').blur(); drawBigMap();
  const d = Math.hypot(e[2] - player.x, e[3] - player.z);
  GPS.t = 0; toast(`Waypoint: ${e[0]} — ${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km'} away · follow the yellow line · X to cancel`);
}
// click the big map: a pin with the nearest place or street, then Go (set the route) or take a taxi there
function dropPin(px, py) {
  const [x, z] = mapToWorld(px, py), S = mapFit() * MAPV.zoom;
  let name = null, bd = 30 / S + 15;
  if (REGION && REGION.search) for (const e of REGION.search) { const d = Math.hypot(e[2] - x, e[3] - z); if (d < bd && e[1] !== 0) { bd = d; name = e[0]; } }
  const st = nearestStreet(x, z), d = Math.hypot(x - player.x, z - player.z), sub = REGION && REGION.suburbs.length ? suburbAt(x, z) : '';
  MAPV.pin = { x, z, name: name || (st ? st : 'Dropped pin') };
  $('pin-name').textContent = MAPV.pin.name;
  $('pin-sub').textContent = `${name && st && st !== name ? st + ' · ' : ''}${sub ? sub + ' · ' : ''}${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km'} away`;
  const fare = Math.round(5 + d / 1000 * 2.6), taxiOk = player.state === 'foot' && player.money >= fare;
  $('pin-taxi').textContent = `🚕 Taxi $${fare}`; $('pin-taxi').disabled = !taxiOk; $('pin-taxi').title = taxiOk ? '' : player.state !== 'foot' ? 'get out of the car first' : 'not enough cash';
  $('mappin').hidden = false; drawBigMap();
}
function pinGo() {
  const P = MAPV.pin; if (!P) return;
  WAYPOINT = { name: P.name, x: P.x, z: P.z }; GPS.t = 0; MAPV.pin = null; $('mappin').hidden = true;
  const d = Math.hypot(P.x - player.x, P.z - player.z);
  if (bigMapOpen) toggleMap();
  toast(`Heading to ${P.name} — ${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km'} · follow the yellow line · X to cancel`);
}
function initBigMap() {
  const c = $('bigc'); let drag = null;
  c.addEventListener('wheel', (e) => { e.preventDefault(); zoomMap(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY); }, { passive: false });
  c.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: MAPV.cx, cz: MAPV.cz, moved: false }; c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointermove', (e) => {
    if (!drag) return; const S = mapFit() * MAPV.zoom, dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    MAPV.cx = drag.cx - dx / S; MAPV.cz = drag.cz - dy / S; drawBigMap();
  });
  c.addEventListener('pointerup', (e) => { if (drag && !drag.moved) dropPin(e.clientX, e.clientY); drag = null; });
  c.addEventListener('dblclick', (e) => { dropPin(e.clientX, e.clientY); pinGo(); });
  $('pin-go').addEventListener('click', pinGo);
  $('pin-taxi').addEventListener('click', () => { if (!MAPV.pin) return; pinGo(); taxi(); });
  $('pin-x').addEventListener('click', () => { MAPV.pin = null; $('mappin').hidden = true; drawBigMap(); });
  $('mapq').addEventListener('input', renderSearch);
  $('mapq').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const r = searchPlaces($('mapq').value); if (r.length) goToPlace(r[0]); } });
  $('zin').addEventListener('click', () => zoomMap(1.6)); $('zout').addEventListener('click', () => zoomMap(1 / 1.6));
  $('zme').addEventListener('click', () => { MAPV.cx = player.x; MAPV.cz = player.z; drawBigMap(); });
  $('zclear').addEventListener('click', () => { cancelDestination(); drawBigMap(); });
}
function updateHUD(dt) {
  const hh = Math.floor(gameHour), mm = Math.floor((gameHour % 1) * 60);
  $('clock').textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  $('money').textContent = '$' + String(player.money).padStart(8, '0');
  const st = $('stars').children; for (let i = 0; i < 5; i++) st[i].className = i < player.stars ? 'on' : '';
  $('health').firstElementChild.style.width = player.health + '%';
  const sp = $('speedo');
  if (player.state === 'car') { sp.hidden = false; sp.firstChild.nodeValue = Math.round(player.car.speed * 3.6); } else sp.hidden = true;
  streetT -= dt;
  if (streetT <= 0) {
    streetT = 0.5;
    const s = nearestStreet(player.x, player.z);
    const inShop = player.mode === 'foot' ? shopAt(player.x, player.z) : null;
    const place = inShop ? inShop.name : player.mode === 'foot' ? nearestPlace(player.x, player.z) : '';
    if ((s && s !== lastStreet) || (place && place !== lastPlace)) {
      const showPlace = place && place !== lastPlace;
      $('street').textContent = showPlace ? place : s;
      $('district').textContent = showPlace && s && s !== place ? s : district(player.x, player.z); streetShowT = 4.5;
    }
    if (s) lastStreet = s;
    lastPlace = place;
  }
  streetShowT -= dt;
  $('street').style.opacity = $('district').style.opacity = streetShowT > 0 ? 1 : 0;
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').style.opacity = 0; }
  let prompt = '';
  const spot = player.state === 'foot' && player.deadT === 0 ? serviceSpot() : null;
  if (spot) prompt = spot.dealer ? `Press <b>F</b> to buy guns from ${spot.name}` : spot.kind === 'bank' ? `Pull out a gun (<b>1–4</b>) to rob ${spot.name}` : `Press <b>F</b> to buy at ${spot.name}`;
  if (robHint && !spot) prompt = `Pull out a weapon (<b>1–4</b>) to rob ${robHint.name}`;
  else if (robHint && spot && !spot.dealer && spot.kind !== 'bank') prompt += ' · or pull out a weapon to rob it';
  else if (player.state === 'foot' && player.deadT === 0) {
    const shop = nearShop();
    if (shop) prompt = `Press <b>F</b> to try on clothes at ${shop.name}`;
    else { const c = nearestEnterableCar(); if (c) prompt = c.driver ? `Press <b>F</b> to carjack` : `Press <b>F</b> to get in`; }
  } else if (player.state === 'car' && player.car.speed < 0.5) prompt = 'Press <b>F</b> to get out';
  const pe = $('prompt'); if (pe.innerHTML !== prompt) pe.innerHTML = prompt; pe.style.opacity = prompt ? 1 : 0;
  drawMinimap();
}

// ---------------------------------------------------------------- wardrobe (clothes shops)
const WARDROBE = {
  shirt: ['#ffffff', '#111111', '#f2c542', '#35c6cf', '#ff6f4f', '#2d6cdf', '#e85a9a', '#7fd36b', '#5a3d8a', '#ff9a3c', '#8a1f2a', '#2f5d50'],
  shorts: ['#1aa3a8', '#1f3c6e', '#2b2b2b', '#5a6b3a', '#c8b48a', '#3b6fb6', '#8a2f2f', '#e2dccf', '#f2c542', '#e85a9a'],
  shoe: ['#e8e8e8', '#111111', '#c43a2a', '#2d6cdf', '#c9a15a'],
  hair: ['#1d1612', '#3b2a1e', '#6b4a2b', '#c9a15a', '#e5cf8f', '#8a3b1f', '#d8d8d8', '#2a7de2', '#e85a9a'],
  skin: ['#f5d6bd', '#f1c9a5', '#e0ac85', '#c68c63', '#8d5a3b', '#5e3b26'],
};
function openWardrobe(shop) {
  uiOpen = true;
  if (document.pointerLockElement) document.exitPointerLock();
  const w = $('wardrobe'); w.hidden = false;
  $('wardrobe-title').textContent = shop.name;
  const body = $('wardrobe-body'); body.innerHTML = '';
  const row = (label, key) => {
    const r = document.createElement('div'); r.className = 'wrow';
    const l = document.createElement('span'); l.textContent = label; r.appendChild(l);
    const sw = document.createElement('div'); sw.className = 'swatches';
    for (const c of WARDROBE[key]) {
      const b = document.createElement('button'); b.type = 'button'; b.style.background = c; b.setAttribute('aria-label', `${label} ${c}`);
      if (player.look[key] === c) b.className = 'on';
      b.addEventListener('click', () => { player.look[key] = c; rebuildPlayer(); for (const o of sw.children) o.className = ''; b.className = 'on'; });
      sw.appendChild(b);
    }
    r.appendChild(sw); body.appendChild(r);
  };
  const styleRow = document.createElement('div'); styleRow.className = 'wrow';
  styleRow.innerHTML = '<span>Top</span>';
  const sw = document.createElement('div'); sw.className = 'swatches';
  for (const [lab, val] of [['Singlet', true], ['T-shirt', false]]) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pill' + (player.look.singlet === val ? ' on' : ''); b.textContent = lab;
    b.addEventListener('click', () => { player.look.singlet = val; rebuildPlayer(); for (const o of sw.children) o.classList.remove('on'); b.classList.add('on'); });
    sw.appendChild(b);
  }
  styleRow.appendChild(sw); body.appendChild(styleRow);
  row('Top colour', 'shirt'); row('Shorts', 'shorts'); row('Shoes', 'shoe'); row('Hair', 'hair'); row('Skin', 'skin');
  camYaw = player.h + Math.PI; camPitch = 0.05;
}
function closeWardrobe() {
  $('wardrobe').hidden = true; uiOpen = false;
  try { localStorage.setItem('gcs-look', JSON.stringify(player.look)); } catch (e) { /* storage blocked */ }
  toast('Looking sharp');
  lockPointer();
}
$('wardrobe-done').addEventListener('click', closeWardrobe);

// ---------------------------------------------------------------- input
const canvasEl = renderer.domElement;
function lockPointer() { try { const p = canvasEl.requestPointerLock && canvasEl.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* drag-to-look fallback */ } }
document.addEventListener('pointerlockchange', () => {
  mouse.locked = document.pointerLockElement === canvasEl;
  if (mouse.locked) mouse.wasLocked = true;
  else if (started && !paused && !bigMapOpen && !uiOpen && mouse.wasLocked) setPaused(true);
});
// some keyboards and on-screen keyboards leave KeyboardEvent.code empty; fall back to the character
function keyCode(e) {
  if (e.code) return e.code;
  const k = e.key || '';
  if (k === ' ') return 'Space';
  if (k === '`') return 'Backquote';
  if (/^[a-z]$/i.test(k)) return 'Key' + k.toUpperCase();
  if (/^[0-9]$/.test(k)) return 'Digit' + k;
  return { Escape: 'Escape', Enter: 'Enter', Shift: 'ShiftLeft', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Tab: 'Tab' }[k] || k;
}
function punch() { if (player.state === 'foot' && player.punchT <= 0 && player.deadT === 0) { player.punchT = 0.32; player.punchArm = 1 - player.punchArm; } }
canvasEl.addEventListener('contextmenu', (e) => e.preventDefault());
canvasEl.addEventListener('mousedown', (e) => {
  if (!started || paused || uiOpen) return;
  if (!mouse.locked) lockPointer();
  mouse.dragging = true;
  if (e.button === 2) mouse.aim = true;
  if (e.button === 0) { mouse.fire = true; mouse.fired = false; if (player.weapon === 'fist') punch(); }
});
window.addEventListener('mouseup', (e) => { mouse.dragging = false; if (e.button === 2) mouse.aim = false; if (e.button === 0) mouse.fire = false; });
window.addEventListener('wheel', (e) => { if (started && !paused && !uiOpen && player.state === 'foot') cycleWeapon(e.deltaY > 0 ? 1 : -1); }, { passive: true });
window.addEventListener('mousemove', (e) => {
  if (!started || paused || uiOpen) return;
  if (!mouse.locked && !mouse.dragging) return;
  if (player.state === 'plane') { PLANE_MOUSE.y = clamp(PLANE_MOUSE.y - e.movementY * 0.02, -1, 1); PLANE_MOUSE.x = clamp(PLANE_MOUSE.x - e.movementX * 0.012, -1, 1); return; } // the mouse flies it: up climbs, sideways turns
  camYaw -= e.movementX * 0.0024; camPitch = clamp(camPitch + e.movementY * 0.0022, -0.35, 1.25);
  mouse.last = elapsed;
});
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) { if (e.key === 'Escape') e.target.blur(); return; } // typing in the map search
  const code = keyCode(e);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code)) e.preventDefault();
  if (MG.active) { if (!e.repeat && !(e.target && e.target.tagName === 'INPUT')) mgKey(code); else if (code === 'Escape') mgKey('Escape'); return; }
  if (code === 'Space') struggleTap();
  if (e.repeat) return;
  keys[code] = true;
  if (!started) return;
  if (uiOpen) {
    if (PHONE.open) { if (code === 'Escape' || code === 'KeyP') closePhone(); return; }
    if (!$('casino').hidden) { if (code === 'Escape') closeCasino(); return; }
    if (code === 'Escape' || code === 'KeyF' || code === 'Enter' || code === 'KeyB') { if (!$('shop').hidden) closeShop(); else if (!$('bag').hidden) closeBag(); else closeWardrobe(); }
    return;
  }
  if (code === 'Escape' && !mouse.locked) { if (bigMapOpen) toggleMap(); else setPaused(!paused); return; }
  if (paused) return;
  if (code === 'KeyF' || code === 'KeyE') useKey();
  if (code === 'KeyQ') punch();
  if (code === 'Backquote') devToggle();
  if (code === 'KeyB') openBag();
  if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(code)) selectWeapon(WEAPON_ORDER[+code.slice(5) - 1]);
  if (code === 'KeyH') { sfxTone([392, 494], 0.35, 0.07); for (const p of peds) if (Math.hypot(p.x - player.x, p.z - player.z) < 12) p.scare(player.x, player.z, 1.2); }
  if (code === 'KeyC') camIdx = (camIdx + 1) % CAM_CAR.length;
  if (code === 'KeyM') toggleMap();
  if (code === 'KeyG') surrender();
  if (code === 'KeyX') cancelDestination();
  if (code === 'KeyP') openPhone();
  if (code === 'KeyT') { timeScale = timeScale === 1 ? 30 : 1; toast(timeScale > 1 ? 'Time ×30' : 'Time normal'); }
  if (code === 'KeyN') { AU.on = !AU.on; toast(AU.on ? 'Sound on' : 'Sound off'); }
});
window.addEventListener('keyup', (e) => { keys[keyCode(e)] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function toggleMap() {
  bigMapOpen = !bigMapOpen; $('bigmap').hidden = !bigMapOpen;
  if (bigMapOpen) { MAPV.cx = player.x; MAPV.cz = player.z; drawBigMap(); if (document.pointerLockElement) document.exitPointerLock(); }
  else { $('mapq').blur(); MAPV.pin = null; $('mappin').hidden = true; lockPointer(); }
}
initBigMap();
function setPaused(p) {
  paused = p;
  $('menu').hidden = !p;
  $('play').textContent = 'Resume';
  if (!p) lockPointer();
}
$('play').addEventListener('click', async () => {
  initAudio(); if (AU.ctx && AU.ctx.state === 'suspended') AU.ctx.resume();
  if (!started) await goToSpawn($('pick-spawn').value);
  started = true; setPaused(false);
});

// ---------------------------------------------------------------- the start screen: how you look, and where you start
const PICKS = {
  skin: ['#fbe3cf', '#f1c9a5', '#e8b98f', '#e0ac85', '#c99068', '#a8714a', '#8d5a3b', '#6e4430', '#56351f', '#3b2416'],
  hair: ['#111111', '#2b1d14', '#4a3020', '#6b4a2b', '#a87a45', '#d9b56c', '#efdba0', '#8a3b1f', '#b0aca6', '#e9e6e1'],
  shirt: ['#ffffff', '#1e1e1e', '#f2c542', '#35c6cf', '#ff6f4f', '#2d6cdf', '#e85a9a', '#7fd36b', '#5a3d8a', '#ff9a3c'],
  shorts: ['#1aa3a8', '#1f3c6e', '#2b2b2b', '#5a6b3a', '#c8b48a', '#3b6fb6', '#8a2f2f', '#e2dccf'],
};
const SPAWN_PLACES = []; // [label, x, z, heading]
function initSetup() {
  for (const k of Object.keys(PICKS)) {
    const box = $('pick-' + k); box.innerHTML = '';
    for (const c of PICKS[k]) {
      const b = document.createElement('button'); b.type = 'button'; b.style.background = c; b.setAttribute('aria-label', k + ' ' + c);
      b.setAttribute('aria-pressed', String(player.look[k] === c));
      b.addEventListener('click', () => { player.look[k] = c; for (const o of box.children) o.setAttribute('aria-pressed', String(o === b)); rebuildPlayer(); saveGame(); });
      box.appendChild(b);
    }
  }
  $('pick-gfx').value = GFX.level; $('pick-gfx').onchange = () => applyGfx($('pick-gfx').value);
  // the north and south ends of every suburb, plus the big landmarks, each snapped onto a real street
  if (!REGION || SPAWN_PLACES.length) return;
  const sel = $('pick-spawn');
  const B = REGION.bounds, inMap = (p) => p[0] > B[0] + 120 && p[0] < B[2] - 120 && p[1] > B[1] + 120 && p[1] < B[3] - 120; // not off the edge of the map
  const near = (x, z) => {
    let best = null, bd = 1e9;
    for (const r of REGION.roads) {
      if (r[0] < 1 || r[0] > 4) continue; // ordinary streets: primary down to residential (no motorway or highway)
      for (let i = 1; i < r.length - 1; i += 2) { const d = Math.hypot(r[i] - x, r[i + 1] - z); if (d < bd && inMap([r[i], r[i + 1]])) { bd = d; best = [r[i], r[i + 1], r[i + 2] !== undefined ? Math.atan2(r[i + 2] - r[i], r[i + 3] - r[i + 1]) : 0]; } }
    }
    return best;
  };
  const add = (group, label, x, z) => { const p = near(x, z); if (!p) return; SPAWN_PLACES.push([label, p[0], p[1], p[2]]); const o = document.createElement('option'); o.value = String(SPAWN_PLACES.length - 1); o.textContent = label; group.appendChild(o); };
  const lg = document.createElement('optgroup'); lg.label = 'Landmarks'; sel.appendChild(lg);
  const qi = Object.keys(MAP.details.bnames || {}).find((k) => /^Q1/.test(MAP.details.bnames[k]));
  if (qi) { const f = MAP.buildings[qi].slice(3); let x = 0, z = 0; for (let q = 0; q < f.length; q += 2) { x += f[q]; z += f[q + 1]; } add(lg, 'Q1 Tower', x / (f.length / 2), z / (f.length / 2)); }
  for (const nm of ['Pacific Fair', 'Robina Town Centre', 'Australia Fair Shopping Centre', 'Broadbeach Mall', 'The Star Gold Coast', 'Gold Coast University Hospital', 'Southport State High School', 'Currumbin Wildlife Sanctuary', 'Kirra Beach']) {
    const e = REGION.search.find((q) => q[0] === nm) || REGION.search.find((q) => q[0].startsWith(nm)); if (e) add(lg, e[0], e[2], e[3]);
  }
  if (AIRPORT && AIRPORT.rw) { // on the apron beside the parked planes
    const R = AIRPORT.rw, x = R.x1 + R.ex * 100 + R.nx * 55, z = R.z1 + R.ez * 100 + R.nz * 55;
    SPAWN_PLACES.push(['Gold Coast Airport — by the planes', x, z, R.h + Math.PI / 2]); const o = document.createElement('option'); o.value = String(SPAWN_PLACES.length - 1); o.textContent = 'Gold Coast Airport — by the planes'; lg.appendChild(o);
  }
  const bg = document.createElement('optgroup'); bg.label = 'Beaches'; sel.appendChild(bg);
  for (const e of REGION.search.filter((q) => q[1] === 3).sort((a, b) => a[3] - b[3])) add(bg, e[0], e[2], e[3]);
  const subs = REGION.suburbs.filter((q) => q[3] === 'suburb' || q[3] === 'town').sort((a, b) => a[1] - b[1]);
  for (const [sx, sz, nm] of subs) {
    const g = document.createElement('optgroup'); g.label = nm; sel.appendChild(g);
    add(g, nm + ' — north', sx, sz - 700); add(g, nm + ' — centre', sx, sz); add(g, nm + ' — south', sx, sz + 700);
  }
  try { const last = localStorage.getItem('gcs-spawn'); if (last && SPAWN_PLACES[+last]) sel.value = last; } catch (e) { /* storage blocked */ }
}
// ---------------------------------------------------------------- never stuck inside a building
// solid buildings (car parks, offices, sheds) have walls but no inside, so standing within one means you're trapped
function bbOf(b) {
  if (!b.bb) { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let q = 3; q < b.length; q += 2) { x0 = Math.min(x0, b[q]); x1 = Math.max(x1, b[q]); z0 = Math.min(z0, b[q + 1]); z1 = Math.max(z1, b[q + 1]); } b.bb = [x0, z0, x1, z1]; }
  return b.bb;
}
function solidBuildingsNear(x, z, r) {
  const list = [], scan = (arr) => { for (const b of arr) { if (b[1] > 2) continue; const bb = bbOf(b); if (x > bb[0] - r && x < bb[2] + r && z > bb[1] - r && z < bb[3] + r) list.push(b); } }; // raised parts (canopies, skybridges) can be walked under
  if (x > MINX - r - 50 && x < MAXX + r + 50 && z > MINZ - r - 50 && z < MAXZ + r + 50) scan(MAP.buildings);
  if (REGION) for (const T of TILES.values()) if (T.blds && x > T.x0 - r - 150 && x < T.x0 + REGION.tile + r + 150 && z > T.z0 - r - 150 && z < T.z0 + REGION.tile + r + 150) scan(T.blds);
  return list;
}
function insideSolid(x, z, list) {
  if (houseAt(x, z) || shopAt(x, z) || (TOWER && inRing(x, z, TOWER.f))) return false; // places with a real inside
  for (const b of list) { const bb = bbOf(b); if (x > bb[0] && x < bb[2] && z > bb[1] && z < bb[3] && inRing(x, z, b.slice(3))) return true; }
  return false;
}
// the nearest spot out in the open: on land, outside every solid building and clear of walls
function freeSpotNear(x, z, maxR = 200) {
  const list = solidBuildingsNear(x, z, maxR);
  for (let r = 0; r <= maxR; r += 2) for (let a = 0, n = Math.max(1, Math.round(r * 0.8)); a < n; a++) {
    const t = (a / n) * TAU, px = x + Math.cos(t) * r, pz = z + Math.sin(t) * r;
    if (isLand(px, pz) && !insideSolid(px, pz, list) && !resolveCircle(px, pz, 0.6)) return [px, pz];
  }
  return null;
}
let stuckT = 0, stuckCheckT = 0;
function updateUnstuck(dt) {
  stuckCheckT -= dt; if (stuckCheckT > 0) return; stuckCheckT = 0.5;
  if (player.state !== 'foot' || player.deadT > 0 || !insideSolid(player.x, player.z, solidBuildingsNear(player.x, player.z, 2))) { stuckT = 0; return; }
  stuckT += 0.5; if (stuckT < 1) return;
  const P = freeSpotNear(player.x, player.z); stuckT = 0;
  if (P) { player.x = P[0]; player.z = P[1]; player.y = 0; toast('You were stuck inside a building — moved you outside'); }
}
// move to the chosen start and wait for the streets there to stream in
async function goToSpawn(v) {
  try { localStorage.setItem('gcs-spawn', v); } catch (e) { /* storage blocked */ }
  const P = SPAWN_PLACES[+v]; if (v === '' || !P) return;
  $('play').disabled = true; $('play').textContent = 'Heading to ' + P[0].split(' — ')[0] + '…';
  player.x = P[1]; player.z = P[2]; player.h = P[3]; camYaw = player.h;
  for (let k = 0; k < 400; k++) { updateTiles(0.5); await new Promise((r) => setTimeout(r, 25)); if (k > 10 && !tileBusy && TILES.has(Math.floor(player.x / REGION.tile) + ',' + Math.floor(player.z / REGION.tile)) && TILES.size >= 4) break; }
  // step off the road onto the footpath
  const fx = Math.sin(player.h), fz = Math.cos(player.h);
  for (const side of [1, -1]) { const x = player.x + fz * 6 * side, z = player.z - fx * 6 * side; if (isLand(x, z) && !resolveCircle(x, z, 0.5)) { player.x = x; player.z = z; break; } }
  // a landmark that is a building (a shopping centre, a hospital): start just outside its wall nearest the road
  const name = P[0].split(' — ')[0]; let bld = null;
  for (const T of TILES.values()) (T.blds || []).forEach((b, bi) => { if (!bld && T.bnames && T.bnames[bi] === name) bld = b; });
  if (bld) {
    const f = bld.slice(3), n = f.length / 2; let best = null, bd = 1e9;
    for (let q = 0; q < n; q++) {
      const ax = f[2 * q], az = f[2 * q + 1], bx = f[(2 * q + 2) % (2 * n)], bz = f[(2 * q + 3) % (2 * n)], L = Math.hypot(bx - ax, bz - az); if (L < 6) continue;
      let nx = (bz - az) / L, nz = -(bx - ax) / L; const mx = (ax + bx) / 2, mz = (az + bz) / 2; if (inRing(mx + nx * 0.5, mz + nz * 0.5, f)) { nx = -nx; nz = -nz; }
      const px = mx + nx * 5, pz = mz + nz * 5, ne = nearestEdge(px, pz); if (ne.e < 0 || !EDGES[ne.e]) continue;
      edgePoint(EDGES[ne.e], 1, ne.s, tmpA); const d = Math.hypot(tmpA.x - px, tmpA.z - pz);
      if (d < bd) { bd = d; best = [px, pz, Math.atan2(-nx, -nz)]; }
    }
    if (best) { player.x = best[0]; player.z = best[1]; player.h = camYaw = best[2]; } // facing the building
  }
  const out = freeSpotNear(player.x, player.z); if (out) { player.x = out[0]; player.z = out[1]; } // some roads run through car parks and under buildings
  playerSpot = { x: player.x, z: player.z };
  for (const c of cars.slice()) if (c !== player.car && c.kind !== 'abandoned' && Math.hypot(c.x - player.x, c.z - player.z) > 400) c.remove();
  for (let i = 0; i < 20; i++) spawnTraffic(30, 330, 'traffic');
  for (let i = 0; i < 24; i++) spawnPed(4, 140);
  updateCamera(0.016); toast(P[0]);
  $('play').disabled = false; // the same button becomes Resume on the pause menu
}
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight); postTargets();
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
});

// ---------------------------------------------------------------- main loop
function stepWorld(dt) {
  elapsed += dt;
  const steps = dt > 1 / 45 ? 2 : 1, h = dt / steps;
  for (let s = 0; s < steps; s++) {
    updatePlayer(h);
    for (const c of cars) {
      if (c.ai && c.driver && c.driver !== 'player' && !c.dead && c.sink === 0) driveAI(c, h);
      c.step(h);
    }
    collideCars();
    carsVsPeople();
  }
  for (const c of cars) c.sync(dt);
  for (const p of peds.slice()) p.update(dt);
  if (player.state === 'car' && player.car && player.car.dead && player.car.sink === 0) bailOut();
  updateDetails(dt);
  updateTiles(dt); updateHouses(dt); updateLoose(dt); updateUnstuck(dt); updateGrass(dt); updateTowers(dt); updateEconomy(dt); updateGPS(dt); updateMissions(dt); updatePlanes(dt);
  updateShops(dt);
  updateWeapons(dt);
  updatePickups(dt);
  updateDrift(dt);
  updateWanted(dt);
  updateCopField(dt);
  manageWorld(dt);
  updateParticles(dt);
  updateSky(dt);
  updateCamera(dt);
  updateHUD(dt);
  updateAudio(dt);
  devUpdate();
}
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (!ready) return;
  if (!started || paused || bigMapOpen || uiOpen) {
    if (!started) { camYaw += dt * 0.05; elapsed += dt; updateCamera(dt); updateSky(0); }
    if (uiOpen) { elapsed += dt; updateCamera(dt); if (MG.active) mgUpdate(dt); }
    renderFrame();
    return;
  }
  stepWorld(dt);
  renderFrame();
}

// ---------------------------------------------------------------- boot
// yield so the loading text paints; the timeout keeps loading going in a background tab
const nextFrame = () => new Promise((r) => { let done = false; const go = () => { if (!done) { done = true; setTimeout(r, 0); } }; requestAnimationFrame(go); setTimeout(go, 80); });
async function boot() {
  const say = (t) => ($('load').textContent = t);
  try {
    say('Reading the Gold Coast coastline…'); await nextFrame();
    try { await Promise.race([Promise.all([document.fonts.load('400 40px "Bowlby One"'), document.fonts.load('700 40px "Barlow Condensed"')]), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* fallback fonts */ }
    buildMasks();
    say('Laying the ground and the beach…'); await nextFrame();
    buildGround(); buildWater();
    say('Paving the streets…'); await nextFrame();
    buildRoads();
    say('Raising 2,300 buildings (and Q1)…'); await nextFrame();
    buildBuildings();
    say('Planting palm trees…'); await nextFrame();
    buildTrees(); buildStreetLights(); buildLandmarks();
    say('Putting up 500 shop and street signs…'); await nextFrame();
    buildDetails();
    buildShops(); initShopUI(); initMiniGameUI(); initCasinoUI();
    say('Loading the Gold Coast around Surfers…'); await loadRegion();
    finishGrid();
    scene.traverse((o) => { const m = o.material; if (m && m.isMeshStandardMaterial && m.envMapIntensity === 1) m.envMapIntensity = 0.3; });
    personMat.envMapIntensity = 0.4; trimMat.envMapIntensity = 0.5; wheelMat.envMapIntensity = 0.5; coinMat.envMapIntensity = 1.2; tramMat.envMapIntensity = 0.6;
    say('Starting traffic…'); await nextFrame();
    const [mc, mx] = worldCanvas(MAPPPM); drawLayers(mx, MINI_PAL, true); mapCanvas = mc;
    for (const ring of MAP.ocean) { const c = coastLine(ring); for (let i = 0; i < c.length; i += 2) if (c[i + 1] > MINZ - 100 && c[i + 1] < MAXZ + 100) coastPts.push(c[i], c[i + 1]); }
    buildParkSpots();
    // start on Cavill Mall, just inland from the arch
    const sign = window.SIGN_POS || { x: 740, z: 303, fx: 1, fz: 0 };
    playerSpot = { x: sign.x - sign.fx * 30, z: sign.z - sign.fz * 30 };
    const s0 = resolveCircle(playerSpot.x, playerSpot.z, 0.5) ? sidewalkNear(playerSpot.x, playerSpot.z) : playerSpot;
    playerSpot = { x: s0.x, z: s0.z };
    player.x = playerSpot.x; player.z = playerSpot.z; player.h = Math.atan2(sign.fx, sign.fz); camYaw = player.h;
    loadGame();
    rebuildPlayer();
    setInterval(() => { if (started) saveGame(); }, 30000);
    // a gold coupe waiting on The Esplanade, made for drifting
    const ne = nearestEdge(sign.x - sign.fx * 10, sign.z - sign.fz * 10, (E) => E.name === 'The Esplanade');
    if (ne.e >= 0) {
      const E = EDGES[ne.e]; edgePoint(E, 1, clamp(ne.s + 24, 0, E.len), tmpA);
      const off = -(E.width / 2 - 1.1), x = tmpA.x + tmpA.tz * off, z = tmpA.z - tmpA.tx * off;
      const c = new Car('coupe', '#d9a520', x, z, Math.atan2(-tmpA.tx, -tmpA.tz)); c.kind = 'abandoned'; cars.push(c);
    }
    for (let i = 0; i < 26; i++) spawnTraffic(30, 330, 'traffic');
    spawnParked(190, 0);
    for (let i = 0; i < 36; i++) spawnPed(4, 140);
    buildPickups();
    updateSky(0); refreshEnvironment();
    updateCamera(0.016);
    say('');
    ready = true;
    initSetup();
    $('play').disabled = false; $('play').textContent = 'Play';
  } catch (err) {
    console.error(err);
    say('Something went wrong while building the city: ' + err.message);
  }
}
requestAnimationFrame(frame);
boot();
