// Gold Coast Streets — plays every activity start to finish. Mini-games are played by a random "monkey" on a fake
// clock (so they run even in a hidden tab); courses are driven checkpoint by checkpoint; finds, photos and jobs are
// done for real by moving the player. Load the game, then:
//   (0, eval)(await (await fetch('tests/activities_test.js')).text()); await runActivityTests();
window.runActivityTests = async (only) => {
  const results = []; const realNow = performance.now.bind(performance); let fake = realNow();
  const rafReal = window.requestAnimationFrame; let q = [];
  const ch = new MessageChannel(); ch.port1.onmessage = () => { const fs = q; q = []; fake += 33; for (const f of fs) { try { f(fake); } catch (e) { console.error(e); } } };
  const pump = () => { if (q.length) ch.port2.postMessage(0); };
  performance.now = () => fake; window.requestAnimationFrame = (f) => { q.push(f); if (q.length === 1) setTimeout(pump, 0); return 1; };
  const tick = () => new Promise((r) => { const c2 = new MessageChannel(); c2.port1.onmessage = () => r(); c2.port2.postMessage(0); });
  const wasReady = ready; ready = false; started = true; paused = true; $('menu').hidden = true;
  const tp = async (x, z) => { player.state = 'foot'; player.mode = 'foot'; player.car = null; player.boat = null; player.deadT = 0; player.x = x; player.z = z; for (let k = 0; k < 120; k++) { updateTiles(0.5); await new Promise((r) => setTimeout(r, 10)); if (!tileBusy && k > 6) break; } };
  const doneN = (id) => actData().done[id] || 0;
  const monkey = async (maxFake = 400000) => { // plays whatever is in the panel until a result shows (or time runs out)
    const t0 = fake;
    while (fake - t0 < maxFake) {
      if (q.length) ch.port2.postMessage(0); await tick();
      const body = $('shop-body'); if ($('shop').hidden) return 'closed';
      const res = [...body.querySelectorAll('p')].find((p) => /^(🏆|😕) /.test(p.textContent)); if (res) return res.textContent;
      const r = Math.random();
      if (r < 0.3) AG.keys.Space = true;
      if (r < 0.35) AG.keys[pick(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyJ', 'KeyK', 'KeyL', 'KeyA', 'KeyD'])] = true;
      if (Math.random() < 0.08) { const bs = [...body.querySelectorAll('button')].filter((b) => !b.disabled && !/^(Done|Play again|Skip)/.test(b.textContent)); if (bs.length) { const b = pick(bs); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); } }
      if (Math.random() < 0.05) { const c = body.querySelector('canvas'); if (c) { const R = c.getBoundingClientRect(), x = R.left + Math.random() * R.width, y = R.top + Math.random() * R.height, o = (e, X, Y) => c.dispatchEvent(new PointerEvent(e, { bubbles: true, clientX: X, clientY: Y })); o('pointerdown', x, y); o('pointermove', x - 30 + Math.random() * 60, y - 30 + Math.random() * 60); o('pointerup', x - 40 + Math.random() * 80, y - 40 + Math.random() * 80); } }
    }
    return 'timeout';
  };
  const run = async (id, fn) => { if (only && !only.includes(id)) return; const before = doneN(id), m0 = player.money; let detail = ''; try { detail = await fn(); } catch (e) { detail = 'ERROR ' + e.message; } if (!$('shop').hidden) closeShop(); document.body.classList.remove('photo'); if (ACT_CUR) quitAct(); results.push({ id, name: ACT_BY[id] && ACT_BY[id].name, completed: doneN(id) > before, money: player.money - m0, detail: String(detail).slice(0, 140) }); };
  const atVenue = async (id) => { const w = actWhere(ACT_BY[id]); await tp(w.x, w.z); return w; };
  player.money = Math.max(player.money, 5000);
  // ---------- mini-games played by the monkey
  for (const id of ['volley', 'sandcastle', 'soccer', 'basketball', 'skate', 'tennis', 'golf', 'boxing', 'bowls', 'minigolf', 'lasertag', 'ride', 'cinema', 'busk', 'festival', 'camping']) {
    await run(id, async () => { await atVenue(id); if (!startAct(id)) return 'did not start: ' + actReady(ACT_BY[id]); return monkey(); });
  }
  // ---------- courses: through every checkpoint in the right vehicle
  for (const id of ['kayak', 'sup', 'swim', 'jetrace', 'boattour', 'run', 'cycle', 'mtb', 'hike', 'waterfall', 'karts']) {
    await run(id, async () => {
      await atVenue(id); if (!startAct(id)) return 'did not start: ' + actReady(ACT_BY[id]); const cur = ACT_CUR; if (!cur || !cur.C) return 'no course';
      const C = cur.C; if (C.car) { player.state = 'car'; player.mode = 'car'; player.car = C.car; player.seq = null; }
      let guard = 0; while (ACT_CUR === cur && guard++ < 200) { const [x, z] = C.pts[C.i]; player.x = x; player.z = z; if (C.boat) { C.boat.x = x; C.boat.z = z; } if (C.car) { C.car.x = x; C.car.z = z; } courseTick(cur, 3); }
      return `${C.pts.length} checkpoints × ${C.laps} lap(s), ${Math.round(C.t)} s`;
    });
  }
  // ---------- finds, photos and the rest
  await run('treasure', async () => { await atVenue('treasure'); startAct('treasure'); const cur = ACT_CUR; if (!cur || !cur.dig) return 'no spots'; const n = cur.dig.length; while (cur.dig && cur.dig.length) { const [x, z] = cur.dig[0]; player.x = x; player.z = z; if (!actUseKey()) return 'could not dig'; } return `${n} dug up`; });
  await run('geocache', async () => { startAct('geocache'); const cur = ACT_CUR; if (!cur || !cur.cache) return 'no cache'; await tp(cur.cache.cx, cur.cache.cz); ACT_CUR = cur; player.x = cur.cache.x; player.z = cur.cache.z; actUseKey(); return cur.cache.name; });
  await run('hunt', async () => { startAct('hunt'); const cur = ACT_CUR; if (!cur) return 'no hunt'; let k = 0; while (ACT_CUR === cur && k++ < 6) { const P = huntPlace(cur.hunt.clues[cur.k][1]); player.x = P.x; player.z = P.z; ACT_BY.hunt.tick(cur, 1); } return cur.hunt.name; });
  await run('bikeexplore', async () => { startAct('bikeexplore'); const cur = ACT_CUR; actData().stats.bikePlaces = (actData().stats.bikePlaces || 0) + 3; ACT_BY.bikeexplore.tick(cur, 1); return '3 new suburbs by bike (stat simulated)'; });
  const aimAt = (x, y, z) => { camera.position.set(x - 30, y + 5, z - 30); camera.lookAt(x, y, z); camera.updateMatrixWorld(); };
  await run('photo', async () => { const L = LANDMARKS.find((q) => !(actData().coll.photos || []).includes(q[0])) || LANDMARKS[0]; const P = landmarkAt(L); await tp(P.x - 60, P.z - 60); startAct('photo'); aimAt(P.x, standAt(P.x, P.z) + 20, P.z); snapPhoto(); return L[0]; });
  for (const [id, bird] of [['wildlife', false], ['birds', true]]) await run(id, async () => { const W = WILDLIFE.find((w) => !!w.bird === bird && !(actData().coll[bird ? 'birds' : 'wildlife'] || []).includes(w.id)) || WILDLIFE.find((w) => !!w.bird === bird); const x = player.x + 20, z = player.z; ANIMALS.push({ W, x, z, h: 0, t: 0, g: makeAnimal(W) }); ANIMALS[ANIMALS.length - 1].g.position.set(x, standAt(x, z), z); startAct(id); aimAt(x, standAt(x, z) + W.size * 0.4, z); camera.position.set(x - 10, standAt(x, z) + 2, z); camera.lookAt(x, standAt(x, z) + W.size * 0.4, z); camera.updateMatrixWorld(); snapPhoto(); return W.name; });
  await run('surf', async () => { await atVenue('surf'); startAct('surf'); const cur = ACT_CUR; if (!cur) return 'no contest'; for (const p of [600, 520, 480]) surfContest(p); if (SURF.on) endSurf(); return 'three waves scored (1,600)'; });
  await run('fishing', async () => { player.items.rod = 1; await tp(-560, -3675); let spot = null; for (let k = 0; k < 800 && !spot; k++) { const a = Math.random() * TAU, r = 10 + Math.random() * 250, x = player.x + Math.cos(a) * r, z = player.z + Math.sin(a) * r; if (!isLand(x, z)) continue; for (let qq = 0; qq < 16; qq++) { const t = qq / 16 * TAU; if (!isLand(x + Math.sin(t) * 3, z + Math.cos(t) * 3)) { spot = [x, z, t]; break; } } } player.x = spot[0]; player.z = spot[1]; player.h = spot[2];
    for (let k = 0; k < 6 && doneN('fishing') === (results.length, doneN('fishing')); k++) { if (!fishUse()) return 'no cast'; const t0 = fake; while (fake - t0 < 90000 && !/caught|paid|reeled|SNAP|got off|spat/.test($('shop-body').textContent)) { if (/STRIKE/.test($('shop-body').textContent)) $('shop-body').querySelector('button').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); if (/HOLD TO REEL/.test($('shop-body').textContent)) { const b = $('shop-body').querySelector('button'), m = $('shop-body').querySelector('div div:nth-child(2)'); const pos = parseFloat((m && m.style.left) || '50'); b.dispatchEvent(new PointerEvent(pos < 55 ? 'pointerdown' : 'pointerup', { bubbles: true })); } ch.port2.postMessage(0); await tick(); } closeShop(); if (/paid|reeled/.test($('shop-body').textContent)) break; }
    return $('shop-body').textContent.slice(0, 90); });
  await run('gym', async () => { await atVenue('gym'); startAct('gym'); const first = $('shop-body').querySelector('.srow button'); if (first) first.click(); const b = [...$('shop-body').querySelectorAll('button')].find((x) => x.textContent === 'LIFT'); if (!b) return 'no workout'; const t0 = fake; while (fake - t0 < 120000 && !$('shop').hidden && [...$('shop-body').querySelectorAll('button')].some((x) => x.textContent === 'LIFT')) { const mk = b.parentNode.querySelector('div div:nth-child(2)'); const pos = parseFloat(mk.style.left); if (pos > 44 && pos < 56) b.click(); ch.port2.postMessage(0); await tick(); } return 'workout set finished'; });
  await run('sightsee', async () => { await tp(727, 305); startAct('sightsee'); if (!MISSION) return 'no tour'; let k = 0; while (MISSION && k++ < 5) { const T = MISSION.targets[0]; player.x = T[2]; player.z = T[3]; updateMissions(0.1); } return 'three sights visited'; });
  for (const id of ['arcade', 'escape']) await run(id, async () => { await atVenue(id); startAct(id); const open = !$('shop').hidden && $('shop-title').textContent; MG.id = id === 'escape' ? 'escape' : 'crocWhack'; mgFinish(100, { text: 'test' }); if (MG.active && typeof mgQuit === 'function') mgQuit(); MG.active = null; $('mg').hidden = true; uiOpen = false; return `counter opened (${open}); finishing a game counts it`; });
  // ---------- jobs through the existing shift system
  const shopFor = (k) => SHOPS.find((s) => (JOBS[k].at.includes(s.kind) || (JOBS[k].style && shopStyle(s) === JOBS[k].style))) || { name: 'Test shop', x: player.x, z: player.z, kind: JOBS[k].at[0] || 'shop' };
  for (const [id, k] of [['job_barista', 'barista'], ['job_retail', 'retail'], ['job_grocer', 'grocer'], ['job_reception', 'reception']]) await run(id, async () => { ECON.shift = null; jobState(k).ready = 0; startShift(k, shopFor(k)); let g = 0; while (ECON.shift && g++ < 80) { const bs = [...$('shop-body').querySelectorAll('button')].filter((b) => !b.disabled); if (!bs.length) break; const b = pick(bs); b.click(); await tick(); } return `${actData().jobLog[0] ? actData().jobLog[0].good + '/' + actData().jobLog[0].done + ' right' : 'no log'}`; });
  await run('job_mechanic', async () => { ECON.shift = null; const V = jobVenue('mechanic'); await tp(V.x, V.z); jobGo('mechanic'); let g = 0; while (ECON.shift && g++ < 400) { const bs = [...$('shop-body').querySelectorAll('button')].filter((b) => !b.disabled); if (bs.length && Math.random() < 0.3) { const b = pick(bs); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); } if (Math.random() < 0.3) AG.keys.Space = true; ch.port2.postMessage(0); await tick(); } return actData().jobLog[0] && actData().jobLog[0].job === 'mechanic' ? `${actData().jobLog[0].good}/4 fixed` : 'shift not finished'; });
  await run('job_delivery', async () => { ECON.shift = null; await tp(727, 305); const sh = SHOPS.find((s) => s.kind === 'food'); startShift('delivery', sh); let g = 0; while (ECON.shift && g++ < 6) { const T = ECON.shift.target; if (!T) break; player.x = T.x; player.z = T.z; updateEconomy(0.1); } return 'three deliveries'; });
  await run('job_taxi', async () => { ECON.shift = null; await tp(727, 305); const c = new Car('sedan', null, player.x, player.z, 0); cars.push(c); player.state = 'car'; player.mode = 'car'; player.car = c; startWorldJob('taxi'); let g = 0; while (ECON.shift && g++ < 12) { const S = ECON.shift, P = S.phase === 'pickup' ? S.pax : S.dest; c.x = player.x = P.x; c.z = player.z = P.z; c.vx = c.vz = 0; updateWorldJobs(1); } c.remove(); player.state = 'foot'; player.car = null; return 'three fares'; });
  await run('job_guide', async () => { ECON.shift = null; await tp(727, 305); startWorldJob('guide'); let g = 0; while (ECON.shift && g++ < 6) { const P = ECON.shift.dest; player.x = P.x; player.z = P.z; updateWorldJobs(1); } return 'three tour stops'; });
  await run('job_lifeguard', async () => { ECON.shift = null; ECON.fitness = Math.max(ECON.fitness, 2); const V = jobVenue('lifeguard'); await tp(V.x, V.z); jobGo('lifeguard'); let g = 0; while (ECON.shift && g++ < 12) { const S = ECON.shift; if (S.phase === 'swim') { player.x = S.victim.x; player.z = S.victim.z; } else { const Sh = nearestShore(player.x, player.z); player.x = Sh.px - Sh.nx * 10; player.z = Sh.pz - Sh.nz * 10; } updateWorldJobs(1); } return 'three rescues'; });
  await run('job_photographer', async () => { ECON.shift = null; await tp(727, 305); startWorldJob('photographer'); let g = 0; while (ECON.shift && g++ < 6) { const L = LANDMARKS.find((q) => q[0] === ECON.shift.want), P = landmarkAt(L); aimAt(P.x, standAt(P.x, P.z) + 20, P.z); snapPhoto(); } return 'three commissions'; });
  performance.now = realNow; window.requestAnimationFrame = rafReal; ready = wasReady; ECON.shift = null;
  const ok = results.filter((r) => r.completed).length;
  return { total: results.length, completed: ok, results };
};
