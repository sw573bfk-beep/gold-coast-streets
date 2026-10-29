"""Build the location registry and the completion audit for the streamed map.

Run after tools/build_tiles.py:  python3 tools/build_registry.py
Inputs:  data/region/osm_*.json (OpenStreetMap), data/sources/qld_schools.csv (Queensland Government
         "State and non-state school details", CC BY 4.0), dist/tiles/*.json (what the game actually builds)
Outputs: data/locations.json         one record per significant place, with sources, verification and game status
         reports/completion_audit.md  the totals, separating real-world verification from what is playable
         dist/tiles/region.json       verified schools missing from OpenStreetMap are added to the map search
Nothing is invented: a place is "verified" only when an official source confirms it; OpenStreetMap-only places stay
"mapped (OSM)" with medium confidence, and anything that can't be matched is listed for research.
"""
import sys, csv, datetime, glob, json, math, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TODAY = datetime.date.today().isoformat()
LAT0, LON0 = (-28.013 + -27.986) / 2, (153.411 + 153.436) / 2
KX = math.cos(math.radians(LAT0)) * 111320.0; KZ = 110574.0
def proj(lat, lon): return (round((lon - LON0) * KX, 1), round((LAT0 - lat) * KZ, 1))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from region_bounds import S, W, N, E  # the extended map
CORE = json.load(open(os.path.join(ROOT, 'data', 'map.json')))['bounds']
in_core = lambda x, z: CORE[0] <= x <= CORE[2] and CORE[1] <= z <= CORE[3]

# ---------------------------------------------------------------- OpenStreetMap places
els = {}
for p in sorted(glob.glob(os.path.join(ROOT, 'data', 'region', 'osm_*.json')) + glob.glob(os.path.join(ROOT, 'data', 'region', 'osmx_*.json'))):
    for e in json.load(open(p))['elements']: els[(e['type'], e['id'])] = e
def center(e):
    if e['type'] == 'node': return e['lat'], e['lon']
    g = [q for q in e.get('geometry', []) if q] or [q for m in e.get('members', []) for q in m.get('geometry', []) if q]
    return (sum(q['lat'] for q in g) / len(g), sum(q['lon'] for q in g) / len(g)) if g else None
CATS = [  # (category, subcategory, test)
    ('education', 'school', lambda t: t.get('amenity') == 'school'), ('education', 'kindergarten', lambda t: t.get('amenity') in ('kindergarten', 'childcare')),
    ('education', 'college/university', lambda t: t.get('amenity') in ('college', 'university')),
    ('health', 'hospital', lambda t: t.get('amenity') == 'hospital'), ('health', 'clinic', lambda t: t.get('amenity') in ('clinic', 'doctors', 'dentist')),
    ('health', 'pharmacy', lambda t: t.get('amenity') == 'pharmacy' or t.get('shop') == 'chemist'),
    ('emergency', 'police', lambda t: t.get('amenity') == 'police'), ('emergency', 'fire station', lambda t: t.get('amenity') == 'fire_station'),
    ('emergency', 'ambulance', lambda t: t.get('emergency') == 'ambulance_station'),
    ('retail', 'shopping centre', lambda t: t.get('shop') == 'mall'), ('retail', 'supermarket', lambda t: t.get('shop') == 'supermarket'),
    ('retail', 'department store', lambda t: t.get('shop') == 'department_store'),
    ('food', 'cafe', lambda t: t.get('amenity') == 'cafe'), ('food', 'bakery', lambda t: t.get('shop') == 'bakery'),
    ('food', 'restaurant', lambda t: t.get('amenity') == 'restaurant'), ('food', 'fast food', lambda t: t.get('amenity') == 'fast_food'),
    ('food', 'pub/bar', lambda t: t.get('amenity') in ('pub', 'bar', 'nightclub')), ('food', 'food court', lambda t: t.get('amenity') == 'food_court'),
    ('retail', 'shop', lambda t: bool(t.get('shop'))),
    ('sport', 'stadium', lambda t: t.get('leisure') == 'stadium'), ('sport', 'sports centre', lambda t: t.get('leisure') in ('sports_centre', 'fitness_centre')),
    ('sport', 'pitch/court', lambda t: t.get('leisure') == 'pitch' and bool(t.get('name'))), ('sport', 'golf course', lambda t: t.get('leisure') == 'golf_course'),
    ('sport', 'swimming pool', lambda t: t.get('leisure') == 'swimming_pool' and bool(t.get('name'))), ('sport', 'skate park', lambda t: t.get('sport') == 'skateboard'),
    ('entertainment', 'cinema', lambda t: t.get('amenity') == 'cinema'), ('entertainment', 'attraction', lambda t: t.get('tourism') in ('attraction', 'museum', 'theme_park', 'zoo', 'viewpoint', 'gallery')),
    ('entertainment', 'hotel', lambda t: t.get('tourism') in ('hotel', 'motel', 'resort', 'apartment')),
    ('entertainment', 'venue', lambda t: t.get('amenity') in ('theatre', 'arts_centre', 'events_venue', 'casino')),
    ('transport', 'station', lambda t: t.get('railway') in ('station', 'tram_stop') or t.get('public_transport') == 'station'),
    ('transport', 'bus interchange', lambda t: t.get('amenity') == 'bus_station'),
    ('nature', 'park', lambda t: t.get('leisure') in ('park', 'garden', 'nature_reserve') and bool(t.get('name'))),
    ('nature', 'playground', lambda t: t.get('leisure') == 'playground'), ('nature', 'beach', lambda t: t.get('natural') == 'beach'),
    ('civic', 'library', lambda t: t.get('amenity') == 'library'), ('civic', 'community centre', lambda t: t.get('amenity') in ('community_centre', 'townhall', 'courthouse', 'post_office')),
]
records, by_name = [], {}
for e in els.values():
    t = e.get('tags', {}); nm = t.get('name')
    if not nm: continue
    cat = next(((c, s) for c, s, f in CATS if f(t)), None)
    if not cat: continue
    c = center(e)
    if not c or not (S <= c[0] <= N and W <= c[1] <= E): continue
    x, z = proj(*c)
    addr = ' '.join(v for v in (t.get('addr:housenumber'), t.get('addr:street'), t.get('addr:suburb') or t.get('addr:city')) if v) or None
    rid = 'osm-%s-%s' % (e['type'], e['id'])
    rec = dict(id=rid, name=nm, alt=[v for k, v in t.items() if k in ('alt_name', 'old_name', 'short_name', 'official_name')], category=cat[0], subcategory=cat[1],
               address=addr, lat=round(c[0], 6), lon=round(c[1], 6), x=x, z=z, sources=['https://www.openstreetmap.org/%s/%s' % (e['type'], e['id'])],
               checked=TODAY, verification='mapped (OSM)', confidence='medium', status=[], gameplay=[], inaccuracies=[])
    records.append(rec); by_name.setdefault(re.sub(r'[^a-z0-9]', '', nm.lower()), []).append(rec)

# ---------------------------------------------------------------- official school list: verify, match, and add what OSM lacks
def norm(s): return re.sub(r'\b(the|state|school|college|campus|primary|secondary|high|of|and)\b', '', re.sub(r'\(.*?\)', '', s.lower())).replace(' ', '')
official = []
src = os.path.join(ROOT, 'data', 'sources', 'qld_schools.csv')
if os.path.exists(src):
    for row in csv.DictReader(open(src, encoding='utf-8-sig', errors='replace')):
        try: lat, lon = float(row['Latitude']), float(row['Longitude'])
        except ValueError: continue
        if row['Centre Status'] != 'Open' or not (S <= lat <= N and W <= lon <= E): continue
        official.append(row)
osm_schools = [r for r in records if r['category'] == 'education']
n_match = n_added = 0
missing = []
for row in official:
    lat, lon = float(row['Latitude']), float(row['Longitude']); x, z = proj(lat, lon); key = norm(row['Centre Name'])
    best, bd = None, 600
    for r in osm_schools:
        d = math.hypot(r['x'] - x, r['z'] - z)
        if d < bd and (norm(r['name']) and (norm(r['name']) in key or key in norm(r['name']))): best, bd = r, d
    years = '%s to %s' % (row['Official Low Year Level'], row['Official High Year Level'])
    sector = row['Sector'] + (' (' + row['Non-State Sector'] + ')' if row['Non-State Sector'] else '')
    official_src = 'https://www.data.qld.gov.au/dataset/state-and-non-state-school-details (centre %s)' % row['Centre Code']
    addr = ', '.join(v for v in (row['Actual Address Line 1'], row['Actual Address Line 2'], row['Actual Address Line 3']) if v)
    if best:
        n_match += 1
        best.update(verification='verified', confidence='high', subcategory='school', address=addr or best['address'])
        best['sources'].append(official_src); best['official'] = dict(name=row['Centre Name'], sector=sector, years=years)
        if math.hypot(best['x'] - x, best['z'] - z) > 150: best['inaccuracies'].append('map position %.0f m from the official coordinates' % math.hypot(best['x'] - x, best['z'] - z))
    else:
        n_added += 1
        rec = dict(id='qld-school-' + row['Centre Code'], name=row['Centre Name'], alt=[], category='education', subcategory='school', address=addr,
                   lat=lat, lon=lon, x=x, z=z, sources=[official_src], checked=TODAY, verification='verified', confidence='high',
                   official=dict(name=row['Centre Name'], sector=sector, years=years), status=[], gameplay=[],
                   inaccuracies=['not in OpenStreetMap: no mapped grounds or buildings, marker only'])
        records.append(rec); missing.append(rec)
for r in osm_schools:
    if r['subcategory'] == 'school' and r['verification'] != 'verified':
        r['verification'] = 'research required'; r['confidence'] = 'low'
        r['inaccuracies'].append('not in the Queensland school list (may be closed, renamed, a campus or a training provider)')

# ---------------------------------------------------------------- what the game actually builds there
tiles = {}
for p in glob.glob(os.path.join(ROOT, 'dist', 'tiles', 't_*.json')):
    t = json.load(open(p)); tiles[(t['i'], t['j'])] = t
poi_ids = {q[4] for t in tiles.values() for q in t['pois']}
fuel_ids = {q[4] for t in tiles.values() for q in t['fuel']}
def big_building_near(x, z, r=60):
    t = tiles.get((math.floor(x / 1000), math.floor(z / 1000)))
    if not t: return None
    for b in t['buildings']:
        f = b[3:]; cx = sum(f[0::2]) / (len(f) / 2); cz = sum(f[1::2]) / (len(f) / 2)
        if abs(cx - x) < r and abs(cz - z) < r: return b
    return None
for r in records:
    st = []
    if in_core(r['x'], r['z']): st.append('mapped'); st.append('exterior: hand-built Surfers core')
    elif tiles.get((math.floor(r['x'] / 1000), math.floor(r['z'] / 1000))): st.append('mapped')
    st.append('map marker (search)')
    if r['id'] in poi_ids or r['id'] in fuel_ids:
        st.append('interactive: shop counter'); r['gameplay'].append('buy from the counter (game prices)')
    b = big_building_near(r['x'], r['z'])
    if r['subcategory'] == 'shopping centre': st.append('interior: approximate (real shop positions and levels from OSM)'); r['gameplay'].append('walk the centre, buy from its mapped shops, escalators')
    elif r['subcategory'] == 'hotel' and b and b[0] >= 14: st.append('interior: approximate (lobby, lift to every floor, rooms)'); r['gameplay'].append('lobby, lift, rooms, rooftop')
    elif b: st.append('exterior: real footprint, roof colour from aerial photo')
    else: st.append('exterior: none (point only)')
    if r['category'] == 'education' and r['subcategory'] == 'school': r['gameplay'].append('grounds and buildings to explore (no interior yet)')
    r['status'] = st

records.sort(key=lambda r: (r['category'], r['subcategory'], r['name']))
json.dump(dict(generated=TODAY, boundary=dict(south=S, west=W, north=N, east=E), sources=['OpenStreetMap contributors (ODbL)', 'Queensland Government school details (CC BY 4.0)'],
               records=records), open(os.path.join(ROOT, 'data', 'locations.json'), 'w'), indent=1)

# verified schools that OSM lacks go into the map search, so they appear on the map
reg_path = os.path.join(ROOT, 'dist', 'tiles', 'region.json')
region = json.load(open(reg_path))
have = {(e[0].lower(), e[1]) for e in region['search']}
for r in missing:
    if (r['name'].lower(), 1) not in have: region['search'].append([r['name'], 1, round(r['x']), round(r['z'])])
json.dump(region, open(reg_path, 'w'), separators=(',', ':'))

# ---------------------------------------------------------------- the audit
from collections import Counter
cnt = Counter((r['category'], r['subcategory']) for r in records)
ver = Counter(r['verification'] for r in records)
interactive = sum(1 for r in records if any(s.startswith('interactive') or s.startswith('interior') for s in r['status']))
total_bld = sum(len(t['buildings']) for t in tiles.values()); houses = sum(1 for t in tiles.values() for b in t['buildings'] if b[2] == 0)
bars = sum(len(t.get('barriers', [])) for t in tiles.values()); hgt = sum(1 for t in tiles.values() if t.get('hgt'))
lines = ['# Completion audit', '', 'Generated %s by `tools/build_registry.py` from `data/locations.json`. Real-world verification and gameplay are counted separately; decorative buildings are not counted as destinations.' % TODAY, '',
         '## The map', '', '| | count |', '|---|---|',
         '| Buildings in streamed tiles | %d |' % total_bld, '| of which houses | %d |' % houses, '| Terrain tiles with LiDAR heights | %d of %d |' % (hgt, len(tiles)),
         '| Mapped fence / wall / hedge pieces (OSM) | %d |' % bars, '',
         '## Places by category', '', '| category | subcategory | records |', '|---|---|---|']
lines += ['| %s | %s | %d |' % (c, s, n) for (c, s), n in sorted(cnt.items())]
lines += ['', '## Verification', '', '| status | records |', '|---|---|'] + ['| %s | %d |' % (k, v) for k, v in ver.most_common()]
lines += ['', '- Official Queensland schools inside the boundary: %d (matched to OSM: %d, added from the official list: %d)' % (len(official), n_match, n_added),
          '- Places with a working interaction or interior: %d of %d' % (interactive, len(records)),
          '- Places marked with known inaccuracies: %d' % sum(1 for r in records if r['inaccuracies']), '',
          '## Schools added from the official list (marker only, not in OpenStreetMap)', ''] + ['- %s — %s' % (r['name'], r['address'] or '') for r in missing]
os.makedirs(os.path.join(ROOT, 'reports'), exist_ok=True)
open(os.path.join(ROOT, 'reports', 'completion_audit.md'), 'w').write('\n'.join(lines) + '\n')
print('records', len(records), dict(ver), '| official schools', len(official), 'matched', n_match, 'added', n_added, '| interactive', interactive)
