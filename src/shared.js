// Gold Coast Streets — the shared online Gold Coast, your safes and your assets.
// Online, every house belongs to one player across the whole server (server/src/index.js keeps the list). Your places
// have a safe: cash in it (or in the bank) is safe when you're wasted, which costs you 75% of the cash on you. While
// you're offline other players can break in and crack your safe for 30-50% of it, once a day; you hear who did it next
// time you play. Single player has the safes too, just no robbers.
// Phone → Assets: your money, places, cars and aircraft. Aircraft you buy float over your home until you call one
// down, and go back up when you send it home (or leave it far behind).

const SHARED = { houses: new Map(), t: 0, hintT: 0, crack: null, claimed: false };
const sharedOn = () => MODE === 'multi' && !!ACCT.token;
const DEATH_LOSS = 0.75; // the share of the cash on you that's gone when you're wasted
// ---------------------------------------------------------------- who owns what (online)
function loadHouses(list) {
  SHARED.houses = new Map((list || []).map((h) => [h.id, h]));
  for (const P of ECON.props) { const h = SHARED.houses.get(P.id); if (h && h.mine) P.safe = h.safe; } // the server's safe totals win
}
function refreshHouses() { if (sharedOn()) api('/houses').then((d) => loadHouses(d.houses)).catch(() => {}); }
const ownedByOther = (id) => { const h = SHARED.houses.get(id); return h && !h.mine ? h : null; };
// after logging in: robbery news, and places bought before the shared world are claimed (the first owner keeps each)
function sharedLogin(d) {
  loadHouses(d.houses);
  for (const r of d.robbed || []) actNote(`🚨 ${r.robber || 'Someone'} cracked your safe at ${r.house || 'your place'} while you were offline: -$${Number(r.amount).toLocaleString()}`);
  if ((d.robbed || []).length) setTimeout(() => toast(`🚨 You were robbed while you were away — phone → Alerts`), 4000);
  if (SHARED.claimed) return; SHARED.claimed = true;
  const unclaimed = ECON.props.filter((P) => !(SHARED.houses.get(P.id) || {}).mine);
  if (!unclaimed.length) return;
  api('/house/claim', { props: unclaimed.map(({ id, kind, name, x, z, price }) => ({ id, kind, name, x, z, price })) }).then((r) => {
    for (const f of r.refunded || []) {
      const i = ECON.props.findIndex((P) => P.id === f.id); if (i < 0) continue;
      const P = ECON.props[i]; ECON.props.splice(i, 1); ECON.bank += f.price;
      if (ECON.home && ECON.home.name === P.name) { ECON.home = null; playerSpot = startSpot; }
      actNote(`🏠 Someone else owned ${P.name} first in the shared world — your $${f.price.toLocaleString()} is back in your savings`);
    }
    saveGame(); refreshHouses();
  }).catch(() => { SHARED.claimed = false; });
}
// ---------------------------------------------------------------- your safe
function safeMove(P, amount) { // + puts cash in, - takes it out
  amount = Math.round(amount); if (!amount) return;
  if (amount > 0 && amount > player.money) { toast('You don’t have that much cash on you'); return; }
  if (amount < 0 && -amount > (P.safe || 0)) { toast('There isn’t that much in the safe'); return; }
  const done = (safe) => { P.safe = safe; player.money -= amount; saveGame(); sfxTone(amount > 0 ? [523, 392] : [392, 523], 0.15, 0.05); toast(amount > 0 ? `Put $${amount.toLocaleString()} in the safe` : `Took $${(-amount).toLocaleString()} out of the safe`); if (!$('shop').hidden) openPlace(P); };
  if (!sharedOn()) return done((P.safe || 0) + amount);
  api('/house/safe', { id: P.id, amount }).then((d) => done(d.safe)).catch((e) => toast(e.message));
}
function safeRows(P) {
  const s = P.safe || 0, rows = [[`🔒 Safe: $${s.toLocaleString()} — kept when you’re wasted${sharedOn() ? ' · while you’re offline a robber can crack it for up to half, once a day' : ''}`, null, false, null]];
  rows.push(['Put all your cash in the safe', 'All in', player.money > 0, () => safeMove(P, player.money)]);
  if (player.money >= 1000) rows.push(['Put $1,000 in', '$1,000', true, () => safeMove(P, 1000)]);
  if (s >= 1000) rows.push(['Take $1,000 out', '$1,000', true, () => safeMove(P, -1000)]);
  rows.push(['Take it all out', 'All out', s > 0, () => safeMove(P, -s)]);
  return rows;
}
const safesTotal = () => ECON.props.reduce((a, P) => a + (P.safe || 0), 0);
// ---------------------------------------------------------------- breaking into someone else's place (online)
function houseHasSafe(H) { return ownsProp(H.id) || !!ownedByOther(H.id); } // the safe sits in a bedroom (houses.js)
function sharedUse() {
  if (!sharedOn() || player.state !== 'foot' || SHARED.crack) return false;
  const H = houseAt(player.x, player.z); if (!H || !H.safeSpot || Math.hypot(H.safeSpot.x - player.x, H.safeSpot.z - player.z) > 1.7) return false;
  const h = ownedByOther(H.id); if (!h) return false;
  if (!h.robbable) { toast(h.online ? `${h.owner} is online — you can only crack their safe while they’re offline` : !h.hasSafe ? `${h.owner}’s safe is empty` : `${h.owner}’s safe has already been hit today (or they’re too new to rob)`); return true; }
  SHARED.crack = { H, h, t: 0, need: 12 }; toast(`Cracking ${h.owner}’s safe… stay close (12 s)`); sfxNoise(0.2, 1400, 0.1);
  return true;
}
function updateCrack(dt) {
  const C = SHARED.crack; if (!C) return;
  const near = player.state === 'foot' && Math.hypot(C.H.safeSpot.x - player.x, C.H.safeSpot.z - player.z) < 2.2;
  if (!near || player.deadT > 0) { SHARED.crack = null; $('jobhud').hidden = true; toast('You left the safe — it locked again'); return; }
  C.t += dt; $('jobhud').hidden = false; $('jobhud').textContent = `🔓 Cracking ${C.h.owner}’s safe · ${Math.max(0, Math.ceil(C.need - C.t))}s`;
  if (Math.floor(C.t * 2) !== Math.floor((C.t - dt) * 2)) sfxTone([1800 + Math.random() * 400], 0.03, 0.03);
  if (C.t < C.need) return;
  SHARED.crack = null; $('jobhud').hidden = true;
  api('/house/rob', { id: C.H.id }).then((d) => {
    player.money += d.amount; saveGame(); sfxTone([523, 659, 784, 1046], 0.5, 0.07, 'triangle'); stat('robbed');
    toast(`Cracked it! +$${d.amount.toLocaleString()} from ${d.owner}’s safe — the alarm’s going off`);
    CRIME_TEXT.alarm = 'a house alarm went off'; raiseWanted(2, 'alarm'); refreshHouses();
  }).catch((e) => toast(e.message));
}
function updateShared(dt) {
  updateCrack(dt);
  if (!sharedOn()) return;
  SHARED.t -= dt; if (SHARED.t <= 0) { SHARED.t = 60; refreshHouses(); }
  SHARED.hintT -= dt;
  if (SHARED.hintT <= 0 && player.state === 'foot') { // walking up to (or into) someone else's place
    const H = houseAt(player.x, player.z) || (nearestDoor(player.x, player.z, 4) || {}).house, h = H && ownedByOther(H.id);
    if (h) { SHARED.hintT = 12; toast(h.online ? `🏠 ${h.owner}’s place — they’re online right now` : h.robbable ? `🏠 ${h.owner}’s place — they’re offline: find the safe in a bedroom and crack it (E)` : `🏠 ${h.owner}’s place`); }
  }
}
// ---------------------------------------------------------------- aircraft: bought, kept over your home, called down
const AIR_SHOP = [
  { type: 'heli', name: 'Helicopter', price: 85000 }, { type: 'cessna', name: 'Cessna 172', price: 45000 }, { type: 'twin', name: 'Twin-prop King Air', price: 120000 },
  { type: 'bizjet', name: 'Private jet', price: 450000 }, { type: 'fighter', name: 'Fighter jet', price: 900000 }, { type: 'jet', name: 'Airliner', price: 2500000 },
];
const AIR_BY = Object.fromEntries(AIR_SHOP.map((a) => [a.type, a]));
const HELI_COLS = ['#f4f4f2', '#d6302a', '#1d3b6b', '#f2c230', '#1d2125', '#2f7a4a'];
const AIRCRAFT = { shown: [], showKey: '', out: new Map() }; // the models over your roof, and the ones you've called down
function homeProp() { return ECON.props.find((P) => ECON.home && P.name === ECON.home.name) || ECON.props[0] || null; }
function roofTop(P) { // the top of your home's roof (or a height over an apartment tower)
  for (const T of TILES.values()) for (const H of T.houses || []) if (H.id === P.id) return H.base + H.top + 2.6;
  return groundAt(P.x, P.z) + (P.kind === 'apt' ? 60 : 9);
}
function buyAircraft(a) {
  if (!homeProp()) { toast('Buy a house first — your aircraft are kept at your home'); return; }
  if (player.money + ECON.bank < a.price) { toast(`You need $${a.price.toLocaleString()} (wallet plus savings)`); return; }
  const w = Math.min(player.money, a.price); player.money -= w; ECON.bank -= a.price - w;
  ECON.aircraft.push({ type: a.type, color: a.type === 'heli' ? pick(HELI_COLS) : null, bought: Date.now() }); saveGame();
  sfxTone([523, 659, 784, 1046], 0.5, 0.07, 'triangle'); toast(`Your ${a.name} is waiting over your home — phone → Assets to bring it down`); AIRCRAFT.showKey = '';
}
function callAircraft(i) {
  const A = ECON.aircraft[i]; if (!A || AIRCRAFT.out.has(i)) return;
  if (player.state !== 'foot') { toast('Get out first'); return; }
  let v;
  if (A.type === 'heli') {
    const s = freeSpotNear(player.x + Math.sin(player.h) * 12, player.z + Math.cos(player.h) * 12, 40); if (!s) { toast('No clear spot for a helicopter here'); return; }
    v = new Chopper(s[0], s[1], player.h, 'Your helicopter', A.color);
  } else { // planes come down on the nearest road, pointing along it
    const P = curbNear(player.x, player.z); if (!P) { toast('A plane needs a road to land on — find one'); return; }
    v = new Plane(A.type, P.x, P.z, P.h);
  }
  v.owned = true; AIRCRAFT.out.set(i, v); AIRCRAFT.showKey = '';
  WAYPOINT = { name: 'Your ' + AIR_BY[A.type].name, x: v.x, z: v.z }; GPS.t = 0;
  closePhone(); toast(`Your ${AIR_BY[A.type].name} is down — E to get in`); sfxNoise(0.6, 300, 0.25);
}
function sendHome(i, quiet) {
  const v = AIRCRAFT.out.get(i); if (!v) return;
  if (player.chopper === v || player.plane === v) { if (!quiet) toast('Get out of it first'); return; }
  if (!v.dead) v.remove(); AIRCRAFT.out.delete(i); AIRCRAFT.showKey = '';
  if (!quiet) toast(`Your ${AIR_BY[ECON.aircraft[i].type].name} flew home`);
}
function updateAircraft(dt) {
  for (const [i, v] of AIRCRAFT.out) { // wrecked or left far behind: back over your home
    const far = Math.hypot(v.x - player.x, v.z - player.z) > 700 && player.chopper !== v && player.plane !== v;
    if (v.dead || far || (!CHOPPERS.includes(v) && !PLANES.includes(v))) { if (v.dead) toast(`Your ${AIR_BY[ECON.aircraft[i].type].name} was towed home for repairs`); sendHome(i, true); }
  }
  // the ones at home float over the roof (only drawn when you're nearby)
  const P = homeProp(), near = P && Math.hypot(P.x - player.x, P.z - player.z) < 600;
  const key = near ? P.id + ':' + ECON.aircraft.map((A, i) => (AIRCRAFT.out.has(i) ? '-' : A.type)).join(',') : '';
  if (key === AIRCRAFT.showKey) { for (const S of AIRCRAFT.shown) { S.g.position.y = S.y + Math.sin(elapsed * 1.2 + S.k) * 0.25; if (S.rotor) S.rotor.rotation.y += dt * 1.5; } return; }
  AIRCRAFT.showKey = key;
  for (const S of AIRCRAFT.shown) { scene.remove(S.g); S.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  AIRCRAFT.shown = []; if (!near) return;
  let y = roofTop(P);
  ECON.aircraft.forEach((A, i) => {
    if (AIRCRAFT.out.has(i)) return;
    let g, rotor = null, lift = 0;
    if (A.type === 'heli') { const M = makeChopper(A.color || '#f4f4f2', '#2b2e33'); g = M.g; rotor = M.rotor; lift = 3.2; } // makeChopper adds it to the scene
    else { const sp = PLANE_TYPES[A.type]; g = makePlaneModel(sp); scene.add(g); lift = sp.fus + sp.gear + 1; }
    g.position.set(P.x, y, P.z); g.rotation.y = i * 0.9; AIRCRAFT.shown.push({ g, y, k: i, rotor }); y += lift + 1.5;
  });
}
// ---------------------------------------------------------------- phone → Assets
function assetsApp(btn, head) {
  const safes = safesTotal();
  head('Money');
  btn(`💵 Cash on you: $${player.money.toLocaleString()}`, `you lose ${Math.round(DEATH_LOSS * 100)}% of it if you’re wasted — bank it or put it in a safe`, () => {}, false);
  btn(`🏦 Savings: $${ECON.bank.toLocaleString()}`, 'safe at any bank, always', () => { const b = nearest(SHOPS.filter((q) => q.kind === 'bank')); if (b) directions(b.name, b.x, b.z); });
  btn(`🔒 In your safes: $${safes.toLocaleString()}`, sharedOn() ? 'safe when you’re wasted · robbers can crack a safe while you’re offline' : 'safe when you’re wasted', () => {}, false);
  head(ECON.props.length ? 'Your places' : 'No places yet');
  if (!ECON.props.length) btn('🏡 Buy a house', 'Real estate on your phone · your home keeps your aircraft', () => { PROP.listings = findListings(); phoneApp('realty'); });
  for (const P of ECON.props) btn(`${P.kind === 'house' ? '🏡' : '🏢'} ${P.name}${ECON.home && ECON.home.name === P.name ? ' · home' : ''}`, `safe $${(P.safe || 0).toLocaleString()} · ${km(P.x, P.z)}`, () => directions(P.name, P.x, P.z));
  head(ECON.aircraft.length ? 'Your aircraft (kept over your home)' : 'No aircraft yet');
  ECON.aircraft.forEach((A, i) => {
    const a = AIR_BY[A.type], out = AIRCRAFT.out.get(i);
    if (out) btn(`✈️ ${a.name} · out`, `${km(out.x, out.z)} away · send it home`, () => { sendHome(i); phoneApp('assets'); });
    else btn(`✈️ ${a.name}`, a.type === 'heli' ? 'bring it down beside you' : 'bring it down on the nearest road', () => callAircraft(i)).classList.add('go');
  });
  if (ECON.garage.length) { head('Your cars'); ECON.garage.forEach((g, i) => btn(`🚗 ${CAR_LABEL[g.type]}`, 'delivered to the nearest road', () => { closePhone(); callCar(i); toast(`Your ${CAR_LABEL[g.type]} is on the nearest road`); })); }
  head('Buy an aircraft');
  for (const a of AIR_SHOP) btn(`${a.type === 'heli' ? '🚁' : '🛩️'} ${a.name} · $${a.price.toLocaleString()}`, homeProp() ? 'kept over your home' : 'you need a house first', () => { buyAircraft(a); phoneApp('assets'); }, !!homeProp() && player.money + ECON.bank >= a.price);
}
