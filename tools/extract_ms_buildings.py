"""Extract Microsoft Global ML Building Footprints (ODbL) for the game region into game coordinates.

Run: python3 -I tools/extract_ms_buildings.py <path to goldcoast.csv.gz>
Writes data/region/ms_buildings.json: list of [height, x0, z0, x1, z1, ...] (metres, same origin as the Surfers map).
"""
import gzip, json, math, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from region_bounds import S, W, N, E  # the extended map
LAT0, LON0 = (-28.013 + -27.986) / 2, (153.411 + 153.436) / 2  # the Surfers map origin
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110574.0

out, kept, seen = [], 0, 0
with gzip.open(sys.argv[1], 'rt') as f:
    for line in f:
        seen += 1
        try:
            feat = json.loads(line)
        except ValueError:
            continue
        geom = feat.get('geometry') or {}
        if geom.get('type') != 'Polygon':
            continue
        ring = geom['coordinates'][0]
        lon, lat = ring[0]
        if not (W <= lon <= E and S <= lat <= N):
            continue
        h = (feat.get('properties') or {}).get('height')
        h = round(h, 1) if isinstance(h, (int, float)) and h > 0 else -1
        pts = []
        for lo, la in ring[:-1]:
            pts += [round((lo - LON0) * KX, 1), round((LAT0 - la) * KZ, 1)]
        if len(pts) >= 6:
            out.append([h] + pts); kept += 1
os.makedirs(os.path.join(ROOT, 'data', 'region'), exist_ok=True)
json.dump(out, open(os.path.join(ROOT, 'data', 'region', 'ms_buildings.json'), 'w'), separators=(',', ':'))
print('read', seen, 'kept', kept)
