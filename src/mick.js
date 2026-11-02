// ============================================================================
// Gold Coast Streets — the Brisbane story. Mick (made up) runs a car-wrap shop in Fortitude Valley and moves stolen
// goods on the side. He texts you six jobs (the Mick app): get up to Brisbane, a bag of hot phones, a car from the
// airport, a crate up the river, a van of knock-off gear from the port, and the big one: a Queen Street Mall job
// with the getaway over the Story Bridge. One job at a time, like Rocco's; fail one and you can take it again.
// ============================================================================
const MICK = { done: 0, M: null };
const MICK_PLACES = { // [name, x, z] in game metres (snapped onto real streets when the job starts)
  valley: ['Fortitude Valley, Brunswick Street', -38185, -59953], mall: ['Queen Street Mall', -39159, -58571], westend: ['West End', -40741, -57329],
  airport: ['Brisbane Airport', -30077, -68036], port: ['Port of Brisbane', -24917, -67395], logan: ['Logan Central', -30913, -39867],
  newfarm: ['New Farm', -36809, -58767], kpoint: ['Kangaroo Point', -38087, -57775],
};
const inBrisbane = () => Math.hypot(player.x - MICK_PLACES.mall[1], player.z - MICK_PLACES.mall[2]) < 16000;
const mickSpot = (k, jitter = 0) => { const [name, x, z] = MICK_PLACES[k], a = rand() * TAU, s = sidewalkNear(x + Math.cos(a) * jitter, z + Math.sin(a) * jitter); return s ? { name, x: s.x, z: s.z } : { name, x, z }; };
const MICK_JOBS = [
  {
    title: 'Welcome to the Big Smoke', pay: 1000,
    intro: ['Rocco says you’re the real deal. I’m Mick — I wrap cars in the Valley. Among other things.', 'Get yourself up to Brisbane. Drive the M1 or jump on the train, your call.', 'Come and see me on Brunswick Street.'],
    start(M) { M.a = mickSpot('valley'); goal('Mick’s shop, ' + M.a.name, M.a.x, M.a.z); },
    step(M) { M.hud = `Meet Mick in Fortitude Valley · ${km(M.a.x, M.a.z)}`; if (near(M.a, 35)) return 'win'; },
  },
  {
    title: 'Hot Phones', pay: 3000,
    intro: ['First job. A bloke at a corner store in the city is holding a bag of phones that “fell off a truck”.', 'Grab it and get it to my buyer in West End. Five minutes, and somebody always talks — watch for the cops.'],
    start(M) {
      if (!inBrisbane()) return 'Get yourself up to Brisbane first.';
      M.a = storyShop(['convenience', 'fuel', 'shop'], 150, 2500) || mickSpot('mall'); M.b = mickSpot('westend', 300);
      goal('Pick up: ' + M.a.name, M.a.x, M.a.z);
    },
    step(M, dt) {
      if (M.phase === 0) { M.hud = `Pick up the phones at ${M.a.name} · ${km(M.a.x, M.a.z)}`; if (near(M.a, 12)) { M.phase = 1; M.t = 300; goal('Drop: ' + M.b.name, M.b.x, M.b.z); toast('Got the bag. West End — five minutes.'); } }
      else {
        M.t -= dt; if (!M.tipped && M.t < 210) { M.tipped = true; player.stars = Math.max(player.stars, 2); toast('Somebody talked — the cops are onto you!'); }
        M.hud = `Get the phones to West End · ${km(M.b.x, M.b.z)} · ${Math.ceil(M.t)}s${player.stars ? ` · ${player.stars}★` : ''}`;
        if (M.t <= 0) return 'fail:Too slow. The buyer’s gone quiet.'; if (near(M.b, 15)) { if (player.stars > 2) { if (!M.warned) { toast('Not with that many cops on you — lose a few first'); M.warned = true; } } else return 'win'; }
      }
    },
  },
  {
    title: 'Airport Run', pay: 4000,
    intro: ['A customer wants a black luxury car. People leave them at the airport for a fortnight.', 'There’s one in the car park out there. Bring it to my lock-up in the Valley — no cops, no dents.'],
    start(M) {
      if (!inBrisbane()) return 'Get yourself up to Brisbane first.';
      const s = curbNear(MICK_PLACES.airport[1], MICK_PLACES.airport[2]); M.spot = s || { x: MICK_PLACES.airport[1], z: MICK_PLACES.airport[2], h: 0 }; M.lock = mickSpot('valley', 150);
      goal('The black car at the airport', M.spot.x, M.spot.z);
    },
    step(M) {
      if (!M.car && near(M.spot, 300)) { const c = new Car('sedan', '#111214', M.spot.x, M.spot.z, M.spot.h || 0); c.kind = 'parked'; c.story = true; cars.push(c); M.car = c; }
      if (M.car && (M.car.dead || !cars.includes(M.car))) return 'fail:The car’s wrecked. Mick won’t be paying for that.';
      if (M.phase === 0) { M.hud = `Find the black car at the airport · ${km(M.spot.x, M.spot.z)}`; if (M.car && player.car === M.car) { M.phase = 1; M.hp0 = M.car.health; goal('Mick’s lock-up', M.lock.x, M.lock.z); toast('Nice. Back to the Valley — keep it clean.'); } }
      else {
        const dmg = M.hp0 - M.car.health; M.hud = `Bring it to the lock-up · ${km(M.lock.x, M.lock.z)} · damage ${Math.round(dmg)}/25${player.stars ? ' · lose the cops' : ''}`;
        if (dmg > 25) return 'fail:Too many dents. The customer doesn’t want it now.';
        if (near(M.lock, 20) && player.car === M.car) { if (player.stars) { if (!M.warned) { toast('Not with the cops on you!'); M.warned = true; } } else { M.car.story = false; return 'win'; } }
      }
    },
  },
  {
    title: 'River Drop', pay: 4500,
    intro: ['There’s a crate on a boat moored up the river. My speedboat’s waiting at the water near you.', 'Get out there, grab the crate and bring the boat back. You’ve got four minutes once you’ve got it — the water police patrol at night.'],
    start(M) {
      if (!inBrisbane()) return 'Get yourself up to Brisbane first.';
      M.dock = dockNear(player.x, player.z, 2000); if (!M.dock) return 'Get near the river and text me again.';
      M.meet = openWater(M.dock.x, M.dock.z, 500, 1600, 600) || dockNear(MICK_PLACES.newfarm[1], MICK_PLACES.newfarm[2], 600); if (!M.meet) return 'Not enough river there. Try nearer the city.';
      goal('The speedboat', M.dock.x, M.dock.z);
    },
    step(M, dt) {
      if (!M.boat && near(M.dock, 250)) { M.boat = new Boat('speedboat', M.dock.x, M.dock.z, Math.atan2(-Math.cos(M.dock.shore), -Math.sin(M.dock.shore))); M.boat.story = true; }
      if (M.phase === 0) { M.hud = `Get to the speedboat · ${km(M.dock.x, M.dock.z)}`; if (M.boat && player.boat === M.boat) { M.phase = 1; goal('The crate', M.meet.x, M.meet.z); toast('Up the river to the crate.'); } }
      else if (M.phase === 1) { M.hud = `Get the crate · ${km(M.meet.x, M.meet.z)}`; if (near(M.meet, 30)) { M.phase = 2; M.t = 240; goal('Back to the dock', M.dock.x, M.dock.z); toast('Crate’s on board. Back to the dock — four minutes.'); sfxTone([523, 659], 0.2, 0.05); } }
      else { M.t -= dt; M.hud = `Bring the boat back · ${km(M.dock.x, M.dock.z)} · ${Math.ceil(M.t)}s`; if (M.t <= 0) return 'fail:The water police got there first.'; if (near(M.dock, 30) && player.state === 'foot') return 'win'; if (near(M.dock, 30) && player.state === 'boat') M.hud += ' · E to hop off'; }
    },
    end(M) { if (M.boat) { M.boat.story = false; if (!M.boat.driven) M.boat.remove(); } },
  },
  {
    title: 'Knock-off King', pay: 6000,
    intro: ['A container of “designer” gear just came off a ship. None of it’s real.', 'There’s a van at the Port of Brisbane. Drive it down to my mate in Logan. It’s slow and the cops will be on you the second you’re out the gate.', 'Keep the van in one piece — it’s worth more than you are.'],
    start(M) {
      if (!inBrisbane()) return 'Get yourself up to Brisbane first.';
      const s = curbNear(MICK_PLACES.port[1], MICK_PLACES.port[2]); M.spot = s || { x: MICK_PLACES.port[1], z: MICK_PLACES.port[2], h: 0 }; M.drop = mickSpot('logan', 250);
      goal('The van at the port', M.spot.x, M.spot.z);
    },
    step(M) {
      if (!M.car && near(M.spot, 300)) { const c = new Car(CAR_TYPES.van ? 'van' : 'ute', '#e9e9e4', M.spot.x, M.spot.z, M.spot.h || 0); c.kind = 'parked'; c.story = true; cars.push(c); M.car = c; }
      if (M.car && (M.car.dead || !cars.includes(M.car))) return 'fail:The van’s a wreck and the gear’s all over the road.';
      if (M.phase === 0) { M.hud = `Find the van at the Port of Brisbane · ${km(M.spot.x, M.spot.z)}`; if (M.car && player.car === M.car) { M.phase = 1; M.hp0 = M.car.health; player.stars = Math.max(player.stars, 3); goal('Logan', M.drop.x, M.drop.z); toast('The cops saw you leave the port — get to Logan!'); } }
      else {
        const dmg = M.hp0 - M.car.health; M.hud = `Drive the van to Logan · ${km(M.drop.x, M.drop.z)} · damage ${Math.round(dmg)}/40${player.stars ? ` · ${player.stars}★` : ''}`;
        if (dmg > 40) return 'fail:The van’s too smashed up. The gear’s ruined.';
        if (player.car !== M.car && player.state === 'car') return 'fail:You ditched the van.';
        if (near(M.drop, 25) && player.car === M.car) { if (player.stars) { if (!M.warned) { toast('Lose the cops before you pull in!'); M.warned = true; } } else { M.car.story = false; return 'win'; } }
      }
    },
  },
  {
    title: 'Story Bridge Getaway', pay: 50000,
    intro: ['This is the big one. A shop in the Queen Street Mall keeps the week’s takings out the back on Friday.', 'Walk in, put a gun on whoever’s behind the counter and keep it there. Then get across the Story Bridge — every cop in Brisbane will be on it — and lose them.', 'Get to my place in Kangaroo Point and we’re set.'],
    start(M) {
      if (!inBrisbane()) return 'Get yourself up to Brisbane first.';
      const mall = MICK_PLACES.mall, list = SHOPS.filter((sh) => sh.keeper && sh.walkIn && Math.hypot(sh.x - mall[1], sh.z - mall[2]) < 500);
      M.a = list.length ? list.reduce((a, b) => (Math.hypot(a.x - mall[1], a.z - mall[2]) < Math.hypot(b.x - mall[1], b.z - mall[2]) ? a : b)) : storyShop(['clothes', 'shop', 'convenience'], 0, 3000, true);
      if (!M.a) return 'Get yourself into the city — near the Queen Street Mall — and text me.';
      M.safe = mickSpot('kpoint', 200); goal('Hold up: ' + M.a.name, M.a.x, M.a.z);
    },
    step(M) {
      if (M.phase === 0) { M.hud = `Hold up ${M.a.name} · ${km(M.a.x, M.a.z)}${player.weapon === 'fist' ? ' · bring a gun' : ''}`; return; }
      const B = typeof SBRIDGE !== 'undefined' && SBRIDGE.at ? SBRIDGE.at(SBRIDGE.L / 2) : null;
      if (M.phase === 1) { M.hud = `Get across the Story Bridge${B ? ' · ' + km(B.x, B.z) : ''} · ${player.stars}★`; if (!B || near(B, 60)) { M.phase = 2; goal('Mick’s place, ' + M.safe.name, M.safe.x, M.safe.z); toast('Over the bridge! Now lose them and get to Kangaroo Point.'); } }
      else { M.hud = `Get to ${M.safe.name} · ${km(M.safe.x, M.safe.z)} · ${player.stars ? `lose the cops (${player.stars}★)` : 'clear'}`; if (near(M.safe, 30) && !player.stars) return 'win'; }
    },
    robbed(M, sh) {
      if (M.phase !== 0 || sh !== M.a) return false;
      M.phase = 1; player.stars = 4; const B = typeof SBRIDGE !== 'undefined' && SBRIDGE.at ? SBRIDGE.at(SBRIDGE.L / 2) : null;
      if (B) goal('The Story Bridge', B.x, B.z); else goal('Mick’s place, ' + M.safe.name, M.safe.x, M.safe.z);
      toast('Got the takings! Every cop in Brisbane is coming — get over the Story Bridge!'); return true;
    },
  },
];
function startMickJob(i) {
  if (STORY.M || MICK.M || MISSION || HEIST.stage) { toast('Finish what you’re doing first'); return; }
  const C = MICK_JOBS[i], M = { i, phase: 0, t: 0, hud: '' };
  const err = C.start(M); if (err) { toast(`Mick: “${err}”`); return; }
  MICK.M = M; closePhone(); toast(`Mick: “${C.intro[C.intro.length - 1]}”`); sfxTone([392, 587], 0.25, 0.05);
}
function endMickJob(won, msg) {
  const M = MICK.M; if (!M) return; const C = MICK_JOBS[M.i]; MICK.M = null;
  if (C.end) C.end(M);
  WAYPOINT = null; clearGPS(); $('jobhud').hidden = true;
  if (won) {
    const first = M.i >= MICK.done, pay = first ? C.pay : Math.round(C.pay / 2);
    if (first) MICK.done = M.i + 1;
    player.money += pay; stat('mickjobs'); saveGame(); sfxTone([523, 659, 784, 1046], 0.6, 0.07, 'triangle');
    toast(M.i === MICK_JOBS.length - 1 && first ? `Mick: “Brisbane’s yours, mate.” · +$${pay.toLocaleString()} · Brisbane story complete!` : `${C.title} done · +$${pay.toLocaleString()}${first && M.i + 1 < MICK_JOBS.length ? ' · Mick will text you the next one' : ''}`);
  } else toast(msg || `${C.title} failed`);
}
function mickRobDone(sh, cash) { const M = MICK.M; if (!M || !MICK_JOBS[M.i].robbed) return cash; return MICK_JOBS[M.i].robbed(M, sh) ? 0 : cash; }
function updateMick(dt) {
  const M = MICK.M; if (!M) return;
  if (player.deadT > 0) { endMickJob(false, player.endKind === 'busted' ? 'Busted. Mick’s never heard of you.' : 'Wasted. The job’s off.'); return; }
  const r = MICK_JOBS[M.i].step(M, dt);
  $('jobhud').hidden = false; $('jobhud').textContent = `${MICK_JOBS[M.i].title} · ${M.hud}`;
  if (r === 'win') endMickJob(true); else if (r && r.startsWith('fail:')) endMickJob(false, r.slice(5));
}
function mickApp(btn, head) {
  const n = MICK.done, thread = document.createElement('div'); thread.className = 'pthread';
  const say = (t, me) => { const b = document.createElement('div'); b.className = 'pmsg' + (me ? ' me' : ''); b.textContent = t; thread.appendChild(b); };
  if (MICK.M) { say(`${MICK_JOBS[MICK.M.i].title}: ${MICK.M.hud}`); $('phone-body').appendChild(thread); btn('Give up this job', 'you can take it again later', () => { endMickJob(false, 'Job abandoned.'); phoneApp('mick'); }); return; }
  if (n < MICK_JOBS.length) {
    for (const line of MICK_JOBS[n].intro) say(line);
    $('phone-body').appendChild(thread);
    btn(`▶ ${MICK_JOBS[n].title}`, `job ${n + 1} of ${MICK_JOBS.length} · pays $${MICK_JOBS[n].pay.toLocaleString()}${n && !inBrisbane() ? ' · you need to be in Brisbane' : ''}`, () => startMickJob(n)).classList.add('go');
  } else { say('Good work, mate. Same jobs, half the pay, whenever you want.'); $('phone-body').appendChild(thread); }
  if (n) { head('Done (half pay to do again)'); for (let i = 0; i < Math.min(n, MICK_JOBS.length); i++) btn(`↻ ${MICK_JOBS[i].title}`, `$${Math.round(MICK_JOBS[i].pay / 2).toLocaleString()}`, () => startMickJob(i)); }
}
