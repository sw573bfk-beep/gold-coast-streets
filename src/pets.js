// ============================================================================
// Gold Coast Streets — a dog of your own. Adopt one at any pet shop (walk in, E at the counter). It follows you,
// hops in the car with you (and out again), sits, comes when called and fetches a ball (phone → Pet).
// ============================================================================
const BREEDS = { Kelpie: ['#8a4b2a', '#2a1a10'], Labrador: ['#e2c48a', '#c9a76a'], Staffy: ['#5a4a42', '#f2f2f0'], Cavoodle: ['#c98e5a', '#a86e40'], 'Border Collie': ['#1d1d1d', '#f4f4f2'] };
const PET = { m: null, x: 0, z: 0, h: 0, mode: 'follow', ball: null, t: 0, barkT: 5 };
function petData() { return ECON.pet || null; }
function makeDog(breed) {
  const [a, b] = BREEDS[breed] || BREEDS.Kelpie, g = new THREE.Group(), mA = new THREE.MeshStandardMaterial({ color: col(a), roughness: 0.85 }), mB = new THREE.MeshStandardMaterial({ color: col(b), roughness: 0.85 });
  const add = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  add(0.32, 0.3, 0.75, 0, 0.45, 0, mA); const head = add(0.26, 0.26, 0.3, 0, 0.66, 0.46, mA); add(0.14, 0.12, 0.16, 0, 0.6, 0.66, mB);
  for (const s of [-1, 1]) add(0.06, 0.12, 0.04, s * 0.09, 0.82, 0.42, mB);
  const tail = add(0.06, 0.06, 0.32, 0, 0.6, -0.48, mA); tail.rotation.x = 0.6;
  const legs = [[-0.11, 0.25], [0.11, 0.25], [-0.11, -0.25], [0.11, -0.25]].map(([x, z]) => add(0.08, 0.32, 0.08, x, 0.16, z, mB));
  scene.add(g); return { g, head, tail, legs };
}
function spawnPet() {
  const P = petData(); if (!P || PET.m) return;
  PET.m = makeDog(P.breed); PET.x = player.x + 1.5; PET.z = player.z; PET.mode = 'follow';
}
function dropPet() { if (!PET.m) return; scene.remove(PET.m.g); PET.m.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); PET.m = null; }
function adoptPet(sh) {
  econPanel(sh.name, 'Adopt a dog ($350, vaccinated and chipped). Name it, and it’s yours — it saves with your game.', Object.keys(BREEDS).map((b) => [`${b}${petData() && petData().breed === b ? ' (yours)' : ''}`, 'Adopt', player.money >= 350 && !petData(), () => {
    if (!pay(350, 'the adoption')) return; const name = (prompt(`Name your ${b}:`, b === 'Kelpie' ? 'Red' : 'Buddy') || 'Buddy').replace(/[^A-Za-z0-9 '-]/g, '').slice(0, 14) || 'Buddy';
    ECON.pet = { breed: b, name, happy: 80 }; saveGame(); closeShop(); dropPet(); spawnPet(); toast(`🐶 Meet ${name}! Phone → Pet for sit, come and fetch`); sfxTone([660, 880, 990], 0.3, 0.05);
  }]));
}
function petCommand(cmd) {
  const P = petData(); if (!P) return; if (!PET.m) spawnPet(); closePhone();
  if (cmd === 'fetch') { const fx = Math.sin(player.h), fz = Math.cos(player.h); PET.ball = { x: player.x + fx * 16, z: player.z + fz * 16, got: false }; PET.mode = 'fetch'; toast(`You threw the ball — go ${P.name}!`); if (!PET.ballM) { PET.ballM = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: col('#c7f000') })); scene.add(PET.ballM); } PET.ballM.visible = true; }
  else if (cmd === 'sit') { PET.mode = 'sit'; toast(`${P.name} sits. Good dog.`); }
  else if (cmd === 'come') { PET.mode = 'follow'; toast(`${P.name} trots back to you`); }
  else if (cmd === 'pat') { P.happy = Math.min(100, (P.happy || 50) + 15); PET.t = 0; toast(`${P.name} wags like mad 🐾`); sfxTone([990], 0.08, 0.04); saveGame(); }
}
function petApp(btn, head) {
  const P = petData();
  if (!P) { btn('No dog yet', 'adopt one at a pet shop (walk in, E at the counter)', () => {}, false); const s = nearest(SHOPS.filter((q) => q.type === 'pet' || /\bpet/i.test(q.name))); if (s) btn('📍 Nearest pet shop', `${s.name} · ${km(s.x, s.z)}`, () => directions(s.name, s.x, s.z)); return; }
  head(`🐶 ${P.name} the ${P.breed} · happiness ${P.happy || 50}%`);
  btn('Come here', 'whistle', () => petCommand('come')); btn('Sit', 'stay put', () => petCommand('sit')); btn('Fetch', 'throw the ball the way you’re facing', () => petCommand('fetch')); btn('Pat', '', () => petCommand('pat'));
}
function updatePet(dt) {
  const P = petData(); if (!P) { dropPet(); return; } if (!PET.m) spawnPet();
  const M = PET.m, riding = player.state !== 'foot' || player.deadT > 0 || !!TOWER;
  M.g.visible = !riding; if (riding) { PET.x = player.x; PET.z = player.z; return; } // in the car (or the lift) with you
  let tx = PET.x, tz = PET.z, speed = 0;
  if (PET.mode === 'follow') { const bx = player.x - Math.sin(player.h) * 1.6 + Math.cos(player.h) * 0.8, bz = player.z - Math.cos(player.h) * 1.6 - Math.sin(player.h) * 0.8; const d = Math.hypot(bx - PET.x, bz - PET.z); if (d > 40) { PET.x = bx; PET.z = bz; } else if (d > 0.8) { tx = bx; tz = bz; speed = Math.min(9, d * 2.2); } }
  else if (PET.mode === 'fetch' && PET.ball) {
    const B = PET.ball; if (!B.got) { tx = B.x; tz = B.z; speed = 8; if (Math.hypot(B.x - PET.x, B.z - PET.z) < 0.6) { B.got = true; PET.ballM.visible = false; } }
    else { tx = player.x; tz = player.z; speed = 7; if (Math.hypot(player.x - PET.x, player.z - PET.z) < 1.4) { PET.mode = 'follow'; PET.ball = null; P.happy = Math.min(100, (P.happy || 50) + 10); stat('fetches'); actComplete('pet', { msg: `${P.name} drops the ball at your feet 🎾` }); } }
    if (PET.ballM && !B.got) PET.ballM.position.set(B.x, standAt(B.x, B.z) + 0.1, B.z);
  }
  if (speed > 0) { const d = Math.hypot(tx - PET.x, tz - PET.z) || 1, k = Math.min(1, speed * dt / d); const nx = PET.x + (tx - PET.x) * k, nz = PET.z + (tz - PET.z) * k; if (!resolveCircle(nx, nz, 0.25)) { PET.x = nx; PET.z = nz; } PET.h = Math.atan2(tx - PET.x, tz - PET.z); }
  PET.t += dt; const run = speed > 0.5, ph = PET.t * (run ? 14 : 2);
  M.g.position.set(PET.x, standAt(PET.x, PET.z), PET.z); M.g.rotation.set(0, PET.h, 0);
  M.legs.forEach((l, i) => { l.rotation.x = run ? Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.6 : 0)) * 0.7 : 0; });
  M.tail.rotation.y = Math.sin(PET.t * 12) * 0.5; M.g.children[0].position.y = PET.mode === 'sit' ? 0.32 : 0.45;
  PET.barkT -= dt; if (PET.barkT <= 0) { PET.barkT = 8 + Math.random() * 14; if (peds.some((p) => Math.hypot(p.x - PET.x, p.z - PET.z) < 6)) sfxTone([420, 360], 0.12, 0.05, 'square'); } // a woof at strangers
}
