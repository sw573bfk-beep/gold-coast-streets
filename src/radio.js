// ============================================================================
// Gold Coast Streets — the car radio (R to change station while driving, boating or flying). Made-up stations
// with music generated on the spot: chilled beach beats, a doof station, a bit of country, and local talkback
// (callers' gripes as captions). Played quietly through a "car speaker" filter.
// ============================================================================
const RADIO = { station: 1, nextT: 0, step: 0, bus: null, capT: 0 };
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI note -> Hz
const STATIONS = [
  { name: 'Radio off' },
  { name: 'Surf FM 99.4', bpm: 88, chords: [[57, 60, 64, 67], [62, 66, 69, 72], [55, 59, 62, 66], [60, 64, 67, 71]] }, // Am7 Dmaj7 Gmaj7 Cmaj7
  { name: 'Doof 104.7', bpm: 128, chords: [[45, 57, 60, 64], [41, 53, 57, 60], [48, 60, 64, 67], [43, 55, 59, 62]] },
  { name: 'Coast Country 87.6', bpm: 104, chords: [[55, 59, 62], [60, 64, 67], [62, 66, 69], [55, 59, 62]] }, // G C D G
  { name: 'Talk 4GC', bpm: 60 },
];
const TALK = [
  'Caller: “The parking at Pacific Fair on a Saturday — it’s a crime, mate.”',
  'Caller: “Seagulls stole my chips at Surfers again. Third time this week.”',
  'Host: “Light Rail running every seven minutes, folks — get on it.”',
  'Caller: “Who keeps driving through Cavill Mall?! It’s for walking!”',
  'Host: “Surf report: one to two foot at Burleigh, bigger if the storm comes.”',
  'Caller: “The M1 at Nerang this morning. Don’t get me started.”',
  'Host: “Police chase through Broadbeach earlier — stay off the roads, legend.”',
  'Caller: “Saw a fighter jet over Coolangatta. Is that normal?”',
  'Host: “Brekky tip: smashed avo at Burleigh. You’re welcome.”',
  'Caller: “Lost my thongs at Kirra. Blue ones. Reward offered.”',
];
function radioBus() {
  if (RADIO.bus || !AU.ctx) return RADIO.bus;
  const C = AU.ctx, f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.35;
  const g = C.createGain(); g.gain.value = 0; f.connect(g); g.connect(AU.master); RADIO.bus = f; RADIO.gain = g; return f;
}
function tone(freq, t, dur, type, vol, glideTo) {
  const C = AU.ctx, o = C.createOscillator(), g = C.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur * 0.8);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(RADIO.bus); o.start(t); o.stop(t + dur + 0.05);
}
function hit(t, dur, freq, vol, type = 'highpass') { // hats and snares from the shared noise buffer
  const C = AU.ctx, s = C.createBufferSource(), f = C.createBiquadFilter(), g = C.createGain(); s.buffer = AU.noise; f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(RADIO.bus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
// one sixteenth-note step of a station
function playStep(S, k, t) {
  const bar = Math.floor(k / 16) % 4, s = k % 16, ch = S.chords[bar], b16 = 60 / S.bpm / 4;
  if (S.name.startsWith('Surf')) {
    if (s === 0) for (const n of ch) tone(NOTE(n), t, b16 * 15, 'triangle', 0.05);
    if (s % 4 === 2) hit(t, 0.04, 7000, 0.04);
    if (s === 0 || s === 10) tone(NOTE(ch[0] - 12), t, b16 * 5, 'sine', 0.16);
    if (s === 4 || s === 12) hit(t, 0.12, 1800, 0.05, 'bandpass');
    if (s % 3 === 0 && rand() < 0.5) tone(NOTE(ch[(s / 3) % ch.length] + 12), t, b16 * 2, 'sine', 0.035);
  } else if (S.name.startsWith('Doof')) {
    if (s % 4 === 0) tone(150, t, 0.22, 'sine', 0.35, 42); // four-on-the-floor kick
    if (s % 4 === 2) hit(t, 0.05, 8000, 0.07);
    if (s % 2 === 1) tone(NOTE(ch[0] - 12), t, b16 * 0.9, 'sawtooth', 0.06);
    if (s % 2 === 0 && bar % 2) tone(NOTE(ch[1 + (s / 2) % 3] + 12), t, b16, 'square', 0.025);
    if (s === 4 || s === 12) hit(t, 0.15, 2200, 0.06, 'bandpass');
  } else { // country
    const strum = [0, 6, 8, 12];
    if (strum.includes(s)) ch.forEach((n, i) => tone(NOTE(n), t + i * 0.015, b16 * 3, 'square', 0.025));
    if (s === 0 || s === 8) tone(NOTE(ch[0] - 12), t, b16 * 3, 'triangle', 0.12);
    if (s === 4 || s === 12) hit(t, 0.1, 3000, 0.04, 'bandpass');
    if (s % 2 === 0) hit(t, 0.02, 9000, 0.015);
  }
}
function changeStation() {
  RADIO.station = (RADIO.station + 1) % STATIONS.length; RADIO.step = 0; RADIO.nextT = 0; RADIO.capT = 0;
  toast(`📻 ${STATIONS[RADIO.station].name}`);
}
function updateRadio(dt) {
  const inVehicle = player.state === 'car' || player.state === 'plane' || player.state === 'boat' || player.state === 'ride' || (hasGear('headphones') && player.deadT === 0);
  const S = STATIONS[RADIO.station], on = inVehicle && AU.ctx && AU.on && RADIO.station > 0;
  $('radio').hidden = !(inVehicle && RADIO.station > 0); if (!$('radio').hidden) $('radio').textContent = '📻 ' + S.name;
  if (!AU.ctx) return;
  radioBus(); RADIO.gain.gain.setTargetAtTime(on ? 0.9 : 0, AU.ctx.currentTime, 0.2);
  if (!on) return;
  if (S.name.startsWith('Talk')) { // captions instead of voices, with a jingle between callers
    RADIO.capT -= dt; if (RADIO.capT <= 0) { RADIO.capT = 9; toast(pick(TALK)); const t = AU.ctx.currentTime + 0.05; [72, 76, 79].forEach((n, i) => tone(NOTE(n), t + i * 0.12, 0.25, 'sine', 0.06)); }
    return;
  }
  const C = AU.ctx, b16 = 60 / S.bpm / 4;
  if (RADIO.nextT < C.currentTime) RADIO.nextT = C.currentTime + 0.05;
  while (RADIO.nextT < C.currentTime + 0.25) { playStep(S, RADIO.step, RADIO.nextT); RADIO.step++; RADIO.nextT += b16; }
}
