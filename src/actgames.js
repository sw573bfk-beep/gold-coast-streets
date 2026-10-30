// ============================================================================
// Gold Coast Streets — the activity mini-games. They run in the shop panel (like the gym and the shooting range),
// with mouse, keyboard or touch, and report back through actComplete. A few small building blocks are shared
// (a timing bar, a reaction button, a canvas with a game loop) but each sport plays its own way.
// ============================================================================
function agOpen(title, sub) {
  uiOpen = true; if (document.pointerLockElement) document.exitPointerLock();
  $('shop').hidden = false; $('shop-title').textContent = title; $('shop-sub').textContent = sub || ''; $('shop-money').textContent = '$' + player.money.toLocaleString();
  const b = $('shop-body'); b.innerHTML = ''; AG.gen++; return b;
}
const AG = { gen: 0, keys: {} };
window.addEventListener('keydown', (e) => { if (!$('shop').hidden) AG.keys[e.code] = true; });
window.addEventListener('keyup', (e) => { AG.keys[e.code] = false; });
const agAlive = (gen) => gen === AG.gen && !$('shop').hidden;
const agWait = (ms) => new Promise((r) => setTimeout(r, ms));
function agEl(parent, tag, css, text) { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text !== undefined) e.textContent = text; parent.appendChild(e); return e; }
function agBtn(parent, label, fn, big) { const b = agEl(parent, 'button', `margin:4px;padding:${big ? '14px 18px' : '8px 12px'};font-size:${big ? 19 : 15}px;touch-action:manipulation`, label); b.type = 'button'; b.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); }); return b; }
function agCanvas(parent, w, h) { const c = agEl(parent, 'canvas', 'width:100%;max-width:480px;display:block;margin:6px auto;border-radius:10px;background:#123;touch-action:none'); c.width = w; c.height = h; return c; }
function agLoop(gen, fn) { let last = performance.now(); const step = (now) => { if (!agAlive(gen)) return; const dt = Math.min(0.05, (now - last) / 1000); last = now; if (fn(dt) !== false) requestAnimationFrame(step); }; requestAnimationFrame(step); }
// a marker sweeps a bar; tap in the green. Resolves 1 (dead centre) .. 0 (edge of the green), or -1 for a miss
function agBar(parent, label, speed = 1, width = 0.2) {
  return new Promise((res) => {
    const gen = AG.gen, wrap = agEl(parent, 'div'); agEl(wrap, 'div', 'font:600 15px sans-serif;margin:6px 0', label);
    const bar = agEl(wrap, 'div', 'position:relative;height:30px;background:#2b3238;border-radius:6px;overflow:hidden'), c0 = 0.15 + rand() * (0.7 - width);
    agEl(bar, 'div', `position:absolute;left:${c0 * 100}%;width:${width * 100}%;top:0;bottom:0;background:#33d17a`);
    const mk = agEl(bar, 'div', 'position:absolute;width:6px;top:0;bottom:0;background:#fff');
    let p = 0, dir = 1, done = false;
    const hit = () => { if (done) return; done = true; wrap.remove(); const mid = c0 + width / 2, off = Math.abs(p - mid) / (width / 2); res(off <= 1 ? 1 - off : -1); };
    agBtn(wrap, 'TAP (Space)', hit, true); const key = () => { if (AG.keys.Space) { AG.keys.Space = false; hit(); } };
    agLoop(gen, (dt) => { if (done) return false; key(); p += dir * dt * 0.9 * speed; if (p > 1 || p < 0) { dir = -dir; p = clamp(p, 0, 1); } mk.style.left = p * 100 + '%'; });
  });
}
// a button appears after a pause: hit it inside the window
function agReact(parent, label, win = 0.7) {
  return new Promise((res) => {
    const gen = AG.gen, wrap = agEl(parent, 'div'); agEl(wrap, 'div', 'font:600 15px sans-serif;margin:6px 0', label + ' — wait for it…');
    let t = 0, shown = false, done = false; const delay = 0.6 + rand() * 1.6, b = agBtn(wrap, 'NOW! (Space)', () => fin(shown), true); b.style.visibility = 'hidden';
    const fin = (ok) => { if (done) return; done = true; wrap.remove(); res(ok && t - delay <= win); };
    agLoop(gen, (dt) => { if (done) return false; t += dt; if (AG.keys.Space) { AG.keys.Space = false; fin(shown); } if (!shown && t > delay) { shown = true; b.style.visibility = 'visible'; } if (shown && t > delay + win) fin(false); });
  });
}
function agResult(id, r) { // the end of a game: pay, record, and offer another go
  stat('minigames'); const a = ACT_BY[id];
  if (r.win && a && a.cat === 'sport') stat('sportWins');
  if (r.win || r.complete) actComplete(id, r); else actFail(id, r.msg);
  const body = $('shop-body'); if ($('shop').hidden) return;
  agEl(body, 'p', 'font:700 18px sans-serif;margin:10px 0', (r.win || r.complete ? '🏆 ' : '😕 ') + (r.msg || ''));
  agBtn(body, 'Play again', () => { if (actReady(a) === null) startAct(id); else toast(actReady(a)); }); agBtn(body, 'Done', closeShop);
}
const winMoney = (base, lvlCat) => Math.round(base * (1 + (catLevel(lvlCat) - 1) * 0.1));

// ---------------------------------------------------------------- beach volleyball: move under the ball, hit it back
function playVolleyball(id) {
  const body = agOpen('Beach volleyball', 'A/D (or ◀ ▶) to move, Space or HIT when the ball drops to you. First to 7.'), gen = AG.gen;
  const c = agCanvas(body, 480, 260), g = c.getContext('2d'), info = agEl(body, 'p', 'font:600 16px sans-serif');
  const row = agEl(body, 'div'), L = { l: false, r: false, hit: false };
  for (const [lab, k] of [['◀', 'l'], ['HIT', 'hit'], ['▶', 'r']]) { const b = agBtn(row, lab, () => { L[k] = true; }, true); b.addEventListener('pointerup', () => { if (k !== 'hit') L[k] = false; }); b.addEventListener('pointerleave', () => { if (k !== 'hit') L[k] = false; }); }
  let me = 0, them = 0, px = 120, ball = null, nx = 360, wait = 1;
  const serve = (toMe) => { ball = toMe ? { x: 360, y: 120, vx: -(120 + rand() * 60), vy: -260, mine: true } : { x: px, y: 150, vx: 160 + rand() * 60, vy: -300, mine: false }; };
  serve(true);
  agLoop(gen, (dt) => {
    const k = AG.keys; if (k.KeyA || k.ArrowLeft || L.l) px -= 240 * dt; if (k.KeyD || k.ArrowRight || L.r) px += 240 * dt; px = clamp(px, 20, 225);
    if (wait > 0) { wait -= dt; } else if (ball) {
      ball.vy += 420 * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      if (ball.x < 240 && ball.mine && ball.y > 150 && (k.Space || L.hit)) { // your hit: the closer under it, the better
        const off = Math.abs(ball.x - px); k.Space = false; L.hit = false;
        if (off < 34) { ball.vx = 150 + (34 - off) * 4; ball.vy = -320; ball.mine = false; sfxNoise(0.05, 1800, 0.2); }
      }
      if (ball.x > 240 && !ball.mine) { nx += clamp(ball.x - nx, -200 * dt, 200 * dt); if (ball.y > 150 && Math.abs(ball.x - nx) < 40) { if (rand() > 0.2) /* they miss about one in five */ { ball.vx = -(130 + rand() * 90); ball.vy = -330 + rand() * 40; ball.mine = true; } } }
      if (ball.y > 230) { if (ball.x < 240) them++; else me++; ball = null; wait = 1; if (me >= 7 || them >= 7) { info.textContent = ''; const win = me > them; agResult(id, { win, score: me - them, money: win ? winMoney(60, 'sport') : 0, msg: `${win ? 'You won' : 'You lost'} ${me}–${them}` }); return false; } setTimeout(() => serve(true), 0); }
    }
    g.fillStyle = '#7fc8e8'; g.fillRect(0, 0, 480, 260); g.fillStyle = '#e8d29a'; g.fillRect(0, 230, 480, 30); g.fillStyle = '#fff'; g.fillRect(238, 150, 4, 80); g.fillRect(238, 150, 4, 3);
    g.fillStyle = '#ff6f4f'; g.fillRect(px - 10, 196, 20, 34); g.fillStyle = '#2d6cdf'; g.fillRect(nx - 10, 196, 20, 34);
    if (ball) { g.fillStyle = '#ffd400'; g.beginPath(); g.arc(ball.x, ball.y, 9, 0, TAU); g.fill(); }
    info.textContent = `You ${me} – ${them} them`;
  });
}
// ---------------------------------------------------------------- sandcastle: design, pack, carve, dig a moat before the tide, decorate
async function playSandcastle(id) {
  const body = agOpen('Sandcastle competition', 'Judges score size, detail and finishing touches. The tide is coming in…'); const gen = AG.gen;
  let score = 0; const say = agEl(body, 'p', 'font:600 16px sans-serif');
  say.textContent = 'Pick a design:'; const design = await new Promise((r) => { const row = agEl(body, 'div'); [['🏰 Classic castle', 1], ['🐉 Sand dragon', 1.3], ['🐙 Giant octopus', 1.5]].forEach(([l, m]) => agBtn(row, l, () => { row.remove(); r({ l, m }); })); });
  for (const step of ['Pack the base', 'Shape the walls', 'Carve the towers']) { if (!agAlive(gen)) return; const v = await agBar(body, step, 1.1 * design.m, 0.22); score += v > 0 ? 20 + v * 15 : 2; }
  if (!agAlive(gen)) return;
  say.textContent = 'Dig the moat: tap DIG as fast as you can before the tide (8 s)!'; let dug = 0; const m = agEl(body, 'div', 'height:12px;background:#2b3238;border-radius:6px'); const fill = agEl(m, 'div', 'height:12px;width:0;background:#2a7de2;border-radius:6px');
  const digB = agBtn(body, 'DIG (Space)', () => { dug++; }, true);
  await new Promise((r) => { let t = 0; agLoop(gen, (dt) => { t += dt; if (AG.keys.Space) { AG.keys.Space = false; dug++; } fill.style.width = Math.min(100, dug * 3) + '%'; if (t > 8) { r(); return false; } }); });
  digB.remove(); m.remove(); score += Math.min(30, dug);
  say.textContent = 'Decorate (pick up to 3):'; const picks = new Set();
  await new Promise((r) => { const row = agEl(body, 'div'); ['🐚 Shells', '🚩 Flags', '🌿 Seaweed', '🪨 Pebbles', '🦀 A crab'].forEach((l) => { const b = agBtn(row, l, () => { picks.add(l); b.disabled = true; if (picks.size >= 3) { row.remove(); r(); } }); }); agBtn(row, 'Finished', () => { row.remove(); r(); }); });
  score = Math.round((score + picks.size * 8) * design.m); const place = score > 150 ? 1 : score > 110 ? 2 : score > 70 ? 3 : 0;
  say.textContent = '';
  agResult(id, { complete: true, score, money: [0, 120, 70, 40][place], msg: `${design.l}: ${score} points${place ? ` — ${['', '1st', '2nd', '3rd'][place]} place!` : ' — no ribbon this time'}` });
}
// ---------------------------------------------------------------- soccer: penalties (aim, then power), saving theirs, free kicks over a wall
function playSoccer(id) {
  const body = agOpen('Soccer', 'Pick a game'); const row = agEl(body, 'div');
  agBtn(row, '🥅 Penalty shootout', () => soccerShootout(id, false), true); agBtn(row, '🧱 Free kicks', () => soccerFreeKicks(id), true); agBtn(row, '🏆 Tournament (3 rounds)', () => soccerShootout(id, true), true);
}
function kickAt(body, wall) { // aim sweeps across the goal: tap to lock, then power
  return new Promise((res) => {
    const gen = AG.gen, c = agCanvas(body, 420, 200), g = c.getContext('2d'); let ax = 0, dir = 1, phase = 'aim', pw = 0, pd = 1, done = false;
    const lock = () => { if (phase === 'aim') phase = 'power'; else if (phase === 'power') { phase = 'go'; done = true; } };
    const b = agBtn(body, 'TAP (Space)', lock, true);
    agLoop(gen, (dt) => {
      if (AG.keys.Space) { AG.keys.Space = false; lock(); }
      if (phase === 'aim') { ax += dir * dt * 1.4; if (ax > 1 || ax < -1) dir = -dir; } else if (phase === 'power') { pw += pd * dt * 1.6; if (pw > 1 || pw < 0) pd = -pd; }
      g.fillStyle = '#3f8f3a'; g.fillRect(0, 0, 420, 200); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(60, 30, 300, 120);
      if (wall) { g.fillStyle = '#d9483b'; for (let k = -2; k <= 1; k++) g.fillRect(190 + k * 22, 120, 18, 50); }
      g.fillStyle = '#ffd400'; g.beginPath(); g.arc(210 + ax * 140, 90, 10, 0, TAU); g.fill();
      g.fillStyle = '#222'; g.fillRect(40, 180, 340, 10); g.fillStyle = pw > 0.55 && pw < 0.85 ? '#33d17a' : '#f6c445'; g.fillRect(40, 180, 340 * pw, 10);
      if (done) { c.remove(); b.remove(); res({ ax, pw }); return false; }
    });
  });
}
async function soccerShootout(id, tourney) {
  const body = agOpen('Penalty shootout', 'Lock your aim, then the power (green is best). Then save theirs: guess the side.'), gen = AG.gen;
  const rounds = tourney ? ['Quarter-final', 'Semi-final', 'Final'] : ['Shootout']; let goalsTotal = 0;
  for (const [ri, rname] of rounds.entries()) {
    let me = 0, them = 0; const say = agEl(body, 'p', 'font:700 16px sans-serif', rname);
    for (let k = 0; k < 5; k++) {
      if (!agAlive(gen)) return;
      const s = await kickAt(body, false); const keeper = pick([-1, 0, 1]), side = s.ax < -0.33 ? -1 : s.ax > 0.33 ? 1 : 0;
      const onTarget = Math.abs(s.ax) < 0.95 && s.pw > 0.4 && s.pw < 0.95, goal = onTarget && (side !== keeper || (s.pw > 0.7 && Math.abs(s.ax) > 0.75));
      if (goal) { me++; goalsTotal++; } say.textContent = `${rname} · kick ${k + 1}: ${goal ? 'GOAL!' : onTarget ? 'Saved!' : 'Missed!'} · you ${me} – ${them}`;
      if (!agAlive(gen)) return;
      const dive = await new Promise((r) => { const row = agEl(body, 'div'); agEl(row, 'div', 'font:600 15px sans-serif', 'Their kick — dive:'); [['⬅ Left', -1], ['Stay', 0], ['Right ➡', 1]].forEach(([l, v]) => agBtn(row, l, () => { row.remove(); r(v); }, true)); });
      const shot = pick([-1, 0, 1, -1, 1]), scored = rand() > 0.15 + ri * -0.03 && dive !== shot; if (scored) them++;
      say.textContent = `${rname} · their kick ${k + 1}: ${scored ? 'they scored' : 'SAVED!'} · you ${me} – ${them}`;
    }
    while (me === them && agAlive(gen)) { const s = await kickAt(body, false); if (Math.abs(s.ax) < 0.9 && s.pw > 0.45 && s.pw < 0.9 && rand() < 0.7) me++; if (rand() < 0.6) them++; say.textContent = `Sudden death · you ${me} – ${them}`; }
    if (!agAlive(gen)) return;
    if (me < them) { stat('goals', goalsTotal); return agResult(id, { win: false, msg: `Knocked out in the ${rname.toLowerCase()} (${me}–${them})` }); }
  }
  stat('goals', goalsTotal);
  agResult(id, { win: true, score: goalsTotal, money: winMoney(tourney ? 300 : 70, 'sport'), msg: tourney ? `Tournament champions! ${goalsTotal} goals` : `You won the shootout (${goalsTotal} goals)` });
}
async function soccerFreeKicks(id) {
  const body = agOpen('Free kicks', 'Curl it over the wall: aim wide of the middle, power in the green.'), gen = AG.gen; let goals = 0; const say = agEl(body, 'p', 'font:700 16px sans-serif');
  for (let k = 0; k < 6; k++) { if (!agAlive(gen)) return; const s = await kickAt(body, true); const over = s.pw > 0.55 && s.pw < 0.85, wide = Math.abs(s.ax) > 0.25 && Math.abs(s.ax) < 0.95; const goal = over && wide && rand() > 0.25; if (goal) goals++; say.textContent = `Free kick ${k + 1}/6: ${goal ? 'GOAL!' : !over ? 'Into the wall' : !wide ? 'Straight at the keeper' : 'Saved'} · ${goals} goals`; }
  stat('goals', goals); agResult(id, { win: goals >= 3, score: goals, money: goals >= 3 ? winMoney(goals * 20, 'sport') : 0, msg: `${goals}/6 free kicks scored` });
}
// ---------------------------------------------------------------- basketball: a timed shooting round, or 1 on 1 to 11
function playBasketball(id) { const body = agOpen('Basketball', 'Pick a game'); const row = agEl(body, 'div'); agBtn(row, '⏱ Shooting challenge (45 s)', () => bballShoot(id), true); agBtn(row, '🏀 1 on 1 to 11', () => bball1v1(id), true); }
async function bballShoot(id) {
  const body = agOpen('Shooting challenge', 'As many baskets as you can in 45 seconds. Further out = 3 points.'), gen = AG.gen, t0 = performance.now(); let pts = 0; const say = agEl(body, 'p', 'font:700 16px sans-serif');
  while ((performance.now() - t0) / 1000 < 45 && agAlive(gen)) { const three = rand() < 0.4; const v = await agBar(body, three ? 'Three-pointer!' : 'Jump shot', three ? 1.5 : 1.2, three ? 0.13 : 0.18); if (v >= 0) { pts += three ? 3 : 2; sfxTone([660], 0.05, 0.04); } say.textContent = `${pts} points · ${Math.max(0, Math.ceil(45 - (performance.now() - t0) / 1000))}s left`; }
  if (!agAlive(gen)) return; agResult(id, { win: pts >= 16, score: pts, money: pts >= 16 ? winMoney(pts * 3, 'sport') : 0, msg: `${pts} points${pts >= 16 ? ' — that beats the court record target (16)' : ' — 16 to beat'}` });
}
async function bball1v1(id) {
  const body = agOpen('1 on 1', 'Your ball: time the shot. Their ball: block when they rise.'), gen = AG.gen; let me = 0, them = 0; const say = agEl(body, 'p', 'font:700 16px sans-serif');
  while (me < 11 && them < 11 && agAlive(gen)) {
    const v = await agBar(body, 'Your shot', 1.25, 0.17); if (v >= 0) me += v > 0.7 && rand() < 0.4 ? 3 : 2; if (!agAlive(gen)) return;
    const blocked = await agReact(body, 'They drive to the hoop — BLOCK', 0.55); if (!blocked && rand() < 0.75) them += 2;
    say.textContent = `You ${me} – ${them}`;
  }
  if (!agAlive(gen)) return; const win = me > them; agResult(id, { win, score: me, money: win ? winMoney(90, 'sport') : 0, msg: `${win ? 'You won' : 'You lost'} ${me}–${them}` });
}
// ---------------------------------------------------------------- skateboarding: type the trick combos before you land
const TRICKS = [['Ollie', '↑'], ['Kickflip', '↑←'], ['Heelflip', '↑→'], ['Shove-it', '↓→'], ['Pop shove-it', '↑↓→'], ['Tre flip', '↑←↓'], ['5-0 grind', '→→↓'], ['Boardslide', '←↓←'], ['Varial heelflip', '↑→↓→'], ['Hardflip', '↑↓←↑']];
async function playSkate(id) {
  const body = agOpen('Skatepark session', 'Type each trick’s arrows (keys or buttons) before you land. Chain them for a multiplier. 60 seconds.'), gen = AG.gen;
  const say = agEl(body, 'p', 'font:700 17px sans-serif'), trick = agEl(body, 'p', 'font:700 26px sans-serif;letter-spacing:4px'), row = agEl(body, 'div');
  let pts = 0, chain = 1, input = ''; const press = (a) => { input += a; };
  [['←', 'ArrowLeft'], ['↑', 'ArrowUp'], ['↓', 'ArrowDown'], ['→', 'ArrowRight']].forEach(([a]) => agBtn(row, a, () => press(a), true));
  const t0 = performance.now();
  while ((performance.now() - t0) / 1000 < 60 && agAlive(gen)) {
    const T = TRICKS[Math.min(TRICKS.length - 1, Math.floor(rand() * Math.min(TRICKS.length, 3 + chain * 2)))]; input = '';
    const limit = 1.2 + T[1].length * 0.55; let t = 0;
    const ok = await new Promise((r) => agLoop(gen, (dt) => {
      t += dt; for (const [a, k] of [['←', 'ArrowLeft'], ['↑', 'ArrowUp'], ['↓', 'ArrowDown'], ['→', 'ArrowRight']]) if (AG.keys[k]) { AG.keys[k] = false; press(a); }
      trick.textContent = `${T[0]}: ${T[1]}   ${input}`; trick.style.color = T[1].startsWith(input) ? '#fff' : '#ff6b6b';
      if (input === T[1]) { r(true); return false; } if (!T[1].startsWith(input) || t > limit) { r(false); return false; }
    }));
    if (ok) { pts += T[1].length * 100 * chain; chain = Math.min(5, chain + 1); sfxTone([523 + chain * 60], 0.06, 0.04); } else { chain = 1; sfxNoise(0.15, 500, 0.3); }
    say.textContent = `${pts.toLocaleString()} pts · ×${chain} · ${Math.max(0, Math.ceil(60 - (performance.now() - t0) / 1000))}s`;
  }
  if (!agAlive(gen)) return; agResult(id, { complete: true, win: pts >= 4000, score: pts, money: Math.min(150, Math.round(pts / 60)), msg: `Session score ${pts.toLocaleString()}` });
}
// ---------------------------------------------------------------- tennis: rallies decided by timing; early goes cross-court, late goes down the line
async function playTennis(id) {
  const body = agOpen('Tennis', 'Time each swing. Hit it sweetly and they may not get there. First to 4 games (deuce: win by 2).'), gen = AG.gen; const say = agEl(body, 'p', 'font:700 16px sans-serif');
  let gm = 0, gt = 0;
  while ((gm < 4 && gt < 4) || Math.abs(gm - gt) < 2) {
    let pm = 0, pt = 0;
    while ((pm < 4 && pt < 4) || Math.abs(pm - pt) < 2) {
      if (!agAlive(gen)) return; let rally = 0, won = null;
      while (won === null) { const v = await agBar(body, `Rally shot ${rally + 1}`, 1.1 + rally * 0.12, 0.2 - Math.min(0.08, rally * 0.01)); if (!agAlive(gen)) return; if (v < 0) won = false; else if (rand() < 0.15 + v * 0.35 + rally * 0.03) won = true; rally++; }
      if (won) pm++; else pt++;
      const call = (a, b) => (a >= 3 && b >= 3 ? (a === b ? 'Deuce' : a > b ? 'Advantage you' : 'Advantage them') : `${[0, 15, 30, 40][Math.min(a, 3)]}–${[0, 15, 30, 40][Math.min(b, 3)]}`);
      say.textContent = `Games ${gm}–${gt} · ${call(pm, pt)}`;
    }
    if (pm > pt) gm++; else gt++; say.textContent = `Games ${gm}–${gt}`;
  }
  const win = gm > gt; agResult(id, { win, score: gm, money: win ? winMoney(110, 'sport') : 0, msg: `${win ? 'Set to you' : 'Set to them'}, ${gm}–${gt}` });
}
// ---------------------------------------------------------------- putting physics (golf putting challenge and mini-golf share it)
const MINI_HOLES = [ // ball start, hole, walls [x0,y0,x1,y1]
  { s: [60, 130], h: [400, 130], w: [] }, { s: [60, 200], h: [400, 60], w: [[220, 80, 240, 260]] }, { s: [60, 60], h: [420, 200], w: [[150, 0, 170, 160], [300, 100, 320, 260]] },
  { s: [240, 230], h: [240, 40], w: [[140, 120, 340, 140]] }, { s: [50, 130], h: [430, 130], w: [[200, 0, 220, 110], [200, 150, 220, 260], [320, 60, 340, 200]] }, { s: [80, 220], h: [400, 40], w: [[100, 100, 380, 120], [180, 160, 200, 260]] },
];
function puttHole(body, H, par) { // drag back from the ball and let go (or the power bar on touch)
  return new Promise((res) => {
    const gen = AG.gen, c = agCanvas(body, 480, 260), g = c.getContext('2d'); let b = { x: H.s[0], y: H.s[1], vx: 0, vy: 0 }, strokes = 0, drag = null;
    const pos = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * 480 / r.width, (e.clientY - r.top) * 260 / r.height]; };
    c.addEventListener('pointerdown', (e) => { if (Math.hypot(b.vx, b.vy) < 2) drag = pos(e); });
    c.addEventListener('pointermove', (e) => { if (drag) drag.cur = pos(e); });
    c.addEventListener('pointerup', (e) => { if (!drag) return; const p = pos(e), dx = drag[0] - p[0], dy = drag[1] - p[1]; drag = null; if (!(Math.hypot(dx, dy) >= 4)) return; b.vx = clamp(dx * 3, -500, 500); b.vy = clamp(dy * 3, -500, 500); strokes++; sfxNoise(0.04, 2400, 0.15); });
    agLoop(gen, (dt) => {
      b.x += b.vx * dt; b.y += b.vy * dt; const f = Math.pow(0.35, dt); b.vx *= f; b.vy *= f;
      if (b.x < 8 || b.x > 472) { b.vx = -b.vx; b.x = clamp(b.x, 8, 472); } if (b.y < 8 || b.y > 252) { b.vy = -b.vy; b.y = clamp(b.y, 8, 252); }
      for (const [x0, y0, x1, y1] of H.w) if (b.x > x0 - 7 && b.x < x1 + 7 && b.y > y0 - 7 && b.y < y1 + 7) { const dl = b.x - (x0 - 7), dr = x1 + 7 - b.x, dtp = b.y - (y0 - 7), db = y1 + 7 - b.y, m = Math.min(dl, dr, dtp, db); if (m === dl || m === dr) { b.vx = -b.vx; b.x += m === dl ? -m : m; } else { b.vy = -b.vy; b.y += m === dtp ? -m : m; } }
      let sp = Math.hypot(b.vx, b.vy); if (sp < 6) { b.vx = b.vy = 0; sp = 0; } // it stops rather than creeping forever
      const dh = Math.hypot(b.x - H.h[0], b.y - H.h[1]);
      g.fillStyle = '#2f8f3c'; g.fillRect(0, 0, 480, 260); g.fillStyle = '#7a5a3c'; for (const [x0, y0, x1, y1] of H.w) g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.fillStyle = '#111'; g.beginPath(); g.arc(H.h[0], H.h[1], 10, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(b.x, b.y, 6, 0, TAU); g.fill();
      if (drag && drag.cur) { g.strokeStyle = '#ffd400'; g.lineWidth = 3; g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x + (drag[0] - drag.cur[0]), b.y + (drag[1] - drag.cur[1])); g.stroke(); }
      g.fillStyle = '#fff'; g.font = '600 16px sans-serif'; g.fillText(`Strokes ${strokes}${par ? ' · par ' + par : ''}`, 10, 20);
      if (dh < 10 && sp < 260) { c.remove(); sfxTone([880], 0.1, 0.05); res(strokes); return false; }
      if (strokes >= 6 && sp === 0) { c.remove(); toast('Pick it up — 7 on that hole'); res(7); return false; } // six strokes and you pick up
    });
  });
}
async function playMinigolf(id) {
  const body = agOpen('Mini-golf', 'Drag back from the ball and let go — further back = harder. 6 holes, par 2 each.'), gen = AG.gen; const card = agEl(body, 'p', 'font:700 16px sans-serif'); let total = 0; const scores = [];
  for (const [i, H] of MINI_HOLES.entries()) { if (!agAlive(gen)) return; card.textContent = `Hole ${i + 1}/6 · scorecard: ${scores.join(' ') || '—'} · total ${total}`; const s = await puttHole(body, H, 2); scores.push(s); total += s; }
  if (!agAlive(gen)) return; agResult(id, { complete: true, win: total <= 12, score: total, money: total <= 12 ? 60 : 20, msg: `Round of ${total} (par 12)${total <= 12 ? ' — under or on par!' : ''}` });
}
async function playGolf(id) {
  const body = agOpen('Golf', 'Driving range: set the club angle, then the power, into the wind. Then three putts on the practice green.'), gen = AG.gen; const say = agEl(body, 'p', 'font:700 16px sans-serif'); let pts = 0;
  for (let k = 0; k < 5; k++) {
    if (!agAlive(gen)) return; const target = pick([100, 150, 200]), wind = Math.round(rr(-12, 12));
    say.textContent = `Ball ${k + 1}/5 · flag at ${target} m · wind ${wind > 0 ? '+' : ''}${wind} m`;
    const ang = await agBar(body, 'Club face (square = green)', 1.3, 0.2); if (!agAlive(gen)) return; const pw = await agBar(body, `Power for ${target} m`, 1.4, 0.16);
    const dist = Math.round(target * (pw < 0 ? 0.6 + rand() * 0.6 : 0.92 + pw * 0.08) + wind + (ang < 0 ? rr(-25, 25) : 0)), off = Math.abs(dist - target);
    const p = off < 5 ? 30 : off < 12 ? 20 : off < 25 ? 10 : 0; pts += p; say.textContent = `${dist} m — ${off} m from the flag (+${p})`; await agWait(700);
  }
  for (const H of [MINI_HOLES[0], { s: [80, 200], h: [400, 70], w: [] }, { s: [420, 60], h: [70, 200], w: [] }]) { if (!agAlive(gen)) return; const s = await puttHole(body, H, 1); pts += Math.max(0, 30 - (s - 1) * 12); }
  if (!agAlive(gen)) return; agResult(id, { complete: true, win: pts >= 150, score: pts, money: Math.round(pts / 3), msg: `Practice score ${pts}` });
}
// ---------------------------------------------------------------- boxing: hit the pad that lights up (J / K / L), combos for speed
async function playBoxing(id) {
  const body = agOpen('Boxing fitness', 'Hit the lit pad fast: J jab · K cross · L hook (or tap). 30 seconds.'), gen = AG.gen; const row = agEl(body, 'div', 'display:flex;gap:10px;justify-content:center'), say = agEl(body, 'p', 'font:700 17px sans-serif');
  const pads = ['J', 'K', 'L'].map((k, i) => { const b = agBtn(row, ['Jab (J)', 'Cross (K)', 'Hook (L)'][i], () => hit(i), true); b.style.width = '30%'; b.style.height = '80px'; return b; });
  let lit = -1, litT = 0, pts = 0, combo = 0, t = 0;
  const light = () => { lit = Math.floor(rand() * 3); litT = 0; pads.forEach((p, i) => { p.style.background = i === lit ? '#f6c445' : ''; p.style.color = i === lit ? '#111' : ''; }); };
  const hit = (i) => { if (lit < 0) return; if (i === lit) { combo++; pts += Math.max(10, Math.round(100 - litT * 120)) * Math.min(4, 1 + Math.floor(combo / 5)); sfxNoise(0.05, 900, 0.3); } else { combo = 0; sfxTone([200], 0.05, 0.04); } light(); };
  light(); await new Promise((r) => agLoop(gen, (dt) => { t += dt; litT += dt; for (const [i, k] of [[0, 'KeyJ'], [1, 'KeyK'], [2, 'KeyL']]) if (AG.keys[k]) { AG.keys[k] = false; hit(i); } if (litT > 1.2) { combo = 0; light(); } say.textContent = `${pts} pts · combo ${combo} · ${Math.max(0, Math.ceil(30 - t))}s`; if (t > 30) { r(); return false; } }));
  if (!agAlive(gen)) return; if (ECON.fitness < 10 && pts > 3500 && rand() < 0.3) ECON.fitness++;
  agResult(id, { complete: true, score: pts, money: 0, msg: `${pts} points${pts > 3500 ? ' — a great session' : ''}` });
}
// ---------------------------------------------------------------- lawn bowls: roll your bowls nearest the jack (they curve)
function playBowls(id) {
  const body = agOpen('Lawn bowls', 'Aim (it swings), then power. Bowls curve with their bias. Nearest to the jack scores. 4 ends.'), gen = AG.gen;
  const c = agCanvas(body, 480, 260), g = c.getContext('2d'), say = agEl(body, 'p', 'font:700 16px sans-serif'); const btn = agBtn(body, 'TAP (Space)', () => tap(), true);
  let end = 1, me = 0, them = 0, bowls = [], jack = null, phase = 'aim', aim = 0, ad = 1, pw = 0, pd = 1, turn = 0, rolling = null;
  const newEnd = () => { bowls = []; jack = { x: 330 + rand() * 90, y: 90 + rand() * 80 }; turn = 0; phase = 'aim'; };
  const tap = () => { if (turn % 2) return; if (phase === 'aim') phase = 'power'; else if (phase === 'power') { roll(aim, pw, '#2a2a2a'); } };
  const roll = (a, p, col) => { rolling = { x: 30, y: 130, vx: 140 + p * 260, vy: a * 120, curve: (a > 0 ? -1 : 1) * 40, col }; phase = 'roll'; };
  newEnd();
  agLoop(gen, (dt) => {
    if (AG.keys.Space) { AG.keys.Space = false; tap(); }
    if (phase === 'aim') { aim += ad * dt * 1.2; if (aim > 1 || aim < -1) ad = -ad; } else if (phase === 'power') { pw += pd * dt * 1.3; if (pw > 1 || pw < 0) pd = -pd; }
    if (rolling) { const R = rolling; R.x += R.vx * dt; R.y += R.vy * dt; R.vy += R.curve * dt; const f = Math.pow(0.55, dt); R.vx *= f; R.vy *= f; if (R.vx < 6 || R.x > 470 || R.y < 5 || R.y > 255) { if (R.x < 470 && R.y > 5 && R.y < 255) bowls.push({ x: R.x, y: R.y, col: R.col }); rolling = null; turn++; phase = turn % 2 ? 'cpu' : 'aim';
      if (turn >= 4) { const d = (b) => Math.hypot(b.x - jack.x, b.y - jack.y), s = bowls.slice().sort((a, b) => d(a) - d(b)); if (s.length) { const w = s[0].col; let n = 0; for (const b of s) { if (b.col !== w) break; n++; } if (w === '#2a2a2a') me += n; else them += n; } end++; if (end > 4) { const win = me > them; agResult(id, { win, score: me, money: win ? winMoney(70, 'sport') : 0, msg: `${win ? 'You won' : me === them ? 'Drawn' : 'You lost'} ${me}–${them} after 4 ends` }); btn.remove(); return false; } setTimeout(newEnd, 600); }
      else if (turn % 2) setTimeout(() => { const ideal = (jack.y - 130) / 120; roll(clamp(ideal + rr(-0.35, 0.35), -1, 1), clamp(0.55 + (jack.x - 330) / 400 + rr(-0.15, 0.15), 0, 1), '#c43a2a'); }, 700); } }
    g.fillStyle = '#3e8f3e'; g.fillRect(0, 0, 480, 260); g.fillStyle = '#fff'; g.beginPath(); g.arc(jack.x, jack.y, 5, 0, TAU); g.fill();
    for (const b of bowls) { g.fillStyle = b.col; g.beginPath(); g.arc(b.x, b.y, 10, 0, TAU); g.fill(); }
    if (rolling) { g.fillStyle = rolling.col; g.beginPath(); g.arc(rolling.x, rolling.y, 10, 0, TAU); g.fill(); }
    if (phase === 'aim' || phase === 'power') { g.strokeStyle = '#ffd400'; g.lineWidth = 3; g.beginPath(); g.moveTo(30, 130); g.lineTo(30 + 120, 130 + aim * 90); g.stroke(); g.fillStyle = '#222'; g.fillRect(20, 245, 200, 8); g.fillStyle = '#f6c445'; g.fillRect(20, 245, 200 * pw, 8); }
    say.textContent = `End ${Math.min(4, end)}/4 · you ${me} – ${them} · ${turn % 2 ? 'their bowl' : phase === 'aim' ? 'tap to set the line' : phase === 'power' ? 'tap to set the weight' : ''}`;
  });
}
// ---------------------------------------------------------------- laser tag: tag the other team as they pop out of cover
function playLaserTag(id) {
  const body = agOpen('Laser tag', 'Click (or tap) the red team when they pop out. Too slow and they tag you. 60 seconds, your team vs theirs.'), gen = AG.gen;
  const c = agCanvas(body, 480, 260), g = c.getContext('2d'), say = agEl(body, 'p', 'font:700 16px sans-serif'); const spots = [[60, 200], [150, 120], [240, 190], [330, 110], [420, 200], [240, 70]];
  let t = 0, up = null, upT = 0, wait = 0.8, mine = 0, theirs = 0, mates = 0, shield = 3, flash = 0;
  c.addEventListener('pointerdown', (e) => { const r = c.getBoundingClientRect(), x = (e.clientX - r.left) * 480 / r.width, y = (e.clientY - r.top) * 260 / r.height; sfxNoise(0.04, 3200, 0.1); if (up && Math.hypot(x - up[0], y - up[1] + 20) < 26) { mine += 100; up = null; wait = 0.3 + rand() * 0.9; } });
  agLoop(gen, (dt) => {
    t += dt; flash = Math.max(0, flash - dt);
    if (!up) { wait -= dt; if (wait <= 0) { up = pick(spots); upT = 0; } } else { upT += dt; if (upT > 1.15) { theirs += 100; shield--; flash = 0.3; up = null; wait = 0.5; if (shield <= 0) { shield = 3; theirs += 200; } } }
    if (rand() < dt * 0.6) mates += 100; if (rand() < dt * 0.45) theirs += 100;
    g.fillStyle = '#0b0f1e'; g.fillRect(0, 0, 480, 260); g.fillStyle = '#29324a'; for (const [x, y] of spots) g.fillRect(x - 30, y, 60, 30);
    if (up) { g.fillStyle = '#ff3b3b'; g.beginPath(); g.arc(up[0], up[1] - 20, 16, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.fillRect(up[0] - 2, up[1] - 26, 4, 4); }
    if (flash) { g.fillStyle = 'rgba(255,40,40,.35)'; g.fillRect(0, 0, 480, 260); }
    say.textContent = `Blue (you ${mine} + team ${mates}) ${mine + mates} – ${theirs} Red · shields ${'🛡'.repeat(shield)} · ${Math.max(0, Math.ceil(60 - t))}s`;
    if (t > 60) { const win = mine + mates > theirs; agResult(id, { win, score: mine, money: win ? 50 : 10, msg: `${win ? 'Blue team wins' : 'Red team wins'} ${mine + mates}–${theirs} (you scored ${mine})` }); return false; }
  });
}
// ---------------------------------------------------------------- busking: hit the notes as they reach the line (← ↓ ↑ →)
function playBusk(id, title) {
  const body = agOpen(title || 'Street performance', 'Hit each note on the line: arrow keys or the buttons. The crowd tips for a good set.'), gen = AG.gen;
  const c = agCanvas(body, 360, 260), g = c.getContext('2d'), say = agEl(body, 'p', 'font:700 16px sans-serif'), row = agEl(body, 'div', 'text-align:center');
  const lanes = ['←', '↓', '↑', '→'], keysL = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'], notes = []; let t = 0, next = 0.8, hits = 0, miss = 0, streak = 0;
  const press = (i) => { const n = notes.find((q) => q.l === i && !q.done && Math.abs(q.y - 220) < 28); if (n) { n.done = true; hits++; streak++; sfxTone([392, 440, 523, 587][i] * (1 + Math.floor(streak / 8) * 0.5), 0.12, 0.05); } else { streak = 0; miss++; } };
  lanes.forEach((l, i) => agBtn(row, l, () => press(i), true));
  agLoop(gen, (dt) => {
    t += dt; next -= dt; if (next <= 0 && t < 40) { notes.push({ l: Math.floor(rand() * 4), y: -10 }); next = Math.max(0.35, 0.9 - t * 0.012); }
    keysL.forEach((k, i) => { if (AG.keys[k]) { AG.keys[k] = false; press(i); } });
    for (const n of notes) { n.y += 160 * dt; if (!n.done && n.y > 250) { n.done = true; miss++; streak = 0; } }
    g.fillStyle = '#1a1030'; g.fillRect(0, 0, 360, 260); g.fillStyle = '#f6c445'; g.fillRect(0, 218, 360, 4);
    for (const n of notes) if (!n.done) { g.fillStyle = ['#ff6f4f', '#33d17a', '#2a7de2', '#e85a9a'][n.l]; g.beginPath(); g.arc(45 + n.l * 90, n.y, 16, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.font = '700 16px sans-serif'; g.textAlign = 'center'; g.fillText(lanes[n.l], 45 + n.l * 90, n.y + 6); }
    say.textContent = `Hits ${hits} · misses ${miss} · streak ${streak}`;
    if (t > 43) { const acc = hits / Math.max(1, hits + miss), tips = Math.round(acc * 80); agResult(id, { complete: true, win: acc > 0.7, score: Math.round(acc * 100), money: tips, msg: `${Math.round(acc * 100)}% of notes · the crowd tipped $${tips}` }); return false; }
  });
}
// ---------------------------------------------------------------- the festival: three stalls, then the prize
async function playFestival(id) {
  const F = festivalToday(), body = agOpen(F.name, 'Play all three stalls. Score 2 of 3 for the event prize.'), gen = AG.gen; const say = agEl(body, 'p', 'font:700 16px sans-serif'); let won = 0;
  say.textContent = 'Stall 1: ring toss'; let rings = 0; for (let k = 0; k < 3; k++) { if (!agAlive(gen)) return; if ((await agBar(body, `Ring ${k + 1}/3`, 1.5, 0.12)) >= 0) rings++; } if (rings >= 2) won++;
  say.textContent = `Ring toss ${rings}/3 · Stall 2: test your reflexes`; let quick = 0; for (let k = 0; k < 3; k++) { if (!agAlive(gen)) return; if (await agReact(body, `Bell ${k + 1}/3`, 0.45)) quick++; } if (quick >= 2) won++;
  say.textContent = `Reflexes ${quick}/3 · Stall 3: the strongman bell`; if (!agAlive(gen)) return; const v = await agBar(body, 'SWING!', 1.8, 0.1); if (v > 0.4) won++;
  if (!agAlive(gen)) return; const prize = won >= 2; if (prize) { player.look.cap = F.cap; rebuildPlayer(); }
  agResult(id, { complete: true, win: prize, score: won, money: prize ? 80 : 0, msg: prize ? `You won ${won}/3 — here’s the ${F.name} cap!` : `${won}/3 — no prize this time` });
}
// ---------------------------------------------------------------- camping: pitch the tent, keep the fire going, sleep under the stars
async function playCamping(id) {
  const body = agOpen('Camping', 'Peg the tent down, get a fire going and keep it alive, then sleep.'), gen = AG.gen; const say = agEl(body, 'p', 'font:700 16px sans-serif'); let good = 0;
  for (let k = 0; k < 4; k++) { if (!agAlive(gen)) return; say.textContent = `Tent peg ${k + 1}/4`; if ((await agBar(body, 'Hammer it in', 1.2, 0.2)) >= 0) good++; }
  if (!agAlive(gen)) return; say.textContent = 'The campfire: tap ADD WOOD when it burns low (keep it out of the red) for 15 seconds.';
  const meter = agEl(body, 'div', 'height:16px;background:#2b3238;border-radius:8px;overflow:hidden'), flame = agEl(meter, 'div', 'height:16px;width:60%;background:#ff9a3c'); let fire = 0.6, t = 0, out = false;
  const add = () => { fire = Math.min(1.2, fire + 0.25); }; const b = agBtn(body, '🪵 ADD WOOD (Space)', add, true);
  await new Promise((r) => agLoop(gen, (dt) => { t += dt; if (AG.keys.Space) { AG.keys.Space = false; add(); } fire -= dt * (0.12 + t * 0.006); if (fire > 1.05) fire -= dt * 0.4; flame.style.width = Math.min(100, fire * 100) + '%'; flame.style.background = fire < 0.25 || fire > 1.05 ? '#d6302a' : '#ff9a3c'; if (fire <= 0) { out = true; r(); return false; } if (t > 15) { r(); return false; } }));
  b.remove(); if (!agAlive(gen)) return;
  if (!out) { gameHour = 7; player.health = 100; ECON.home = ECON.home || null; }
  agResult(id, { complete: !out, win: !out, score: good, money: 0, msg: out ? 'The fire went out — a cold night. Try again?' : `A good night under the stars (${good}/4 pegs solid). Fully rested, it’s morning.` });
}
// ---------------------------------------------------------------- Sea World rides: hold on through the twists (quick prompts)
const RIDES = [['Storm Coaster', 6], ['Jet Rescue', 7], ['Vikings Revenge Flume Ride', 5], ['Leviathan', 8], ['Sea Viper', 7]];
async function playRide(id) {
  const body = agOpen('Sea World rides', 'Pick a ride. Press the arrow shown at each twist to hold on — the faster, the bigger the thrill.'), gen = AG.gen;
  const R = await new Promise((r) => { const row = agEl(body, 'div'); for (const q of RIDES) agBtn(row, `🎢 ${q[0]}${(actData().coll.rides || []).includes(q[0]) ? ' ✅' : ''}`, () => { row.remove(); r(q); }); });
  const say = agEl(body, 'p', 'font:700 18px sans-serif'), arrow = agEl(body, 'p', 'font:700 48px sans-serif;text-align:center'), row = agEl(body, 'div', 'text-align:center'); let thrill = 0, got = '';
  const map = [['←', 'ArrowLeft'], ['↑', 'ArrowUp'], ['↓', 'ArrowDown'], ['→', 'ArrowRight']]; map.forEach(([a]) => agBtn(row, a, () => { got = a; }, true));
  for (let k = 0; k < R[1]; k++) {
    if (!agAlive(gen)) return; const [want] = pick(map); got = ''; arrow.textContent = want; say.textContent = `${R[0]} · twist ${k + 1}/${R[1]}`; let t = 0;
    const ok = await new Promise((r) => agLoop(gen, (dt) => { t += dt; for (const [a, kk] of map) if (AG.keys[kk]) { AG.keys[kk] = false; got = a; } if (got) { r(got === want ? Math.max(0, 1 - t) : 0); return false; } if (t > 1.3) { r(0); return false; } }));
    thrill += Math.round(ok * 100); sfxNoise(0.2, 400 + ok * 800, 0.3);
  }
  arrow.textContent = ''; if (!agAlive(gen)) return; const badge = collect('rides', R[0], R[0] + ' badge');
  agResult(id, { complete: true, score: thrill, money: 0, msg: `${R[0]}: thrill score ${thrill}${badge ? ' · new ride badge!' : ''} (${collCount('rides')}/${RIDES.length} rides)` });
}
// ---------------------------------------------------------------- the cinema: a ticket and a (made-up) short film
const FILMS = [
  { name: 'Seagull Heist', scenes: ['🏖️ Surfers Paradise, noon.', '🐦 Gary the seagull has a plan.', '🍟 The target: a large chips, unattended.', '😱 A beach umbrella topples!', '🐦🐦🐦 The whole flock swoops.', '🍟➡️🐦 Success. Gary is a legend.', 'THE END'] },
  { name: 'Wave of a Lifetime', scenes: ['🌊 Burleigh Heads, 5 a.m.', '🏄 Mia paddles out alone.', '⛈️ A storm swell rolls in.', '🌊🌊🌊 The set of the decade.', '🏄‍♀️ She drops in…', '🏆 …and makes it. The crowd goes wild.', 'THE END'] },
  { name: 'Lost at Pacific Fair', scenes: ['🛒 One quick errand.', '🗺️ Wrong exit.', '🍦 A detour for ice cream.', '🚗 Which car park level was it?!', '⏳ Three hours later…', '🚗✨ Found it. Level 2. Always level 2.', 'THE END'] },
];
async function playCinema(id) {
  const body = agOpen('Event Cinemas', 'Pick a film ($18). Popcorn not included.'), gen = AG.gen;
  const F = await new Promise((r) => { const row = agEl(body, 'div'); for (const f of FILMS) agBtn(row, `🎬 ${f.name}`, () => { if (!pay(18, 'a ticket')) return; row.remove(); r(f); }); });
  const screen = agEl(body, 'div', 'background:#000;color:#fff;font:700 24px sans-serif;text-align:center;padding:50px 10px;border-radius:8px;min-height:80px'); agBtn(body, 'Skip ⏭', () => { skip = true; });
  let skip = false; for (const s of F.scenes) { if (!agAlive(gen) || skip) break; screen.textContent = s; await agWait(2600); }
  if (!agAlive(gen)) return; collect('films', F.name); player.health = Math.min(100, player.health + 15);
  agResult(id, { complete: true, money: 0, msg: `You watched ${F.name} (${collCount('films')}/${FILMS.length} films seen) · +15 health` });
}
// ---------------------------------------------------------------- job tasks for the existing shift system
function retailTask(S) { // a customer at the checkout: give the right change
  const price = Math.round(rr(12, 95) * 100) / 100, paid = [20, 50, 100].find((n) => n > price) || 100, change = Math.round((paid - price) * 100) / 100;
  const opts = [change, Math.round((change + pick([1, 5, -1, 10])) * 100) / 100, Math.round((change + pick([0.5, -0.5, 2])) * 100) / 100].filter((v, i, a) => v > 0 && a.indexOf(v) === i).sort(() => rand() - 0.5);
  econPanel(`${S.shop.name} — retail`, `Customer ${S.done + 1}/5 buys $${price.toFixed(2)} of clothes and hands you $${paid}. Their change?`, opts.map((v) => [`$${v.toFixed(2)}`, 'Give', true, () => { S.done++; if (v === change) { S.good++; S.earned += jobRate('retail'); player.money += jobRate('retail'); } else toast(`It was $${change.toFixed(2)}`); nextTask(); }]));
}
const GUESTS = ['Nguyen', 'Smith', 'Patel', 'O’Brien', 'Kowalski', 'Tanaka', 'Garcia', 'Wilson'];
function receptionTask(S) { // check a guest in to the right room
  const book = GUESTS.slice().sort(() => rand() - 0.5).slice(0, 4).map((n, i) => [n, 100 + Math.floor(rand() * 20) * 10 + i]), guest = pick(book);
  econPanel(`${S.shop.name} — reception`, `Guest ${S.done + 1}/5: “Hi, I’m ${guest[0]}, checking in.” Bookings: ${book.map((b) => `${b[0]} → room ${b[1]}`).join(' · ')}`,
    book.map((b) => [`Key for room ${b[1]}`, 'Hand over', true, () => { S.done++; if (b === guest) { S.good++; S.earned += jobRate('reception'); player.money += jobRate('reception'); } else toast(`That’s ${b[0]}’s room!`); nextTask(); }]));
}
const FAULTS = [['Squeals when braking', 'Brake pads'], ['Won’t start, clicks', 'Battery'], ['Overheats in traffic', 'Radiator fan'], ['Pulls to the left', 'Wheel alignment'], ['Check-engine light, rough idle', 'Spark plugs'], ['Flat and won’t hold air', 'Tyre']];
async function mechanicTask(S) {
  const f = pick(FAULTS), body = agOpen(`${S.shop.name} — mechanic`, `Job ${S.done + 1}/4: “${f[0]}.” What needs fixing?`), gen = AG.gen;
  const ans = await new Promise((r) => { const row = agEl(body, 'div'); FAULTS.map((q) => q[1]).sort(() => rand() - 0.5).forEach((p) => agBtn(row, p, () => { row.remove(); r(p); })); });
  if (!agAlive(gen)) return; let ok = ans === f[1];
  if (ok) { const v = await agBar(body, 'Torque it up (green)', 1.2, 0.2); if (!agAlive(gen)) return; ok = v >= 0; if (!ok) toast('Stripped a bolt — redo'); } else toast(`It was the ${f[1].toLowerCase()}`);
  S.done++; if (ok) { S.good++; S.earned += jobRate('mechanic'); player.money += jobRate('mechanic'); } nextTask();
}
const GROCER_AISLES = { 'Fruit & veg': ['Bananas', 'Avocados', 'Lettuce'], Dairy: ['Milk', 'Cheese', 'Yoghurt'], Bakery: ['Bread', 'Croissants'], Frozen: ['Ice cream', 'Frozen peas'], Drinks: ['Soft drink', 'Juice', 'Water'] };
function grocerTask(S) { // restock, or point a customer to the right aisle
  const aisle = pick(Object.keys(GROCER_AISLES)), item = pick(GROCER_AISLES[aisle]), ask = S.done % 2;
  econPanel(`${S.shop.name} — supermarket`, `${S.done + 1}/8: ${ask ? `A customer asks, “Where’s the ${item.toLowerCase()}?”` : `A trolley of ${item.toLowerCase()} to put away.`}`,
    Object.keys(GROCER_AISLES).map((a) => [`Aisle: ${a}`, ask ? 'Point there' : 'Stock here', true, () => { S.done++; if (a === aisle) { S.good++; S.earned += jobRate('grocer'); player.money += jobRate('grocer'); } else toast(`That’s in ${aisle}`); nextTask(); }]));
}
