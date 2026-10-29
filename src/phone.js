// Gold Coast Streets — the phone (P): call a taxi, a mechanic, food or one of your cars; missions for cash
// (a bank heist with a hired crew, street races, a landmark tour); and TikTak, a feed of made-up local clips.

const PHONE = { open: false, app: 'home', clip: 0 };
function phoneEl() { return $('phone'); }
function openPhone() {
  if (uiOpen && !PHONE.open) return;
  PHONE.open = true; uiOpen = true; if (document.pointerLockElement) document.exitPointerLock();
  phoneEl().hidden = false; phoneApp('home');
}
function closePhone() { PHONE.open = false; phoneEl().hidden = true; uiOpen = false; lockPointer(); }
function phoneApp(app) {
  PHONE.app = app; const body = $('phone-body'); body.innerHTML = '';
  const btn = (label, sub, fn, ok = true) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'papp'; b.disabled = !ok; b.innerHTML = '<b></b><span></span>'; b.firstChild.textContent = label; b.lastChild.textContent = sub || ''; b.addEventListener('click', fn); body.appendChild(b); return b; };
  const back = () => btn('← Back', '', () => phoneApp('home'));
  $('phone-title').textContent = { home: 'Phone', missions: 'Missions', heist: 'Bank job', cars: 'My cars', clips: 'TikTak' }[app] || 'Phone';
  if (app === 'home') {
    btn('🚕 Taxi', WAYPOINT ? `to ${WAYPOINT.name} · $${taxiFare()}` : 'set a destination on the map first (M)', taxi, !!WAYPOINT && player.state === 'foot');
    btn('🔧 Mechanic', 'fixes your car where it is · $80', mechanic);
    btn('🍔 Food delivery', 'a burger and chips to wherever you are · $18', foodDelivery);
    btn('🚗 My cars', `${ECON.garage.length} owned`, () => phoneApp('cars'));
    btn('💰 Missions', HEIST.stage ? 'bank job in progress' : 'cash jobs: heist, races, tours', () => phoneApp('missions'));
    btn('📱 TikTak', 'funny clips from around the Coast', () => phoneApp('clips'));
    if (WAYPOINT) btn('✕ Cancel destination', WAYPOINT.name, () => { cancelDestination(); phoneApp('home'); });
  } else if (app === 'cars') {
    back(); if (!ECON.garage.length) btn('No cars yet', 'buy one at a car dealership', () => {}, false);
    ECON.garage.forEach((g, i) => btn(`Bring my ${CAR_LABEL[g.type]}`, 'delivered to the nearest road', () => { closePhone(); callCar(i); toast(`Your ${CAR_LABEL[g.type]} is on the nearest road`); }));
  } else if (app === 'missions') {
    back();
    btn('🏦 Bank job', HEIST.stage ? 'continue planning' : 'plan a heist, hire a crew, split the take', () => phoneApp('heist'));
    btn('🏁 Street race', MISSION ? 'already on a mission' : 'reach the finish line before the clock runs out (car needed)', startRace, !MISSION);
    btn('📸 Landmark tour', MISSION ? 'already on a mission' : 'visit 3 sights for a tourist tour company', startTour, !MISSION);
    if (MISSION) btn('Give up the current mission', MISSION.title, () => { endMission(false, 'Mission abandoned.'); phoneApp('missions'); });
  } else if (app === 'heist') { back(); heistPlanner(btn); }
  else if (app === 'clips') { back(); showClip(); }
}

// ---------------------------------------------------------------- calls
function taxiFare() { return WAYPOINT ? Math.round(5 + Math.hypot(WAYPOINT.x - player.x, WAYPOINT.z - player.z) / 1000 * 2.6) : 0; }
async function taxi() {
  const fare = taxiFare(); if (!pay(fare, 'the taxi')) return;
  closePhone(); toast(`Taxi to ${WAYPOINT.name}…`);
  const tx = WAYPOINT.x, tz = WAYPOINT.z; player.x = tx; player.z = tz;
  for (let k = 0; k < 200; k++) { updateTiles(0.5); await new Promise((r) => setTimeout(r, 20)); if (k > 8 && !tileBusy) break; }
  const s = sidewalkNear(tx, tz); player.x = s.x; player.z = s.z; player.h = s.h; camYaw = s.h; saveGame();
  toast(`You've arrived · fare $${fare}`);
}
function mechanic() {
  const c = player.car || cars.filter((q) => (q.owned || q.kind === 'abandoned') && !q.dead && Math.hypot(q.x - player.x, q.z - player.z) < 30)[0];
  if (!c) { toast('No car of yours nearby for the mechanic to fix'); return; }
  if (!pay(80, 'the mechanic')) return; c.health = 100; c.burn = -1; closePhone(); toast('The mechanic patched it up — good as new'); sfxTone([523, 784], 0.2, 0.06, 'triangle');
}
function foodDelivery() {
  if (!pay(18, 'food delivery')) return; closePhone(); toast('Order placed — it’ll be here in 20 seconds');
  setTimeout(() => { player.health = Math.min(100, player.health + 45); toast('Food delivered! +45 health'); sfxTone([660, 880], 0.15, 0.05); }, 20000);
}

// ---------------------------------------------------------------- missions: one at a time
let MISSION = null; // { kind, title, t, targets, reward }
function endMission(won, msg) {
  if (!MISSION) return; const M = MISSION; MISSION = null; WAYPOINT = null; clearGPS(); $('jobhud').hidden = true;
  if (won) { player.money += M.reward; saveGame(); sfxTone([523, 659, 784, 1046], 0.5, 0.07, 'triangle'); toast(`${msg} +$${M.reward}`); } else toast(msg);
}
function pickPlaces(kinds, minD, maxD) { return (REGION && REGION.search ? REGION.search : []).filter((e) => kinds.includes(e[1]) && Math.hypot(e[2] - player.x, e[3] - player.z) > minD && Math.hypot(e[2] - player.x, e[3] - player.z) < maxD); }
function startRace() {
  if (player.state !== 'car') { toast('Get in a car first — then start the race'); return; }
  const c = pickPlaces([0, 10, 3, 5], 1400, 3200); if (!c.length) { toast('No finish line nearby'); return; }
  const e = pick(c), d = Math.hypot(e[2] - player.x, e[3] - player.z), t = Math.round(d / 21 + 20);
  MISSION = { kind: 'race', title: 'Street race', t, targets: [e], reward: Math.round(d / 5 / 10) * 10 };
  WAYPOINT = { name: 'Finish: ' + e[0], x: e[2], z: e[3] }; GPS.t = 0; closePhone();
  toast(`Race to ${e[0]} — ${(d / 1000).toFixed(1)} km in ${t}s. GO!`); sfxTone([440, 440, 880], 0.5, 0.08);
}
function startTour() {
  const c = pickPlaces([10, 3, 2], 300, 3000); if (c.length < 3) { toast('Not enough sights nearby — try somewhere else'); return; }
  const picks = []; while (picks.length < 3) { const e = pick(c); if (!picks.includes(e)) picks.push(e); }
  MISSION = { kind: 'tour', title: 'Landmark tour', t: 600, targets: picks, reward: 600 };
  WAYPOINT = { name: 'Tour stop: ' + picks[0][0], x: picks[0][2], z: picks[0][3] }; GPS.t = 0; closePhone();
  toast(`Landmark tour: ${picks.map((p) => p[0]).join(', ')} — 10 minutes`);
}
function updateMissions(dt) {
  if (MISSION) {
    const M = MISSION; M.t -= dt; const T = M.targets[0];
    $('jobhud').hidden = false; $('jobhud').textContent = `${M.title} · ${T[0]} · ${Math.round(Math.hypot(T[2] - player.x, T[3] - player.z))} m · ${Math.max(0, Math.ceil(M.t))}s`;
    if (M.t <= 0) return endMission(false, M.kind === 'race' ? 'Too slow — race lost.' : 'Out of time — the tour group went home.');
    if (Math.hypot(T[2] - player.x, T[3] - player.z) < (M.kind === 'race' ? 25 : 35)) {
      M.targets.shift();
      if (!M.targets.length) return endMission(true, M.kind === 'race' ? 'You won the race!' : 'Tour complete!');
      toast(`Stop done — next: ${M.targets[0][0]}`); WAYPOINT = { name: 'Tour stop: ' + M.targets[0][0], x: M.targets[0][2], z: M.targets[0][3] }; GPS.t = 0;
    }
  }
  updateHeist(dt);
}

// ---------------------------------------------------------------- the bank job: plan, hire a crew, rob, escape, split
const CREW = {
  driver: { name: 'Getaway driver', cost: 600, cut: 0.15, perk: 'a fast car waiting outside the bank' },
  hacker: { name: 'Hacker', cost: 900, cut: 0.15, perk: 'cracks the vault twice as fast' },
  muscle: { name: 'Muscle', cost: 700, cut: 0.15, perk: 'holds off the cops: your wanted level stops at 3 stars' },
};
const HEIST = { stage: 0, bank: null, crew: {}, take: 0, safe: null }; // stage 1 planning, 2 go rob, 3 escape
function heistPlanner(btn) {
  if (!HEIST.stage) {
    const banks = SHOPS.filter((s) => s.kind === 'bank').sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z));
    if (!banks.length) { btn('No bank nearby', 'find a bank first (they show green on the map)', () => {}, false); return; }
    btn(`Case ${banks[0].name}`, `${Math.round(Math.hypot(banks[0].x - player.x, banks[0].z - player.z))} m away · the nearest bank`, () => { HEIST.stage = 1; HEIST.bank = banks[0]; HEIST.crew = {}; phoneApp('heist'); });
    return;
  }
  if (HEIST.stage === 1) {
    for (const [k, c] of Object.entries(CREW)) btn(HEIST.crew[k] ? `✓ ${c.name} hired` : `Hire a ${c.name.toLowerCase()} · $${c.cost}`, `${c.perk} · takes ${c.cut * 100}% of the cash`, () => { if (HEIST.crew[k] || !pay(c.cost, c.name.toLowerCase())) return; HEIST.crew[k] = true; phoneApp('heist'); }, !HEIST.crew[k] && player.money >= c.cost);
    btn('Start the job', `go to ${HEIST.bank.name} and hold up the teller (aim at them)`, () => {
      HEIST.stage = 2; WAYPOINT = { name: HEIST.bank.name, x: HEIST.bank.x, z: HEIST.bank.z }; GPS.t = 0; closePhone();
      if (HEIST.crew.driver) { const P = curbNear(HEIST.bank.x, HEIST.bank.z); if (P) { const c = new Car('sports', '#111111', P.x, P.z, P.h); c.kind = 'abandoned'; c.getaway = true; cars.push(c); HEIST.car = c; } }
      toast('The job is on. Get to the bank and hold up the teller.');
    });
    btn('Call it off', 'crew fees aren’t refunded', () => { HEIST.stage = 0; phoneApp('missions'); });
    return;
  }
  btn(HEIST.stage === 2 ? `Rob ${HEIST.bank.name}` : 'Get to the safehouse and lose the cops', HEIST.stage === 3 ? `take: $${HEIST.take.toLocaleString()}` : 'aim at the teller and hold it', () => {}, false);
}
function heistRobDone(target, cash) { // called by the robbery code; returns the cash to pay out now (the rest comes at the safehouse)
  if (HEIST.stage !== 2 || target !== HEIST.bank) return cash;
  HEIST.take = Math.round(cash * 2.5); HEIST.stage = 3;
  const ang = rand() * TAU, s = sidewalkNear(player.x + Math.cos(ang) * 1500, player.z + Math.sin(ang) * 1500);
  HEIST.safe = { x: s.x, z: s.z }; WAYPOINT = { name: 'Safehouse', x: s.x, z: s.z }; GPS.t = 0;
  toast(`Vault cleaned out: $${HEIST.take.toLocaleString()}! Get to the safehouse and lose the cops.`);
  return 0;
}
function heistNeed(target) { return HEIST.stage === 2 && target === HEIST.bank && HEIST.crew.hacker ? 5 : 10; }
function updateHeist() {
  if (HEIST.stage !== 3) return;
  if (HEIST.crew.muscle && player.stars > 3) player.stars = 3;
  const d = Math.hypot(HEIST.safe.x - player.x, HEIST.safe.z - player.z);
  $('jobhud').hidden = false; $('jobhud').textContent = `Bank job · safehouse ${Math.round(d)} m · ${player.stars ? 'lose the cops first' : 'clear'} · $${HEIST.take.toLocaleString()}`;
  if (d < 25 && player.stars === 0) {
    const cut = Object.keys(HEIST.crew).reduce((a, k) => a + CREW[k].cut, 0), mine = Math.round(HEIST.take * (1 - cut));
    player.money += mine; HEIST.stage = 0; WAYPOINT = null; clearGPS(); $('jobhud').hidden = true; saveGame();
    toast(`Clean getaway! Your share: $${mine.toLocaleString()} (crew took ${Math.round(cut * 100)}%)`); sfxTone([523, 659, 784, 1046], 0.6, 0.07, 'triangle');
  }
}

// ---------------------------------------------------------------- TikTak: original made-up clips (no real people or videos)
const CLIPS = [
  { e: '🐦🍟', t: 'POV: you opened your chips on the beach at Surfers', c: 'the seagulls have called in reinforcements', u: '@chipless_in_surfers' },
  { e: '🚗⏳', t: 'Finding a park at Pacific Fair on a Saturday', c: 'day 3. we are living in the car park now', u: '@lap47' },
  { e: '🌊😱', t: 'Me: "the water looks warm"', c: 'the water in July:', u: '@burleighbrr' },
  { e: '🐙✨', t: 'Rating Gold Coast landmarks', c: 'giant octopus on Cavill: 11/10 no notes', u: '@coastcritic' },
  { e: '🚋💨', t: 'Running for the G:link like', c: 'it was right there. it left. it saw me.', u: '@gtramtears' },
  { e: '🦎☕', t: 'A water dragon stole my seat at the café', c: 'he ordered a flat white, honestly fair', u: '@broady_brunch' },
  { e: '🏄‍♂️🙃', t: 'Day 1 of learning to surf', c: 'the board has learned more than me', u: '@kookdiaries' },
  { e: '🌧️☀️', t: 'Gold Coast weather in 5 minutes', c: 'sunburn and drenched. at the same time.', u: '@sunshinestateofmind' },
  { e: '🛒💸', t: 'Went to Robina Town Centre for "one thing"', c: 'came home with a lamp, a candle and regret', u: '@robina_receipts' },
  { e: '🚓😅', t: 'When the cops lose you because you hid in a car park', c: 'tactical genius (I was scared)', u: '@getaway_gaz' },
  { e: '🦜🍞', t: 'Rainbow lorikeets at 5:45am', c: 'the neighbourhood alarm clock nobody asked for', u: '@miami_mornings' },
  { e: '🎰🙂', t: 'Went to the casino with $50', c: 'I now own one (1) complimentary mint', u: '@starstruck_broke' },
];
function showClip() {
  const body = $('phone-body'), C = CLIPS[PHONE.clip % CLIPS.length];
  const card = document.createElement('div'); card.className = 'clip';
  card.innerHTML = '<div class="clip-e"></div><div class="clip-t"></div><div class="clip-c"></div><div class="clip-u"></div>';
  card.children[0].textContent = C.e; card.children[1].textContent = C.t; card.children[2].textContent = C.c; card.children[3].textContent = `${C.u} · ❤️ ${((PHONE.clip * 7919) % 900 + 100) / 10}k`;
  body.appendChild(card);
  const next = document.createElement('button'); next.type = 'button'; next.className = 'papp'; next.innerHTML = '<b>Next clip ⬆</b><span></span>';
  next.addEventListener('click', () => { PHONE.clip++; phoneApp('clips'); }); body.appendChild(next);
}
