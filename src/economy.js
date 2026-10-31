// Gold Coast Streets — the city economy: jobs with real tasks, car dealerships and owned cars, a bank account,
// hotel rooms as a home, and gym training. Everything uses the one player balance and the one save.

const ECON = { bank: 0, garage: [], props: [], gear: {}, aim: 0, rangeBest: 0, jobs: {}, home: null, fitness: 0, gymDay: -1, shift: null, called: null, testDrive: null, lastBuy: 0 };
// one purchase at a time: a second click within a quarter second is ignored (no double charges)
function purchaseGuard(key) { const t = performance.now(); if (t - ECON.lastBuy < 250 && ECON.lastKey === key) return false; ECON.lastBuy = t; ECON.lastKey = key; return true; } // the same thing twice within 250 ms is a double click
function pay(amount, what) { if (player.money < amount) { toast(`Not enough money for ${what} ($${amount})`); return false; } player.money -= amount; return true; }

// the shared panel (the shop window): title, a line of help, and rows of [label, button, enabled, action]
function econPanel(title, sub, rows) {
  uiOpen = true; if (document.pointerLockElement) document.exitPointerLock();
  $('shop').hidden = false; $('shop-title').textContent = title; $('shop-sub').textContent = sub; $('shop-money').textContent = '$' + player.money.toLocaleString();
  const body = $('shop-body'); body.innerHTML = '';
  for (const [label, btn, ok, fn] of rows) {
    const row = document.createElement('div'); row.className = 'srow';
    const l = document.createElement('span'); l.textContent = label; row.appendChild(l);
    if (btn) { const b = document.createElement('button'); b.type = 'button'; b.textContent = btn; b.disabled = !ok; b.addEventListener('click', () => { if (purchaseGuard(title + label)) fn(); }); row.appendChild(b); }
    body.appendChild(row);
  }
}

// ---------------------------------------------------------------- car dealerships: buy, test drive, call your car
const CAR_PRICES = { tuner: 38000, widebody: 52000, dragster: 85000, ebike: 2200, hatch: 7500, sedan: 9800, motorbike: 12500, ute: 14500, suv: 16900, coupe: 24000, muscle: 31000, sports: 45000 };
const CAR_LABEL = { tuner: 'Street tuner', widebody: 'Widebody street machine', dragster: 'Pro-street dragster', ebike: 'E-bike', hatch: 'City hatchback', sedan: 'Family sedan', motorbike: 'Sports motorbike', ute: 'Tradie ute', suv: 'Seven-seat SUV', coupe: 'Drift coupe', muscle: 'V8 muscle car', sports: 'Sports car' };
function dealerStock(sh) { // each dealership carries its own range
  const n = sh.name.toLowerCase(), all = Object.keys(CAR_PRICES);
  if (/yamaha|kawasaki|ducati|harley|triumph|ktm|motorcycle|motorbike|moto\b|bikes?\b|scooter/.test(n)) return ['motorbike', 'ebike'];
  if (/bmw|mercedes|audi|lexus|porsche|jaguar|tesla|prestige/.test(n)) return ['sedan', 'suv', 'coupe', 'sports', 'motorbike', 'dragster'];
  if (/ford|holden|ram|chev/.test(n)) return ['ute', 'muscle', 'suv', 'sedan', 'widebody'];
  if (/toyota|mazda|hyundai|kia|nissan|honda|mitsubishi|subaru|suzuki|volkswagen|mg|isuzu/.test(n)) return /honda|suzuki/.test(n) ? ['hatch', 'sedan', 'motorbike', 'ebike'] : ['hatch', 'sedan', 'suv', 'ute', 'tuner'];
  let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return all.filter((t, i) => (h >> i) & 1 && !CAR_TYPES[t].livery).slice(0, 3).concat(['hatch', ['tuner', 'widebody', 'dragster'][h % 3]]); // and one street machine
}
function openDealer(sh) {
  const rows = dealerStock(sh).map((t) => {
    const sp = CAR_TYPES[t], owned = ECON.garage.some((g) => g.type === t);
    return [`${CAR_LABEL[t]} — top speed ${Math.round(sp.max * 3.6)} km/h, ${sp.drive.toUpperCase()}${owned ? ' (you own one)' : ''}`, '$' + CAR_PRICES[t].toLocaleString(), player.money >= CAR_PRICES[t], () => buyCar(sh, t)];
  });
  rows.push(['Take one for a 2-minute test drive', 'Test drive', !ECON.testDrive, () => testDrive(sh)]);
  econPanel(sh.name, `Car dealership · you have $${player.money.toLocaleString()} · cars you buy are yours to call from your bag (B)`, rows);
}
function curbNear(x, z) { // a clear spot on the nearest road
  const ne = nearestEdge(x, z); if (ne.e < 0 || !EDGES[ne.e]) return null;
  const E = EDGES[ne.e]; edgePoint(E, 1, clamp(ne.s, 2, E.len - 2), tmpA);
  const off = -(E.width / 2 - 1.2); return { x: tmpA.x + tmpA.tz * off, z: tmpA.z - tmpA.tx * off, h: Math.atan2(tmpA.tx, tmpA.tz) };
}
function buyCar(sh, type) {
  const price = CAR_PRICES[type]; if (!pay(price, CAR_LABEL[type])) return;
  const color = pick(CAR_COLORS); ECON.garage.push({ type, color, bought: Date.now() }); saveGame();
  closeShop(); callCar(ECON.garage.length - 1); toast(`You bought a ${CAR_LABEL[type]}! It's parked out the front.`); sfxTone([523, 659, 784], 0.25, 0.06, 'triangle');
}
function callCar(i) {
  const g = ECON.garage[i]; if (!g) return;
  const P = curbNear(player.x, player.z); if (!P) { toast('No road nearby to bring it to'); return; }
  if (ECON.called && ECON.called !== player.car && cars.includes(ECON.called)) ECON.called.remove();
  const c = new Car(g.type, g.color, P.x, P.z, P.h); c.kind = 'abandoned'; c.owned = true; cars.push(c); ECON.called = c;
  WAYPOINT = { name: 'Your ' + CAR_LABEL[g.type], x: P.x, z: P.z };
}
function testDrive(sh) {
  const t = dealerStock(sh)[0], P = curbNear(player.x, player.z); if (!P) { toast('No road nearby'); return; }
  const c = new Car(t, '#e8e8e8', P.x, P.z, P.h); c.kind = 'abandoned'; cars.push(c); ECON.testDrive = { car: c, t: 120 };
  closeShop(); toast(`Test drive: the ${CAR_LABEL[t]} is out the front — 2 minutes`); WAYPOINT = { name: 'Test drive', x: P.x, z: P.z };
}

// a new paint colour on a car (respray): rebuild its model in the new colour, keeping everything else
function repaintCar(c, color) {
  const old = c.model; c.model = makeCarModel(c.type, color); scene.add(c.model.root);
  if (c.driver) setDriverLook(c.model, c.look || null); scene.remove(old.root); disposeCarModel(old); c.sync(0);
  const g = c.owned && ECON.garage.find((q) => q.type === c.type); if (g) { g.color = color; saveGame(); }
}

// ---------------------------------------------------------------- the bank: a savings account (game money only)
function openBank(sh) {
  const m = player.money, b = ECON.bank;
  econPanel(sh.name, `Wallet $${m.toLocaleString()} · savings $${b.toLocaleString()} · savings are safe when you get wasted or busted`, [
    ['Deposit $100', 'Deposit', m >= 100, () => { player.money -= 100; ECON.bank += 100; saveGame(); openBank(sh); }],
    ['Deposit everything in your wallet', 'Deposit all', m > 0, () => { ECON.bank += player.money; player.money = 0; saveGame(); openBank(sh); }],
    ['Withdraw $100', 'Withdraw', b >= 100, () => { ECON.bank -= 100; player.money += 100; saveGame(); openBank(sh); }],
    ['Withdraw all savings', 'Withdraw all', b > 0, () => { player.money += ECON.bank; ECON.bank = 0; saveGame(); openBank(sh); }],
  ]);
}

// ---------------------------------------------------------------- the gym: a day pass and a timing workout that slowly builds fitness
function openGym(sh) {
  const day = Math.floor(Date.now() / 600000); // one session counts per 10 real minutes
  econPanel(sh.name, `Gym · fitness ${ECON.fitness}/10 (each level: +1.5% sprint speed, longer energy boosts)`, [
    ['Day pass and a workout (hit the green zone 5 times)', '$15', player.money >= 15, () => { if (!pay(15, 'a day pass')) return; startWorkout(sh, day); }],
    ['Protein shake', '$8', player.money >= 8, () => { if (!pay(8, 'a shake')) return; player.health = Math.min(100, player.health + 20); player.effects.energy = Math.max(player.effects.energy, 30); toast('Protein shake: +20 health, energy boost'); openGym(sh); }],
  ]);
}
function startWorkout(sh, day) {
  let hits = 0, misses = 0, pos = 0, dir = 1, raf = 0;
  const body = $('shop-body'); body.innerHTML = '';
  $('shop-sub').textContent = 'Click LIFT when the marker is in the green. 5 good reps finish the set.';
  const bar = document.createElement('div'); bar.style.cssText = 'position:relative;height:28px;background:#2b3238;border-radius:6px;margin:10px 0;overflow:hidden';
  const zone = document.createElement('div'); zone.style.cssText = 'position:absolute;left:42%;width:16%;top:0;bottom:0;background:#33d17a'; bar.appendChild(zone);
  const mark = document.createElement('div'); mark.style.cssText = 'position:absolute;width:6px;top:0;bottom:0;background:#fff'; bar.appendChild(mark);
  const info = document.createElement('p'); const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = 'LIFT';
  body.append(bar, info, btn);
  const tick = () => { if ($('shop').hidden) return; pos += dir * (1.1 + hits * 0.25); if (pos > 100 || pos < 0) dir = -dir; mark.style.left = clamp(pos, 0, 100) + '%'; info.textContent = `Reps ${hits}/5 · misses ${misses}/3`; raf = requestAnimationFrame(tick); };
  btn.addEventListener('click', () => {
    if (pos > 42 && pos < 58) hits++; else misses++;
    if (hits >= 5 || misses >= 3) {
      cancelAnimationFrame(raf);
      const gain = hits >= 5 && ECON.gymDay !== day && ECON.fitness < 10;
      if (gain) { ECON.fitness++; ECON.gymDay = day; }
      if (hits >= 5) actHook('gym');
      saveGame(); toast(hits >= 5 ? (gain ? `Set done! Fitness ${ECON.fitness}/10` : 'Set done (fitness already trained this session)') : 'Too many missed reps — try again');
      openGym(sh);
    }
  });
  tick();
}
function fitnessSpeed() { return 1 + ECON.fitness * 0.015; }

// ---------------------------------------------------------------- hotels: a room for the night sets your home (where you respawn)
function bookRoom(sh) {
  if (!pay(80, 'a room')) return false;
  player.health = 100; gameHour = 8; ECON.home = { x: player.x, z: player.z, name: sh.name }; playerSpot = { x: player.x, z: player.z }; saveGame();
  toast(`You slept at ${sh.name}. It's your home now — you'll respawn here.`); return true;
}

// ---------------------------------------------------------------- jobs: short shifts with real tasks, paid per task, with a cooldown
const JOBS = {
  barista: { name: 'Barista', at: ['cafe'], pay: 16, desc: 'Make each order: tap the right items, then Serve. 5 orders a shift.' },
  stocker: { name: 'Shelf stacker', at: ['convenience', 'shop'], pay: 6, desc: 'Put each delivery item in the right aisle. 8 items a shift.' },
  delivery: { name: 'Delivery driver', at: ['food'], pay: 22, desc: 'Take 3 orders to the addresses on your map before time runs out (walk or drive).', where: 'any takeaway' },
  retail: { name: 'Retail assistant', at: ['clothes'], pay: 14, desc: 'Work the checkout: give 5 customers the right change.', where: 'clothes shops' },
  grocer: { name: 'Supermarket worker', at: [], style: 'supermarket', pay: 10, desc: 'Restock shelves and point customers to the right aisle. 8 tasks a shift.', where: 'supermarkets' },
  reception: { name: 'Hotel receptionist', at: ['hotel'], pay: 15, desc: 'Check 5 guests in to the right rooms.', where: 'hotels' },
  mechanic: { name: 'Mechanic', at: [], venue: /Automotive Services|Smash Repairs|Tyre and Brake/i, pay: 30, desc: 'Diagnose 4 cars and fix them (pick the fault, then torque it up).', where: 'Mudgeeraba Automotive Services / West Burleigh Smash Repairs' },
  taxi: { name: 'Taxi driver', at: [], pay: 6, desc: 'Pick up 3 passengers and drive them where they’re going (bring any car). Paid by distance; quick trips get tips.', where: 'anywhere (you need a car)' },
  guide: { name: 'Tour guide', at: [], pay: 35, desc: 'Lead a tour group to 3 landmarks, each against the clock.', where: 'anywhere' },
  lifeguard: { name: 'Lifeguard', at: [], venue: /Lifeguard Centre|Surf Club|Surf Life/i, pay: 45, desc: 'Patrol from the lifeguard centre: swim out to 3 swimmers in trouble and bring them in.', where: 'Surfers Paradise and Broadbeach lifeguard centres', needs: () => (ECON.fitness >= 2 ? null : 'Fitness 2 — train at a gym first') },
  photographer: { name: 'Photographer', at: [], pay: 40, desc: 'Three commissions: photograph the landmark each client asks for (phone → Camera).', where: 'anywhere' },
};
function jobFor(sh) { if (shopStyle(sh) === 'supermarket') return 'grocer'; return Object.keys(JOBS).find((k) => JOBS[k].at.includes(sh.kind)); }
function jobState(k) { return ECON.jobs[k] || (ECON.jobs[k] = { shifts: 0, earned: 0, ready: 0 }); }
function jobRate(k) { return Math.round(JOBS[k].pay * (1 + Math.min(4, Math.floor(jobState(k).shifts / 5)) * 0.15)); } // a raise every 5 shifts
function jobRowFor(sh, body) {
  const k = jobFor(sh); if (!k || ECON.shift) return;
  const J = JOBS[k], st = jobState(k), wait = Math.max(0, Math.ceil(st.ready - elapsed));
  const row = document.createElement('div'); row.className = 'srow';
  const l = document.createElement('span'); l.textContent = `Work here: ${J.name} — $${jobRate(k)} per task · shifts done ${st.shifts}${wait ? ` · next shift in ${wait}s` : ''}`;
  const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Start shift'; b.disabled = wait > 0;
  b.addEventListener('click', () => startShift(k, sh)); row.append(l, b); body.appendChild(row);
}
function startShift(k, sh) {
  ECON.shift = { job: k, shop: sh, done: 0, good: 0, earned: 0 }; jobState(k).hired = true;
  if (k === 'delivery') { closeShop(); nextDelivery(); } else nextTask();
}
function endShift(msg) {
  const S = ECON.shift; if (!S) return; const st = jobState(S.job);
  st.shifts++; st.earned += S.earned; st.ready = elapsed + 60; ECON.shift = null; WAYPOINT = null; $('jobhud').hidden = true;
  const A = actData(); A.jobLog.unshift({ job: S.job, earned: S.earned, good: S.good, done: S.done, t: Date.now() }); A.jobLog.length = Math.min(A.jobLog.length, 15); stat('shifts'); stat('earned', S.earned); if (S.done) actHook(JOB_ACT[S.job]); dropPax(); saveGame();
  toast(`${msg} Shift paid $${S.earned}.`);
  if (!$('shop').hidden) closeShop();
}
const ORDER_ITEMS = ['coffee', 'latte', 'longblack', 'icedlatte', 'chai', 'toastie', 'bananabread', 'croissant', 'muffin'];
const AISLES = { Drinks: ['soda', 'energy', 'juice'], Snacks: ['fries', 'muffin', 'cake'], Pantry: ['pie', 'sausageroll', 'bananabread'], Health: ['medkit'] };
function nextTask() {
  const S = ECON.shift, J = JOBS[S.job];
  if (S.job === 'barista') {
    if (S.done >= 5) return endShift(`Shift over: ${S.good}/5 orders right.`);
    const order = []; while (order.length < 2) { const it = pick(ORDER_ITEMS); if (!order.includes(it)) order.push(it); }
    const made = [];
    const render = () => econPanel(`${S.shop.name} — barista`, `Order ${S.done + 1}/5: ${order.map((i) => ITEMS[i].name).join(' + ')}  ·  made: ${made.map((i) => ITEMS[i].name).join(', ') || 'nothing yet'}`,
      ORDER_ITEMS.map((i) => [ITEMS[i].name, made.includes(i) ? 'Added' : 'Add', !made.includes(i), () => { made.push(i); render(); }]).concat([['Hand it over', 'Serve', made.length > 0, () => {
        const ok = made.length === order.length && order.every((i) => made.includes(i));
        S.done++; if (ok) { S.good++; S.earned += jobRate('barista'); player.money += jobRate('barista'); toast(`Perfect order! +$${jobRate('barista')}`); } else toast('Wrong order — no pay for that one');
        nextTask();
      }]]));
    render();
  } else if (S.job === 'stocker') {
    if (S.done >= 8) return endShift(`Shift over: ${S.good}/8 items in the right aisle.`);
    const aisle = pick(Object.keys(AISLES)), item = pick(AISLES[aisle]);
    econPanel(`${S.shop.name} — shelf stacker`, `Item ${S.done + 1}/8: where does "${ITEMS[item].name}" go?`, Object.keys(AISLES).map((a) => [`Aisle: ${a}`, 'Here', true, () => {
      S.done++; if (a === aisle) { S.good++; S.earned += jobRate('stocker'); player.money += jobRate('stocker'); } else toast(`That belongs in ${aisle}`);
      nextTask();
    }]));
  }
  else if (S.job === 'retail') { if (S.done >= 5) return endShift(`Shift over: ${S.good}/5 customers given the right change.`); retailTask(S); }
  else if (S.job === 'reception') { if (S.done >= 5) return endShift(`Shift over: ${S.good}/5 guests in the right rooms.`); receptionTask(S); }
  else if (S.job === 'grocer') { if (S.done >= 8) return endShift(`Shift over: ${S.good}/8 right.`); grocerTask(S); }
  else if (S.job === 'mechanic') { if (S.done >= 4) return endShift(`Shift over: ${S.good}/4 cars fixed.`); mechanicTask(S); }
  void J;
}
function nextDelivery() {
  const S = ECON.shift;
  if (S.done >= 3) return endShift(`Deliveries done: ${S.good}/3 on time.`);
  const cands = (REGION && REGION.search ? REGION.search : []).filter((e) => e[1] === 0 && Math.hypot(e[2] - player.x, e[3] - player.z) > 250 && Math.hypot(e[2] - player.x, e[3] - player.z) < 900);
  const e = cands.length ? pick(cands) : null;
  if (!e) return endShift('No addresses nearby.');
  const d = Math.hypot(e[2] - player.x, e[3] - player.z);
  S.target = { x: e[2], z: e[3], name: e[0], t: Math.round(d / 5 + 45), dist: d };
  WAYPOINT = { name: 'Delivery: ' + e[0], x: e[2], z: e[3] };
  toast(`Delivery ${S.done + 1}/3: ${e[0]} — ${Math.round(d)} m, ${S.target.t}s`);
}

// ---------------------------------------------------------------- every frame: delivery timers, test drives, the job read-out
function updateEconomy(dt) {
  const S = ECON.shift, hud = $('jobhud');
  if (S && S.job === 'delivery' && S.target) {
    S.target.t -= dt;
    const d = Math.hypot(S.target.x - player.x, S.target.z - player.z);
    hud.hidden = false; hud.textContent = `Delivery ${S.done + 1}/3 · ${S.target.name} · ${Math.round(d)} m · ${Math.max(0, Math.ceil(S.target.t))}s`;
    if (d < 18) {
      const onTime = S.target.t > 0, amt = onTime ? jobRate('delivery') + Math.round(S.target.dist / 100) : 8;
      S.done++; if (onTime) S.good++; S.earned += amt; player.money += amt; toast(onTime ? `Delivered on time! +$${amt}` : `Delivered late. +$${amt}`); sfxTone([660, 880], 0.15, 0.05);
      S.target = null; nextDelivery();
    }
  } else if (S) { hud.hidden = false; hud.textContent = `On shift: ${JOBS[S.job].name} · ${S.done} done · $${S.earned} earned`; }
  if (ECON.testDrive) {
    ECON.testDrive.t -= dt;
    if (ECON.testDrive.t <= 0) {
      const c = ECON.testDrive.car; ECON.testDrive = null;
      if (player.car === c) { toast('Test drive over — bring it back next time!'); bailOut(); }
      if (cars.includes(c)) c.remove();
    }
  }
}
function economySave() { return { bank: ECON.bank, garage: ECON.garage, props: ECON.props, gear: ECON.gear, aim: ECON.aim, rangeBest: ECON.rangeBest, story: storySave(), act: ECON.act, jobs: ECON.jobs, home: ECON.home, fitness: ECON.fitness, gymDay: ECON.gymDay }; }
function economyLoad(s) {
  if (!s) return;
  if (typeof s.bank === 'number') ECON.bank = s.bank;
  if (Array.isArray(s.garage)) ECON.garage = s.garage.filter((g) => CAR_PRICES[g.type]);
  if (Array.isArray(s.props)) ECON.props = s.props.filter((P) => P && P.id && typeof P.x === 'number');
  if (s.gear) ECON.gear = s.gear;
  if (typeof s.aim === 'number') ECON.aim = clamp(s.aim, 0, 5);
  if (typeof s.rangeBest === 'number') ECON.rangeBest = s.rangeBest;
  storyLoad(s.story);
  if (s.act && typeof s.act === 'object') ECON.act = s.act;
  if (s.jobs) ECON.jobs = s.jobs;
  if (s.home) ECON.home = s.home;
  if (typeof s.fitness === 'number') ECON.fitness = clamp(s.fitness, 0, 10);
  if (typeof s.gymDay === 'number') ECON.gymDay = s.gymDay;
}
