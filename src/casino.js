// Gold Coast Streets — the casino: blackjack against the dealer, Texas hold'em against three bots, and slots.
// Game money only: bets come out of your in-game wallet and nothing here can be bought with real money.

const CAS = { game: 'blackjack', bet: 20, bj: null, pk: null, slotSpin: false };
const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
function newDeck() { const d = []; for (const s of SUITS) for (let r = 0; r < 13; r++) d.push({ r, s }); for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; }
function cardHTML(c, hidden) { return hidden ? '<span class="pc back">?</span>' : `<span class="pc${c.s === '♥' || c.s === '♦' ? ' red' : ''}">${RANKS[c.r]}${c.s}</span>`; }
function openCasino(game) {
  uiOpen = true; if (document.pointerLockElement) document.exitPointerLock();
  CAS.game = game || CAS.game; $('casino').hidden = false; renderCasino();
}
function closeCasino() { $('casino').hidden = true; uiOpen = false; CAS.bj = null; CAS.pk = null; saveGame(); lockPointer(); }
function casMsg(t) { $('cas-msg').textContent = t; }
function renderCasino() {
  for (const b of document.querySelectorAll('#cas-tabs button')) b.classList.toggle('on', b.dataset.g === CAS.game);
  $('cas-wallet').textContent = `Wallet $${player.money.toLocaleString()} · bet $${CAS.bet}`;
  const t = $('cas-table'), a = $('cas-actions'); t.innerHTML = ''; a.innerHTML = '';
  const act = (label, fn, ok = true) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.disabled = !ok; b.addEventListener('click', fn); a.appendChild(b); };
  const betRow = () => { for (const v of [10, 20, 50, 100, 250, 500]) act('$' + v, () => { CAS.bet = v; renderCasino(); }, true); };
  if (CAS.game === 'blackjack') {
    const B = CAS.bj;
    if (!B || B.done) {
      if (B) t.innerHTML = `<p>Dealer (${handValue(B.dealer)}): ${B.dealer.map((c) => cardHTML(c)).join('')}</p><p>You (${handValue(B.you)}): ${B.you.map((c) => cardHTML(c)).join('')}</p>`;
      betRow(); act(`Deal ($${CAS.bet})`, bjDeal, player.money >= CAS.bet);
    } else {
      t.innerHTML = `<p>Dealer: ${cardHTML(B.dealer[0])}${cardHTML(B.dealer[1], true)}</p><p>You (${handValue(B.you)}): ${B.you.map((c) => cardHTML(c)).join('')}</p>`;
      act('Hit', bjHit); act('Stand', bjStand); act(`Double ($${B.bet})`, bjDouble, B.you.length === 2 && player.money >= B.bet);
    }
  } else if (CAS.game === 'poker') renderPoker(t, act, betRow);
  else {
    t.innerHTML = `<div class="reels">${(CAS.reels || ['🍒', '🔔', '7️⃣']).map((s) => `<span>${s}</span>`).join('')}</div><p class="pay">🍒🍒🍒 ×5 · 🍋🍋🍋 ×8 · 🔔🔔🔔 ×12 · ⭐⭐⭐ ×20 · 💎💎💎 ×40 · 7️⃣7️⃣7️⃣ ×80 · any two 🍒 ×2</p>`;
    betRow(); act(CAS.slotSpin ? 'Spinning…' : `Spin ($${CAS.bet})`, slotSpin, !CAS.slotSpin && player.money >= CAS.bet);
  }
}

// ---------------------------------------------------------------- blackjack: dealer hits to 17, blackjack pays 3:2
function handValue(h) { let v = 0, aces = 0; for (const c of h) { if (c.r === 12) { aces++; v += 11; } else v += c.r >= 9 ? 10 : c.r + 2; } while (v > 21 && aces) { v -= 10; aces--; } return v; }
function bjDeal() {
  if (player.money < CAS.bet) return; player.money -= CAS.bet;
  const d = newDeck(); CAS.bj = { d, you: [d.pop(), d.pop()], dealer: [d.pop(), d.pop()], bet: CAS.bet, done: false };
  if (handValue(CAS.bj.you) === 21) return bjFinish(); casMsg('Hit or stand?'); renderCasino();
}
function bjHit() { const B = CAS.bj; B.you.push(B.d.pop()); if (handValue(B.you) > 21) return bjFinish(); renderCasino(); }
function bjDouble() { const B = CAS.bj; player.money -= B.bet; B.bet *= 2; B.you.push(B.d.pop()); bjFinish(); }
function bjStand() { bjFinish(); }
function bjFinish() {
  const B = CAS.bj, yv = handValue(B.you), natural = yv === 21 && B.you.length === 2;
  if (yv <= 21 && !natural) while (handValue(B.dealer) < 17) B.dealer.push(B.d.pop());
  const dv = handValue(B.dealer); let win = 0, msg;
  if (yv > 21) msg = 'Bust! The house takes it.';
  else if (natural && !(dv === 21 && B.dealer.length === 2)) { win = Math.round(B.bet * 2.5); msg = `Blackjack! You win $${win - B.bet}`; }
  else if (dv > 21 || yv > dv) { win = B.bet * 2; msg = `You win $${B.bet}!`; }
  else if (yv === dv) { win = B.bet; msg = 'Push — your bet comes back.'; }
  else msg = `Dealer wins with ${dv}.`;
  player.money += win; B.done = true; casMsg(msg); if (win > B.bet) sfxTone([660, 880], 0.15, 0.05); renderCasino();
}

// ---------------------------------------------------------------- slots
function slotSpin() {
  if (CAS.slotSpin || player.money < CAS.bet) return; player.money -= CAS.bet; CAS.slotSpin = true;
  const SYM = ['🍒', '🍒', '🍒', '🍋', '🍋', '🍋', '🔔', '🔔', '⭐', '⭐', '💎', '7️⃣'], PAY = { '🍒': 5, '🍋': 8, '🔔': 12, '⭐': 20, '💎': 40, '7️⃣': 80 };
  const final = [pick(SYM), pick(SYM), pick(SYM)]; let n = 0;
  const tick = setInterval(() => {
    n++; CAS.reels = [0, 1, 2].map((i) => (n > 8 + i * 4 ? final[i] : pick(SYM))); renderCasino(); sfxTone([300 + n * 20], 0.03, 0.02);
    if (n > 16) {
      clearInterval(tick); CAS.slotSpin = false;
      let win = 0; if (final[0] === final[1] && final[1] === final[2]) win = CAS.bet * PAY[final[0]]; else if (final.filter((s) => s === '🍒').length === 2) win = CAS.bet * 2;
      player.money += win; casMsg(win ? `Winner! +$${win}` : 'No luck this time.'); if (win) sfxTone([523, 659, 784], 0.3, 0.06, 'triangle'); renderCasino();
    }
  }, 70);
}

// ---------------------------------------------------------------- Texas hold'em against three bots (blinds, four betting rounds, showdown)
const BOTS = ['Shazza', 'Davo', 'Kev'];
function rank5(cs) { // a comparable score for the best five-card hand
  const rs = cs.map((c) => c.r).sort((a, b) => b - a), cnt = {}; for (const r of rs) cnt[r] = (cnt[r] || 0) + 1;
  const groups = Object.entries(cnt).map(([r, n]) => [n, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const flush = cs.every((c) => c.s === cs[0].s), uniq = [...new Set(rs)];
  let straightHigh = -1; if (uniq.length === 5) { if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0]; else if (uniq.join() === '12,3,2,1,0') straightHigh = 3; }
  const kick = groups.map((g) => g[1]), score = (cat, ks) => cat * 1e10 + ks.reduce((a, k, i) => a + k * Math.pow(15, 4 - i), 0);
  if (straightHigh >= 0 && flush) return score(8, [straightHigh]);
  if (groups[0][0] === 4) return score(7, kick);
  if (groups[0][0] === 3 && groups[1][0] === 2) return score(6, kick);
  if (flush) return score(5, rs);
  if (straightHigh >= 0) return score(4, [straightHigh]);
  if (groups[0][0] === 3) return score(3, kick);
  if (groups[0][0] === 2 && groups[1][0] === 2) return score(2, kick);
  if (groups[0][0] === 2) return score(1, kick);
  return score(0, rs);
}
function bestHand(cards) { let best = 0; for (let a = 0; a < cards.length; a++) for (let b = a + 1; b < cards.length; b++) { const five = cards.filter((_, i) => i !== a && i !== b); if (five.length === 5) best = Math.max(best, rank5(five)); } return cards.length === 5 ? rank5(cards) : best; }
const HAND_NAMES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
function pkStart() {
  if (player.money < CAS.bet * 2) return;
  const d = newDeck(), P = { d, board: [], pot: 0, stage: 0, players: [{ name: 'You', cards: [d.pop(), d.pop()], folded: false, me: true }, ...BOTS.map((n) => ({ name: n, cards: [d.pop(), d.pop()], folded: false }))], log: [] };
  player.money -= CAS.bet; P.pot = CAS.bet * 4; P.unit = CAS.bet; CAS.pk = P; casMsg('Ante in. Your move.'); renderCasino(); // everyone antes one bet
}
function botStrength(b, P) { // 0..1 rough hand strength from what the bot can see
  const all = b.cards.concat(P.board);
  if (all.length < 5) { const [a, c] = b.cards, pair = a.r === c.r; return Math.min(1, (a.r + c.r) / 26 * 0.6 + (pair ? 0.35 : 0) + (a.s === c.s ? 0.05 : 0)); }
  return Math.min(1, Math.floor(bestHand(all) / 1e10) / 5 + 0.1);
}
function pkAct(choice) { // the player checks/calls, raises or folds; the bots answer, then the next card
  const P = CAS.pk, me = P.players[0];
  if (choice === 'fold') { me.folded = true; return pkShowdown(); }
  let raise = choice === 'raise' ? P.unit : 0;
  if (raise) { if (player.money < raise) return; player.money -= raise; P.pot += raise; P.log.push(`You raise $${raise}`); }
  for (const b of P.players.slice(1)) {
    if (b.folded) continue; const s = botStrength(b, P) + (rand() - 0.5) * 0.25;
    if (raise && s < 0.35) { b.folded = true; P.log.push(`${b.name} folds`); }
    else if (raise) { P.pot += raise; P.log.push(`${b.name} calls`); }
    else if (s > 0.72 && rand() < 0.6) { // a bot bets: you call it or fold
      P.pot += P.unit; P.log.push(`${b.name} bets $${P.unit}`);
      if (player.money >= P.unit) { player.money -= P.unit; P.pot += P.unit; P.log.push('You call'); } else { me.folded = true; return pkShowdown(); }
      raise = P.unit;
    } else P.log.push(`${b.name} checks`);
  }
  if (P.players.slice(1).every((b) => b.folded)) return pkShowdown();
  P.stage++;
  if (P.stage === 1) P.board.push(P.d.pop(), P.d.pop(), P.d.pop()); else if (P.stage <= 3) P.board.push(P.d.pop()); else return pkShowdown();
  casMsg(['', 'The flop.', 'The turn.', 'The river.'][P.stage]); renderCasino();
}
function pkShowdown() {
  const P = CAS.pk, live = P.players.filter((p) => !p.folded);
  while (P.board.length < 5) P.board.push(P.d.pop());
  let best = -1, winners = [];
  for (const p of live) { p.score = bestHand(p.cards.concat(P.board)); if (p.score > best) { best = p.score; winners = [p]; } else if (p.score === best) winners.push(p); }
  const share = Math.floor(P.pot / winners.length), meWon = winners.some((p) => p.me);
  if (meWon) player.money += share;
  P.done = true; casMsg(live.length === 1 ? `${live[0].name} takes the pot ($${P.pot}) — everyone else folded.` : `${winners.map((w) => w.name).join(' & ')} win${winners.length > 1 || winners[0].me ? '' : 's'} $${share} with ${HAND_NAMES[Math.floor(best / 1e10)]}.`);
  if (meWon) sfxTone([523, 659, 784], 0.3, 0.06, 'triangle'); renderCasino();
}
function renderPoker(t, act, betRow) {
  const P = CAS.pk;
  if (!P || P.done) {
    if (P) t.innerHTML = `<p>Board: ${P.board.map((c) => cardHTML(c)).join('')}</p>` + P.players.map((p) => `<p>${p.name}${p.folded ? ' (folded)' : ''}: ${p.cards.map((c) => cardHTML(c)).join('')}${p.score && !p.folded ? ' — ' + HAND_NAMES[Math.floor(p.score / 1e10)] : ''}</p>`).join('');
    betRow(); act(`Deal in (ante $${CAS.bet})`, pkStart, player.money >= CAS.bet * 2); return;
  }
  t.innerHTML = `<p>Pot $${P.pot} · Board: ${P.board.map((c) => cardHTML(c)).join('') || '—'}</p><p>You: ${P.players[0].cards.map((c) => cardHTML(c)).join('')}</p>` +
    P.players.slice(1).map((b) => `<p>${b.name}${b.folded ? ' (folded)' : ''}: ${cardHTML(null, true)}${cardHTML(null, true)}</p>`).join('') + `<p class="log">${P.log.slice(-4).join(' · ')}</p>`;
  act('Check / call', () => pkAct('check')); act(`Raise $${P.unit}`, () => pkAct('raise'), player.money >= P.unit); act('Fold', () => pkAct('fold'));
}
function initCasinoUI() {
  for (const b of document.querySelectorAll('#cas-tabs button')) b.addEventListener('click', () => { CAS.game = b.dataset.g; casMsg(''); renderCasino(); });
  $('cas-close').addEventListener('click', closeCasino);
  $('phone-close').addEventListener('click', closePhone);
}
