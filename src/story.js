// ============================================================================
// Gold Coast Streets — the story. Rocco (made up) runs a pawn shop in Nerang and a lot more out the back. He texts
// you jobs one at a time on the phone (the Rocco app): a package run, a car to lift, a servo hold-up, a night boat
// pickup on the Broadwater, driving his inside man, and then the big one: the cash cage at The Star.
// Fail one and you can take it again. Finish them all and he'll still put work your way.
// ============================================================================
const STORY = { done: 0, M: null };
const ROCCO = 'Rocco';
function storyShop(kinds, minD, maxD, keeper) {
  const list = SHOPS.filter((sh) => kinds.includes(sh.kind) && (!keeper || sh.walkIn) && Math.hypot(sh.x - player.x, sh.z - player.z) > minD && Math.hypot(sh.x - player.x, sh.z - player.z) < maxD && elapsed - sh.robbedAt > 300);
  return list.length ? pick(list) : null;
}
// open water near you: no land within 20 m of the spot
function openWater(x, z, minD, maxD, tries = 400) {
  for (let k = 0; k < tries; k++) {
    const a = rand() * TAU, r = minD + rand() * (maxD - minD), px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (isLand(px, pz)) continue;
    let clear = true; for (let q = 0; q < 8 && clear; q++) { const t = q / 8 * TAU; if (isLand(px + Math.cos(t) * 20, pz + Math.sin(t) * 20)) clear = false; }
    if (clear) return { x: px, z: pz };
  }
  return null;
}
// water right beside a bank: where the boat waits
function dockNear(x, z, maxD) {
  for (let k = 0; k < 500; k++) {
    const a = rand() * TAU, r = 30 + rand() * maxD, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (isLand(px, pz)) continue;
    for (let q = 0; q < 8; q++) { const t = q / 8 * TAU; if (isLand(px + Math.cos(t) * 6, pz + Math.sin(t) * 6) && !isLand(px - Math.cos(t) * 25, pz - Math.sin(t) * 25)) return { x: px, z: pz, shore: t }; }
  }
  return null;
}
const goal = (name, x, z) => { WAYPOINT = { name, x, z }; GPS.t = 0; };
const near = (P, r) => Math.hypot(P.x - player.x, P.z - player.z) < r;
function theStar() {
  const e = REGION && REGION.search && (REGION.search.find((q) => /^the star gold coast/i.test(q[0])) || REGION.search.find((q) => /^the star\b/i.test(q[0])));
  const at = e ? { x: e[2], z: e[3] } : MAP.landmarks['The Star Gold Coast'] ? { x: MAP.landmarks['The Star Gold Coast'][0], z: MAP.landmarks['The Star Gold Coast'][1] } : null;
  const cas = SHOPS.filter((sh) => sh.kind === 'casino'); if (!cas.length) return at ? { name: 'The Star', x: at.x, z: at.z, sh: null } : null;
  const sh = at ? cas.reduce((a, b) => (Math.hypot(a.x - at.x, a.z - at.z) < Math.hypot(b.x - at.x, b.z - at.z) ? a : b)) : cas[0];
  return { name: sh.name, x: sh.x, z: sh.z, sh };
}
// ---------------------------------------------------------------- the jobs
const CHAPTERS = [
  {
    title: 'The Package', pay: 1500,
    intro: ['G’day. Word is you’re handy and you don’t ask questions. I’m Rocco.', 'There’s a package behind the counter at a servo. Grab it, take it where I tell you. Don’t open it.', 'You’ve got four minutes once you’ve got it.'],
    start(M) {
      M.a = storyShop(['fuel', 'convenience'], 300, 1500); M.b = storyShop(['bar', 'food', 'cafe'], 1000, 2600);
      if (!M.a || !M.b) return 'Not enough shops round here. Try somewhere busier.';
      goal('Pick up: ' + M.a.name, M.a.x, M.a.z);
    },
    step(M, dt) {
      if (M.phase === 0) { M.hud = `Pick up the package at ${M.a.name} · ${km(M.a.x, M.a.z)}`; if (near(M.a, 10)) { M.phase = 1; M.t = 240; goal('Drop: ' + M.b.name, M.b.x, M.b.z); toast(`Got it. Take it to ${M.b.name} — 4 minutes.`); } }
      else { M.t -= dt; M.hud = `Deliver to ${M.b.name} · ${km(M.b.x, M.b.z)} · ${Math.ceil(M.t)}s`; if (M.t <= 0) return 'fail:Too slow. The buyer walked.'; if (near(M.b, 12)) return 'win'; }
    },
  },
  {
    title: 'Wheels', pay: 3000,
    intro: ['That went sweet. Next: a client wants a yellow sports car. There’s one parked up near you.', 'Lift it and bring it to my mate’s lock-up. No cops on your tail when you pull in, and don’t scratch it.'],
    start(M) {
      const a = rand() * TAU, s = curbNear(player.x + Math.cos(a) * 900, player.z + Math.sin(a) * 900);
      const b = rand() * TAU, lock = sidewalkNear(player.x + Math.cos(b) * 1800, player.z + Math.sin(b) * 1800);
      if (!s || !lock) return 'Can’t find a spot for it. Try again somewhere with more streets.';
      M.spot = s; M.lock = { x: lock.x, z: lock.z }; goal('The yellow sports car', s.x, s.z);
    },
    step(M) {
      if (!M.car && near(M.spot, 300)) { const c = new Car('sports', '#f2c230', M.spot.x, M.spot.z, M.spot.h); c.kind = 'parked'; c.story = true; cars.push(c); M.car = c; }
      if (M.car && (M.car.dead || !cars.includes(M.car))) return 'fail:The car’s wrecked. Rocco is not happy.';
      if (M.phase === 0) { M.hud = `Find the yellow sports car · ${km(M.spot.x, M.spot.z)}`; if (M.car && player.car === M.car) { M.phase = 1; goal('The lock-up', M.lock.x, M.lock.z); toast('Nice. Now get it to the lock-up — lose any cops first.'); } }
      else {
        M.hud = `Bring it to the lock-up · ${km(M.lock.x, M.lock.z)} · car ${Math.round(M.car.health)}%${player.stars ? ' · lose the cops' : ''}`;
        if (near(M.lock, 20) && player.car === M.car) { if (player.stars) { if (!M.warned) { toast('Not with the cops on you!'); M.warned = true; } } else { M.car.story = false; return 'win'; } }
      }
    },
  },
  {
    title: 'Smash and Grab', pay: 2500,
    intro: ['You’ve got a feel for this. Here’s a test of nerve.', 'Hold up the servo I send you — point a gun at whoever’s behind the counter and keep it there — then lose the cops.', 'No gun? The blokes in the back lanes sell them.'],
    start(M) { M.a = storyShop(['fuel', 'convenience'], 300, 2000, true); if (!M.a) return 'No servo nearby. Head somewhere busier.'; goal('Hold up: ' + M.a.name, M.a.x, M.a.z); },
    step(M) {
      if (M.phase === 0) M.hud = `Hold up ${M.a.name} · ${km(M.a.x, M.a.z)}${player.weapon === 'fist' ? ' · you need a gun' : ''}`;
      else { M.hud = player.stars ? `Lose the cops (${player.stars}★)` : 'Clear'; if (!player.stars) return 'win'; }
    },
    robbed(M, sh) { if (M.phase === 0 && sh === M.a) { M.phase = 1; WAYPOINT = null; clearGPS(); toast('Now lose the cops.'); } },
  },
  {
    title: 'Night Boat', pay: 4000,
    intro: ['Something’s coming in by water. There’s a speedboat tied up for you.', 'Take it out, meet my contact on the water, then bring the boat back to where you found it.'],
    start(M) {
      M.dock = dockNear(player.x, player.z, 2500); if (!M.dock) return 'No water nearby — head for the Broadwater or a canal and call me back.';
      M.meet = openWater(M.dock.x, M.dock.z, 450, 1100); if (!M.meet) return 'Not enough open water there. Try the Broadwater.';
      goal('The speedboat', M.dock.x, M.dock.z);
    },
    step(M) {
      if (!M.boat && near(M.dock, 250)) { M.boat = new Boat('speedboat', M.dock.x, M.dock.z, Math.atan2(-Math.cos(M.dock.shore), -Math.sin(M.dock.shore))); M.boat.story = true; }
      if (M.phase === 0) { M.hud = `Get to the speedboat · ${km(M.dock.x, M.dock.z)}`; if (M.boat && player.boat === M.boat) { M.phase = 1; goal('Meet the contact', M.meet.x, M.meet.z); toast('Out to the contact — follow the marker.'); } }
      else if (M.phase === 1) { M.hud = `Meet the contact on the water · ${km(M.meet.x, M.meet.z)}`; if (near(M.meet, 30)) { M.phase = 2; goal('Back to the dock', M.dock.x, M.dock.z); toast('Bags on board. Back to the dock.'); sfxTone([523, 659], 0.2, 0.05); } }
      else { M.hud = `Bring the boat back · ${km(M.dock.x, M.dock.z)}`; if (near(M.dock, 30) && player.state === 'boat') { M.hud += ' · E to hop off'; } if (near(M.dock, 30) && player.state === 'foot') return 'win'; }
    },
    end(M) { if (M.boat) { M.boat.story = false; if (!M.boat.driven) M.boat.remove(); } },
  },
  {
    title: 'The Inside Man', pay: 3500,
    intro: ['Big one’s coming. I’ve got someone on the inside at The Star — Lena, a croupier.', 'Pick her up from a café and get her to work. Carefully. If that car gets banged up she walks.'],
    start(M) { M.a = storyShop(['cafe'], 300, 1800); M.star = theStar(); if (!M.a || !M.star) return 'Can’t set it up from here. Try nearer Surfers or Broadbeach.'; goal('Pick up Lena: ' + M.a.name, M.a.x, M.a.z); },
    step(M) {
      if (M.phase === 0) { M.hud = `Pick up Lena at ${M.a.name} · ${km(M.a.x, M.a.z)}${player.state !== 'car' ? ' · you need a car' : ''}`; if (near(M.a, 25) && player.state === 'car') { M.phase = 1; M.car = player.car; M.hp0 = M.car.health; goal(M.star.name, M.star.x, M.star.z); toast('Lena: “Hi. Please don’t crash.”'); } }
      else {
        const dmg = M.hp0 - (M.car ? M.car.health : 0); M.hud = `Drive Lena to ${M.star.name} · ${km(M.star.x, M.star.z)} · damage ${Math.round(dmg)}/30`;
        if (player.car !== M.car) return 'fail:You left Lena in the car. She’s gone.';
        if (dmg > 30) return 'fail:Lena: “I’m getting out.” The car took too much damage.';
        if (near(M.star, 60)) return 'win';
      }
    },
  },
  {
    title: 'The Star Job', pay: 60000,
    intro: ['This is it. Lena’s left the cage door unlocked tonight.', 'Walk into The Star, put a gun on the cashier at the cage and keep it there. Then get to the safehouse and lose every cop on the coast.', 'Do this and we’re all set for life. Don’t muck it up.'],
    start(M) {
      M.star = theStar(); if (!M.star) return 'Can’t find The Star from here.';
      const home = ECON.props.length ? ECON.props.reduce((a, b) => (Math.hypot(a.x - M.star.x, a.z - M.star.z) > Math.hypot(b.x - M.star.x, b.z - M.star.z) ? a : b)) : null;
      const ang = rand() * TAU, s = sidewalkNear(M.star.x + Math.cos(ang) * 2200, M.star.z + Math.sin(ang) * 2200);
      M.safe = home && Math.hypot(home.x - M.star.x, home.z - M.star.z) > 800 ? { x: home.x, z: home.z, name: home.name } : { x: s.x, z: s.z, name: 'the lock-up' };
      goal(M.star.name, M.star.x, M.star.z);
    },
    step(M) {
      if (M.phase === 0) M.hud = `Hold up the cash cage at ${M.star.name} · ${km(M.star.x, M.star.z)}${player.weapon === 'fist' ? ' · bring a gun' : ''}`;
      else {
        M.hud = `Get to ${M.safe.name} · ${km(M.safe.x, M.safe.z)} · ${player.stars ? `lose the cops (${player.stars}★)` : 'clear'}`;
        if (near(M.safe, 30) && !player.stars) return 'win';
      }
    },
    robbed(M, sh) { if (M.phase === 0 && sh.kind === 'casino') { M.phase = 1; player.stars = 5; goal(M.safe.name, M.safe.x, M.safe.z); toast(`The cage is empty! Every cop on the coast is coming — get to ${M.safe.name}.`); return true; } },
  },
];
// ---------------------------------------------------------------- running a job
function startChapter(i) {
  if (STORY.M || MISSION || HEIST.stage) { toast('Finish what you’re doing first'); return; }
  const C = CHAPTERS[i], M = { i, phase: 0, t: 0, hud: '' };
  const err = C.start(M); if (err) { toast(`${ROCCO}: “${err}”`); return; }
  STORY.M = M; closePhone(); toast(`${ROCCO}: “${C.intro[C.intro.length - 1]}”`); sfxTone([392, 523], 0.25, 0.05);
}
function endChapter(won, msg) {
  const M = STORY.M; if (!M) return; const C = CHAPTERS[M.i]; STORY.M = null;
  if (C.end) C.end(M);
  WAYPOINT = null; clearGPS(); $('jobhud').hidden = true;
  if (won) {
    const first = M.i >= STORY.done, pay = first ? C.pay : Math.round(C.pay / 2);
    if (first) STORY.done = M.i + 1;
    player.money += pay; saveGame(); sfxTone([523, 659, 784, 1046], 0.6, 0.07, 'triangle');
    toast(M.i === CHAPTERS.length - 1 && first ? `${ROCCO}: “Legend. That’s the lot.” · +$${pay.toLocaleString()} · story complete!` : `${C.title} done · +$${pay.toLocaleString()}${first && M.i + 1 < CHAPTERS.length ? ' · Rocco will text you the next job' : ''}`);
  } else toast(msg || `${C.title} failed`);
}
function storyRobDone(sh, cash) { // the robbery code asks: does this hold-up belong to the job? (the casino cage pays at the safehouse)
  const M = STORY.M; if (!M || !CHAPTERS[M.i].robbed) return cash;
  return CHAPTERS[M.i].robbed(M, sh) ? 0 : cash;
}
function updateStory(dt) {
  const M = STORY.M; if (!M) return;
  if (player.deadT > 0) { endChapter(false, player.endKind === 'busted' ? 'Busted. Rocco says don’t mention his name.' : 'Wasted. The job’s off.'); return; }
  const r = CHAPTERS[M.i].step(M, dt);
  $('jobhud').hidden = false; $('jobhud').textContent = `${CHAPTERS[M.i].title} · ${M.hud}`;
  if (r === 'win') endChapter(true); else if (r && r.startsWith('fail:')) endChapter(false, r.slice(5));
}
// the Rocco app: his texts, and the next job
function roccoApp(btn, head) {
  const n = STORY.done, thread = document.createElement('div'); thread.className = 'pthread';
  const say = (t, me) => { const b = document.createElement('div'); b.className = 'pmsg' + (me ? ' me' : ''); b.textContent = t; thread.appendChild(b); };
  if (STORY.M) { say(`${CHAPTERS[STORY.M.i].title}: ${STORY.M.hud}`); $('phone-body').appendChild(thread); btn('Give up this job', 'you can take it again later', () => { endChapter(false, 'Job abandoned.'); phoneApp('rocco'); }); return; }
  if (n < CHAPTERS.length) {
    for (const line of CHAPTERS[n].intro) say(line);
    $('phone-body').appendChild(thread);
    btn(`▶ ${CHAPTERS[n].title}`, `job ${n + 1} of ${CHAPTERS.length} · pays $${CHAPTERS[n].pay.toLocaleString()}`, () => startChapter(n)).classList.add('go');
  } else { say('You did good, mate. Want more work? Same jobs, half the pay — you know the drill.'); $('phone-body').appendChild(thread); }
  if (n) { head('Done (half pay to do again)'); for (let i = 0; i < Math.min(n, CHAPTERS.length); i++) btn(`↻ ${CHAPTERS[i].title}`, `$${Math.round(CHAPTERS[i].pay / 2).toLocaleString()}`, () => startChapter(i)); }
}
function storySave() { return STORY.done; }
function storyLoad(n) { if (typeof n === 'number') STORY.done = clamp(n, 0, CHAPTERS.length); }
