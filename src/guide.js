// Gold Coast Streets — help for new players. The phone's "What to do?" app lists everything there is to do, each in one
// line with a button that takes you there (and "Surprise me" picks one for you). The first time you play, a short
// tutorial walks you through moving, looking, jumping, cars, the map and the phone; skip a step (Enter) or the whole
// thing (K) whenever you like, and replay it from "What to do?".

// ---------------------------------------------------------------- phone → What to do?
function nearestOfKind(kinds) { let best = null, bd = 1e9; for (const e of (REGION && REGION.search) || []) if (kinds.includes(e[1])) { const d = Math.hypot(e[2] - player.x, e[3] - player.z); if (d < bd) { bd = d; best = { name: e[0], x: e[2], z: e[3] }; } } return best; }
function placeNamed(re) { const e = REGION && REGION.search && REGION.search.find((q) => re.test(q[0])); return e ? { name: e[0], x: e[2], z: e[3] } : null; }
const goTo = (P, none) => () => { if (P) directions(P.name, P.x, P.z); else toast(none || 'Nothing like that nearby'); };
function nearestTower() { const T = bigBuildingsNear(player.x, player.z, 1500).filter((B) => ['hotel', 'apartments', 'offices'].includes(B.kind) && B.b[0] >= 40).sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - player.x, (a.z0 + a.z1) / 2 - player.z) - Math.hypot((b.x0 + b.x1) / 2 - player.x, (b.z0 + b.z1) / 2 - player.z))[0]; return T ? { name: T.name || 'Tall tower', x: (T.x0 + T.x1) / 2, z: (T.z0 + T.z1) / 2 } : null; }
function guideList() { // [icon, name, how, action]
  const heli = nearest(CHOPPERS.filter((c) => !c.dead)), A = (n) => () => phoneApp(n);
  return [
    ['📋', 'Contracts', 'Paid jobs from Tash, one after another, forever. The best way to make money.', A('contracts')],
    ['🪂', 'Base jumping', 'Go into any tall tower (E at its doors), take the lift to Roof, Space at the edge, Space again for your parachute.', goTo(nearestTower(), 'No tall towers near here — try Surfers Paradise')],
    ['🚁', 'Skydive from a helicopter', 'Fly a helicopter up high (Space), then press E to jump out and parachute down.', heli ? goTo({ name: heli.name || 'Helicopter', x: heli.x, z: heli.z }) : goTo(placeNamed(/^Sea World$/i))],
    ['✈️', 'Fly a plane', 'Planes are parked at Gold Coast Airport. Hold Space for power, then S to lift off. F jumps out in the air.', goTo(AIRPORT && AIRPORT.rw ? { name: 'Gold Coast Airport', x: AIRPORT.rw.x1, z: AIRPORT.rw.z1 } : null)],
    ['🎯', 'Activities', `${ACTS.length} things to do around the coast: sports, courses, rides, photography and more.`, A('acts')],
    ['💼', 'Jobs', 'Work real shifts: barista, taxi driver, lifeguard, mechanic and more. Paid per task.', A('jobs')],
    ['🏅', 'Daily missions', 'New challenges every day and week, with bonus cash.', A('missions')],
    ['😎', 'Rocco’s story', 'A pawn-shop boss in Nerang texts you six jobs, ending with a casino job.', A('rocco')],
    ['🧢', 'Mick’s story (Brisbane)', 'Six jobs in Brisbane. Catch the train up from any Gold Coast station.', A('mick')],
    ['🏦', 'Bank heist', 'Pick a bank, hire a crew, rob the vault and get to the safehouse.', A('heist')],
    ['🏁', 'Street race', 'Get in a car, then phone → Street race. Beat the clock to the finish.', () => { closePhone(); startRace(); }],
    ['⏱', 'Time trials', 'Set routes against the clock, with records to beat.', A('trials')],
    ['🏄', 'Surfing', 'On any beach press E to hire a board, paddle out with W and catch a wave.', goTo(nearestOfKind([3]))],
    ['🎣', 'Fishing', 'Buy a rod at a servo, face the water and press E to cast.', goTo(nearestOfKind([9]))],
    ['🚤', 'Boats and jet skis', 'They’re tied up along the canals and beaches. Walk up and press E.', goTo(nearestOfKind([3]))],
    ['🎰', 'Casino', 'Blackjack, poker and slots at The Star (game money only).', goTo(placeNamed(/^The Star/i))],
    ['🛹', 'Stunts', 'Ramps at The Spit stunt park and on the beaches. Hit them fast!', goTo(placeNamed(/^The Spit/i))],
    ['🏡', 'Buy a house', 'Houses and apartments for sale near you. Rent comes in while you play.', () => { PROP.listings = findListings(); phoneApp('realty'); }],
    ['☕', 'Run a business', 'Buy a café or car yard, hire staff and collect the takings.', A('business')],
    ['🐶', 'Get a dog', 'Adopt one at any pet shop. It follows you and plays fetch.', A('pet')],
    ['🚆', 'Go to Brisbane', 'Catch the train to Roma Street, then ride a CityCat up the river.', A('transit')],
    ['🌐', 'Play with friends', 'Join a public world or make a private one with a code.', A('online')],
    ['🗺️', 'Explore', 'Open the map (M), click anywhere and follow the yellow line. Every street is real.', () => { closePhone(); toggleMap(); }],
  ];
}
function guideApp(btn, head) {
  btn('🎲 Surprise me', 'pick something for me to do right now', () => { const L = guideList().slice(1), g = pick(L); toast(`${g[0]} ${g[1]}: ${g[2]}`); g[3](); }).classList.add('go');
  head('Everything you can do');
  for (const [icon, name, how, fn] of guideList()) btn(`${icon} ${name}`, how, fn);
  head('Help');
  btn('🎓 Replay the tutorial', 'the quick walk-through from your first game', () => { closePhone(); tutStart(); });
}

// ---------------------------------------------------------------- the first-game tutorial
const TUT = { on: false, i: 0, t: 0, seen: {}, base: null, el: null };
const TUT_FRESH = (() => { try { return !localStorage.getItem('gcs-tutorial') && !localStorage.getItem('gcs-save'); } catch (e) { return false; } })(); // read before anything saves
const TUT_STEPS = [
  { key: 'Welcome to Gold Coast Streets! Walk around with W A S D.', touch: 'Welcome to Gold Coast Streets! Push the left thumbstick to walk.', done: (B) => Math.hypot(player.x - B.x, player.z - B.z) > 8 },
  { key: 'Move the mouse to look around. Hold Shift while walking to sprint.', touch: 'Drag on the right of the screen to look around. Push the stick all the way to sprint.', done: (B) => Math.abs(angDiff(camYaw, B.yaw)) > 1.2 },
  { key: 'Press Space to jump. Space at a fence climbs over it.', touch: 'Tap the jump button.', done: () => player.vy > 1 || player.vault },
  { key: 'Walk up to a car and press E to get in. (Taking someone else’s car can get the cops after you!)', touch: 'Walk up to a car and tap the use button to get in.', done: () => player.state === 'car' },
  { key: 'W drives, S brakes, A and D steer, Space is the handbrake. Stop and press E to get out.', touch: 'Use the stick to drive. Stop, then tap use to get out.', done: (B, S) => (S.drove = S.drove || player.state === 'car') && player.state === 'foot' },
  { key: 'Press M for the map. Click anywhere to set a destination, then follow the yellow line.', touch: 'Tap the map button. Tap anywhere to set a destination.', done: () => TUT.seen.map },
  { key: 'Press P for your phone. Tap “What to do?” to see everything you can do.', touch: 'Tap the phone button. Tap “What to do?” to see everything you can do.', done: () => TUT.seen.guide },
  { key: 'Last one: open Contracts on the phone. Tash always has a paid job for you. Have fun!', touch: 'Last one: open Contracts on the phone. Tash always has a paid job for you. Have fun!', done: () => TUT.seen.contracts },
];
function tutSeen(what) { if (!TUT.on) return; TUT.seen[what] = true; if (TUT_STEPS[TUT.i].done(TUT.base, TUT.state)) tutNext(); } // straight away, even with the phone or map open
function tutMaybeStart() { if (TUT_FRESH) tutStart(); }
function tutStart() { TUT.on = true; TUT.i = 0; TUT.seen = {}; tutStep(); }
function tutStep() {
  TUT.base = { x: player.x, z: player.z, yaw: camYaw }; TUT.state = {}; TUT.t = 0;
  let el = TUT.el;
  if (!el) {
    el = TUT.el = document.createElement('div'); el.id = 'tut';
    el.style.cssText = 'position:fixed;left:50%;top:96px;transform:translateX(-50%);width:min(560px,calc(100vw - 32px));z-index:35;background:rgba(8,14,18,.92);border:2px solid var(--gold);border-radius:14px;padding:10px 14px 12px;color:#fff;font:500 17px var(--hud);box-shadow:0 6px 24px rgba(0,0,0,.5)';
    el.innerHTML = '<div style="font:700 13px var(--hud);color:var(--gold);letter-spacing:.08em;text-transform:uppercase"></div><div style="margin:4px 0 9px;line-height:1.25"></div><div style="display:flex;gap:8px;flex-wrap:wrap"></div>';
    const mk = (label, fn, primary) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = `font:700 15px var(--hud);padding:6px 12px;border-radius:9px;border:2px solid rgba(246,196,69,.6);cursor:pointer;${primary ? 'background:var(--gold);color:#111' : 'background:#0d1418;color:#fff'}`; b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); el.children[2].appendChild(b); return b; };
    TUT.next = mk('Next step', tutNext, true); mk('Skip tutorial', () => tutEnd(true));
    document.body.appendChild(el);
  }
  const S = TUT_STEPS[TUT.i], touch = TOUCH.on;
  el.hidden = false;
  el.children[0].textContent = `Tutorial · ${TUT.i + 1} of ${TUT_STEPS.length}`;
  el.children[1].textContent = touch ? S.touch : S.key;
  TUT.next.textContent = touch ? 'Skip step' : 'Skip step (Enter)';
  el.children[2].lastChild.textContent = touch ? 'Skip tutorial' : 'Skip tutorial (K)';
}
function tutNext() { if (!TUT.on) return; TUT.i++; if (TUT.i >= TUT_STEPS.length) return tutEnd(false); sfxTone([660, 880], 0.12, 0.04); tutStep(); }
function tutEnd(skipped) {
  TUT.on = false; if (TUT.el) TUT.el.hidden = true;
  try { localStorage.setItem('gcs-tutorial', 'done'); } catch (e) { /* storage blocked */ }
  toast(skipped ? 'Tutorial skipped — phone (P) → What to do? any time' : 'Tutorial done! Phone (P) → What to do? for ideas');
}
function tutKey(code) { if (!TUT.on) return false; if (code === 'Enter') { tutNext(); return true; } if (code === 'KeyK') { tutEnd(true); return true; } return false; }
function updateTutorial(dt) {
  if (!TUT.on) return; TUT.t += dt;
  if (TUT.t > 0.6 && TUT_STEPS[TUT.i].done(TUT.base, TUT.state)) tutNext();
}
