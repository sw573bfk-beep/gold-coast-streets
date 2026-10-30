// ============================================================================
// Gold Coast Streets — shops that do something to you or for you: barbers (a new cut, colour and beard), tattoo
// parlours (sleeves, neck, legs), electronics stores (gear that changes how you play) and the shooting range
// (Gold Coast Pistol Club, or out the back of a dealer), where good shooting steadies your aim for real.
// ============================================================================
const CUTS = [['short', 'Short back and sides', 25], ['buzz', 'Buzz cut', 20], ['mohawk', 'Mohawk', 45], ['mullet', 'Mullet', 40], ['long', 'Long', 35], ['bun', 'Man bun', 35], ['afro', 'Afro', 40], ['bald', 'Clean shave', 15]];
const HAIR_DYE = ['#1d1612', '#3b2a1e', '#6b4a2b', '#c9a15a', '#e5cf8f', '#8a3b1f', '#d8d8d8', '#2a7de2', '#e85a9a', '#33d17a'];
function lookChanged(msg) {
  rebuildPlayer(); saveGame(); try { localStorage.setItem('gcs-look', JSON.stringify(player.look)); } catch (e) { /* storage blocked */ }
  sfxTone([660, 880], 0.12, 0.05); toast(msg);
}
function openBarber(sh) {
  const L = player.look, rows = [];
  for (const [id, name, price] of CUTS) rows.push([`${name}${(L.hairStyle || 'short') === id ? '  (what you have)' : ''}`, `$${price}`, player.money >= price && (L.hairStyle || 'short') !== id, () => { if (!pay(price, 'the cut')) return; L.hairStyle = id; lookChanged(`Fresh ${name.toLowerCase()}`); openBarber(sh); }]);
  rows.push([L.beard ? 'Shave the beard off' : 'Grow out a beard (they glue it on, it’s fine)', '$15', player.money >= 15, () => { if (!pay(15, 'the beard')) return; L.beard = !L.beard; lookChanged(L.beard ? 'Beard on' : 'Smooth'); openBarber(sh); }]);
  econPanel(sh.name, 'Barber · pick a cut, or a colour below ($20)', rows);
  const sw = document.createElement('div'); sw.className = 'swatches'; sw.style.margin = '10px 0';
  for (const c of HAIR_DYE) {
    const b = document.createElement('button'); b.type = 'button'; b.style.background = c; b.setAttribute('aria-label', 'Hair colour ' + c); if (L.hair === c) b.className = 'on';
    b.addEventListener('click', () => { if (L.hair === c || !pay(20, 'the colour')) return; L.hair = c; lookChanged('New colour'); openBarber(sh); });
    sw.appendChild(b);
  }
  $('shop-body').appendChild(sw);
}
const TATS = [['sleeves', 'Full sleeves (both arms)', 350], ['neck', 'Neck piece', 180], ['legs', 'Leg pieces', 260]];
function openTattoo(sh) {
  const T = player.look.tats || (player.look.tats = {});
  const rows = TATS.map(([id, name, price]) => [T[id] ? `${name} (you have it)` : name, T[id] ? 'Laser off $120' : `$${price}`, player.money >= (T[id] ? 120 : price), () => {
    if (!pay(T[id] ? 120 : price, T[id] ? 'laser removal' : 'the tattoo')) return; T[id] = !T[id]; lookChanged(T[id] ? 'Fresh ink. Keep it out of the sun.' : 'Lasered off. Ouch.'); openTattoo(sh);
  }]);
  rows.push(['(Wear a singlet to show off sleeves — any clothes shop)', null, false, null]);
  econPanel(sh.name, 'Tattoo parlour · all ink is permanent (unless you pay to laser it)', rows);
}
// ---------------------------------------------------------------- electronics: gear you keep
const GEAR = {
  scanner: { name: 'Police scanner app', price: 1500, desc: 'every cop car on your big map, and you shake off a search 25% faster' },
  radar: { name: 'Radar detector', price: 600, desc: 'beeps when a cop car is within 150 m while you drive' },
  headphones: { name: 'Wireless headphones', price: 250, desc: 'listen to the radio on foot (R changes station)' },
  prophone: { name: 'Pear 15 Pro phone', price: 1200, desc: 'a Camera app on your phone: photo mode with the HUD hidden' },
};
const hasGear = (k) => !!(ECON.gear && ECON.gear[k]);
function openElectronics(sh) {
  ECON.gear = ECON.gear || {};
  econPanel(sh.name, 'Electronics · gear you keep for good (it’s saved)', Object.entries(GEAR).map(([k, G]) => [`${G.name}: ${G.desc}${hasGear(k) ? '  (owned)' : ''}`, hasGear(k) ? 'Owned' : `$${G.price.toLocaleString()}`, !hasGear(k) && player.money >= G.price, () => {
    if (hasGear(k) || !pay(G.price, G.name)) return; ECON.gear[k] = true; saveGame(); sfxTone([523, 784], 0.2, 0.06, 'triangle'); toast(`${G.name}: ${G.desc}`); openElectronics(sh);
  }]));
}
let radarT = 0;
function updateGear(dt) {
  radarT -= dt;
  if (hasGear('radar') && player.state === 'car' && radarT <= 0) {
    const near = cars.some((c) => c.kind === 'police' && !c.dead && c !== player.car && Math.hypot(c.x - player.x, c.z - player.z) < 150);
    if (near) { radarT = 6; sfxTone([1400, 1800, 1400], 0.3, 0.04, 'square'); toast('📡 Radar: police nearby'); }
  }
}
function photoMode() { closePhone(); document.body.classList.add('photo'); toast('Photo mode — P or Esc to come back'); }
// ---------------------------------------------------------------- the shooting range: 10 targets, click them before they drop
const isRange = (sh) => sh.dealer || /pistol club|shooting|rifle range|gun club|gun range/i.test(sh.name);
function openRange(sh) {
  const best = ECON.rangeBest || 0;
  econPanel(sh.name, `Shooting range · aim ${ECON.aim || 0}/5 (each level tightens your spread 10%) · best ${best}/10`, [
    ['A round of 10 targets — hit 7 to raise your aim, 10 for a $150 prize', '$40', player.money >= 40, () => { if (!pay(40, 'a round')) return; startRange(sh); }],
  ]);
}
function startRange(sh) {
  const body = $('shop-body'); body.innerHTML = ''; $('shop-sub').textContent = 'Click each target before it drops. They get quicker.';
  const lane = document.createElement('div'); lane.style.cssText = 'position:relative;height:220px;background:linear-gradient(#3a4148,#262b30);border-radius:8px;overflow:hidden;cursor:crosshair;touch-action:manipulation';
  const info = document.createElement('p'); body.append(lane, info);
  let n = 0, hits = 0, T = null, timer = 0;
  const next = () => {
    if (T) { T.remove(); T = null; }
    if ($('shop').hidden) return;
    if (n >= 10) return finish();
    n++; info.textContent = `Target ${n}/10 · hits ${hits}`;
    T = document.createElement('button'); T.type = 'button'; T.setAttribute('aria-label', 'Target');
    const size = 46 - n * 2; T.style.cssText = `position:absolute;width:${size}px;height:${size}px;border-radius:50%;border:0;padding:0;left:${8 + rand() * 84}%;top:${10 + rand() * 70}%;transform:translate(-50%,-50%);background:radial-gradient(#fff 0 18%,#d6302a 19% 40%,#fff 41% 60%,#d6302a 61%)`;
    T.addEventListener('pointerdown', (e) => { e.preventDefault(); hits++; sfxNoise(0.08, 2600, 0.25); clearTimeout(timer); next(); });
    lane.appendChild(T);
    timer = setTimeout(next, 1300 - n * 70);
  };
  lane.addEventListener('pointerdown', (e) => { if (e.target === lane) sfxNoise(0.08, 2600, 0.15); }); // a miss still goes bang
  const finish = () => {
    ECON.rangeBest = Math.max(ECON.rangeBest || 0, hits);
    let msg = `${hits}/10.`;
    if (hits >= 7 && (ECON.aim || 0) < 5) { ECON.aim = (ECON.aim || 0) + 1; msg += ` Aim up to ${ECON.aim}/5 — steadier with every gun.`; }
    if (hits === 10) { player.money += 150; msg += ' Perfect round: +$150.'; }
    saveGame(); toast(msg); openRange(sh);
  };
  next();
}
const aimSpread = () => 1 - (ECON.aim || 0) * 0.1;
// which of these a shop is (null: an ordinary shop)
function serviceFor(sh) {
  const n = sh.name.toLowerCase();
  if (isRange(sh) && !sh.dealer) return openRange;
  if (/tattoo/.test(n) && !/removal|cosmetic/.test(n)) return openTattoo;
  if (/barber|hair|cutz|salon/.test(n) && !/nail|beauty|lash|brow/.test(n)) return openBarber;
  if (shopStyle(sh) === 'electronics') return openElectronics;
  return null;
}
