"""Train stations, the railway lines between them and the ferry routes (OpenStreetMap, ODbL), for the trains and the
CityCats in the game. One small query for each box of the map (the Gold Coast's and Brisbane's).

Run: python3 -u tools/fetch_transit.py   (writes data/region/transit_gc.json and transit_bris.json)
"""
import json, os, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from region_bounds import S, W, N, E, BRIS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'region')
EPS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
Q = """[out:json][timeout:240][bbox:{s},{w},{n},{e}];
(node["railway"~"^(station|halt)$"]; node["public_transport"="station"]["train"="yes"];
 way["railway"="rail"]["usage"~"^(main|branch|commuter)$"]; way["railway"="rail"][!"service"];
 way["route"="ferry"]; node["amenity"="ferry_terminal"]; node["public_transport"="stop_position"]["ferry"="yes"];);
out body geom qt;"""
for name, (s, w, n, e) in (('gc', (S, W, N, E)), ('bris', BRIS)):
    path = os.path.join(OUT, 'transit_%s.json' % name)
    if os.path.exists(path): continue
    for attempt in range(30):  # the public servers are often busy: keep trying, politely
        raw = subprocess.run(['curl', '-s', '--max-time', '300', '-A', 'gold-coast-streets-builder', '--data-urlencode', 'data=' + Q.format(s=s, w=w, n=n, e=e), EPS[attempt % len(EPS)]], capture_output=True, text=True).stdout
        try:
            d = json.loads(raw)
            if 'elements' not in d: raise ValueError
            json.dump(d, open(path, 'w'), separators=(',', ':')); print(path, len(d['elements']), flush=True); break
        except ValueError:
            time.sleep(10 + attempt * 3)
print('done')
