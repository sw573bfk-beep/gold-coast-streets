// ============================================================================
// Gold Coast Streets — shops: walk-in interiors, shopkeepers, buy menus, items,
// back-room gun dealers, banks, and saving your progress
// ============================================================================
const SHOPS = [];   // every shop you can buy from (walk-in or served at the door)
const DEALERS = []; // back-room gun dealers

// ---------------------------------------------------------------- items
const ITEMS = {
  burger: { name: 'Burger', price: 12, heal: 35 }, fries: { name: 'Chips', price: 6, heal: 15 }, soda: { name: 'Soft drink', price: 4, heal: 8 },
  pizza: { name: 'Pizza slice', price: 8, heal: 25 }, kebab: { name: 'Kebab', price: 13, heal: 40 }, sushi: { name: 'Sushi roll', price: 10, heal: 25 },
  taco: { name: 'Burrito', price: 14, heal: 40 }, chicken: { name: 'Fried chicken', price: 12, heal: 35 }, icecream: { name: 'Gelato', price: 7, heal: 15 },
  shake: { name: 'Thickshake', price: 9, heal: 20 }, coffee: { name: 'Flat white', price: 6, heal: 10, energy: 20 }, cake: { name: 'Cake slice', price: 7, heal: 15 },
  mocktail: { name: 'Mocktail', price: 9, heal: 12 }, energy: { name: 'Energy drink', price: 5, heal: 5, energy: 40 }, medkit: { name: 'First aid kit', price: 60, heal: 100 },
  specs: { name: 'Illusion Specs', price: 45, specs: 40, desc: 'Trippy vision for 40 seconds' },
  spiral: { name: 'Spinning Spiral Illusion', price: 25, keep: true }, cube: { name: 'Impossible Cube', price: 30, keep: true },
  head: { name: 'Shrunken Head (replica)', price: 35, keep: true }, eye: { name: 'Optical Illusion Poster', price: 15, keep: true },
  plush: { name: 'Timezone plushie', price: 20, keep: true }, tickets: { name: 'Arcade card (+$ prize tickets)', price: 10, keep: true },
  globe: { name: 'Surfers snow globe', price: 18, keep: true }, koala: { name: 'Koala keyring', price: 8, keep: true }, magnet: { name: 'Surfboard magnet', price: 6, keep: true },
  sunnies: { name: 'Sunnies', price: 25, wear: 'sunnies' }, cap: { name: 'Cap', price: 20, wear: 'cap' },
  outfit: { name: 'Change your outfit', price: 30, outfit: true },
  rest: { name: 'Room for the night (full health, wake at 8am)', price: 90, rest: true },
  pistol: { name: 'Pistol + 36 rounds', price: 300, weapon: 'pistol', ammo: 36 }, smg: { name: 'SMG + 120 rounds', price: 1200, weapon: 'smg', ammo: 120 },
  shotgun: { name: 'Shotgun + 16 shells', price: 900, weapon: 'shotgun', ammo: 16 },
  ammoP: { name: 'Pistol ammo ×36', price: 40, ammoFor: 'pistol', ammo: 36 }, ammoS: { name: 'SMG ammo ×120', price: 80, ammoFor: 'smg', ammo: 120 },
  ammoG: { name: 'Shotgun shells ×16', price: 60, ammoFor: 'shotgun', ammo: 16 },
};
// what a shop sells, from its type and name
function shopKind(cat, name) {
  const n = name.toLowerCase();
  if (cat === 8) return 'bank';
  if (/ripley/.test(n) && !/cargo/.test(n)) return 'ripley';
  if (/timezone|arcade/.test(n)) return 'arcade';
  if (/gelat|ice cream|copenhagen|messina|baskin|ben & jerry|milky lane|milk bar|goo-e|minus 18/.test(n)) return 'icecream';
  if (cat === 6) return 'clothes';
  if (cat === 2) return 'bar';
  if (cat === 1) return 'cafe';
  if (cat === 0) return 'food';
  if (cat === 4) return 'hotel';
  if (cat === 7) return /pharm|chemist|clinic|doctor|medical/.test(n) ? 'pharmacy' : 'service';
  if (cat === 5) return 'fun';
  return /7-eleven|convenience|food store|bws|bottle|woolworths|coles|supermarket|news/.test(n) ? 'convenience' : 'shop';
}
function menuFor(shop) {
  const n = shop.name.toLowerCase();
  switch (shop.kind) {
    case 'food':
      if (/pizza|vapiano|italian/.test(n)) return ['pizza', 'soda', 'cake'];
      if (/kebab|anatolia|baha|turk/.test(n)) return ['kebab', 'fries', 'soda'];
      if (/sushi|japan|amimoto/.test(n)) return ['sushi', 'soda'];
      if (/guzman|zambrero|camino|mex|taco/.test(n)) return ['taco', 'fries', 'soda'];
      if (/kfc|chicken|oporto|flock|wings/.test(n)) return ['chicken', 'fries', 'soda'];
      return ['burger', 'fries', 'shake', 'soda'];
    case 'icecream': return ['icecream', 'shake', 'cake'];
    case 'cafe': return ['coffee', 'cake', 'soda'];
    case 'bar': return ['mocktail', 'fries', 'soda'];
    case 'convenience': return ['energy', 'soda', 'fries', 'medkit'];
    case 'clothes': return ['outfit', 'sunnies', 'cap'];
    case 'ripley': return ['specs', 'spiral', 'cube', 'head', 'eye'];
    case 'arcade': return ['tickets', 'plush', 'soda'];
    case 'hotel': return ['rest', 'soda'];
    case 'pharmacy': return ['medkit', 'energy'];
    case 'bank': return [];
    default: return /souvenir|gift|koala|paradise/.test(n) ? ['globe', 'koala', 'magnet', 'sunnies'] : ['soda', 'energy', 'globe', 'magnet'];
  }
}

// ---------------------------------------------------------------- interiors
const INTERIOR_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
const SHOP_GLASS = new THREE.MeshStandardMaterial({ color: col('#bfe3ee'), transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
const FLOORS = { food: '#c9b79c', icecream: '#f1e6ee', cafe: '#a07b55', bar: '#3a2a22', convenience: '#d7dadc', clothes: '#e6e0d6', ripley: '#1c1626', arcade: '#20123a', hotel: '#b9a27e', pharmacy: '#eef1f3', service: '#cfd3d6', bank: '#d9d1c2', fun: '#2a2a33', shop: '#d8cdbb' };
const WALLC = { food: '#f2e6d2', icecream: '#fde9f2', cafe: '#efe2cc', bar: '#2b1f1a', convenience: '#f4f6f7', clothes: '#f7f4ee', ripley: '#26203a', arcade: '#1a1030', hotel: '#efe7d8', pharmacy: '#f6fbff', service: '#eef0f2', bank: '#efe9dd', fun: '#30303c', shop: '#f3ece0' };
function roomFrame(sh) { // room coordinates: u along the shopfront, v inward, y up
  return (u, v, y) => [sh.ax + sh.ex * u + sh.ix * v, y, sh.az + sh.ez * u + sh.iz * v];
}
function quad4(B, a, b, c, d, colr, shade) {
  const r = colr.r * shade, g = colr.g * shade, bl = colr.b * shade;
  B.pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < 6; i++) B.col.push(r, g, bl);
}
function ibox(B, P, u0, u1, v0, v1, y0, y1, hex) {
  const c = col(hex);
  const p = (u, v, y) => P(u, v, y);
  quad4(B, p(u0, v0, y1), p(u1, v0, y1), p(u1, v1, y1), p(u0, v1, y1), c, 1.0);       // top
  quad4(B, p(u0, v0, y0), p(u1, v0, y0), p(u1, v0, y1), p(u0, v0, y1), c, 0.86);     // front (towards the door)
  quad4(B, p(u0, v1, y0), p(u1, v1, y0), p(u1, v1, y1), p(u0, v1, y1), c, 0.8);
  quad4(B, p(u0, v0, y0), p(u0, v1, y0), p(u0, v1, y1), p(u0, v0, y1), c, 0.72);
  quad4(B, p(u1, v0, y0), p(u1, v1, y0), p(u1, v1, y1), p(u1, v0, y1), c, 0.72);
}
const MENU_TEX = {};
function menuTexture(kind) {
  if (MENU_TEX[kind]) return MENU_TEX[kind];
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const x = c.getContext('2d');
  const dark = kind === 'bar' || kind === 'ripley' || kind === 'arcade' || kind === 'fun';
  x.fillStyle = dark ? '#111' : '#1f2a2f'; x.fillRect(0, 0, 512, 160);
  x.fillStyle = kind === 'arcade' ? '#ff4fd8' : kind === 'ripley' ? '#ffd200' : '#f6c445';
  x.font = `400 34px ${FONT.display}`; x.textAlign = 'center';
  const title = { food: 'MENU', icecream: 'FLAVOURS', cafe: 'COFFEE', bar: 'DRINKS', convenience: 'OPEN 24/7', clothes: 'NEW SEASON', ripley: 'BELIEVE IT OR NOT!', arcade: 'PLAY · WIN · PRIZES', hotel: 'RECEPTION', pharmacy: 'PHARMACY', service: 'WELCOME', bank: 'TELLERS', fun: 'TICKETS', shop: 'SOUVENIRS' }[kind] || 'WELCOME';
  x.fillText(title, 256, 50);
  x.fillStyle = '#e8eef0'; x.font = `600 22px ${FONT.cond}`;
  const lines = menuFor({ kind, name: '' }).slice(0, 3).map((k) => `${ITEMS[k].name}  $${ITEMS[k].price}`);
  lines.forEach((l, i) => x.fillText(l, 256, 88 + i * 26));
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO;
  return (MENU_TEX[kind] = new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
}
function furnish(B, sh, P) {
  const W = sh.t1 - sh.t0, D = sh.depth, u0 = sh.t0, u1 = sh.t1, k = sh.kind;
  const cv = sh.counterV, cw = 0.7;
  const counterCol = { bar: '#5a3a26', ripley: '#3b2a55', arcade: '#3a1d6e', bank: '#8a6a4a', hotel: '#6b4a32', cafe: '#6b4a32' }[k] || '#d9dde0';
  const front = { food: '#d94e3a', icecream: '#f08ab8', convenience: '#2f7fb8', clothes: '#2b2b2b', pharmacy: '#2f9a5b', shop: '#c98a3a', service: '#2f5f8a', fun: '#7a3e9a' }[k] || counterCol;
  if (k === 'bank') {
    ibox(B, P, u0 + 0.2, u1 - 0.2, cv - cw / 2, cv + cw / 2, 0, 1.1, '#8a6a4a');
    for (let u = u0 + 1.2; u < u1 - 0.8; u += 1.6) ibox(B, P, u - 0.03, u + 0.03, cv - 0.05, cv + 0.05, 1.1, 2.4, '#9aa2a6');
    ibox(B, P, u0 + W / 2 - 0.9, u0 + W / 2 + 0.9, D - 0.08, D - 0.02, 0.4, 2.2, '#9aa2a6'); // vault door
  } else ibox(B, P, u0 + 0.5, u1 - 0.5, cv - cw / 2, cv + cw / 2, 0, 1.05, front);
  ibox(B, P, u0 + 0.45, u1 - 0.45, cv - cw / 2 - 0.05, cv + cw / 2 + 0.05, 1.05, 1.12, counterCol);
  const mid = (u0 + u1) / 2, space = cv - cw / 2 - 1.0; // floor between the door and the counter
  const rnd = mulberry32(Math.floor(sh.ax * 13 + sh.az * 7));
  const r = () => rnd();
  const product = ['#e23b2a', '#2a7de2', '#f2c230', '#2ac28a', '#f07ac0', '#ffffff', '#ff8a2a', '#7a3e9a'];
  if (k === 'food' || k === 'cafe' || k === 'icecream') {
    if (k === 'icecream') for (let u = u0 + 0.8; u < u1 - 0.8; u += 0.45) ibox(B, P, u, u + 0.35, cv - 0.2, cv + 0.1, 1.12, 1.2, product[Math.floor(r() * product.length)]);
    if (space > 1.6) for (let u = u0 + 1.0; u < u1 - 1.0; u += 2.2) { ibox(B, P, u, u + 0.8, 1.0, 1.8, 0.72, 0.78, '#e8e1d4'); ibox(B, P, u + 0.35, u + 0.45, 1.35, 1.45, 0, 0.72, '#555'); }
    ibox(B, P, u0 + 0.6, u0 + 1.4, cv + 0.6, cv + 1.2, 0, 1.8, '#c9ced2'); // fridge / machines
  } else if (k === 'bar') {
    for (let u = u0 + 0.8; u < u1 - 0.8; u += 0.4) ibox(B, P, u, u + 0.12, D - 0.35, D - 0.2, 1.3 + Math.floor(r() * 3) * 0.45, 1.6 + Math.floor(r() * 3) * 0.45, product[Math.floor(r() * product.length)]);
    for (let u = u0 + 0.9; u < u1 - 0.9; u += 1.0) ibox(B, P, u, u + 0.35, cv - 0.9, cv - 0.55, 0, 0.75, '#2a2a2a');
    ibox(B, P, u0 + 0.1, u1 - 0.1, D - 0.05, D - 0.02, 3.0, 3.1, '#ff4fd8'); // neon strip
  } else if (k === 'convenience' || k === 'shop' || k === 'pharmacy') {
    for (let v = 1.0; v < cv - 1.2; v += 1.6) for (const side of [0, 1]) {
      const a = side ? u1 - 1.4 : u0 + 0.3, b2 = side ? u1 - 0.3 : u0 + 1.4;
      ibox(B, P, a, b2, v, v + 0.5, 0, 1.6, '#c9c4b8');
      for (let y = 0.35; y < 1.6; y += 0.42) for (let u = a + 0.05; u < b2 - 0.15; u += 0.22) ibox(B, P, u, u + 0.16, v - 0.02, v + 0.15, y, y + 0.25, product[Math.floor(r() * product.length)]);
    }
  } else if (k === 'clothes') {
    for (const side of [0, 1]) {
      const uu = side ? u1 - 0.5 : u0 + 0.5;
      ibox(B, P, uu - 0.03, uu + 0.03, 0.8, cv - 1.0, 1.55, 1.6, '#9aa2a6');
      for (let v = 0.9; v < cv - 1.1; v += 0.28) ibox(B, P, uu - 0.25, uu + 0.25, v, v + 0.06, 0.7, 1.5, product[Math.floor(r() * product.length)]);
    }
    if (space > 1.6) ibox(B, P, mid - 0.7, mid + 0.7, 1.4, 2.4, 0, 0.8, '#d8cfc0');
  } else if (k === 'ripley' || k === 'fun') {
    for (let i = 0; i < Math.min(6, Math.floor(W / 1.6)); i++) {
      const u = u0 + 0.9 + i * 1.6, v = 1.2 + (i % 2) * 1.2; if (v > cv - 1.2) continue;
      ibox(B, P, u - 0.35, u + 0.35, v - 0.35, v + 0.35, 0, 0.9, '#f2f2f2');
      ibox(B, P, u - 0.22, u + 0.22, v - 0.22, v + 0.22, 0.9, 1.35, product[i % product.length]);
    }
    ibox(B, P, u0 + 0.1, u1 - 0.1, D - 0.05, D - 0.02, 0.2, 3.2, '#ffd200');
  } else if (k === 'arcade') {
    for (const side of [0, 1]) for (let v = 0.8; v < cv - 1.0; v += 1.1) {
      const a = side ? u1 - 1.0 : u0 + 0.2;
      ibox(B, P, a, a + 0.8, v, v + 0.8, 0, 1.75, product[Math.floor(r() * product.length)]);
      ibox(B, P, side ? a - 0.01 : a + 0.79, side ? a + 0.01 : a + 0.81, v + 0.1, v + 0.7, 1.0, 1.55, '#7ff6ff');
    }
  } else if (k === 'hotel' || k === 'service') {
    if (space > 1.6) ibox(B, P, u0 + 0.6, u0 + 2.4, 1.0, 1.8, 0, 0.5, '#4a5a6a');
  }
}
function buildShops() {
  const B = newBuf(), G = newBuf(), boards = new Map();
  for (const q of D.signs) {
    const [x, z, nx, nz, w, y, cat, name, bi, k, t0, t1, depth] = q;
    const kind = shopKind(cat, name);
    const sh = { name, cat, kind, x, z, nx, nz, keeper: null, robT: 0, robbedAt: -1e9, walkIn: depth > 0 };
    if (depth > 0) {
      const f = MAP.buildings[bi].slice(3), n = f.length / 2;
      const ax = f[2 * k], az = f[2 * k + 1], bx = f[(2 * k + 2) % (2 * n)], bz = f[(2 * k + 3) % (2 * n)], L = Math.hypot(bx - ax, bz - az);
      Object.assign(sh, { ax, az, ex: (bx - ax) / L, ez: (bz - az) / L, ix: -nx, iz: -nz, t0, t1, depth });
      sh.counterV = depth < 4.6 ? depth - 1.5 : Math.min(depth * 0.58, depth - 1.6);
      const P = roomFrame(sh), wc = col(WALLC[kind] || '#f0ebe0'), fc = col(FLOORS[kind] || '#d8cdbb'), H = 3.5;
      quad4(B, P(t0, 0.02, 0.025), P(t1, 0.02, 0.025), P(t1, depth, 0.025), P(t0, depth, 0.025), fc, 0.95);
      quad4(B, P(t0, 0, H), P(t1, 0, H), P(t1, depth, H), P(t0, depth, H), wc, 1.0);
      quad4(B, P(t0, depth, 0), P(t1, depth, 0), P(t1, depth, H), P(t0, depth, H), wc, 0.9);
      quad4(B, P(t0, 0, 0), P(t0, depth, 0), P(t0, depth, H), P(t0, 0, H), wc, 0.8);
      quad4(B, P(t1, 0, 0), P(t1, depth, 0), P(t1, depth, H), P(t1, 0, H), wc, 0.8);
      for (let u = t0 + 1; u < t1 - 0.6; u += 2.2) ibox(B, P, u, u + 1.2, depth * 0.3, depth * 0.3 + 0.5, H - 0.04, H - 0.01, '#ffffff'); // lights
      // glass shopfront with a doorway in the middle
      const uc = (t0 + t1) / 2;
      for (const [a, b2] of [[t0, uc - 0.85], [uc + 0.85, t1]]) quad4(G, P(a, 0.03, 0), P(b2, 0.03, 0), P(b2, 0.03, 3.4), P(a, 0.03, 3.4), col('#ffffff'), 1);
      for (const u of [t0, uc - 0.85, uc + 0.85, t1]) ibox(B, P, u - 0.04, u + 0.04, -0.02, 0.06, 0, 3.6, '#2a2f33');
      ibox(B, P, t0, t1, -0.02, 0.06, 3.4, 3.6, '#2a2f33');
      furnish(B, sh, P);
      // walls and counter you bump into
      const wp = (u, v) => P(u, v, 0);
      const seg = (p, q2, h) => addSeg(p[0], p[2], q2[0], q2[2], h);
      seg(wp(t0, 0), wp(t0, depth), 3.5); seg(wp(t1, 0), wp(t1, depth), 3.5); seg(wp(t0, depth), wp(t1, depth), 3.5);
      seg(wp(t0 + 0.45, sh.counterV - 0.4), wp(t1 - 0.45, sh.counterV - 0.4), 1.1);
      seg(wp(t0 + 0.45, sh.counterV - 0.4), wp(t0 + 0.45, sh.counterV + 0.4), 1.1); seg(wp(t1 - 0.45, sh.counterV - 0.4), wp(t1 - 0.45, sh.counterV + 0.4), 1.1);
      // menu board on the back wall
      const bw = Math.min(3.4, t1 - t0 - 1), mat = menuTexture(kind);
      if (!boards.has(mat)) boards.set(mat, newBuf());
      const MB = boards.get(mat), c0 = P(uc - bw / 2, depth - 0.04, 2.2), c1 = P(uc + bw / 2, depth - 0.04, 2.2), c2 = P(uc + bw / 2, depth - 0.04, 3.1), c3 = P(uc - bw / 2, depth - 0.04, 3.1);
      MB.pos.push(...c0, ...c1, ...c2, ...c0, ...c2, ...c3); MB.uv.push(1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1);
      const kp = P(uc, sh.counterV + 0.75, 0); sh.kx = kp[0]; sh.kz = kp[2];
      const dp = P(uc, -1.4, 0); sh.dx = dp[0]; sh.dz = dp[2];
      const cp = P(uc, sh.counterV - 0.9, 0); sh.cx = cp[0]; sh.cz = cp[2];
    } else {
      sh.cx = x + nx * 1.6; sh.cz = z + nz * 1.6; sh.dx = sh.cx; sh.dz = sh.cz;
    }
    SHOPS.push(sh);
  }
  for (const [x, z, cat, name] of D.freeSigns) {
    const kind = shopKind(cat, name);
    SHOPS.push({ name, cat, kind, x, z, cx: x, cz: z, dx: x, dz: z, walkIn: false, keeper: null, robT: 0, robbedAt: -1e9 });
  }
  const m = new THREE.Mesh(toGeometry(B), INTERIOR_MAT); m.frustumCulled = true; scene.add(m);
  scene.add(new THREE.Mesh(toGeometry(G), SHOP_GLASS));
  for (const [mat, MB] of boards) scene.add(new THREE.Mesh(toGeometry(MB), mat));
  // back-room gun dealers: a crate, a tarp and someone you probably shouldn't trust
  const crate = new THREE.MeshStandardMaterial({ color: col('#6b4a2c'), roughness: 0.9 });
  for (const [x, z, name] of D.dealers) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.9), crate); c.position.set(x, 0.4, z); c.castShadow = true; scene.add(c);
    const P = makePerson({ shirt: '#1d1d1d', shorts: '#2b2b2b', hair: '#1a1a1a', skin: pick(SKIN), cap: '#7a1f1f' });
    P.root.position.set(x + 1.1, 0, z); P.root.rotation.y = -Math.PI / 2; scene.add(P.root);
    addBox(x, z, 0.75, 1);
    DEALERS.push({ x: x + 1.6, z, name, m: P });
  }
}
// shopkeepers only exist when you're nearby
let keeperT = 0;
function updateShops(dt) {
  keeperT -= dt;
  if (keeperT <= 0) {
    keeperT = 0.5;
    for (const sh of SHOPS) {
      if (!sh.walkIn) continue;
      const d = Math.abs(sh.kx - player.x) + Math.abs(sh.kz - player.z);
      if (d < 55 && !sh.keeper) {
        const P = makePerson(sh.kind === 'bank' ? { shirt: '#f2f2f2', shorts: '#1f2a3a' } : undefined);
        P.root.position.set(sh.kx, 0, sh.kz); P.root.rotation.y = Math.atan2(-sh.ix, -sh.iz); scene.add(P.root);
        sh.keeper = { m: P, t: rand() * 10 };
      } else if (d > 80 && sh.keeper) { disposePerson(sh.keeper.m); sh.keeper = null; }
    }
  }
  for (const sh of SHOPS) {
    if (!sh.keeper) continue;
    const K = sh.keeper; K.t += dt;
    const scared = elapsed - sh.robbedAt < 12 || sh.robT > 0;
    animatePerson(K.m, 0, 0);
    if (scared) { K.m.armL.rotation.x = K.m.armR.rotation.x = -3.0; K.m.armL.rotation.z = 0.2; K.m.armR.rotation.z = -0.2; }
    else { K.m.armR.rotation.x = Math.sin(K.t * 1.3) * 0.15 - 0.3; K.m.body.rotation.y = Math.sin(K.t * 0.4) * 0.2; }
  }
  for (const d of DEALERS) d.m.body.rotation.y = Math.sin(elapsed * 0.7) * 0.25;
}
// where you are: inside a walk-in shop, at a counter or door, or at a dealer
function shopAt(x, z) {
  for (const sh of SHOPS) {
    if (!sh.walkIn) continue;
    const rx = x - sh.ax, rz = z - sh.az, u = rx * sh.ex + rz * sh.ez, v = rx * sh.ix + rz * sh.iz;
    if (u > sh.t0 && u < sh.t1 && v > 0.1 && v < sh.depth) return sh;
  }
  return null;
}
function serviceSpot() {
  const inside = shopAt(player.x, player.z);
  if (inside && Math.hypot(inside.cx - player.x, inside.cz - player.z) < 2.0) return inside;
  for (const sh of SHOPS) if (!sh.walkIn && Math.abs(sh.cx - player.x) < 1.8 && Math.abs(sh.cz - player.z) < 1.8) return sh;
  for (const d of DEALERS) if (Math.hypot(d.x - player.x, d.z - player.z) < 2.2) return { dealer: true, name: d.name, kind: 'dealer' };
  return null;
}

// ---------------------------------------------------------------- buy menu
let openShopRef = null;
function openShop(sh) {
  const list = sh.dealer ? ['pistol', 'smg', 'shotgun', 'ammoP', 'ammoS', 'ammoG'] : menuFor(sh);
  if (!list.length) { toast(sh.kind === 'bank' ? "The teller isn't handing over cash for free…" : 'Nothing for sale here'); return; }
  uiOpen = true; openShopRef = sh;
  if (document.pointerLockElement) document.exitPointerLock();
  $('shop').hidden = false;
  $('shop-title').textContent = sh.name;
  $('shop-sub').textContent = sh.dealer ? 'Cash only. No questions.' : { ripley: 'Odditorium gift counter', arcade: 'Prize counter', hotel: 'Front desk', clothes: 'Change rooms out the back' }[sh.kind] || 'What can I get you?';
  renderShop(list);
}
function renderShop(list) {
  const body = $('shop-body'); body.innerHTML = '';
  for (const id of list) {
    const it = ITEMS[id], row = document.createElement('div'); row.className = 'srow';
    const own = it.weapon && player.weapons[it.weapon] !== undefined;
    const label = document.createElement('span');
    label.textContent = it.name + (it.keep && player.items[id] ? `  (have ${player.items[id]})` : '') + (own ? '  (owned: buys ammo)' : '');
    const b = document.createElement('button'); b.type = 'button'; b.textContent = '$' + it.price;
    b.disabled = player.money < it.price;
    b.addEventListener('click', () => { buy(id); renderShop(list); });
    row.append(label, b); body.appendChild(row);
  }
  $('shop-money').textContent = '$' + player.money;
}
function closeShop() { $('shop').hidden = true; uiOpen = false; openShopRef = null; saveGame(); lockPointer(); }
function buy(id) {
  const it = ITEMS[id];
  if (player.money < it.price) return;
  if (it.outfit) { player.money -= it.price; closeShop(); openWardrobe({ name: 'Change rooms' }); return; }
  player.money -= it.price;
  sfxTone([660, 990], 0.12, 0.06, 'triangle');
  if (it.heal) player.health = Math.min(100, player.health + it.heal);
  if (it.energy) player.effects.energy = Math.max(player.effects.energy, it.energy);
  if (it.specs) player.effects.specs = it.specs;
  if (it.keep) player.items[id] = (player.items[id] || 0) + 1;
  if (it.wear) { player.look[it.wear] = it.wear === 'cap' ? pick(['#c43a2a', '#1f3c6e', '#111111', '#f2c542', '#2f8a5b']) : true; rebuildPlayer(); }
  if (it.rest) { player.health = 100; gameHour = 8; toast('You wake up refreshed at 8am'); }
  if (it.weapon) { player.weapons[it.weapon] = (player.weapons[it.weapon] || 0) + it.ammo; player.weapon = it.weapon; attachGun(); }
  if (it.ammoFor) {
    if (player.weapons[it.ammoFor] === undefined) { player.money += it.price; toast(`You need a ${WEAPONS[it.ammoFor].name.toLowerCase()} first`); return; }
    player.weapons[it.ammoFor] += it.ammo;
  }
  if (id === 'tickets') { const win = Math.round(rr(0, 4)) * 5; player.money += win; toast(win ? `Prize tickets! +$${win}` : 'No tickets this time'); }
  else toast(`Bought: ${it.name}`);
}
function openBag() {
  uiOpen = true; if (document.pointerLockElement) document.exitPointerLock();
  $('bag').hidden = false;
  const body = $('bag-body'); body.innerHTML = '';
  const have = Object.entries(player.items).filter(([, n]) => n > 0);
  const weap = Object.entries(player.weapons).map(([w, a]) => `${WEAPONS[w].name}: ${a} rounds`);
  const lines = [...weap, ...have.map(([id, n]) => `${ITEMS[id].name} ×${n}`)];
  if (!lines.length) lines.push('Empty. Shops on Cavill Mall have plenty to buy.');
  for (const l of lines) { const p = document.createElement('p'); p.textContent = l; body.appendChild(p); }
}
function closeBag() { $('bag').hidden = true; uiOpen = false; lockPointer(); }
function initShopUI() { $('shop-close').addEventListener('click', closeShop); $('bag-close').addEventListener('click', closeBag); }

// ---------------------------------------------------------------- saving
function saveGame() {
  try { localStorage.setItem('gcs-save', JSON.stringify({ money: player.money, items: player.items, weapons: player.weapons, weapon: player.weapon, look: player.look })); } catch (e) { /* storage blocked */ }
}
function loadGame() {
  try {
    const s = JSON.parse(localStorage.getItem('gcs-save') || 'null'); if (!s) return;
    if (typeof s.money === 'number') player.money = s.money;
    Object.assign(player.items, s.items || {}); Object.assign(player.weapons, s.weapons || {});
    if (s.weapon && (s.weapon === 'fist' || player.weapons[s.weapon] !== undefined)) player.weapon = s.weapon;
    if (s.look) Object.assign(player.look, s.look);
  } catch (e) { /* storage blocked */ }
}
