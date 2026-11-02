"""Street details for the whole map from OpenStreetMap (ODbL), for tools/build_tiles.py.

Run: python3 -u tools/fetch_details.py   (writes data/region/det_<row>_<col>.json; finished cells are skipped on a re-run)
Fetches what the main map query leaves out: pedestrian crossings, stop and give-way lines, bus stops, street lights,
power poles and lines, channel markers and beacons, lifeguard towers, benches, bins and drinking fountains, and
mangroves.
"""
import json, os, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from region_bounds import S, W, N, E, BRIS
PREFIX = 'det'
if sys.argv[1:] == ['brisbane']: S, W, N, E = BRIS[0], BRIS[1], BRIS[2], 153.270; PREFIX = 'detb'  # python3 tools/fetch_details.py brisbane
if sys.argv[1:] == ['east']: from region_bounds import BRIS_EAST as _BE; S, W, N, E = _BE; PREFIX = 'detc'

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'region')
EPS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
Q = """[out:json][timeout:180][bbox:{s},{w},{n},{e}];
(node["highway"~"^(crossing|stop|give_way|bus_stop|street_lamp)$"];
 node["public_transport"="platform"]["bus"="yes"];
 node["power"~"^(pole|tower)$"]; way["power"~"^(line|minor_line)$"];
 node["seamark:type"]; node["man_made"~"^(beacon|lighthouse)$"];
 nwr["emergency"~"^(lifeguard|lifeguard_tower|lifeguard_base)$"]; nwr["lifeguard"];
 node["amenity"~"^(bench|waste_basket|drinking_water|bbq|shower)$"]; node["leisure"="picnic_table"];
 way["wetland"="mangrove"]; relation["wetland"="mangrove"];);
out body geom qt;"""
STEP = 0.1
rows, cols = int(round((N - S) / STEP + 0.4999)), int(round((E - W) / STEP + 0.4999))
for r in range(rows):
    for c in range(cols):
        path = os.path.join(OUT, '%s_%d_%d.json' % (PREFIX, r, c))
        if os.path.exists(path): continue
        s, n = S + r * STEP, min(N, S + (r + 1) * STEP); w, e = W + c * STEP, min(E, W + (c + 1) * STEP)
        q = Q.format(s=s, w=w, n=n, e=e)
        for attempt in range(30):  # the public servers are often busy: keep trying, politely
            ep = EPS[attempt % len(EPS)]
            raw = subprocess.run(['curl', '-s', '--max-time', '240', '-A', 'gold-coast-streets-builder', '--data-urlencode', 'data=' + q, ep], capture_output=True, text=True).stdout
            try:
                d = json.loads(raw)
                if 'elements' not in d: raise ValueError('no elements')
                json.dump(d, open(path, 'w'), separators=(',', ':'))
                print(path, len(d['elements']), flush=True)
                break
            except ValueError:
                time.sleep(8 + attempt * 2)
        else:
            print('FAILED', path, flush=True)
print('done')
