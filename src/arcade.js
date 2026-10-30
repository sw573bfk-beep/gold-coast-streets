// ============================================================================
// Gold Coast Streets — playable activities inside venues: three arcade games for
// Timezone (tickets for prizes) and an escape-room puzzle. Each has a start screen,
// a finish with rewards, and a way out (Esc / Quit) at any time.
// ============================================================================
const MG = { active: null, phase: 'idle' }; // phase: intro | play | done
const MGW = 480, MGH = 320;

function startMiniGame(id) {
  const g = MINIGAMES[id]();
  MG.active = g; MG.phase = 'intro'; MG.id = id;
  uiOpen = true;
  if (document.pointerLockElement) document.exitPointerLock();
  $('mg').hidden = false;
  $('mg-title').textContent = g.title;
  $('mg-help').textContent = g.help;
  $('mg-go').hidden = false; $('mg-go').textContent = 'Start';
  $('mg-side').innerHTML = '';
  g.draw(mgCtx(), true);
}
function mgCtx() { const c = $('mg-canvas'); return c.getContext('2d'); }
function mgBegin() {
  if (MG.phase === 'done') return mgExit(true);
  MG.phase = 'play'; $('mg-go').hidden = true; MG.active.start();
}
function mgFinish(score, reward) {
  MG.phase = 'done';
  const r = reward || {}; actHook(MG.id === 'escape' ? 'escape' : 'arcade', { score });
  if (r.tickets) player.items.tickets = (player.items.tickets || 0) + r.tickets;
  if (r.money) player.money += r.money;
  if (r.item) player.items[r.item] = (player.items[r.item] || 0) + 1;
  saveGame();
  $('mg-side').innerHTML = `<p class="mg-big">${score}</p><p>${r.text || ''}</p>`;
  $('mg-go').hidden = false; $('mg-go').textContent = 'Collect & leave';
  sfxTone(r.tickets || r.money ? [523, 659, 784] : [300, 220], 0.35, 0.07, 'triangle');
}
function mgExit(collected) {
  if (!MG.active) return;
  if (MG.active.stop) MG.active.stop();
  if (!collected && MG.phase === 'play') toast('You walked away from the game');
  MG.active = null; MG.phase = 'idle';
  $('mg').hidden = true; uiOpen = false; lockPointer();
}
function mgKey(code) {
  if (code === 'Escape') return mgExit(false);
  if (MG.phase !== 'play') { if (code === 'Space' || code === 'Enter') mgBegin(); return; }
  if (MG.active.key) MG.active.key(code);
}
function mgUpdate(dt) {
  const g = MG.active; if (!g) return;
  if (MG.phase === 'play') g.update(dt);
  g.draw(mgCtx(), MG.phase !== 'play');
}
function mgClick(e) {
  const c = $('mg-canvas'), r = c.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * MGW, y = ((e.clientY - r.top) / r.height) * MGH;
  if (MG.active && MG.phase === 'play' && MG.active.click) MG.active.click(x, y);
}
function initMiniGameUI() {
  $('mg-go').addEventListener('click', mgBegin);
  $('mg-quit').addEventListener('click', () => mgExit(false));
  $('mg-canvas').addEventListener('mousedown', mgClick);
}
function panel(x, bg) { x.fillStyle = bg; x.fillRect(0, 0, MGW, MGH); }
function txt(x, s, px, py, size, color, align = 'center') { x.fillStyle = color; x.font = `700 ${size}px ${FONT.cond}`; x.textAlign = align; x.textBaseline = 'middle'; x.fillText(s, px, py); }

const MINIGAMES = {
  // ---------------------------------------------------------- Croc Whack: click the crocs before they duck
  croc: () => {
    const holes = []; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) holes.push({ x: 110 + i * 130, y: 95 + j * 85, up: 0, t: 0, hit: 0 });
    let time = 25, score = 0, spawn = 0;
    return {
      title: 'Croc Whack', help: 'Click each croc as it pops up. 25 seconds. 10 points a croc; every 10 points is a prize ticket.',
      start() { time = 25; score = 0; },
      update(dt) {
        time -= dt; spawn -= dt;
        if (spawn <= 0) { const free = holes.filter((h) => !h.up); if (free.length) { const h = pick(free); h.up = 1; h.t = Math.max(0.55, 1.1 - (25 - time) * 0.02); } spawn = Math.max(0.35, 0.8 - (25 - time) * 0.015); }
        for (const h of holes) { if (h.up) { h.t -= dt; if (h.t <= 0) h.up = 0; } if (h.hit > 0) h.hit -= dt; }
        if (time <= 0) mgFinish(score, { tickets: Math.floor(score / 10), text: `${Math.floor(score / 10)} prize tickets` });
      },
      click(x, y) {
        for (const h of holes) if (h.up && Math.hypot(x - h.x, y - h.y) < 38) { h.up = 0; h.hit = 0.25; score += 10; sfxNoise(0.06, 1200, 0.2); return; }
      },
      draw(x, idle) {
        panel(x, '#0d3b2e');
        for (const h of holes) {
          x.fillStyle = '#062019'; x.beginPath(); x.ellipse(h.x, h.y + 18, 46, 16, 0, 0, TAU); x.fill();
          if (h.up) { x.fillStyle = '#4caf50'; x.beginPath(); x.ellipse(h.x, h.y, 30, 24, 0, 0, TAU); x.fill(); x.fillStyle = '#fff'; x.fillRect(h.x - 14, h.y - 12, 8, 8); x.fillRect(h.x + 6, h.y - 12, 8, 8); x.fillStyle = '#111'; x.fillRect(h.x - 11, h.y - 9, 3, 3); x.fillRect(h.x + 9, h.y - 9, 3, 3); x.fillStyle = '#fff'; for (let k = -2; k <= 2; k++) x.fillRect(h.x + k * 8 - 2, h.y + 8, 4, 5); }
          if (h.hit > 0) txt(x, 'WHACK!', h.x, h.y - 30, 18, '#ffd400');
        }
        txt(x, `SCORE ${score}`, 16, 18, 20, '#ffd400', 'left'); txt(x, `${Math.max(0, time).toFixed(1)}s`, MGW - 16, 18, 20, '#fff', 'right');
        if (idle && MG.phase === 'intro') txt(x, 'Press Start', MGW / 2, MGH / 2, 32, '#fff');
      },
    };
  },
  // ---------------------------------------------------------- Wave Rider: stop the surfer in the green zone
  wave: () => {
    let round = 0, pos = 0, dir = 1, speed = 260, zone = { a: 180, w: 90 }, score = 0, flash = 0, msg = '';
    const newZone = () => { const w = Math.max(30, 100 - round * 9); zone = { a: 40 + rand() * (MGW - 80 - w), w }; };
    return {
      title: 'Wave Rider', help: 'Press Space to stop the surfer inside the green zone. 8 waves, each faster and tighter. Dead centre scores double.',
      start() { round = 0; score = 0; speed = 260; newZone(); },
      update(dt) { pos += dir * speed * dt; if (pos < 20) { pos = 20; dir = 1; } if (pos > MGW - 20) { pos = MGW - 20; dir = -1; } if (flash > 0) flash -= dt; },
      key(code) {
        if (code !== 'Space') return;
        const c = zone.a + zone.w / 2, inZone = pos >= zone.a && pos <= zone.a + zone.w;
        const pts = inZone ? (Math.abs(pos - c) < zone.w * 0.15 ? 20 : 10) : 0;
        score += pts; msg = pts === 20 ? 'PERFECT!' : pts ? 'Nice' : 'Wiped out'; flash = 0.6; sfxTone(pts ? [700] : [160], 0.1, 0.05);
        round++; speed += 45;
        if (round >= 8) mgFinish(score, { tickets: Math.floor(score / 8), text: `${Math.floor(score / 8)} prize tickets` }); else newZone();
      },
      draw(x, idle) {
        panel(x, '#0b4f7a');
        x.fillStyle = '#1478b8'; for (let i = 0; i < MGW; i += 24) { x.beginPath(); x.arc(i + 12, 210, 14, Math.PI, 0); x.fill(); }
        x.fillStyle = '#2ecc71'; x.fillRect(zone.a, 150, zone.w, 30);
        x.fillStyle = '#fff'; x.fillRect(zone.a + zone.w / 2 - 1, 146, 2, 38);
        x.fillStyle = '#ffd400'; x.beginPath(); x.ellipse(pos, 140, 22, 6, 0, 0, TAU); x.fill();
        x.fillStyle = '#e0ac85'; x.fillRect(pos - 4, 112, 8, 22); x.fillStyle = '#1aa3a8'; x.fillRect(pos - 5, 124, 10, 8);
        txt(x, `WAVE ${Math.min(8, round + 1)}/8`, 16, 18, 20, '#fff', 'left'); txt(x, `SCORE ${score}`, MGW - 16, 18, 20, '#ffd400', 'right');
        if (flash > 0) txt(x, msg, MGW / 2, 80, 30, msg === 'Wiped out' ? '#ff6f4f' : '#7fdc6a');
        if (idle && MG.phase === 'intro') txt(x, 'Press Start', MGW / 2, 260, 28, '#fff');
      },
    };
  },
  // ---------------------------------------------------------- Tower Stacker: drop blocks squarely
  stack: () => {
    let blocks = [], cur = null, dir = 1, speed = 160, over = false;
    const H = 20;
    return {
      title: 'Tower Stacker', help: 'Press Space to drop the sliding block. Anything hanging over is cut off. Reach the top (12 floors) for a jackpot.',
      start() { blocks = [{ x: 140, w: 200 }]; cur = { x: 0, w: 200 }; dir = 1; speed = 160; over = false; },
      update(dt) { if (!cur) return; cur.x += dir * speed * dt; if (cur.x < 0) { cur.x = 0; dir = 1; } if (cur.x + cur.w > MGW) { cur.x = MGW - cur.w; dir = -1; } },
      key(code) {
        if (code !== 'Space' || !cur) return;
        const top = blocks[blocks.length - 1], a = Math.max(cur.x, top.x), b = Math.min(cur.x + cur.w, top.x + top.w);
        if (b - a <= 0) { cur = null; return this.end(); }
        blocks.push({ x: a, w: b - a }); sfxTone([400 + blocks.length * 40], 0.08, 0.05);
        if (blocks.length >= 13) { cur = null; return this.end(); }
        cur = { x: rand() < 0.5 ? 0 : MGW - (b - a), w: b - a }; speed += 22;
      },
      end() { const floors = blocks.length - 1, jackpot = floors >= 12; mgFinish(`${floors} floors`, { tickets: floors * 3 + (jackpot ? 30 : 0), text: `${floors * 3 + (jackpot ? 30 : 0)} prize tickets${jackpot ? ' — JACKPOT!' : ''}` }); },
      draw(x, idle) {
        panel(x, '#2a1050');
        blocks.forEach((bk, i) => { x.fillStyle = `hsl(${(i * 28) % 360} 80% 60%)`; x.fillRect(bk.x, MGH - 20 - i * H, bk.w, H - 2); });
        if (cur) { x.fillStyle = '#fff'; x.fillRect(cur.x, MGH - 20 - blocks.length * H, cur.w, H - 2); }
        txt(x, `FLOORS ${Math.max(0, blocks.length - 1)}/12`, 16, 18, 20, '#ffd400', 'left');
        if (idle && MG.phase === 'intro') txt(x, 'Press Start', MGW / 2, MGH / 2, 32, '#fff');
      },
    };
  },
  // ---------------------------------------------------------- Escape room: The Lighthouse Keeper's Study
  escape: () => {
    const hour = 1 + Math.floor(rand() * 9), gulls = 2 + Math.floor(rand() * 7), red = 1 + Math.floor(rand() * 6);
    const code = `${hour}${gulls}${red}${(hour + gulls + red) % 10}`;
    const word = pick(['WAVES', 'REEFS', 'SANDY', 'PALMS', 'SURFS', 'TIDES']);
    let time = 300, stage = 1, torch = false, note = 'Find the 4-digit code for the chest. Click things in the room to look closer.';
    const spots = [
      { id: 'clock', x: 70, y: 70, w: 80, h: 80 }, { id: 'painting', x: 190, y: 50, w: 140, h: 90 },
      { id: 'books', x: 360, y: 60, w: 100, h: 150 }, { id: 'chest', x: 170, y: 220, w: 120, h: 70 }, { id: 'door', x: 20, y: 170, w: 90, h: 140 },
    ];
    const books = []; { const reds = new Set(); while (reds.size < red) reds.add(Math.floor(rand() * 14)); for (let i = 0; i < 14; i++) books.push(reds.has(i) ? '#c0392b' : pick(['#2a6f97', '#7a5c2e', '#3d6b3a', '#5a3d8a', '#8a8a8a'])); }
    const side = () => {
      $('mg-side').innerHTML = `<p>${note}</p>${stage === 1 ? '<label>Chest lock <input id="mg-code" inputmode="numeric" maxlength="4" autocomplete="off"></label><button id="mg-try" type="button">Try code</button>'
        : '<label>Door keypad (5 letters) <input id="mg-word" maxlength="5" autocomplete="off"></label><button id="mg-try" type="button">Try word</button>'}`;
      $('mg-try').addEventListener('click', () => {
        if (stage === 1) {
          if ($('mg-code').value.trim() === code) { stage = 2; torch = true; note = 'Click! The chest opens: a UV torch. Shine it around — something is hidden in the room.'; sfxTone([600, 900], 0.2, 0.06); }
          else { note = 'The lock doesn\'t budge. Look again: the clock, the birds, the red spines… and what\'s scratched on the chest lid?'; sfxTone([160], 0.15, 0.05); time -= 10; }
        } else {
          if ($('mg-word').value.trim().toUpperCase() === word) { const left = Math.floor(time); mgFinish(`Escaped with ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left`, { money: 100 + left, item: 'trophy', text: `+$${100 + left} and an escape room trophy` }); return; }
          note = 'BZZT. Wrong word. The torch shows letters somewhere you\'ve already looked.'; sfxTone([160], 0.15, 0.05); time -= 10;
        }
        side();
      });
    };
    return {
      title: "Escape Room: The Lighthouse Keeper's Study", help: 'Five minutes. Find the chest code, then the word that opens the door. Wrong guesses cost 10 seconds. Click objects to inspect them.',
      start() { time = 300; side(); },
      update(dt) { time -= dt; if (time <= 0) { time = 0; mgFinish('Time\'s up', { text: 'The keeper lets you out. Better luck next time.' }); } },
      click(x, y) {
        const s = spots.find((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h); if (!s) return;
        note = {
          clock: 'The clock stopped on the hour. Which hour is it pointing to?',
          painting: torch ? 'Under the UV torch, letters glow across the painting.' : 'A stormy sea. How many seagulls can you count?',
          books: 'A shelf of spines. A few are bright red.',
          chest: 'A 4-digit lock. Scratched on the lid: "time · birds · red · then add them up (last digit only)".',
          door: stage === 1 ? 'Locked. A keypad with letters. You need to open the chest first.' : 'The keypad wants a 5-letter word.',
        }[s.id];
        side();
      },
      draw(x, idle) {
        panel(x, '#3a3028'); x.fillStyle = '#2a2420'; x.fillRect(0, 230, MGW, 90);
        x.fillStyle = '#5a4630'; x.fillRect(20, 170, 90, 140); x.fillStyle = '#c9a15a'; x.fillRect(95, 240, 8, 8);
        x.fillStyle = '#f2e6c8'; x.beginPath(); x.arc(110, 110, 36, 0, TAU); x.fill(); x.strokeStyle = '#2a2420'; x.lineWidth = 3; x.stroke();
        const ang = (hour / 12) * TAU - Math.PI / 2; x.beginPath(); x.moveTo(110, 110); x.lineTo(110 + Math.cos(ang) * 22, 110 + Math.sin(ang) * 22); x.stroke();
        x.lineWidth = 1.5; x.beginPath(); x.moveTo(110, 110); x.lineTo(110, 80); x.stroke();
        for (let k = 1; k <= 12; k++) { const a = (k / 12) * TAU - Math.PI / 2; txt(x, String(k), 110 + Math.cos(a) * 28, 110 + Math.sin(a) * 28, 9, '#2a2420'); }
        x.fillStyle = '#6a5a3a'; x.fillRect(186, 46, 148, 98); x.fillStyle = '#5a7a8a'; x.fillRect(192, 52, 136, 86); x.fillStyle = '#2f4a5a'; x.fillRect(192, 110, 136, 28);
        for (let k = 0; k < gulls; k++) { const gx = 205 + ((k * 37) % 115), gy = 62 + ((k * 23) % 40); x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.moveTo(gx - 6, gy); x.quadraticCurveTo(gx - 3, gy - 4, gx, gy); x.quadraticCurveTo(gx + 3, gy - 4, gx + 6, gy); x.stroke(); }
        if (torch) txt(x, word.split('').join(' '), 260, 124, 22, '#c77dff');
        x.fillStyle = '#4a3624'; x.fillRect(356, 56, 108, 158);
        books.forEach((c, i) => { x.fillStyle = c; x.fillRect(362 + (i % 7) * 14, 64 + Math.floor(i / 7) * 74, 11, 66); });
        x.fillStyle = stage === 1 ? '#7a5230' : '#9a7240'; x.fillRect(170, 230, 120, 60); x.fillStyle = '#c9a15a'; x.fillRect(222, 250, 16, 14);
        txt(x, `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`, MGW - 14, 300, 22, time < 60 ? '#ff6f4f' : '#ffd400', 'right');
        if (idle && MG.phase === 'intro') { x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(0, 0, MGW, MGH); txt(x, 'Press Start when ready', MGW / 2, MGH / 2, 28, '#fff'); }
      },
    };
  },
};
