// ============================================================================
// Gold Coast Streets — the mod shop (at any car dealership: walk in and press E, then "Mod shop"). Paint, decals in a
// style you choose, wheel colour, lowered suspension, neon underglow and an engine tune. Mods on a car you own are
// saved with it (and come back whenever you call it); on any other car they last until you leave it.
// ============================================================================
const MOD_PAINT = ['#f2f2f0', '#141414', '#9c1f1f', '#ff2d55', '#ff6a00', '#ffd400', '#7cff00', '#2f5d50', '#00e5ff', '#1d3b6b', '#b84dff', '#d9b84a', '#8d9399', '#e85a9a'];
const MOD_LIVERY = ['None', 'Flames', 'Racing stripes', 'Lightning', 'Chequers', 'Splatter'];
const MOD_WHEELS = { Standard: null, Chrome: '#e6e9ec', Black: '#151515', Gold: '#d4af37', White: '#f4f4f2', Red: '#d6302a' };
const MOD_NEON = { Off: null, Cyan: '#00e5ff', Pink: '#ff2d95', Green: '#39ff14', Purple: '#b84dff', Red: '#ff2020' };
const MOD_COST = { paint: 400, livery: 900, wheels: 600, lower: 500, neon: 750, tune: 2500 };
function carMods(c) { const g = c.owned && ECON.garage.find((q) => q.type === c.type); return (g && (g.mods = g.mods || {})) || (c.mods = c.mods || {}); }
// put a car's mods on its model (after it's built, or rebuilt by a respray)
function applyMods(c) {
  const m = carMods(c), M = c.model; if (!M || M.bike) return;
  if (M.liveryMeshes) { for (const o of M.liveryMeshes) M.bodyG.remove(o); M.liveryMeshes = null; if (M.livery) { M.livery.map.dispose(); M.livery.dispose(); M.livery = null; } }
  if (m.livery) addLivery(M, c.spec, m.liverySeed || 7, m.livery - 1); else if (c.spec.livery && !m.liveryOff) addLivery(M, c.spec, m.liverySeed || c.liverySeed || 7);
  if (m.wheels && MOD_WHEELS[m.wheels]) { const mat = M.wheelMod || (M.wheelMod = new THREE.MeshStandardMaterial({ color: col(MOD_WHEELS[m.wheels]), metalness: 0.85, roughness: 0.25 })); mat.color.set(MOD_WHEELS[m.wheels]); for (const w of M.wheels) w.m.material = mat; }
  else if (M.wheelMod) { for (const w of M.wheels) w.m.material = wheelMat; }
  M.bodyG.position.y = -(m.lower || 0);
  if (M.neon) { M.bodyG.remove(M.neon); M.neon.geometry.dispose(); M.neon.material.dispose(); M.neon = null; }
  if (m.neon && MOD_NEON[m.neon]) {
    const g = new THREE.PlaneGeometry(c.spec.W * 1.1, c.spec.L * 0.95); g.rotateX(-Math.PI / 2);
    M.neon = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col(MOD_NEON[m.neon]), transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false })); M.neon.position.y = 0.06 - c.spec.bot + 0.02; M.bodyG.add(M.neon);
  }
  c.tune = m.tune ? 1.12 : 1;
}
let NEON_LIGHT = null;
function updateMods() { // one real light under the car you're driving at night (the rest just glow)
  const c = player.state === 'car' && player.car, m = c && carMods(c), on = !!(m && m.neon && MOD_NEON[m.neon]);
  if (on && !NEON_LIGHT) { NEON_LIGHT = new THREE.PointLight(0xffffff, 0, 7, 2); scene.add(NEON_LIGHT); }
  if (NEON_LIGHT) { NEON_LIGHT.intensity = on ? 2.5 * Math.max(0.2, nightLevel) : 0; if (on) { NEON_LIGHT.color.set(MOD_NEON[m.neon]); NEON_LIGHT.position.set(c.x, standAt(c.x, c.z) + 0.15, c.z); } }
}
// the shop panel
function modShopCar() { return player.state === 'car' && player.car ? player.car : cars.filter((c) => !c.dead && !c.model.bike && (c.owned || c.kind === 'abandoned') && Math.hypot(c.x - player.x, c.z - player.z) < 30).sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0]; }
function buyMod(c, key, fn) { if (!pay(MOD_COST[key], 'that mod')) return; fn(carMods(c)); if (key === 'paint') { const col0 = carMods(c).paint; repaintCar(c, col0); } applyMods(c); saveGame(); sfxTone([523, 784], 0.15, 0.05); stat('mods'); if (!ACT_CUR) actComplete('modshop', { msg: 'Fresh mods fitted' }); openModShop(); }
function openModShop() {
  const c = modShopCar(); if (!c) { toast('Bring a car (yours, or one you drove here) up to the shop first'); return; }
  const m = carMods(c), label = CAR_LABEL[c.type] || c.type;
  econPanel('Mod shop', `${label}${c.owned ? ' (yours: mods are saved)' : ' (not yours: mods last until you leave it)'} · paint $${MOD_COST.paint} · decals $${MOD_COST.livery} · wheels $${MOD_COST.wheels} · lowering $${MOD_COST.lower} · neon $${MOD_COST.neon} · tune $${MOD_COST.tune}`, [
    [`Engine tune (+12% power and top speed)${m.tune ? ' — fitted' : ''}`, m.tune ? 'Fitted' : 'Tune', !m.tune, () => buyMod(c, 'tune', (q) => { q.tune = true; })],
    [`Lowered suspension: ${['stock', 'a bit lower', 'slammed'][Math.round((m.lower || 0) / 0.05)]}`, 'Next', true, () => buyMod(c, 'lower', (q) => { q.lower = ((Math.round((q.lower || 0) / 0.05) + 1) % 3) * 0.05; })],
  ]);
  const body = $('shop-body');
  const group = (title, opts, cur, onPick) => { const h = document.createElement('div'); h.className = 'psec'; h.textContent = title; body.appendChild(h); const row = document.createElement('div'); row.className = 'psays'; for (const [lab, val, swatch] of opts) { const b = document.createElement('button'); b.type = 'button'; b.textContent = lab; if (swatch) { b.style.background = swatch; b.style.color = '#111'; b.style.minWidth = '34px'; } if (val === cur) b.style.outline = '2px solid #f6c445'; b.addEventListener('click', () => onPick(val)); row.appendChild(b); } body.appendChild(row); };
  group(`Paint ($${MOD_COST.paint})`, MOD_PAINT.map((p) => ['', p, p]), m.paint || c.color, (p) => buyMod(c, 'paint', (q) => { q.paint = p; }));
  group(`Decals ($${MOD_COST.livery})`, MOD_LIVERY.map((l, i) => [l, i]), m.livery || 0, (i) => buyMod(c, 'livery', (q) => { q.livery = i; q.liveryOff = i === 0; q.liverySeed = Math.floor(Math.random() * 1e6); }));
  group(`Wheels ($${MOD_COST.wheels})`, Object.keys(MOD_WHEELS).map((k) => [k, k]), m.wheels || 'Standard', (k) => buyMod(c, 'wheels', (q) => { q.wheels = k === 'Standard' ? null : k; }));
  group(`Neon underglow ($${MOD_COST.neon})`, Object.keys(MOD_NEON).map((k) => [k, k, MOD_NEON[k]]), m.neon || 'Off', (k) => buyMod(c, 'neon', (q) => { q.neon = k === 'Off' ? null : k; }));
}
