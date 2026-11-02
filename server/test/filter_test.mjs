// Run: cp server/src/filter.js server/test/filter.mjs && node server/test/filter_test.mjs — builds every spelling trick for every word on the lists and checks the filter
// catches them, then checks ordinary sentences (with words that hide bad words inside them) get through untouched.
import { check, ANYWHERE, WHOLE, SEVERE_ANY, SLURS } from './filter.mjs';
const AT = new Set(['die', 'kill', 'murder', 'stab', 'shoot', 'ugly', 'fat', 'loser', 'idiot', 'stupid', 'dumb', 'moron', 'gay', 'jew', 'jews', 'muslim', 'butt', 'bum', 'nut', 'nuts', 'balls', 'crap', 'damn', 'bloody', 'poo', 'poop', 'noob', 'naked', 'nip', 'queer', 'cripple', 'midget', 'hooker', 'stripper']);
const LEET = { a: ['4'], e: ['3'], i: ['1'], o: ['0'], s: ['5'], t: ['7'], b: ['8'], g: ['9'] };
const variants = new Set(), atOf = new Map();
const roots = [...new Set([...ANYWHERE, ...SEVERE_ANY, ...WHOLE])].filter((w) => !/ /.test(w));
for (const w of roots) {
  const forms = new Set([w]);
  for (const suf of ['s', 'er', 'ers', 'ing', 'ed', 'y', 'head', 'face']) if (w.length > 3 && !(suf === 'y' && SLURS.has(w))) forms.add(w + suf); // (slurs with -y aren't real spellings, and -y would catch spicy)
  for (const f of [...forms]) {
    const set = new Set([f, f.toUpperCase(), f[0].toUpperCase() + f.slice(1)]);
    for (let i = 0; i < f.length; i++) { if (/[a-z]/.test(f[i])) set.add(f.slice(0, i) + f[i].repeat(3) + f.slice(i + 1)); if (LEET[f[i]]) for (const l of LEET[f[i]]) set.add(f.slice(0, i) + l + f.slice(i + 1)); }
    let all = ''; for (const c of f) all += LEET[c] ? LEET[c][0] : c; set.add(all);
    if (f.length <= 10) { set.add(f.split('').join(' ')); set.add(f.split('').join('.')); }
    for (const v of set) { variants.add(v); if (AT.has(w)) atOf.set(v, true); }
  }
}
let caught = 0, missed = [];
for (const v of variants) {
  const msg = atOf.get(v) ? `you ${v}` : `lol ${v} mate`;
  const r = check(msg);
  if (!r.ok || r.starred) caught++; else missed.push(msg);
}
console.log(`bad words on the lists: ${roots.length} · spellings generated: ${variants.size} · caught ${caught} (${(caught / variants.size * 100).toFixed(1)}%)`);
const by = {}; for (const m of missed) { const k = m.replace(/^(lol|you) /, '').replace(/ mate$/, ''); by[k.slice(0, 6)] = (by[k.slice(0, 6)] || 0) + 1; } console.log('missed, grouped:', JSON.stringify(by).slice(0, 1500));
const clean = ['I need to pass the class', 'that peacock is cool', 'grape juice please', 'spicy food at the cafe', 'the method works', 'my manuscript', 'down in the basement', 'a raccoon in the bin',
  'this hit me hard', 'his hit was huge', 'assassin creed', 'cocktail bar', 'reading Dickens', 'hello everyone', 'grapes and drapes', 'trip to Japan', 'snipe them', 'what about it', 'Nigeria and Niger',
  'good night', 'press the button', 'my bumper is dented', 'nutella toast', 'Essex', 'analysis of the canal', 'I assume so', 'glass of water', 'bass guitar', 'cut the grass', 'hitman movie',
  'spice rack', 'document', 'cucumber salad', 'circumstances', 'scrape the paint', 'Moscow', 'Pakistan cricket', 'Mississippi', 'my therapist said', 'bigger waves today', 'the gun shop at Southport',
  'a fat burger', 'this game is dumb lol', 'kill the engine', 'I will shoot the photo', 'damn that was close', 'Surfers Paradise is the best', 'race you to Burleigh!', 'nice wave', 'meet at the casino',
  'who wants to race', 'anyone want to do a heist?', 'I got 1000000 dollars', 'cheers mate', 'shotgun front seat', 'scunthorpe united'];
const bad = clean.map((t) => [t, check(t)]).filter(([t, r]) => !r.ok || r.starred);
console.log(`ordinary sentences: ${clean.length} · wrongly blocked or starred: ${bad.length}`, bad.map(([t, r]) => `${t} -> ${r.ok ? r.text : r.reason}`));
for (const t of ['you are a f4ggot', 'kys', 'go die', 'f u c k you', 'f.u.c.k', 'sh1t', 'what the fuuuuck', 'call me 0412 345 678', 'add my snap', 'you are so ugly', 'nice ass', 'fuckin legend']) { const r = check(t); console.log(JSON.stringify(t), '->', r.ok ? r.text : 'BLOCKED: ' + r.reason); }
