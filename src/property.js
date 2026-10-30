// ============================================================================
// Gold Coast Streets — property. The Real estate app on the phone lists houses and apartments for sale near you.
// Buy one and it's yours: the front door opens with your key, it becomes home (you respawn there), you can sleep
// till morning, park cars in your garage, and rent comes into your savings every five minutes while you play.
// ============================================================================
const PROP = { listings: [], sel: null, rentT: 0, hintT: 0 };
const RENT_EVERY = 300;
const ownsProp = (id) => ECON.props.some((P) => P.id === id);
function streetName(x, z) { const ne = nearestEdge(x, z, (E) => !!E.name); return ne.e >= 0 && EDGES[ne.e] ? EDGES[ne.e].name : null; }
const roundTo = (v, k) => Math.round(v / k) * k;
// what's for sale within a kilometre: a few houses from the streamed suburbs and the apartment towers nearby
function findListings() {
  const out = [], seen = new Set();
  const houses = [];
  for (const T of TILES.values()) for (const H of T.houses || []) {
    const fd = H.doors.find((d) => d.type === 'front'); if (!fd || ownsProp(H.id)) continue;
    const d = Math.hypot(fd.x - player.x, fd.z - player.z); if (d < 60 || d > 1000) continue;
    houses.push({ H, fd, d });
  }
  houses.sort((a, b) => a.d - b.d);
  for (let i = 0; i < houses.length && out.length < 5; i += 9) { // every ninth: spread along different streets
    const { H, fd } = houses[i], area = Math.abs(polyArea(H.f)), st = streetName(fd.x, fd.z);
    if (seen.has(st) && i + 9 < houses.length) continue; seen.add(st);
    const beds = clamp(Math.round(area / 55), 2, 5), price = roundTo(45000 + area * 380 + (H.top > 6 ? 25000 : 0), 1000);
    out.push({ id: H.id, kind: 'house', name: `${beds} bed house${st ? ', ' + st : ''}`, x: fd.x, z: fd.z, price, rent: roundTo(price * 0.004, 10) });
  }
  const towers = bigBuildingsNear(player.x, player.z, 1000).filter((B) => B.kind === 'apartments' && B.b[0] >= 20)
    .map((B) => { const [cx, cz] = footCentroid(B.f); return { B, cx, cz, d: Math.hypot(cx - player.x, cz - player.z) }; })
    .filter((t) => t.d < 1000).sort((a, b) => a.d - b.d);
  const used = new Set();
  for (const t of towers) {
    const id = `apt:${Math.round(t.cx)},${Math.round(t.cz)}`; if (used.has(id) || ownsProp(id)) continue; used.add(id);
    const hash = ((Math.round(t.cx) * 73856093) ^ (Math.round(t.cz) * 19349663)) >>> 0; // the same listing each time you look
    const floor = clamp(Math.round(t.B.b[0] / 3 * (0.4 + (hash % 1000) / 2000)), 2, 80), st = streetName(t.cx, t.cz);
    const s = sidewalkNear(t.cx, t.cz), price = roundTo(38000 + t.B.b[0] * 650 + floor * 400, 1000);
    out.push({ id, kind: 'apt', name: `Level ${floor} apartment, ${t.B.name || (st ? st : 'tower')}`, x: s.x, z: s.z, price, rent: roundTo(price * 0.0045, 10) });
    if (out.filter((q) => q.kind === 'apt').length >= 4) break;
  }
  return out;
}
// buying: wallet first, then savings
function buyProperty(L) {
  if (ownsProp(L.id)) return;
  if (player.money + ECON.bank < L.price) { toast(`Not enough money: you need $${L.price.toLocaleString()} (wallet plus savings)`); return; }
  const fromWallet = Math.min(player.money, L.price); player.money -= fromWallet; ECON.bank -= L.price - fromWallet;
  ECON.props.push({ id: L.id, kind: L.kind, name: L.name, x: L.x, z: L.z, price: L.price, rent: L.rent });
  ECON.home = { x: L.x, z: L.z, name: L.name }; playerSpot = { x: L.x, z: L.z }; saveGame();
  sfxTone([523, 659, 784, 1046], 0.5, 0.07, 'triangle');
  toast(`Sold! ${L.name} is yours — it's home now. Rent: $${L.rent} every 5 minutes into your savings.`);
}
function sellProperty(P) {
  const i = ECON.props.indexOf(P); if (i < 0) return;
  const back = roundTo(P.price * 0.8, 100); ECON.props.splice(i, 1); ECON.bank += back;
  if (ECON.home && ECON.home.name === P.name) { ECON.home = null; playerSpot = startSpot; }
  saveGame(); toast(`Sold ${P.name} for $${back.toLocaleString()} (into your savings)`);
}
// the Real estate app
function realtyApp(btn, head) {
  if (ECON.props.length) {
    head('Your places');
    for (const P of ECON.props) btn(`🔑 ${P.name}`, `${km(P.x, P.z)} · rent $${P.rent} / 5 min${ECON.home && ECON.home.name === P.name ? ' · home' : ''}`, () => directions(P.name, P.x, P.z));
  }
  head('For sale near you');
  if (!PROP.listings.length) btn('Nothing listed nearby', 'try the suburbs or a street of towers', () => {}, false);
  for (const L of PROP.listings) btn(`${L.kind === 'house' ? '🏡' : '🏢'} ${L.name}`, `$${L.price.toLocaleString()} · ${km(L.x, L.z)} · rent $${L.rent} / 5 min`, () => { PROP.sel = L; phoneApp('listing'); });
}
function listingApp(btn, head) {
  const L = PROP.sel; if (!L) return;
  head(L.name);
  btn(`$${L.price.toLocaleString()}`, `${L.kind === 'house' ? 'House with a garage' : 'Apartment with a car space'} · ${km(L.x, L.z)} away`, () => {}, false);
  btn('What you get', 'a place to sleep and save · your respawn point · a garage for cars you take · rent income', () => {}, false);
  btn('📍 Go and look', 'directions to the front door', () => directions(L.name, L.x, L.z));
  const ok = player.money + ECON.bank >= L.price;
  btn(ownsProp(L.id) ? 'You own this' : '✍️ Buy it', ok ? 'wallet first, then savings' : `you have $${(player.money + ECON.bank).toLocaleString()} (wallet plus savings)`, () => { buyProperty(L); phoneApp('realty'); }, ok && !ownsProp(L.id)).classList.add('go');
}
// at one of your places
function propHere() {
  for (const P of ECON.props) {
    if (P.kind === 'house') { const H = houseAt(player.x, player.z); if ((H && H.id === P.id) || Math.hypot(P.x - player.x, P.z - player.z) < 4) return P; }
    else if (Math.hypot(P.x - player.x, P.z - player.z) < 10) return P;
  }
  return null;
}
function propertyUse() {
  if (player.state !== 'foot') return false;
  const P = propHere(); if (!P) return false;
  openPlace(P); return true;
}
function garageCandidates(P) { return cars.filter((c) => c.kind === 'abandoned' && !c.owned && !c.dead && CAR_PRICES[c.type] && Math.hypot(c.x - P.x, c.z - P.z) < 30); }
function openPlace(P) {
  const rows = [
    ['Sleep till morning (full health, saves the game)', 'Sleep', true, () => { player.health = 100; gameHour = 8; ECON.home = { x: P.x, z: P.z, name: P.name }; playerSpot = { x: P.x, z: P.z }; saveGame(); closeShop(); toast('You slept in. Good morning!'); }],
  ];
  if (!ECON.home || ECON.home.name !== P.name) rows.push(['Make this home (where you respawn)', 'Set home', true, () => { ECON.home = { x: P.x, z: P.z, name: P.name }; playerSpot = { x: P.x, z: P.z }; saveGame(); openPlace(P); }]);
  for (const c of garageCandidates(P)) rows.push([`Put the ${CAR_LABEL[c.type]} out the front in your garage (keep it for good)`, 'Garage it', true, () => {
    ECON.garage.push({ type: c.type, color: c.color, bought: Date.now() }); c.remove(); saveGame(); toast(`Your ${CAR_LABEL[c.type]} is in the garage — call it any time from My cars`); openPlace(P);
  }]);
  rows.push([`Rent: $${P.rent} every 5 minutes into your savings · next in ${Math.ceil((RENT_EVERY - PROP.rentT) / 60)} min`, null, false, null]);
  rows.push([`Sell (80%: $${roundTo(P.price * 0.8, 100).toLocaleString()})`, 'Sell', true, () => { sellProperty(P); closeShop(); }]);
  econPanel(P.name, `Your ${P.kind === 'house' ? 'house' : 'apartment'} · savings $${ECON.bank.toLocaleString()} · ${ECON.garage.length} cars in the garage`, rows);
}
function updateProperty(dt) {
  if (ECON.props.length) {
    PROP.rentT += dt;
    if (PROP.rentT >= RENT_EVERY) {
      PROP.rentT = 0; const sum = ECON.props.reduce((a, P) => a + P.rent, 0); ECON.bank += sum; saveGame();
      toast(`Rent's in: +$${sum.toLocaleString()} to your savings`); sfxTone([784, 1046], 0.15, 0.05);
    }
  }
  PROP.hintT -= dt;
  if (player.state === 'foot' && PROP.hintT <= 0 && propHere()) { toast('E: your place — sleep, garage, rent'); PROP.hintT = 10; }
}
