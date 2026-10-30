// ============================================================================
// Gold Coast Streets — models: people and cars built from code
// ============================================================================

function paintGeo(g, color) {
  const c = color.isColor ? color : col(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function box(w, h, d, x, y, z, color) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return paintGeo(g, color); }
function mergeGeos(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), colr = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    if (!g.attributes.normal) g.computeVertexNormals();
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.color) colr.set(g.attributes.color.array, o * 3); else colr.fill(1, o * 3, (o + g.attributes.position.count) * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  out.computeBoundingSphere();
  return out;
}

// ---------------------------------------------------------------- people
const personMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
const SKIN = ['#f1c9a5', '#e0ac85', '#c68c63', '#8d5a3b', '#5e3b26', '#f5d6bd'];
const HAIR = ['#1d1612', '#3b2a1e', '#6b4a2b', '#c9a15a', '#e5cf8f', '#2a2a2a', '#8a3b1f'];
const SHIRT = ['#ffffff', '#f2c542', '#35c6cf', '#ff6f4f', '#2d6cdf', '#1e1e1e', '#e85a9a', '#7fd36b', '#f4efe4', '#5a3d8a', '#ff9a3c'];
const SHORTS = ['#1f3c6e', '#2b2b2b', '#5a6b3a', '#c8b48a', '#3b6fb6', '#8a2f2f', '#e2dccf', '#1aa3a8'];
function makePerson(opt = {}) {
  const skin = col(opt.skin || pick(SKIN)), hair = col(opt.hair || pick(HAIR)), shirt = col(opt.shirt || pick(SHIRT)), shorts = col(opt.shorts || pick(SHORTS));
  const singlet = opt.singlet !== undefined ? opt.singlet : rand() < 0.35;
  const shoe = col(opt.shoe || (rand() < 0.5 ? '#2a2a2a' : '#e8e8e8'));
  const root = new THREE.Group();
  const body = mergeGeos([
    box(0.44, 0.6, 0.25, 0, 1.2, 0, shirt),
    box(0.42, 0.16, 0.245, 0, 0.94, 0, shorts),
    box(0.12, 0.08, 0.12, 0, 1.54, 0, skin),
    box(0.23, 0.26, 0.24, 0, 1.69, 0, skin),
    box(0.25, 0.07, 0.26, 0, 1.84, -0.01, hair),
    box(0.25, 0.16, 0.06, 0, 1.75, -0.12, hair),
    box(0.17, 0.03, 0.02, 0, 1.72, 0.121, col('#2a2422')),
    ...(opt.sunnies ? [box(0.21, 0.055, 0.03, 0, 1.715, 0.128, '#0b0b0b'), box(0.02, 0.02, 0.2, 0.11, 1.72, 0.03, '#0b0b0b'), box(0.02, 0.02, 0.2, -0.11, 1.72, 0.03, '#0b0b0b')] : []),
    ...(opt.cap ? [box(0.26, 0.08, 0.28, 0, 1.87, -0.005, opt.cap), box(0.22, 0.025, 0.14, 0, 1.835, 0.19, opt.cap)] : []),
  ]);
  const bm = new THREE.Mesh(body, personMat); bm.castShadow = true; root.add(bm);
  const legGeo = mergeGeos([box(0.18, 0.4, 0.2, 0, -0.2, 0, shorts), box(0.13, 0.44, 0.15, 0, -0.62, 0, skin), box(0.15, 0.08, 0.27, 0, -0.88, 0.04, shoe)]);
  const armGeo = mergeGeos([box(0.13, 0.22, 0.14, 0, -0.1, 0, singlet ? skin : shirt), box(0.105, 0.42, 0.115, 0, -0.42, 0, skin), box(0.1, 0.1, 0.11, 0, -0.68, 0, skin)]);
  const limb = (geo, x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); const m = new THREE.Mesh(geo, personMat); m.castShadow = true; p.add(m); root.add(p); return p; };
  const legL = limb(legGeo, 0.11, 0.92), legR = limb(legGeo, -0.11, 0.92);
  const armL = limb(armGeo, 0.28, 1.47), armR = limb(armGeo, -0.28, 1.47);
  return { root, legL, legR, armL, armR, body: bm, geos: [body, legGeo, armGeo] };
}
function animatePerson(P, phase, amt, mode) {
  const s = Math.sin(phase) * amt;
  if (mode === 'swim') {
    P.armL.rotation.x = -Math.PI * 0.9 + Math.sin(phase) * 1.2; P.armR.rotation.x = -Math.PI * 0.9 - Math.sin(phase) * 1.2;
    P.legL.rotation.x = s * 0.4; P.legR.rotation.x = -s * 0.4;
    return;
  }
  if (mode === 'sprint') { // long strides, pumping arms held bent and in close
    P.legL.rotation.x = s * 1.1; P.legR.rotation.x = -s * 1.1;
    P.armL.rotation.x = -s * 1.25 - 0.35; P.armR.rotation.x = s * 1.25 - 0.35;
    P.armL.rotation.z = -0.25; P.armR.rotation.z = 0.25;
    P.body.position.y = Math.abs(Math.cos(phase)) * 0.09 * amt;
    return;
  }
  P.legL.rotation.x = s * 0.75; P.legR.rotation.x = -s * 0.75;
  P.armL.rotation.x = -s * 0.65; P.armR.rotation.x = s * 0.65;
  P.armL.rotation.z = 0.06; P.armR.rotation.z = -0.06;
  P.body.position.y = Math.abs(Math.cos(phase)) * 0.05 * amt;
}
function disposePerson(P) { scene.remove(P.root); for (const g of P.geos) g.dispose(); }

// ---------------------------------------------------------------- cars
// drive: which wheels push; mu: tyre grip; frontBias: share of weight on the front axle
const CAR_TYPES = {
  sedan: { L: 4.7, W: 1.82, wr: 0.34, wb: 2.75, bot: 0.3, bump: 0.62, hood: 0.86, trunk: 0.94, belt: 0.97, roof: 1.45, cr: -1.2, rr: -0.72, rf: 0.36, cf: 1.08, accel: 8, max: 50, grip: 7.2, mass: 1450, drive: 'fwd', mu: 1.05, frontBias: 0.6 },
  hatch: { L: 4.05, W: 1.76, wr: 0.32, wb: 2.5, bot: 0.3, bump: 0.6, hood: 0.84, trunk: 1.0, belt: 0.98, roof: 1.48, cr: -1.86, rr: -1.68, rf: 0.28, cf: 0.92, accel: 7.2, max: 44, grip: 7.4, mass: 1150, drive: 'fwd', mu: 1.08, frontBias: 0.62 },
  ute: { L: 5.15, W: 1.86, wr: 0.38, wb: 3.1, bot: 0.4, bump: 0.74, hood: 1.02, trunk: 1.06, belt: 1.08, roof: 1.78, cr: -0.42, rr: -0.4, rf: 0.6, cf: 1.32, accel: 8.6, max: 50, grip: 6.4, mass: 1800, tray: true, drive: 'rwd', mu: 0.92, frontBias: 0.58 },
  suv: { L: 4.8, W: 1.9, wr: 0.38, wb: 2.85, bot: 0.42, bump: 0.8, hood: 1.08, trunk: 1.18, belt: 1.16, roof: 1.82, cr: -2.15, rr: -2.05, rf: 0.24, cf: 1.02, accel: 7, max: 45, grip: 6.2, mass: 2000, drive: 'awd', mu: 1.0, frontBias: 0.55 },
  sports: { L: 4.45, W: 1.9, wr: 0.33, wb: 2.6, bot: 0.22, bump: 0.5, hood: 0.7, trunk: 0.8, belt: 0.82, roof: 1.2, cr: -1.05, rr: -0.5, rf: 0.22, cf: 0.98, accel: 11.5, max: 66, grip: 8.6, mass: 1350, drive: 'rwd', mu: 1.12, frontBias: 0.46 },
  coupe: { L: 4.35, W: 1.76, wr: 0.32, wb: 2.52, bot: 0.26, bump: 0.56, hood: 0.78, trunk: 0.9, belt: 0.92, roof: 1.32, cr: -0.95, rr: -0.55, rf: 0.25, cf: 0.95, accel: 10, max: 58, grip: 7.6, mass: 1250, drive: 'rwd', mu: 0.96, frontBias: 0.52 },
  muscle: { L: 4.95, W: 1.9, wr: 0.36, wb: 2.9, bot: 0.3, bump: 0.64, hood: 0.92, trunk: 0.98, belt: 1.0, roof: 1.44, cr: -1.3, rr: -0.82, rf: 0.34, cf: 1.12, accel: 10.5, max: 60, grip: 7.0, mass: 1700, drive: 'rwd', mu: 0.98, frontBias: 0.55 },
};
// two wheels: a road bike and an e-bike (light, slow, quiet); they lean into corners and you can see the rider
CAR_TYPES.motorbike = { L: 2.1, W: 0.8, wr: 0.32, wb: 1.42, bot: 0.3, accel: 10, max: 40, grip: 8, mass: 260, drive: 'rwd', mu: 1.15, frontBias: 0.5, bike: true, cdA: 0.2 };
CAR_TYPES.ebike = { L: 1.8, W: 0.6, wr: 0.33, wb: 1.1, bot: 0.3, accel: 2.4, max: 7.2, grip: 7, mass: 110, drive: 'rwd', mu: 1.05, frontBias: 0.5, bike: true, ebike: true, cdA: 0.25 };
CAR_TYPES.taxi = Object.assign({}, CAR_TYPES.sedan, { taxi: true });
CAR_TYPES.police = Object.assign({}, CAR_TYPES.muscle, { police: true, accel: 11, max: 62, grip: 7.8, mu: 1.04 });
// every car well up on real-world pace: about 80% higher top speed than the base specs and a much punchier launch
// (30% in V8, another 40% in V9.4)
for (const t of Object.values(CAR_TYPES)) { t.max *= 1.3 * 1.4; t.accel *= 1.25 * 1.4; }
const CAR_COLORS = ['#f2f2f0', '#f2f2f0', '#c9ccd0', '#8d9399', '#2b2e33', '#1d3b6b', '#9c1f1f', '#e8e3d3', '#2f5d50', '#c96a1c', '#5a2f6b', '#d9b84a', '#3a7bbf', '#141414'];

const glassMat = new THREE.MeshStandardMaterial({ color: col('#2b3d4a'), metalness: 0.6, roughness: 0.05, envMapIntensity: 1.0, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });
const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
const brakeMat = new THREE.MeshBasicMaterial({ color: col('#5a0606'), toneMapped: false });
const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.3 });
const sirenRed = new THREE.MeshBasicMaterial({ color: col('#ff2020'), toneMapped: false });
const sirenBlue = new THREE.MeshBasicMaterial({ color: col('#2a5cff'), toneMapped: false });
const sirenOff = new THREE.MeshStandardMaterial({ color: col('#552222') });

// extrude a side profile (s along the car, y up) across the car's width, centred, length along +z
function profileGeo(points, width) {
  const shape = new THREE.Shape(points.map(([s, y]) => new THREE.Vector2(s, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 4 });
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2, 0, 0);
  return g;
}
const wheelGeoCache = {};
function wheelGeo(r) {
  if (wheelGeoCache[r]) return wheelGeoCache[r];
  const tire = new THREE.CylinderGeometry(r, r, 0.26, 16); tire.rotateZ(Math.PI / 2); paintGeo(tire, '#1b1b1b');
  const rim = new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.27, 10); rim.rotateZ(Math.PI / 2); paintGeo(rim, '#b9bec3');
  const hub = new THREE.BoxGeometry(0.28, r * 0.25, r * 1.1); paintGeo(hub, '#7a7f84');
  return (wheelGeoCache[r] = mergeGeos([tire, rim, hub]));
}
function makeBikeModel(p, color) {
  const root = new THREE.Group(), bodyG = new THREE.Group(); root.add(bodyG);
  const paintMat = new THREE.MeshPhysicalMaterial({ color: col(color), metalness: 0.5, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.25 });
  const hw = p.wb / 2, wr = p.wr, paintParts = [], trim = [];
  if (p.ebike) { // step-through frame, battery on the down tube, a basket on the front
    paintParts.push(new THREE.BoxGeometry(0.07, 0.07, p.wb * 0.8).rotateX(-0.45).translate(0, wr + 0.25, 0.05), new THREE.BoxGeometry(0.06, 0.62, 0.06).translate(0, wr + 0.32, -0.25), new THREE.BoxGeometry(0.06, 0.06, 0.62).translate(0, wr + 0.05, -0.25));
    trim.push(box(0.14, 0.12, 0.42, 0, wr + 0.18, 0.12, '#1d1d1d'), box(0.22, 0.06, 0.26, 0, wr + 0.66, -0.32, '#2a2a2a'), box(0.05, 0.62, 0.05, 0, wr + 0.38, hw - 0.05, '#2a2a2a'), box(0.6, 0.04, 0.04, 0, wr + 0.7, hw - 0.12, '#2a2a2a'), box(0.32, 0.2, 0.26, 0, wr + 0.55, hw + 0.1, '#8a6a4a'));
  } else { // tank, seat, fairing and exhaust
    paintParts.push(new THREE.BoxGeometry(0.34, 0.26, 0.6).translate(0, wr + 0.5, 0.18), new THREE.BoxGeometry(0.42, 0.38, 0.4).translate(0, wr + 0.42, 0.62), new THREE.BoxGeometry(0.28, 0.12, 0.5).translate(0, wr + 0.5, -0.5));
    trim.push(box(0.3, 0.1, 0.62, 0, wr + 0.62, -0.18, '#1d1d1d'), box(0.3, 0.32, 0.5, 0, wr + 0.18, 0.08, '#3a3d40'), box(0.1, 0.1, 0.7, 0.18, wr + 0.08, -0.35, '#9aa2a6'), box(0.06, 0.55, 0.06, 0, wr + 0.32, hw - 0.12, '#9aa2a6'), box(0.62, 0.04, 0.04, 0, wr + 0.62, hw - 0.28, '#1d1d1d'));
  }
  const paint = new THREE.Mesh(mergeGeos(paintParts.map((g) => paintGeo(g, '#ffffff'))), paintMat); paint.castShadow = true;
  const trimM = new THREE.Mesh(mergeGeos(trim), trimMat); trimM.castShadow = true;
  const lightM = new THREE.Mesh(mergeGeos([box(0.14, 0.1, 0.05, 0, wr + (p.ebike ? 0.62 : 0.52), hw + (p.ebike ? 0.25 : 0.36), '#fff6dc')]), lightMat);
  const tailM = new THREE.Mesh(mergeGeos([box(0.14, 0.07, 0.04, 0, wr + (p.ebike ? 0.4 : 0.55), -hw - (p.ebike ? 0.12 : 0.18), '#ff2a2a')]), brakeMat.clone());
  bodyG.add(paint, trimM, lightM, tailM);
  const driver = new THREE.Group(); driver.position.set(0, wr + (p.ebike ? 0.62 : 0.62), p.ebike ? -0.25 : -0.12); driver.visible = false; bodyG.add(driver);
  const wheels = [], wg = new THREE.CylinderGeometry(wr, wr, p.ebike ? 0.06 : 0.14, 18); wg.rotateZ(Math.PI / 2); paintGeo(wg, '#1b1b1b');
  const rimG = new THREE.CylinderGeometry(wr * 0.7, wr * 0.7, p.ebike ? 0.065 : 0.145, 12); rimG.rotateZ(Math.PI / 2); paintGeo(rimG, p.ebike ? '#c9ced2' : '#3a3d40');
  const wgeo = mergeGeos([wg, rimG]);
  for (const [z, front] of [[hw, 1], [-hw, 0]]) { const pivot = new THREE.Group(); pivot.position.set(0, wr, z); const m = new THREE.Mesh(wgeo, wheelMat); pivot.add(m); bodyG.add(pivot); wheels.push({ pivot, m, front: !!front }); }
  return { root, bodyG, wheels, paintMat, tailMat: tailM.material, siren: null, doors: [], driver, geos: [paint.geometry, trimM.geometry, lightM.geometry, tailM.geometry, wgeo], bike: true };
}
function makeCarModel(typeName, color) {
  const p = CAR_TYPES[typeName];
  if (p.bike) return makeBikeModel(p, color);
  const L = p.L, W = p.W, hl = L / 2, sF = p.wb / 2, sR = -p.wb / 2, ar = p.wr + 0.07;
  const out = [[-hl, p.bot + 0.05], [-hl - 0.02, p.bump], [-hl + 0.1, p.trunk], [p.cr, p.belt], [p.cf, p.belt], [hl - 0.38, p.hood], [hl, p.bump - 0.02], [hl - 0.02, p.bot + 0.06], [sF + ar, p.bot]];
  for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI; out.push([sF + ar * Math.cos(a), Math.max(p.bot, p.wr + ar * Math.sin(a) * 0.95)]); }
  out.push([sF - ar, p.bot], [sR + ar, p.bot]);
  for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI; out.push([sR + ar * Math.cos(a), Math.max(p.bot, p.wr + ar * Math.sin(a) * 0.95)]); }
  out.push([sR - ar, p.bot]);
  const paintParts = [profileGeo(out, W - 0.06)];
  const cab = [[p.cr + 0.02, p.belt - 0.03], [p.rr, p.roof], [p.rf, p.roof], [p.cf - 0.02, p.belt - 0.03]];
  const glass = profileGeo(cab, W - 0.2);
  paintParts.push(new THREE.BoxGeometry(W - 0.16, 0.06, p.rf - p.rr - 0.06).translate(0, p.roof + 0.01, (p.rf + p.rr) / 2));
  paintParts.push(new THREE.BoxGeometry(W - 0.15, p.roof - p.belt - 0.04, 0.09).translate(0, (p.roof + p.belt) / 2, (p.rf + p.rr) / 2 - 0.15));
  for (const s of [-1, 1]) paintParts.push(new THREE.BoxGeometry(0.1, 0.09, 0.2).translate(s * (W / 2 + 0.04), p.belt + 0.06, p.cf - 0.12));
  const trim = [
    box(W - 0.02, 0.17, 0.14, 0, p.bot + 0.12, hl - 0.02, '#202224'), box(W - 0.02, 0.17, 0.14, 0, p.bot + 0.12, -hl + 0.02, '#202224'),
    box(W * 0.5, 0.12, 0.05, 0, p.bump - 0.12, hl + 0.02, '#151515'),
  ];
  if (p.tray) {
    trim.push(box(W - 0.24, 0.04, -p.cr - hl + 0.25 > 0 ? 0.1 : (p.cr + hl - 0.3), 0, p.belt + 0.01, (p.cr - hl) / 2 + 0.05, '#2b2b2b'));
    const tl = p.cr - (-hl) - 0.15;
    for (const s of [-1, 1]) paintParts.push(new THREE.BoxGeometry(0.07, 0.36, tl).translate(s * (W / 2 - 0.07), p.belt + 0.18, -hl + 0.1 + tl / 2));
    paintParts.push(new THREE.BoxGeometry(W - 0.1, 0.36, 0.07).translate(0, p.belt + 0.18, -hl + 0.12));
    trim.push(box(W - 0.24, 0.03, tl - 0.1, 0, p.belt + 0.02, -hl + 0.1 + tl / 2, '#2a2a2a'));
  }
  if (p.police) {
    for (let i = 0; i < 12; i++) {
      const z0 = -hl + 0.25 + i * ((L - 0.5) / 12);
      for (const s of [-1, 1]) trim.push(box(0.02, 0.2, (L - 0.5) / 12, s * (W / 2 - 0.01), p.belt - 0.25, z0 + (L - 0.5) / 24, i % 2 ? '#1a3f9a' : '#f2f2f2'));
    }
    trim.push(box(0.9, 0.08, 0.3, 0, p.roof + 0.06, (p.rf + p.rr) / 2, '#222'));
  }
  if (p.taxi) trim.push(box(0.55, 0.18, 0.24, 0, p.roof + 0.13, (p.rf + p.rr) / 2, '#f5c400'));
  const lights = [];
  for (const s of [-1, 1]) {
    lights.push(box(0.36, 0.11, 0.06, s * (W / 2 - 0.3), p.bump + 0.07, hl - 0.03, '#fff6dc'));
  }
  const tails = [];
  for (const s of [-1, 1]) tails.push(box(0.34, 0.12, 0.05, s * (W / 2 - 0.3), p.trunk - 0.14, -hl - 0.02, '#ff2a2a'));

  const paintMat = new THREE.MeshPhysicalMaterial({ color: col(p.police ? '#f4f4f2' : p.taxi ? '#f6f2e8' : color), metalness: 0.5, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.25 }); // glossy clear-coated paint
  const root = new THREE.Group(), bodyG = new THREE.Group();
  root.add(bodyG);
  const paint = new THREE.Mesh(mergeGeos(paintParts.map((g) => paintGeo(g, '#ffffff'))), paintMat);
  paint.castShadow = true;
  const glassM = new THREE.Mesh(glass, glassMat);
  const trimM = new THREE.Mesh(mergeGeos(trim), trimMat);
  const lightM = new THREE.Mesh(mergeGeos(lights), lightMat);
  const tailM = new THREE.Mesh(mergeGeos(tails), brakeMat.clone());
  bodyG.add(paint, glassM, trimM, lightM, tailM);
  let siren = null;
  if (p.police) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.26), sirenOff); r.position.set(0.22, p.roof + 0.15, (p.rf + p.rr) / 2);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.26), sirenOff); b.position.set(-0.22, p.roof + 0.15, (p.rf + p.rr) / 2);
    bodyG.add(r, b); siren = { r, b };
  }
  // front doors on hinges (local +x is the car's left; the driver sits on the right, -x)
  const doors = [];
  const dl = Math.min(1.15, p.cf - p.cr - 0.2), dh = p.belt - p.bot - 0.08;
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group(); hinge.position.set(side * (W / 2 - 0.0), p.bot + 0.04 + dh / 2, p.cf - 0.08);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.05, dh, dl).translate(0, 0, -dl / 2), paintMat); panel.castShadow = true;
    const seam = new THREE.Mesh(mergeGeos([box(0.052, 0.025, dl, 0, -dh / 2 + 0.01, -dl / 2, '#1a1a1a'), box(0.052, dh, 0.025, 0, 0, -dl + 0.01, '#1a1a1a'), box(0.07, 0.04, 0.16, side * 0.02, dh * 0.25, -dl + 0.18, '#2a2a2a')]), trimMat);
    hinge.add(panel, seam); bodyG.add(hinge);
    doors.push({ hinge, side, open: 0 });
  }
  // a driver you can see through the glass
  const driver = new THREE.Group(); driver.position.set(-W * 0.2, p.belt - 0.42, (p.cr + p.cf) / 2 - 0.05); driver.visible = false; bodyG.add(driver);
  const wheels = [];
  const wg = wheelGeo(p.wr);
  for (const [x, z, front] of [[W / 2 - 0.16, sF, 1], [-W / 2 + 0.16, sF, 1], [W / 2 - 0.16, sR, 0], [-W / 2 + 0.16, sR, 0]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, p.wr, z);
    const m = new THREE.Mesh(wg, wheelMat); pivot.add(m); root.add(pivot);
    wheels.push({ pivot, m, front: !!front });
  }
  const geos = [paint.geometry, glass, trimM.geometry, lightM.geometry, tailM.geometry];
  for (const d of doors) d.hinge.traverse((o) => { if (o.geometry) geos.push(o.geometry); }); // door panels belong to this car
  if (siren) geos.push(siren.r.geometry, siren.b.geometry);
  return { root, bodyG, wheels, paintMat, tailMat: tailM.material, siren, doors, driver, geos };
}
// head and shoulders of whoever is driving, in their colours
function setDriverLook(M, look) {
  for (const o of M.driver.children) if (o.geometry) o.geometry.dispose();
  M.driver.clear();
  if (!look) { M.driver.visible = false; return; }
  if (M.bike) { // the whole rider: leaning over the bars, knees in, helmet on a road bike
    const helmet = look.helmet === false ? look.hair : '#1d1d1d', shorts = look.shorts || '#2b2b2b';
    const g = mergeGeos([box(0.4, 0.5, 0.26, 0, 0.3, 0.1, look.shirt), box(0.24, 0.26, 0.26, 0, 0.72, 0.18, look.skin), box(0.28, 0.16, 0.3, 0, 0.86, 0.17, helmet),
      box(0.1, 0.1, 0.48, 0.22, 0.46, 0.4, look.skin), box(0.1, 0.1, 0.48, -0.22, 0.46, 0.4, look.skin), // arms out to the bars
      box(0.14, 0.14, 0.5, 0.14, 0.02, 0.22, shorts), box(0.14, 0.14, 0.5, -0.14, 0.02, 0.22, shorts), box(0.12, 0.46, 0.12, 0.16, -0.2, 0.44, look.skin), box(0.12, 0.46, 0.12, -0.16, -0.2, 0.44, look.skin)]);
    M.driver.add(new THREE.Mesh(g, personMat)); M.driver.visible = true; return;
  }
  const g = mergeGeos([box(0.42, 0.5, 0.26, 0, 0.25, 0, look.shirt), box(0.22, 0.25, 0.24, 0, 0.66, 0, look.skin), box(0.24, 0.07, 0.26, 0, 0.81, -0.01, look.hair), box(0.11, 0.38, 0.12, 0.2, 0.25, 0.18, look.skin), box(0.11, 0.38, 0.12, -0.2, 0.25, 0.18, look.skin)]);
  M.driver.add(new THREE.Mesh(g, personMat)); M.driver.visible = true;
}
const randomLook = () => ({ shirt: pick(SHIRT), skin: pick(SKIN), hair: pick(HAIR) });
function disposeCarModel(M) { scene.remove(M.root); M.paintMat.dispose(); M.tailMat.dispose(); for (const g of M.geos) g.dispose(); for (const o of M.driver.children) if (o.geometry) o.geometry.dispose(); }
