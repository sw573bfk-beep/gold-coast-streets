"""Download the places the main region query misses: gyms and sports centres, arcades, bowling, escape rooms,
trampoline parks and mini golf (OpenStreetMap "leisure" points), bakeries and breweries ("craft"), and clinics
mapped only as "healthcare". Writes data/region/poix_<n>.json; tools/build_tiles.py reads them with the rest.

Run: python3 tools/fetch_pois_extra.py
"""
import json, os, subprocess, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'region')
S, W, N, E = -28.2, 153.18, -27.935, 153.56  # the whole extended map
QUERY = """[out:json][timeout:180][bbox:{s},{w},{n},{e}];
(nwr["leisure"~"^(fitness_centre|sports_centre|amusement_arcade|bowling_alley|escape_game|trampoline_park|water_park|miniature_golf|ice_rink)$"]["name"];
 nwr["craft"~"^(bakery|brewery|distillery|winery|confectionery)$"]["name"];
 nwr["healthcare"]["name"][!"amenity"];);
out tags center qt;"""
ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
for k, (s, n) in enumerate([(S, (S + N) / 2), ((S + N) / 2, N)]):
    path = os.path.join(OUT, 'poix_%d.json' % k)
    if os.path.exists(path) and os.path.getsize(path) > 100: continue
    for attempt in range(6):
        subprocess.run(['curl', '-s', '-m', '240', '-A', 'GoldCoastStreetsGame/0.1 (personal project)', '-X', 'POST', ENDPOINTS[attempt % 2],
                        '--data-urlencode', 'data=' + QUERY.format(s=s, w=W, n=n, e=E), '-o', path + '.part'])
        try:
            d = json.load(open(path + '.part'))
            for e in d['elements']:  # the builder reads node-style positions: give ways their centre
                if 'center' in e and 'lat' not in e: e['lat'], e['lon'] = e['center']['lat'], e['center']['lon']; e['type'] = 'node'
            json.dump(d, open(path, 'w')); os.remove(path + '.part'); print(path, len(d['elements']), 'places'); break
        except Exception as ex:
            print('retry', attempt, ex); time.sleep(10)
