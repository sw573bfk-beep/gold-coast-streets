// Gold Coast Streets — the chat filter (and the name filter). It only runs on the server, so editing the game can't
// switch it off.
//
// How it catches the spellings people use to get round filters, rather than listing every one:
//   - only letters, numbers, spaces and . , ! ? ' get through at all
//   - numbers and symbols that stand in for letters are read as letters (f4ck, sh1t, 5lut, b1tch)
//   - every letter of a bad word may be repeated (fuuuuck, shiiiit)
//   - letters spelled out with gaps are joined up (f u c k, f.u.c.k, f-u-c-k)
//   - endings are covered (fucking, fucker, shitty, bitches, dickhead, assholes...)
// Rude words are starred out. Slurs, sexual stuff, threats and "kill yourself" block the whole message, and so do phone
// numbers, links and contact details. Short words that hide inside ordinary ones (ass in class, cock in peacock,
// rape in grape, spic in spicy, meth in method) only count as whole words.

// matched anywhere, even inside other words: none of these turn up inside ordinary English words
const ANYWHERE = [
  'fuck', 'fuq', 'fck', 'fcuk', 'phuck', 'phuk', 'fukk', 'fukin', 'fuker', 'motherf', 'mthrfck', 'muthaf', 'mutherf',
  'shit', 'shyt', 'bullsh', 'cunt', 'kunt', 'bitch', 'biatch', 'biotch', 'bytch', 'beyotch', 'bastard', 'basterd',
  'bollock', 'wank', 'arsehole', 'asshole', 'arsewipe', 'asswipe', 'arselick', 'asslick', 'dickhead', 'dickwad', 'dickweed', 'dickface',
  'dicksuck', 'cocksuck', 'cockhead', 'cockface', 'knobhead', 'knobend', 'bellend', 'pussy', 'pussie', 'twat', 'douchebag',
  'jackass', 'dumbass', 'fatass', 'smartass', 'dumbarse', 'goddamn', 'godamn', 'dipshit', 'slut', 'skank', 'whore', 'scumbag',
  'porn', 'hentai', 'blowjob', 'handjob', 'rimjob', 'footjob', 'titjob', 'cumshot', 'cumslut', 'creampie', 'gangbang', 'bukkake',
  'deepthroat', 'masturbat', 'jerkoff', 'jackoff', 'orgasm', 'sexting', 'titties', 'dildo', 'buttplug', 'ballsack', 'nutsack',
  'jizz', 'milf', 'pedophil', 'paedophil', 'molest', 'incest', 'bestiality', 'zoophil', 'onlyfans', 'camgirl', 'sexcam', 'nsfw',
  'rule34', 'prostitut', 'nigger', 'nigga', 'nigguh', 'niggah', 'niggaz', 'nigglet', 'jigaboo', 'jiggaboo', 'porchmonkey',
  'junglebunny', 'golliwog', 'zipperhead', 'wetback', 'raghead', 'towelhead', 'sandnigger', 'faggot', 'fagot', 'faggit', 'fagg',
  'poofter', 'pooftah', 'tranny', 'trannie', 'shemale', 'retard', 'libtard', 'spastic', 'hitler', 'siegheil', 'kukluxklan',
  'killyourself', 'killurself', 'killyoself', 'neckyourself', 'hangyourself', 'terrorist', 'cocaine', 'fentanyl', 'ketamine', 'marijuana',
];
// whole words only, with their endings
const WHOLE = [
  'ass', 'arse', 'asshat', 'cock', 'dick', 'dik', 'knob', 'prick', 'tit', 'titty', 'boob', 'boobs', 'boobies', 'cum', 'hoe', 'fag', 'sex',
  'sexy', 'horny', 'nude', 'nudes', 'naked', 'nipple', 'vagina', 'vulva', 'clit', 'penis', 'erection', 'boner', 'vibrator', 'anal', 'anus',
  'scrotum', 'testicle', 'semen', 'sperm', 'spunk', 'dilf', 'pedo', 'paedo', 'fetish', 'bdsm', 'bondage', 'lewd', 'smut', 'erotic', 'xxx',
  'fap', 'orgy', 'piss', 'pissed', 'tosser', 'wanker', 'wanka', 'bugger', 'feck', 'fuk', 'mofo', 'bolox', 'twot', 'turd', 'stripper', 'hooker',
  'negro', 'coon', 'sambo', 'darkie', 'darky', 'wog', 'abo', 'boong', 'lubra', 'chink', 'chinky', 'gook', 'slanteye', 'jap', 'nip', 'spic',
  'spick', 'beaner', 'kike', 'kyke', 'heeb', 'hymie', 'yid', 'paki', 'dothead', 'gyppo', 'gypo', 'pikey', 'honky', 'honkey', 'redskin',
  'injun', 'squaw', 'halfbreed', 'dyke', 'lezzo', 'lesbo', 'homo', 'poof', 'queer', 'tard', 'spaz', 'mong', 'cripple', 'midget', 'nazi',
  'heil', 'kkk', 'kys', 'jihad', 'meth', 'mdma', 'lsd', 'heroin', 'rape', 'raped', 'rapes', 'rapist', 'raping', 'wtf', 'stfu', 'gtfo', 'fml',
  'die', 'kill', 'murder', 'stab', 'shoot', 'ugly', 'fat', 'loser', 'idiot', 'stupid', 'dumb', 'moron', 'gay', 'jew', 'jews', 'muslim',
  'butt', 'bum', 'nut', 'nuts', 'balls', 'crap', 'damn', 'bloody', 'poo', 'poop', 'noob',
];
// ordinary words that are only a problem aimed at someone ("the gun shop", "a fat burger" are fine; "u r ugly" isn't)
const AT_PEOPLE = new Set(['die', 'kill', 'murder', 'stab', 'shoot', 'ugly', 'fat', 'loser', 'idiot', 'stupid', 'dumb', 'moron', 'gay', 'jew', 'jews', 'muslim', 'butt', 'bum', 'nut', 'nuts', 'balls', 'crap', 'damn', 'bloody', 'poo', 'poop', 'noob', 'naked', 'nip', 'queer', 'cripple', 'midget', 'hooker', 'stripper']);
const YOU = /^(you|u|ur|youre|your|yours|ya|yous|youse|him|her|them|hes|shes|theyre|ure)$/;
// any of these blocks the whole message (the rest are starred)
const SEVERE_ANY = ['nigg', 'jigab', 'jiggab', 'porchmonk', 'junglebun', 'golliwog', 'zipperhead', 'wetback', 'raghead', 'towelhead', 'sandnig',
  'faggot', 'fagot', 'faggit', 'tranny', 'trannie', 'shemale', 'retard', 'hitler', 'siegheil', 'kukluxklan', 'whitepower', 'killyourself',
  'killurself', 'killyoself', 'neckyourself', 'hangyourself', 'schoolshoot', 'bombthreat', 'pedophil', 'paedophil', 'molest', 'incest',
  'bestiality', 'zoophil', 'porn', 'hentai', 'blowjob', 'handjob', 'rimjob', 'cumshot', 'cumslut', 'creampie', 'gangbang', 'bukkake',
  'deepthroat', 'masturbat', 'dildo', 'onlyfans', 'rule34', 'sexcam', 'camgirl'];
const SEVERE_WORDS = new Set(['negro', 'coon', 'sambo', 'darkie', 'chink', 'gook', 'spic', 'beaner', 'kike', 'kyke', 'hymie', 'paki', 'dothead', 'nazi',
  'heil', 'kkk', 'kys', 'rape', 'raped', 'rapes', 'rapist', 'raping', 'pedo', 'paedo', 'nudes', 'jihad', 'boong', 'abo', 'wog', 'gyppo', 'redskin']);
// numbers and symbols that stand in for letters (only the ones that get through: digits)
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', 6: 'g' };
const ENDINGS = ['s', 'es', 'z', 'er', 'ers', 'a', 'ah', 'ing', 'ings', 'in', 'ed', 'd', 'y', 'ie', 'ies', 'ier', 'iest', 'ish', 'head', 'heads', 'face', 'faces', 'hole', 'holes', 'wad', 'wit', 'bag', 'bags', 'stick', 'sucker', 'suckers', 'ass', 'off'];
const STRICT_ENDINGS = ['s', 'es', 'er', 'ers', 'ing', 'ed', 'd', 'ist', 'ists', 'head', 'heads', 'face', 'faces', 'hole', 'bag', 'lover', 'lovers']; // slurs: no -y or -in (spic is in spicy, coon... in cooning)
const esc = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w) => w.split('').map((c) => LEET[c] || c).map((c) => (/[a-z]/.test(c) ? `${c}+` : esc(c))).join(''); // every letter can repeat: fuuuuck (and the list's own digits read as letters, like the message's)
const ANY_RE = new RegExp(ANYWHERE.map(wordRe).sort((a, b) => b.length - a.length).join('|'), 'g');
const SEV_RE = new RegExp(SEVERE_ANY.map(wordRe).join('|'));
const endRe = (list) => `(?:${list.map(wordRe).join('|')})?`; // endings can stretch too: cocksss
const SLURS = new Set([...SEVERE_WORDS, 'chinky', 'slanteye', 'jap', 'nip', 'spick', 'heeb', 'yid', 'gypo', 'pikey', 'honky', 'honkey', 'injun', 'squaw', 'halfbreed', 'dyke', 'lezzo', 'lesbo', 'homo', 'poof', 'queer', 'tard', 'spaz', 'mong', 'darky', 'lubra']);
const WHOLE_RES = WHOLE.map((w) => [w, new RegExp(`^${wordRe(w)}${endRe(SLURS.has(w) ? STRICT_ENDINGS : ENDINGS)}$`)]); // slurs don't take -y or -in (spicy, nippy, homey)
const SEVERE_RES = [...SEVERE_WORDS].map((w) => [w, new RegExp(`^${wordRe(w)}${endRe(STRICT_ENDINGS)}$`)]);
const ALLOWED = /[^A-Za-z0-9 .,!?']/g;
function tidy(s) { return String(s || '').replace(/[’‘]/g, "'").replace(ALLOWED, '').replace(/\s+/g, ' ').trim(); }
// the message as letters, one for one (so a match lines up with the original): lower case, digits read as letters, the rest spaces
function letters(s) { let o = ''; for (const ch of s.toLowerCase()) o += LEET[ch] || (/[a-z]/.test(ch) ? ch : ch === "'" ? '\u0000' : ' '); return o; }
function wholeHit(w) { for (const [root, re] of WHOLE_RES) if (re.test(w)) return root; return null; }
function check(raw) {
  const text = tidy(raw).slice(0, 120);
  if (!text) return { ok: false, reason: 'Type a message first' };
  const lowText = text.toLowerCase();
  if (/(^|\D)0[\d ]{7,}/.test(text) || /\d{10,}/.test(text.replace(/ /g, ''))) return { ok: false, reason: 'No phone numbers in chat — stay safe' };
  if (/https?|www|dot ?(com|net|org)|\.(com|net|org|au|io|gg)\b|discord|snapchat|snap me|my snap|add me on|add my|follow me on|dm me|insta(gram)?|tik ?tok|whatsapp|telegram|\bkik\b|my number|my address|where do you live|where u live|wat school|what school/.test(lowText)) return { ok: false, reason: 'No links or contact details in chat — stay safe' };
  const low = letters(text).replace(/\u0000/g, ''), map = []; // positions in `low` back to `text` (apostrophes dropped)
  { let j = 0; for (let i = 0; i < text.length; i++) if (text[i] !== "'") map[j++] = i; }
  // letters spelled out with gaps: runs of 3+ single letters (f u c k, f.u.c.k) are joined up and checked too
  const tokens = []; low.replace(/[a-z]+/g, (w, i) => { tokens.push([w, i]); return w; });
  for (let k = 0; k < tokens.length; k++) {
    if (tokens[k][0].length > 2) continue;
    let e = k; while (e + 1 < tokens.length && tokens[e + 1][0].length <= 2) e++;
    if (e - k >= 2) { const joined = tokens.slice(k, e + 1).map((t) => t[0]).join(''); ANY_RE.lastIndex = 0; if (SEV_RE.test(joined) || ANY_RE.test(joined) || wholeHit(joined)) return { ok: false, reason: 'That message was blocked — keep it friendly' }; }
    k = e;
  }
  if (SEV_RE.test(low)) return { ok: false, reason: 'That message was blocked — keep it friendly' };
  for (const [w] of tokens) if (SEVERE_RES.some(([, re]) => re.test(w))) return { ok: false, reason: 'That message was blocked — keep it friendly' };
  if (/\b(go|plz|pls|please|u should|you should|just) ?(die|kill)\b/.test(low) || /\bkill (yo|you|ur)/.test(low)) return { ok: false, reason: 'That message was blocked — keep it friendly' };
  // star out the rest
  const out = text.split(''); let hits = 0;
  const star = (a, b) => { for (let i = a; i < b; i++) { const p = map[i]; if (p !== undefined && out[p] !== ' ') out[p] = '*'; } hits++; };
  ANY_RE.lastIndex = 0; let m;
  while ((m = ANY_RE.exec(low))) star(m.index, m.index + m[0].length);
  tokens.forEach(([w, i], k) => {
    const root = wholeHit(w); if (!root) return;
    if (AT_PEOPLE.has(root) && ![tokens[k - 3], tokens[k - 2], tokens[k - 1], tokens[k + 1], tokens[k + 2]].some((q) => q && YOU.test(q[0]))) return;
    star(i, i + w.length);
  });
  const shown = out.join('');
  if (hits && shown.replace(/[^*]/g, '').length * 2 > shown.replace(/ /g, '').length) return { ok: false, reason: 'That message was blocked — keep it friendly' }; // mostly stars
  return { ok: true, text: shown, starred: hits };
}
// names and titles: no starring, just yes or no
function cleanName(s) { const r = check(s); return r.ok && !r.starred && r.text === tidy(s); }
export { check, cleanName, tidy, ANYWHERE, WHOLE, SEVERE_ANY, SLURS };
