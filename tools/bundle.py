"""Bundle the game into single HTML files.

dist/gold-coast-streets.html  page body for publishing (the host adds the document skeleton)
dist/index.html               full document for local testing
docs/                         the public website: index.html plus the published map (dist/site: the Gold Coast tiles)
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = lambda *p: open(os.path.join(ROOT, *p), encoding='utf-8').read()

PACK = 3  # tiles per pack side for the Claude-hosted page (it allows 511 files)
# every file shares one page: a name declared at the top of two files stops the whole game loading, so refuse to bundle
import re as _re, collections as _col
_names = _col.defaultdict(list)
for _f in sorted(os.listdir(os.path.join(ROOT, 'src'))):
    if _f.endswith('.js'):
        for _line in open(os.path.join(ROOT, 'src', _f), encoding='utf-8'):
            _m = _re.match(r'^(?:const|let|var|class|function|async function)\s+([A-Za-z_$][\w$]*)', _line)
            if _m: _names[_m.group(1)].append(_f)
_dup = {k: v for k, v in _names.items() if len(v) > 1}
if _dup: raise SystemExit('names declared in more than one file: %s' % _dup)
page = src('src', 'index.html')
map_js = '<script>window.MAP=' + src('data', 'map.json') + ';window.TRAM_DATA=' + src('data', 'tram.json') + ';</script>'
game_js = '<script>\n' + '\n'.join(src('src', f) for f in ('world.js', 'post.js', 'weather.js', 'models.js', 'details.js', 'shops.js', 'interiors.js', 'economy.js', 'gps.js', 'phone.js', 'casino.js', 'planes.js', 'surf.js', 'police.js', 'radio.js', 'boats.js', 'transit.js', 'rail.js', 'property.js', 'services.js', 'story.js', 'mick.js', 'touch.js', 'online.js', 'accounts.js', 'party.js', 'admin.js', 'chat.js', 'keyhints.js', 'fishing.js', 'activities.js', 'actgames.js', 'actworld.js', 'mods.js', 'pets.js', 'heli.js', 'stunts.js', 'racing.js', 'brisbane.js', 'life.js', 'business.js', 'lobbies.js', 'weapons.js', 'arcade.js', 'skydive.js', 'contracts.js', 'guide.js', 'shared.js', 'devtools.js', 'tiles.js', 'streets.js', 'landmarks.js', 'grass.js', 'houses.js', 'yards.js', 'towers.js', 'game.js')) + '\n</script>'
body = page.replace('<!--MAP-->', map_js).replace('<!--GAME-->', game_js)

os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
with open(os.path.join(ROOT, 'dist', 'gold-coast-streets.html'), 'w', encoding='utf-8') as f:
    f.write('<script>window.TILE_PACK=%d;</script>\n' % PACK + body)  # the Claude-hosted page reads tile packs
with open(os.path.join(ROOT, 'dist', 'index.html'), 'w', encoding='utf-8') as f:
    f.write('<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
            '</head><body>\n' + body + '\n</body></html>\n')
import shutil
os.makedirs(os.path.join(ROOT, 'dist', 'tests'), exist_ok=True)
for t in ('regression.js', 'activities_test.js'): shutil.copy(os.path.join(ROOT, 'tests', t), os.path.join(ROOT, 'dist', 'tests', t))  # local test page only; never published
# ---------------------------------------------------------------- the map that gets published
# The Gold Coast only: Brisbane made the whole game lag (its overview roads, search entries and 88 km of railway weigh
# on every frame even down the coast). The full build stays in dist/tiles; set BRISBANE = True to publish it again.
BRISBANE = False
import collections, json
tiles, ground = os.path.join(ROOT, 'dist', 'tiles'), os.path.join(ROOT, 'dist', 'ground')
REG = json.load(open(os.path.join(tiles, 'region.json'))) if os.path.exists(os.path.join(tiles, 'region.json')) else {}
GCB = (REG.get('boxes') or [REG.get('bounds')])[0] if REG else None
in_gc = lambda x, z, m=1: not GCB or (GCB[0] - m <= x <= GCB[2] + m and GCB[1] - m <= z <= GCB[3] + m)
tile_gc = lambda i, j: not GCB or (j + 1) * 1000 > GCB[1]  # everything south of where Brisbane starts (Brisbane's box sits on the Gold Coast's north edge)
block_gc = lambda bi, bj: tile_gc(bi * PACK + PACK - 1, bj * PACK + PACK - 1)
touches = lambda pts: any(in_gc(pts[k], pts[k + 1], 300) for k in range(0, len(pts) - 1, 2))
def gold_coast(R):
    g = dict(R); g['tiles'] = [t for t in R['tiles'] if tile_gc(t[0], t[1])]
    g['search'] = [q for q in R.get('search', []) if in_gc(q[2], q[3])]; g['suburbs'] = [q for q in R.get('suburbs', []) if in_gc(q[0], q[1])]
    g['landmarks'] = [q for q in R.get('landmarks', []) if in_gc(q[0], q[1])]
    g['roads'] = [r for r in R.get('roads', []) if touches(r[1:])]; g['water'] = [w for w in R.get('water', []) if touches(w)]; g['coast'] = [c for c in R.get('coast', []) if touches(c)]
    if g.get('airport'): g['airport'] = dict(g['airport'], runways=[r for r in g['airport']['runways'] if in_gc(r[0], r[1]) and in_gc(r[2], r[3])])  # Gold Coast Airport's, not Brisbane's
    g['bounds'] = GCB; g['boxes'] = [GCB]; g.pop('storyBridge', None)
    return g
def gold_coast_transit(T):
    out = {'trains': [], 'ferries': []}  # the CityCats are Brisbane's
    for L in T.get('trains', []):
        p, cum, cut = L['line'], 0.0, None
        for k in range(2, len(p), 2):
            if not in_gc(p[k], p[k + 1]): cut = k; break
            cum += ((p[k] - p[k - 2]) ** 2 + (p[k + 1] - p[k - 1]) ** 2) ** 0.5
        if cut is None: out['trains'].append(L); continue
        stops = [st for st in L['stops'] if st[0] <= cum - 60]
        if len(stops) >= 2: out['trains'].append(dict(L, line=p[:cut], stops=stops, len=round(cum, 1)))  # the Gold Coast end of the line: Varsity Lakes up to the last station before Brisbane's box
    return out
SITE = os.path.join(ROOT, 'dist', 'site')  # what's published, laid out as the site serves it (hard links into dist/tiles and dist/ground)
if REG:
    for sub in ('tiles', 'ground'): shutil.rmtree(os.path.join(SITE, sub), ignore_errors=True); os.makedirs(os.path.join(SITE, sub))
    GR = REG if BRISBANE else gold_coast(REG)
    keep = {(t[0], t[1]) for t in GR['tiles']}
    for name in os.listdir(tiles):
        if name.startswith('t_') and (lambda ij: (ij[0], ij[1]) in keep)(list(map(int, name[2:-5].split('_')))): os.link(os.path.join(tiles, name), os.path.join(SITE, 'tiles', name))
    json.dump(GR, open(os.path.join(SITE, 'tiles', 'region.json'), 'w'), separators=(',', ':'))
    if os.path.exists(os.path.join(tiles, 'transit.json')):
        T = json.load(open(os.path.join(tiles, 'transit.json'))); json.dump(T if BRISBANE else gold_coast_transit(T), open(os.path.join(SITE, 'tiles', 'transit.json'), 'w'), separators=(',', ':'))
    if os.path.isdir(ground):
        idx = [k for k in json.load(open(os.path.join(ground, 'index.json'))) if BRISBANE or block_gc(*map(int, k.split('_')))]
        for k in idx:
            if os.path.exists(os.path.join(ground, 'g_%s.jpg' % k)): os.link(os.path.join(ground, 'g_%s.jpg' % k), os.path.join(SITE, 'ground', 'g_%s.jpg' % k))
        json.dump(idx, open(os.path.join(SITE, 'ground', 'index.json'), 'w'))
    print('published map: %d tiles, %d overview roads, %d search entries, %d ground photos%s' % (len(GR['tiles']), len(GR.get('roads', [])), len(GR.get('search', [])), len(os.listdir(os.path.join(SITE, 'ground'))) - 1, '' if BRISBANE else ' (Gold Coast only)'))
# the local test page reads the published map too
html_local = open(os.path.join(ROOT, 'dist', 'index.html'), encoding='utf-8').read().replace('<body>\n', '<body>\n<script>window.MAP_DIR=\'site/\';</script>\n', 1)
open(os.path.join(ROOT, 'dist', 'index.html'), 'w', encoding='utf-8').write(html_local)
# the public site: the full page and the published map (no tests)
site = os.path.join(ROOT, 'docs')
os.makedirs(os.path.join(site, 'tiles'), exist_ok=True)
# the public site counts visits with GoatCounter (only there: the Claude-hosted page doesn't load outside scripts)
GOATCOUNTER = '<script data-goatcounter="https://sw573.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>'
html = html_local.replace("<script>window.MAP_DIR='site/';</script>\n", '', 1).replace('</body>', GOATCOUNTER + '\n</body>', 1)
open(os.path.join(site, 'index.html'), 'w', encoding='utf-8').write(html)
open(os.path.join(site, '.nojekyll'), 'w').close()  # serve files as they are
# the GitHub Pages copy of the page reads the map from the Cloudflare Pages copy (MAP_BASE in src/tiles.js), so Cloudflare lets other sites read it
open(os.path.join(site, '_headers'), 'w').write('/tiles/*\n  Access-Control-Allow-Origin: *\n/ground/*\n  Access-Control-Allow-Origin: *\n')
for sub in ('tiles', 'ground'):
    a, b = os.path.join(SITE, sub), os.path.join(site, sub)
    if not os.path.isdir(a): continue
    os.makedirs(b, exist_ok=True)
    for name in os.listdir(b):
        if not os.path.exists(os.path.join(a, name)): os.remove(os.path.join(b, name))
    for name in os.listdir(a):
        if not os.path.exists(os.path.join(b, name)) or os.path.getsize(os.path.join(b, name)) != os.path.getsize(os.path.join(a, name)) or name.endswith('index.json') or name in ('region.json', 'transit.json'): shutil.copy(os.path.join(a, name), os.path.join(b, name))
# tile packs for the Claude-hosted page: dist/packs/p_<i//3>_<j//3>.json = {"i_j": tile, ...}, the Gold Coast only (it can't fit Brisbane)
packs = os.path.join(ROOT, 'dist', 'packs')
if REG:
    shutil.rmtree(packs, ignore_errors=True); os.makedirs(packs)
    groups = collections.defaultdict(list)
    for name in os.listdir(tiles):
        if name.startswith('t_'):
            i, j = map(int, name[2:-5].split('_'))
            if tile_gc(i, j): groups[(i // PACK, j // PACK)].append((i, j, name))
    os.makedirs(os.path.join(ROOT, 'dist', 'art'), exist_ok=True); json.dump(gold_coast(REG), open(os.path.join(ROOT, 'dist', 'art', 'region.json'), 'w'), separators=(',', ':'))
    for (a, b), items in groups.items():
        with open(os.path.join(packs, 'p_%d_%d.json' % (a, b)), 'w', encoding='utf-8') as f:
            f.write('{' + ','.join('"%d_%d":%s' % (i, j, src('dist', 'tiles', name)) for i, j, name in items) + '}')
    if os.path.isdir(ground): json.dump([k for k in json.load(open(os.path.join(ground, 'index.json'))) if (tuple(map(int, k.split('_'))) in groups) and os.path.exists(os.path.join(ground, 'g_%s.jpg' % k))], open(os.path.join(ROOT, 'dist', 'art', 'ground_index.json'), 'w'))
print('bundled', os.path.getsize(os.path.join(ROOT, 'dist', 'index.html')), 'bytes')
