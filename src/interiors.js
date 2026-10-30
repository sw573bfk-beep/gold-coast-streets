// ============================================================================
// Gold Coast Streets — what's inside a shop. Each shop is fitted out for what it is: supermarket aisles and
// checkouts, servo drink fridges, bottle-shop wine walls, café coffee machines and cake cabinets, fast-food
// counters and booths, clothes racks, TV walls, salon chairs, teller windows and so on, in the colours of the
// chain where it's a known one. Street shops also get a few shoppers browsing.
// Room coordinates: u along the shopfront (t0..t1), v inward from the glass (0..depth), y up from the floor.
// The counter runs across the room at v = counterV; customers stay in front of it, staff behind.
// ============================================================================
const SHOP_BRANDS = [ // name pattern -> main colour, accent colour (fixtures, end caps, uniforms, feature walls)
  [/woolworths|woolies/, '#178841', '#ffffff'], [/coles/, '#e01a22', '#ffffff'], [/aldi/, '#00205b', '#f39200'], [/\biga\b/, '#d71920', '#1d1d1d'],
  [/foodworks|spar\b/, '#e30613', '#007a3d'], [/7-eleven|7 eleven/, '#008163', '#ee2526'], [/ampol|caltex|foodary/, '#e2231a', '#1e3c8c'],
  [/\bbp\b/, '#009b3a', '#ffe600'], [/shell/, '#ffd500', '#dd1d21'], [/mcdonald/, '#da291c', '#ffc72c'], [/kfc/, '#a3080c', '#ffffff'],
  [/hungry jack/, '#e2231a', '#f6a800'], [/subway/, '#008c15', '#ffc600'], [/domino/, '#006491', '#e31837'], [/pizza hut/, '#c8102e', '#1d1d1d'],
  [/red rooster/, '#e31837', '#ffffff'], [/nando/, '#c8102e', '#1d1d1d'], [/guzman|zambrero/, '#1d1d1d', '#c8102e'], [/grill'd/, '#1d1d1d', '#8cc63f'],
  [/oporto/, '#e31837', '#ffcd00'], [/boost/, '#e4007c', '#8dc63f'], [/gloria jean/, '#5a2d1a', '#c8a26b'], [/starbucks/, '#00704a', '#ffffff'],
  [/chemist warehouse/, '#e2001a', '#0055a4'], [/priceline/, '#e5007e', '#ffffff'], [/terry white/, '#0072ce', '#e4002b'],
  [/jb hi/, '#fff200', '#1d1d1d'], [/harvey norman/, '#003a70', '#e4002b'], [/eb games/, '#0a0a0a', '#e4002b'], [/bunnings/, '#0d5257', '#e5332a'],
  [/kmart/, '#e2001a', '#ffffff'], [/big w/, '#004b8d', '#ffffff'], [/target/, '#cc0000', '#ffffff'], [/myer/, '#1d1d1d', '#ffffff'],
  [/dan murphy/, '#0b5a2a', '#ffffff'], [/\bbws\b/, '#e30613', '#1d1d1d'], [/liquorland/, '#c8102e', '#ffffff'], [/bottle-o|bottle o/, '#1d1d1d', '#ffd100'],
  [/commonwealth|commbank/, '#ffcc00', '#1d1d1d'], [/westpac/, '#d5002b', '#ffffff'], [/\banz\b/, '#007dba', '#ffffff'], [/\bnab\b/, '#c20000', '#1d1d1d'],
  [/bendigo/, '#8b1e3f', '#ffffff'], [/suncorp/, '#00473f', '#f5c400'], [/cotton on/, '#1d1d1d', '#ffffff'], [/rebel/, '#e4002b', '#1d1d1d'],
];
function brandOf(sh) { const n = sh.name.toLowerCase(); for (const [re, a, b] of SHOP_BRANDS) if (re.test(n)) return [a, b]; return null; }
// what kind of fit-out a shop gets, from what it sells and its name
function shopStyle(sh) {
  const n = sh.name.toLowerCase(), k = sh.kind;
  if (['arcade', 'ripley', 'escape', 'casino', 'cars', 'stripclub'].includes(k)) return k;
  if (/woolworths|coles|aldi|\biga\b|foodworks|supermarket|spar\b|harris farm|drakes|foodland|grocer/.test(n)) return 'supermarket';
  if (k === 'fuel' || /7-eleven|7 eleven|night owl|on the run|foodary|convenience|food store|mini mart|minimart/.test(n)) return 'servo';
  if (k === 'bottle') return 'bottle';
  if (k === 'vape') return 'vape';
  if (k === 'adult') return 'adult';
  if (k === 'pharmacy' || /chemist|pharmacy|priceline|terry white/.test(n)) return 'pharmacy';
  if (/mcdonald|kfc|hungry jack|subway|domino|pizza hut|red rooster|guzman|zambrero|grill'd|oporto|nando|burger|chicken|kebab|fish (and|&) chips|chippy|taco|burrito/.test(n)) return 'fastfood';
  if (k === 'icecream') return 'icecream';
  if (/bake|bread|patisserie|donut|doughnut|\bpies?\b|croissant/.test(n)) return 'bakery';
  if (/sushi|japanese|ramen|teppan/.test(n)) return 'sushi';
  if (/pizza|italian|trattoria|pasta/.test(n)) return 'pizza';
  if (k === 'food') return 'restaurant';
  if (k === 'cafe') return 'cafe';
  if (k === 'club') return 'club';
  if (k === 'bar') return 'bar';
  if (k === 'bank') return 'bank';
  if (k === 'gym') return 'gym';
  if (k === 'hotel') return 'hotel';
  if (/jb hi|harvey norman|eb games|good guys|apple|samsung|telstra|optus|vodafone|mobile|phone|computer|electronic|gaming|games\b/.test(n)) return 'electronics';
  if (/bunnings|mitre 10|hardware|tool|trade/.test(n)) return 'hardware';
  if (/kmart|big w|target|myer|david jones|best & less|harris scarfe|department/.test(n)) return 'department';
  if (/shoe|foot locker|platypus|athlete'?s foot|hype dc|skechers|novo|sneaker/.test(n)) return 'shoes';
  if (/hair|barber|salon|beauty|nail|lash|brow|\bspa\b|massage|tattoo/.test(n)) return 'salon';
  if (/jewel|prouds|michael hill|pandora|diamond|watches/.test(n)) return 'jewellery';
  if (/newsagen|news\b|book|dymocks|qbd|stationery|typo|officeworks/.test(n)) return 'books';
  if (/florist|flower/.test(n)) return 'florist';
  if (/butcher|meats?\b|deli\b/.test(n)) return 'butcher';
  if (k === 'clothes' || /cotton on|surf|billabong|quiksilver|rip curl|zara|h&m|uniqlo|fashion|boutique|clothing|apparel|swim/.test(n)) return 'clothes';
  if (k === 'service') return 'office';
  if (k === 'fun') return 'fun';
  return k === 'convenience' ? 'servo' : 'shop';
}
const STYLE_ROOM = { // floor, walls
  supermarket: ['#d9dcdf', '#f4f6f7'], servo: ['#d7dadc', '#f4f6f7'], bottle: ['#8a6a4a', '#efe6d8'], vape: ['#1e1e24', '#2a2a33'], adult: ['#3a2f36', '#4a3b44'],
  pharmacy: ['#eef1f3', '#ffffff'], fastfood: ['#c9b79c', '#f4ead8'], icecream: ['#f1e6ee', '#fde9f2'], bakery: ['#b99a72', '#f6ecd8'], sushi: ['#6b4a32', '#efe2cc'],
  pizza: ['#9c5a3c', '#f1e2c8'], restaurant: ['#7a5a40', '#efe2cc'], cafe: ['#a07b55', '#efe2cc'], club: ['#141018', '#1b1424'], bar: ['#3a2a22', '#2b1f1a'],
  bank: ['#d9d1c2', '#f2ede2'], gym: ['#2b2e33', '#e9ecee'], hotel: ['#b9a27e', '#efe7d8'], electronics: ['#cfd3d6', '#f2f4f5'], hardware: ['#b8b2a6', '#e9e6df'],
  department: ['#e2e4e6', '#f6f6f4'], shoes: ['#c9b9a2', '#f4efe6'], salon: ['#e8e2dc', '#fbf7f2'], jewellery: ['#e9e4dc', '#fbf8f2'], books: ['#9c7a58', '#f2ead9'],
  florist: ['#c9c2b4', '#f4f1ea'], butcher: ['#e9eef0', '#ffffff'], clothes: ['#e6e0d6', '#f7f4ee'], office: ['#cfd3d6', '#eef0f2'], shop: ['#d8cdbb', '#f3ece0'],
};
const PRODUCT = ['#e23b2a', '#2a7de2', '#f2c230', '#2ac28a', '#f07ac0', '#ffffff', '#ff8a2a', '#7a3e9a', '#1fb5c9', '#9bd14b'];
const BOTTLES = ['#2f5d3a', '#6b1f2a', '#c9a24a', '#e8e2c8', '#3a2a1a', '#1e3a5a', '#b8452a'];
const CLOTH = ['#1d1d1d', '#f4f4f2', '#2d6cdf', '#c43a2a', '#e8d9b8', '#5a6b3a', '#e85a9a', '#35c6cf', '#8a1f2a', '#f2c542'];

// fit out one room. B: the coloured interior buffer; P(u, v, y) -> world; solid(u0, u1, v0, v1, h) adds a wall box;
// opts.noCounter: the room already has its own (shopping-centre units)
function furnish(B, sh, P, solid, opts = {}) {
  const u0 = sh.t0, u1 = sh.t1, D = sh.depth, W = u1 - u0, cv = sh.counterV, uc = (u0 + u1) / 2, style = shopStyle(sh), brand = brandOf(sh);
  const main = brand ? brand[0] : null, acc = brand ? brand[1] : null;
  const rnd = mulberry32(Math.floor(Math.abs(sh.ax || sh.x || 1) * 13 + Math.abs(sh.az || sh.z || 1) * 7) + 1), r = () => rnd(), pick = (a) => a[Math.floor(r() * a.length)];
  const box = (a, b, c, d, y0, y1, hex, glow = 1) => ibox(B, P, a, b, c, d, y0, y1, hex, glow);
  const block = (a, b, c, d, y0, y1, hex, glow) => { box(a, b, c, d, y0, y1, hex, glow); if (solid) solid(a, b, c, d, y1); };
  const front = 0.9, back = cv - 0.8; // the shop floor in front of the counter (v)
  const room = back - front, walk = (u) => Math.abs(u - uc) < 1.05; // keep a clear path from the door to the counter
  // the counter itself, in the shop's colours
  const counterCol = main || { bar: '#5a3a26', club: '#2a2a33', bank: '#8a6a4a', hotel: '#6b4a32', cafe: '#6b4a32', bakery: '#8a6a4a', jewellery: '#f4f4f2', vape: '#1d1d1d' }[style] || '#d9dde0';
  if (!opts.noCounter) {
    if (style === 'bank') {
      box(u0 + 0.2, u1 - 0.2, cv - 0.35, cv + 0.35, 0, 1.1, '#8a6a4a');
      for (let u = u0 + 1.2; u < u1 - 0.8; u += 1.6) box(u - 0.02, u + 0.02, cv - 0.04, cv + 0.04, 1.1, 2.4, '#cfe3ea', 1); // teller screens
    } else box(u0 + 0.5, u1 - 0.5, cv - 0.35, cv + 0.35, 0, 1.05, counterCol);
    box(u0 + 0.45, u1 - 0.45, cv - 0.4, cv + 0.4, 1.05, 1.11, style === 'cafe' || style === 'bakery' ? '#e8e1d4' : '#2b2f33');
  }
  // a feature wall behind the counter in the brand colour (or a tone of the room)
  if (main) box(u0 + 0.05, u1 - 0.05, D - 0.06, D - 0.03, 1.2, 2.15, main);
  const backWall = (fn) => { for (let u = u0 + 0.4; u < u1 - 0.6; u += 0.9) fn(u, Math.min(u + 0.8, u1 - 0.3)); };
  const shelfUnit = (a, b, v0, v1, h, palette, levels = 4) => { // a gondola: frame, shelves, and stock on every level, both faces
    block(a, b, v0, v1, 0, 0.12, '#9aa0a4');
    box(a, b, (v0 + v1) / 2 - 0.03, (v0 + v1) / 2 + 0.03, 0.12, h, '#c9c4b8');
    for (let k = 0; k < levels; k++) {
      const y = 0.15 + (k / levels) * (h - 0.25);
      for (const [p, q] of [[v0, (v0 + v1) / 2 - 0.04], [(v0 + v1) / 2 + 0.04, v1]]) {
        box(a, b, p, q, y, y + 0.03, '#e2e0da');
        for (let u = a + 0.04; u < b - 0.12; u += 0.28 + r() * 0.3) box(u, Math.min(b - 0.04, u + 0.22 + r() * 0.25), p + 0.03, q - 0.03, y + 0.03, y + 0.16 + r() * 0.16, pick(palette));
      }
    }
    if (main) box(a - 0.02, a + 0.02, v0, v1, 0.12, h + 0.25, main); // end cap in the chain's colour
  };
  const fridges = (a, b, v, h = 2.1) => { // glass-door fridges: lit inside, stock on every shelf
    box(a, b, v - 0.7, v, 0, h + 0.2, '#e8ebee');
    box(a, b, v - 0.72, v - 0.66, 0.15, h, '#cfe6f2', 1.5);
    for (let y = 0.3; y < h - 0.1; y += 0.42) for (let u = a + 0.05; u < b - 0.1; u += 0.13) box(u, u + 0.08, v - 0.62, v - 0.4, y, y + 0.24, pick(PRODUCT));
    for (let u = a; u <= b; u += 0.75) box(u - 0.025, u + 0.025, v - 0.74, v - 0.68, 0.15, h, '#9aa2a6');
    if (solid) solid(a, b, v - 0.7, v, h);
  };
  const table = (u, v, round = false, c = '#e8e1d4') => { box(u - 0.4, u + 0.4, v - 0.4, v + 0.4, 0.72, 0.76, c); box(u - 0.04, u + 0.04, v - 0.04, v + 0.04, 0, 0.72, '#3a3d40'); if (solid) solid(u - 0.35, u + 0.35, v - 0.35, v + 0.35, 0.76); void round; };
  const chair = (u, v, c = '#3a3d40') => { box(u - 0.2, u + 0.2, v - 0.2, v + 0.2, 0.44, 0.48, c); box(u - 0.2, u + 0.2, v + 0.16, v + 0.2, 0.48, 0.9, c); for (const [p, q] of [[-0.17, -0.17], [0.15, -0.17], [-0.17, 0.15], [0.15, 0.15]]) box(u + p, u + p + 0.03, v + q, v + q + 0.03, 0, 0.44, '#2a2a2a'); };
  const stool = (u, v, c = '#2a2a2a') => { box(u - 0.17, u + 0.17, v - 0.17, v + 0.17, 0.72, 0.77, c); box(u - 0.03, u + 0.03, v - 0.03, v + 0.03, 0, 0.72, '#9aa2a6'); };
  const plant = (u, v) => { box(u - 0.22, u + 0.22, v - 0.22, v + 0.22, 0, 0.42, '#d8cfc0'); box(u - 0.3, u + 0.3, v - 0.3, v + 0.3, 0.42, 1.2, '#3f7d3a'); };
  const pendant = (u, v, c = '#fff2d6') => { box(u - 0.01, u + 0.01, v - 0.01, v + 0.01, 2.6, 3.5, '#2a2a2a'); box(u - 0.16, u + 0.16, v - 0.16, v + 0.16, 2.45, 2.6, c, 2.2); };
  const screen = (u, v, w, y0, h, c) => { box(u - w / 2 - 0.04, u + w / 2 + 0.04, v - 0.06, v, y0 - 0.04, y0 + h + 0.04, '#111111'); box(u - w / 2, u + w / 2, v - 0.075, v - 0.06, y0, y0 + h, c, 1.6); };
  const rack = (u, v0, v1, palette = CLOTH) => { // a clothes rail with garments hanging side by side
    box(u - 0.02, u + 0.02, v0, v1, 1.5, 1.54, '#9aa2a6'); for (const v of [v0, v1]) box(u - 0.02, u + 0.02, v - 0.02, v + 0.02, 0, 1.54, '#9aa2a6');
    for (let v = v0 + 0.08; v < v1 - 0.08; v += 0.09) box(u - 0.24, u + 0.24, v, v + 0.05, 0.7 + r() * 0.15, 1.48, pick(palette));
    if (solid) solid(u - 0.25, u + 0.25, v0, v1, 1.5);
  };
  const mannequin = (u, v, c) => { box(u - 0.2, u + 0.2, v - 0.04, v + 0.04, 0, 0.04, '#9aa2a6'); box(u - 0.03, u + 0.03, v - 0.03, v + 0.03, 0.04, 0.8, '#9aa2a6'); box(u - 0.2, u + 0.2, v - 0.12, v + 0.12, 0.8, 1.5, c); box(u - 0.1, u + 0.1, v - 0.1, v + 0.1, 1.5, 1.75, '#e8e2dc'); };
  const glassCase = (a, b, v0, v1, items) => { block(a, b, v0, v1, 0, 0.8, '#f4f4f2'); box(a + 0.03, b - 0.03, v0 + 0.03, v1 - 0.03, 0.8, 1.05, '#dff3fb', 1.25); for (let u = a + 0.1; u < b - 0.1; u += 0.18) box(u, u + 0.08, v0 + 0.15, v1 - 0.15, 0.8, 0.86, pick(items), 1.4); };

  switch (style) {
    case 'supermarket': {
      for (let u = u0 + 0.5; u < u1 - 1.6; u += 2.3) { // aisles running back from the front, a clear middle aisle
        if (walk(u + 0.45)) continue;
        shelfUnit(u, u + 0.9, front + 1.6, back - 0.4, 1.9, PRODUCT, 5);
      }
      for (let u = u0 + 0.6; u < uc - 1.3; u += 1.1) box(u, u + 0.9, front, front + 0.9, 0, 0.75, pick(['#9bd14b', '#e23b2a', '#f2c230', '#ff8a2a', '#2ac28a'])); // fruit and veg
      backWall((a, b) => { if (b - a > 0.5) fridges(a, b, D - 0.05); });
      for (let u = uc + 1.3; u < u1 - 1.2; u += 1.8) { block(u, u + 0.5, front + 0.2, front + 1.3, 0, 0.9, '#2b2f33'); box(u, u + 0.5, front + 0.2, front + 1.3, 0.9, 0.93, '#1d1d1d'); box(u + 0.6, u + 0.9, front + 0.9, front + 1.2, 0.9, 1.35, main || '#2a7de2'); } // checkouts
      break;
    }
    case 'servo': {
      for (let u = u0 + 0.6; u < u1 - 1.4; u += 2.1) if (!walk(u + 0.4) && room > 2.2) shelfUnit(u, u + 0.8, front + 0.3, back - 0.2, 1.45, PRODUCT, 4);
      if (room > 1) fridges(u0 + 0.05, u0 + 0.75, back + 0.3, 2.0); // a drinks fridge by the counter
      backWall((a, b) => box(a, b, D - 0.4, D - 0.05, 0.9, 2.3, '#3a3d40')); // smokes cabinet behind the counter
      box(u1 - 1.4, u1 - 0.8, cv - 0.3, cv + 0.1, 1.11, 1.7, '#c9ced2'); box(u1 - 1.35, u1 - 0.85, cv - 0.32, cv - 0.28, 1.25, 1.6, '#e23b2a', 1.3); // slushie machine
      box(u0 + 0.8, u0 + 1.3, cv - 0.2, cv + 0.2, 1.11, 1.55, '#2b2f33'); // coffee machine
      break;
    }
    case 'bottle': {
      for (const s of [0, 1]) { const a = s ? u1 - 0.55 : u0 + 0.05, b = s ? u1 - 0.05 : u0 + 0.55; block(a, b, front, back, 0, 2.2, '#6b4a32'); for (let y = 0.25; y < 2.1; y += 0.36) for (let v = front + 0.05; v < back - 0.05; v += 0.11) box(s ? a - 0.02 : b - 0.25, s ? a + 0.23 : b + 0.02, v, v + 0.07, y, y + 0.3, pick(BOTTLES)); }
      for (let u = u0 + 1.2; u < u1 - 1.6; u += 2.2) if (!walk(u + 0.5) && room > 2) { block(u, u + 1.0, front + 0.6, front + 1.6, 0, 0.9, '#c9a24a'); for (let k = 0; k < 4; k++) box(u + k * 0.25, u + k * 0.25 + 0.22, front + 0.6, front + 1.6, 0.9, 1.15, pick(['#1f4fb3', '#e23b2a', '#f2c230', '#2ac28a'])); } // beer slabs
      backWall((a, b) => fridges(a, b, D - 0.05, 2.0));
      break;
    }
    case 'vape': case 'adult': {
      glassCase(u0 + 0.5, u1 - 0.5, cv - 0.35, cv + 0.35, ['#35c6cf', '#e85a9a', '#f2c230', '#7a3e9a']);
      backWall((a, b) => { for (let y = 1.0; y < 2.4; y += 0.32) box(a, b, D - 0.3, D - 0.05, y, y + 0.03, '#9aa2a6'); for (let y = 1.05; y < 2.4; y += 0.32) for (let u = a + 0.05; u < b - 0.1; u += 0.14) box(u, u + 0.1, D - 0.28, D - 0.12, y, y + 0.2, style === 'vape' ? pick(['#35c6cf', '#e85a9a', '#f2c230', '#9bd14b', '#ff8a2a']) : pick(['#3a3a44', '#6b4a5a', '#8a8a96'])); });
      box(u0 + 0.05, u1 - 0.05, D - 0.05, D - 0.02, 2.6, 2.66, style === 'vape' ? '#35c6cf' : '#e85a9a', 2.4); // LED strip
      if (style === 'adult') box(u1 - 1.6, u1 - 0.3, D - 0.04, D - 0.01, 0, 2.4, '#5a1f2a'); // a curtain to the back room
      break;
    }
    case 'pharmacy': {
      for (let u = u0 + 0.5; u < u1 - 1.2; u += 1.9) if (!walk(u + 0.4) && room > 2) shelfUnit(u, u + 0.8, front + 0.4, back - 0.2, 1.6, ['#ffffff', '#e5007e', '#2a7de2', '#2ac28a', '#f2c230', '#f07ac0'], 5);
      backWall((a, b) => { box(a, b, D - 0.35, D - 0.05, 0, 2.3, '#f4f4f2'); for (let y = 0.4; y < 2.2; y += 0.3) for (let u = a + 0.05; u < b - 0.08; u += 0.1) box(u, u + 0.07, D - 0.33, D - 0.2, y, y + 0.14, pick(['#ffffff', '#e8eef0', '#2a7de2', '#2ac28a'])); }); // the dispensary
      box(uc - 1.2, uc + 1.2, D - 0.04, D - 0.01, 2.35, 2.75, main || '#2f9a5b', 1.3); // PRESCRIPTIONS sign
      break;
    }
    case 'fastfood': {
      for (let u = u0 + 0.8; u < u1 - 0.6; u += 1.2) screen(u + 0.3, D - 0.05, 1.05, 2.0, 0.6, pick(['#ffd28a', '#ffb070', '#ffe6b0'])); // lit menu boards
      backWall((a, b) => box(a, b, D - 0.8, D - 0.1, 0, 1.0, '#c9ced2')); // kitchen benches
      box(u0 + 0.7, u0 + 1.5, D - 0.8, D - 0.1, 1.0, 1.9, '#9aa2a6'); // fryers and hoods
      if (room > 1.6) for (let u = u0 + 0.9; u < u1 - 0.9; u += 2.4) if (!walk(u)) { table(u, front + 0.9, false, main || '#e8e1d4'); chair(u - 0.6, front + 0.9, acc || '#3a3d40'); chair(u + 0.6, front + 0.9, acc || '#3a3d40'); }
      if (room > 1) { box(u1 - 0.9, u1 - 0.3, back + 0.1, back + 0.4, 0, 1.8, '#1d1d1d'); box(u1 - 0.85, u1 - 0.35, back + 0.08, back + 0.1, 0.9, 1.7, '#cfe8ff', 1.6); } // order kiosk
      break;
    }
    case 'cafe': case 'bakery': case 'icecream': {
      // the display cabinet in the counter: cakes and pastries, bread, or tubs of gelato
      const goods = style === 'bakery' ? ['#c98a3a', '#a86a2a', '#e0b070', '#8a5a2a'] : style === 'icecream' ? ['#f07ac0', '#9bd14b', '#f2c230', '#ffffff', '#6b3a2a', '#ff8a2a'] : ['#f07ac0', '#c98a3a', '#ffffff', '#6b3a2a', '#9bd14b'];
      box(uc - 1.4, uc + 1.4, cv - 0.38, cv + 0.05, 1.11, 1.5, '#dff3fb', 1.3);
      for (let u = uc - 1.3; u < uc + 1.3; u += 0.24) box(u, u + 0.18, cv - 0.3, cv - 0.05, 1.12, 1.24, pick(goods), 1.2);
      if (style === 'cafe') { box(u1 - 1.6, u1 - 0.8, cv - 0.1, cv + 0.3, 1.11, 1.55, '#c9ced2'); box(u1 - 1.55, u1 - 0.85, cv - 0.12, cv - 0.1, 1.3, 1.5, '#1d1d1d'); } // espresso machine
      if (style === 'bakery') backWall((a, b) => { for (let y = 0.9; y < 2.2; y += 0.35) { box(a, b, D - 0.4, D - 0.05, y, y + 0.03, '#8a6a4a'); for (let u = a + 0.05; u < b - 0.15; u += 0.22) box(u, u + 0.18, D - 0.35, D - 0.1, y + 0.03, y + 0.15, pick(goods)); } });
      if (room > 1.4) for (let u = u0 + 0.9; u < u1 - 0.8; u += 1.9) for (let v = front + 0.4; v < back - 0.5; v += 1.8) if (!walk(u)) { table(u, v, true, style === 'icecream' ? '#ffffff' : '#c9a77c'); chair(u - 0.55, v); chair(u + 0.55, v); }
      for (let u = u0 + 1; u < u1 - 0.8; u += 1.8) pendant(u, (front + back) / 2);
      if (room > 1) { plant(u0 + 0.4, front + 0.2); plant(u1 - 0.4, front + 0.2); }
      break;
    }
    case 'sushi': case 'pizza': case 'restaurant': {
      if (style === 'sushi') { box(u0 + 0.5, u1 - 0.5, cv - 0.6, cv - 0.38, 0.9, 1.0, '#9aa2a6'); for (let u = u0 + 0.6; u < u1 - 0.6; u += 0.35) box(u, u + 0.2, cv - 0.58, cv - 0.4, 1.0, 1.06, pick(['#e23b2a', '#2a7de2', '#f2c230', '#2ac28a'])); for (let u = u0 + 0.7; u < u1 - 0.7; u += 0.7) stool(u, cv - 1.0); } // sushi train
      if (style === 'pizza') { box(u0 + 0.6, u0 + 2.0, D - 1.3, D - 0.05, 0, 1.8, '#9c5a3c'); box(u0 + 0.95, u0 + 1.65, D - 1.32, D - 1.3, 0.8, 1.2, '#ff7a1a', 2.4); } // wood-fired oven
      if (room > 1.4) for (let u = u0 + 0.9; u < u1 - 0.8; u += 2.0) for (let v = front + 0.4; v < back - (style === 'sushi' ? 1.4 : 0.4); v += 1.9) if (!walk(u)) { table(u, v, false, style === 'pizza' ? '#c43a2a' : '#6b4a32'); chair(u, v - 0.6); chair(u, v + 0.6); }
      for (let u = u0 + 1; u < u1 - 0.8; u += 1.8) pendant(u, (front + back) / 2, '#ffd8a0');
      backWall((a, b) => box(a, b, D - 0.6, D - 0.1, 0, 0.95, '#c9ced2'));
      break;
    }
    case 'bar': case 'club': case 'stripclub': {
      backWall((a, b) => { for (const y of [1.2, 1.6, 2.0]) { box(a, b, D - 0.3, D - 0.05, y, y + 0.03, '#5a3a26', 1.2); for (let u = a + 0.05; u < b - 0.08; u += 0.12) box(u, u + 0.07, D - 0.25, D - 0.12, y + 0.03, y + 0.32, pick(BOTTLES), 1.15); } });
      for (let u = u0 + 1; u < u1 - 0.8; u += 0.9) { stool(u, cv - 0.75); box(u + 0.3, u + 0.36, cv - 0.1, cv - 0.04, 1.11, 1.45, '#c9a24a'); } // stools and beer taps
      if (style === 'club' || style === 'stripclub') {
        for (let u = u0 + 0.6; u < u1 - 0.6; u += 1) for (let v = front + 0.2; v < back - 0.4; v += 1) if (!walk(u + 0.5) || style === 'club') box(u, u + 0.96, v, v + 0.96, 0, 0.02, pick(['#ff4fd8', '#35c6cf', '#7a3e9a', '#2a7de2', '#f2c230']), 1.8); // lit dance floor
        box(u0 + 0.05, u1 - 0.05, 0.02, 0.05, 3.0, 3.08, '#ff4fd8', 2.6);
      } else if (room > 2.4 && W > 5) { block(u0 + 0.6, u0 + 2.6, front + 0.4, front + 1.5, 0, 0.8, '#3a2a1a'); box(u0 + 0.65, u0 + 2.55, front + 0.45, front + 1.45, 0.8, 0.83, '#1f6b3a'); } // pool table
      screen(u1 - 1.2, D - 0.05, 1.3, 2.3, 0.75, '#5aa0ff');
      box(u0 + 0.05, u1 - 0.05, D - 0.05, D - 0.02, 3.0, 3.08, style === 'bar' ? '#ffb000' : '#35c6cf', 2.4); // neon strip
      break;
    }
    case 'bank': {
      for (let u = u0 + 1; u < uc - 1.2; u += 0.9) box(u - 0.03, u + 0.03, front + 1.2, front + 1.26, 0, 0.95, '#9aa2a6'); // queue posts
      box(u0 + 1, uc - 1.2, front + 1.21, front + 1.25, 0.88, 0.94, main || '#1f2a6b');
      if (room > 1) for (let u = uc + 1.4; u < u1 - 0.8; u += 1.0) { block(u, u + 0.7, front - 0.5 + 0.05, front + 0.1, 0, 1.75, '#c9ced2'); screen(u + 0.35, front + 0.11, 0.35, 1.1, 0.3, '#5aa0ff'); } // ATMs
      box(u0 + W / 2 - 0.9, u0 + W / 2 + 0.9, D - 0.08, D - 0.02, 0.4, 2.2, '#9aa2a6'); // vault door
      plant(u0 + 0.4, front + 0.2);
      break;
    }
    case 'electronics': {
      backWall((a, b) => screen((a + b) / 2, D - 0.05, b - a - 0.1, 1.2, 0.5, pick(['#5aa0ff', '#ff6b6b', '#7bd88f', '#ffd166', '#c3a6ff']))); // TV wall
      for (let u = u0 + 0.8; u < u1 - 1.2; u += 2.2) if (!walk(u + 0.6) && room > 1.8) { block(u, u + 1.2, front + 0.5, front + 1.3, 0, 0.9, main || '#f4f4f2'); for (let k = 0; k < 3; k++) screen(u + 0.2 + k * 0.4, front + 0.9, 0.3, 0.92, 0.2, pick(['#5aa0ff', '#ffffff', '#7bd88f'])); }
      for (const s of [0, 1]) { const a = s ? u1 - 0.45 : u0 + 0.05; box(a, a + 0.4, front, back, 0, 2.0, '#2b2f33'); for (let y = 0.3; y < 1.9; y += 0.32) for (let v = front + 0.05; v < back - 0.05; v += 0.16) box(a + (s ? -0.02 : 0.25), a + (s ? 0.15 : 0.42), v, v + 0.12, y, y + 0.2, pick(PRODUCT)); }
      break;
    }
    case 'hardware': case 'department': case 'shop': case 'books': {
      const pal = style === 'books' ? ['#c43a2a', '#2a7de2', '#f2c230', '#2ac28a', '#ffffff', '#7a3e9a'] : style === 'hardware' ? ['#e5332a', '#f2c230', '#2a7de2', '#9aa2a6', '#c98a3a'] : PRODUCT;
      const h = style === 'hardware' ? 2.6 : 1.7;
      for (let u = u0 + 0.5; u < u1 - 1.2; u += 2.0) if (!walk(u + 0.45) && room > 2) shelfUnit(u, u + 0.85, front + 0.5, back - 0.2, h, pal, style === 'hardware' ? 5 : 4);
      for (const s of [0, 1]) { const a = s ? u1 - 0.45 : u0 + 0.05; box(a, a + 0.4, front, back, 0, 2.1, '#c9c4b8'); for (let y = 0.3; y < 2.0; y += 0.34) for (let v = front + 0.05; v < back - 0.05; v += 0.2) box(a + (s ? -0.02 : 0.25), a + (s ? 0.15 : 0.42), v, v + 0.15, y, y + 0.22, pick(pal)); }
      if (style === 'department') for (let u = uc + 1.4; u < u1 - 1; u += 1.4) rack(u, front + 0.3, Math.min(back, front + 2.4));
      break;
    }
    case 'clothes': case 'shoes': {
      if (style === 'clothes') {
        for (const s of [0, 1]) rack(s ? u1 - 0.4 : u0 + 0.4, front, back);
        for (let u = u0 + 1.5; u < u1 - 1.5; u += 1.6) if (!walk(u)) rack(u, front + 0.6, Math.min(back - 0.3, front + 2.2));
        if (room > 1) { mannequin(uc - 1.6, front + 0.1, pick(CLOTH)); mannequin(uc + 1.6, front + 0.1, pick(CLOTH)); }
        box(u1 - 1.8, u1 - 0.3, D - 1.3, D - 0.05, 0, 2.2, '#d8cfc0'); box(u1 - 1.75, u1 - 0.35, D - 1.32, D - 1.3, 0, 2.0, '#5a3a4a'); // change room
      } else {
        for (const s of [0, 1]) { const a = s ? u1 - 0.4 : u0 + 0.05; box(a, a + 0.35, front, back, 0, 2.2, '#f4f4f2'); for (let y = 0.4; y < 2.1; y += 0.3) { box(a, a + 0.35, front, back, y, y + 0.02, '#c9c4b8'); for (let v = front + 0.1; v < back - 0.2; v += 0.36) box(a + 0.04, a + 0.31, v, v + 0.28, y + 0.02, y + 0.13, pick(CLOTH)); } }
        for (let u = u0 + 1.6; u < u1 - 1.6; u += 2.2) if (!walk(u + 0.6)) block(u, u + 1.2, front + 0.8, front + 1.2, 0, 0.45, '#5a6670'); // try-on benches
      }
      box(u0 + 0.05, u0 + 0.08, front + 0.3, back, 0.4, 2.0, '#dfeff5', 1.15); // mirror
      break;
    }
    case 'salon': {
      for (let u = u0 + 0.8; u < u1 - 0.6; u += 1.5) { if (walk(u)) continue; box(u - 0.6, u + 0.6, back + 0.15, back + 0.2, 0.9, 2.0, '#dfeff5', 1.2); box(u - 0.25, u + 0.25, back - 0.6, back - 0.1, 0, 0.5, '#1d1d1d'); box(u - 0.28, u + 0.28, back - 0.65, back - 0.1, 0.5, 0.6, '#3a3a44'); box(u - 0.28, u + 0.28, back - 0.15, back - 0.08, 0.6, 1.2, '#3a3a44'); } // chairs at mirrors
      if (room > 1.2) for (let u = u0 + 0.6; u < uc - 1.2; u += 0.65) chair(u, front + 0.35, '#c9a77c'); // waiting chairs
      break;
    }
    case 'jewellery': {
      for (const s of [0, 1]) glassCase(s ? u1 - 1.0 : u0 + 0.1, s ? u1 - 0.1 : u0 + 1.0, front + 0.2, back - 0.2, ['#ffd700', '#ffffff', '#c0c0c0', '#e85a9a', '#5aa0ff']);
      glassCase(u0 + 0.6, u1 - 0.6, cv - 0.35, cv + 0.35, ['#ffd700', '#ffffff', '#c0c0c0']);
      for (let u = u0 + 1; u < u1 - 0.8; u += 1.6) pendant(u, (front + back) / 2, '#ffffff');
      break;
    }
    case 'florist': {
      for (let u = u0 + 0.5; u < u1 - 0.5; u += 0.55) if (!walk(u)) for (const v of [front + 0.2, back - 0.3]) { box(u, u + 0.4, v, v + 0.4, 0, 0.45, '#9aa2a6'); box(u - 0.05, u + 0.45, v - 0.05, v + 0.45, 0.45, 0.85, pick(['#e23b2a', '#f07ac0', '#ffffff', '#f2c230', '#7a3e9a', '#ff8a2a'])); }
      break;
    }
    case 'butcher': {
      box(u0 + 0.5, u1 - 0.5, cv - 0.38, cv + 0.05, 1.11, 1.45, '#dff3fb', 1.3);
      for (let u = u0 + 0.6; u < u1 - 0.6; u += 0.3) box(u, u + 0.24, cv - 0.3, cv - 0.05, 1.12, 1.2, pick(['#b8322a', '#d9524a', '#8a2a22', '#e8b0a0']), 1.2);
      backWall((a, b) => box(a, b, D - 0.6, D - 0.05, 0, 0.95, '#c9ced2'));
      break;
    }
    case 'gym': {
      for (let u = u0 + 0.6; u < u1 - 1; u += 1.2) if (!walk(u + 0.4) && room > 2.2) { block(u, u + 0.75, front + 0.3, front + 2.0, 0, 0.25, '#1d1d1d'); box(u, u + 0.75, front + 1.8, front + 2.0, 0.25, 1.3, '#2b2e33'); screen(u + 0.37, front + 1.79, 0.4, 1.0, 0.25, '#5aa0ff'); } // treadmills
      backWall((a, b) => { box(a, b, D - 0.5, D - 0.05, 0, 0.12, '#2b2e33'); for (let u = a + 0.1; u < b - 0.1; u += 0.25) box(u, u + 0.12, D - 0.4, D - 0.15, 0.12, 0.3, '#1d1d1d'); }); // dumbbell racks
      box(u0 + 0.05, u1 - 0.05, D - 0.04, D - 0.01, 0.6, 2.4, '#dfeff5', 1.15); // mirror wall
      break;
    }
    case 'hotel': case 'office': {
      if (room > 1.6) { block(u0 + 0.6, u0 + 2.4, front + 0.3, front + 1.1, 0, 0.45, '#4a5a6a'); box(u0 + 0.6, u0 + 2.4, front + 0.9, front + 1.1, 0.45, 0.85, '#4a5a6a'); plant(u0 + 2.8, front + 0.4); }
      if (style === 'office') for (let u = uc + 1.2; u < u1 - 0.8; u += 1.8) { block(u, u + 1.2, back - 0.9, back - 0.2, 0, 0.74, '#d8cfc0'); screen(u + 0.6, back - 0.6, 0.5, 0.78, 0.3, '#cfe8ff'); chair(u + 0.6, back - 1.1); }
      box(uc - 1.0, uc + 1.0, D - 0.04, D - 0.01, 1.4, 2.3, main || '#8a6a4a');
      break;
    }
    default: furnishSpecial(B, sh, P); break; // arcades, Ripley's, fun parks keep their own fit-out
  }
  // ceiling lights on every fit-out
  for (let u = u0 + 1; u < u1 - 0.6; u += 2.2) for (let v = Math.min(2, D * 0.3); v < D - 0.8; v += 3.2) box(u, u + 1.2, v, v + 0.5, 3.44, 3.47, '#ffffff', style === 'club' || style === 'bar' || style === 'stripclub' ? 0.6 : 2.2);
}

// ---------------------------------------------------------------- shoppers browsing (street walk-in shops near you)
const SHOPPERS_BY_STYLE = { supermarket: 4, servo: 2, bottle: 2, pharmacy: 2, fastfood: 3, cafe: 3, bakery: 2, icecream: 2, sushi: 3, pizza: 3, restaurant: 3, bar: 3, club: 4, clothes: 2, shoes: 1, department: 3, electronics: 2, hardware: 2, books: 1, salon: 2, jewellery: 1, gym: 2, shop: 1 };
function updateShoppers(dt) {
  for (const sh of SHOPS) {
    if (!sh.walkIn) continue;
    if (!sh.keeper) { if (sh.shoppers) { for (const c of sh.shoppers) disposePerson(c.m); sh.shoppers = null; } continue; }
    if (!sh.shoppers) {
      sh.shoppers = []; const want = Math.floor((SHOPPERS_BY_STYLE[shopStyle(sh)] || 0) * (0.5 + rand() * 0.8));
      const room = sh.counterV - 1.7; if (room < 0.8) continue;
      for (let k = 0; k < want; k++) { const m = makePerson(); scene.add(m.root); sh.shoppers.push({ m, u: rr(sh.t0 + 0.6, sh.t1 - 0.6), v: rr(0.9, sh.counterV - 0.8), tu: 0, tv: 0, idle: rr(0, 4), ph: rand() * TAU }); }
    }
    const P = roomFrame(sh), scared = elapsed - sh.robbedAt < 12 || sh.robT > 0;
    for (const c of sh.shoppers) {
      const M = c.m; animatePerson(M, c.ph, 0);
      if (scared) { M.armL.rotation.x = M.armR.rotation.x = -3.0; c.idle = 3; } // hands up
      else if (c.idle > 0) { c.idle -= dt; if (c.idle <= 0) { c.tu = rr(sh.t0 + 0.6, sh.t1 - 0.6); c.tv = rr(0.9, sh.counterV - 0.8); } }
      else {
        const du = c.tu - c.u, dv = c.tv - c.v, d = Math.hypot(du, dv);
        if (d < 0.15) c.idle = rr(2, 7);
        else {
          const nu = c.u + du / d * 0.8 * dt, nv = c.v + dv / d * 0.8 * dt, [nx, , nz] = P(nu, nv, 0);
          if (resolveCircle(nx, nz, 0.28)) { c.idle = rr(0.5, 2); continue; } // a shelf in the way: stop, then try somewhere else
          c.u = nu; c.v = nv; c.ph += dt * 2.6; animatePerson(M, c.ph, 0.6); c.h = Math.atan2(du * sh.ex + dv * sh.ix, du * sh.ez + dv * sh.iz);
        }
      }
      const [x, , z] = P(c.u, c.v, 0); M.root.position.set(x, groundAt(x, z), z); if (c.h !== undefined) M.root.rotation.y = c.h;
    }
  }
}
