"""Bundle the game into single HTML files.

dist/gold-coast-streets.html  page body for publishing (the host adds the document skeleton)
dist/index.html               full document for local testing
docs/                         the public website (GitHub Pages): index.html plus the map tiles
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
game_js = '<script>\n' + '\n'.join(src('src', f) for f in ('world.js', 'post.js', 'weather.js', 'models.js', 'details.js', 'shops.js', 'interiors.js', 'economy.js', 'gps.js', 'phone.js', 'casino.js', 'planes.js', 'surf.js', 'police.js', 'radio.js', 'boats.js', 'transit.js', 'rail.js', 'property.js', 'services.js', 'story.js', 'mick.js', 'touch.js', 'online.js', 'accounts.js', 'party.js', 'admin.js', 'chat.js', 'keyhints.js', 'fishing.js', 'activities.js', 'actgames.js', 'actworld.js', 'mods.js', 'pets.js', 'heli.js', 'stunts.js', 'racing.js', 'brisbane.js', 'life.js', 'business.js', 'lobbies.js', 'weapons.js', 'arcade.js', 'devtools.js', 'tiles.js', 'streets.js', 'landmarks.js', 'grass.js', 'houses.js', 'towers.js', 'game.js')) + '\n</script>'
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
# the public site: the full page and every map tile (no tests)
site = os.path.join(ROOT, 'docs')
os.makedirs(os.path.join(site, 'tiles'), exist_ok=True)
# the public site counts visits with GoatCounter (only there: the Claude-hosted page doesn't load outside scripts)
GOATCOUNTER = '<script data-goatcounter="https://sw573.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>'
html = open(os.path.join(ROOT, 'dist', 'index.html'), encoding='utf-8').read().replace('</body>', GOATCOUNTER + '\n</body>', 1)
open(os.path.join(site, 'index.html'), 'w', encoding='utf-8').write(html)
open(os.path.join(site, '.nojekyll'), 'w').close()  # serve files as they are
tiles = os.path.join(ROOT, 'dist', 'tiles')
if os.path.isdir(tiles):
    for name in os.listdir(os.path.join(site, 'tiles')):
        if not os.path.exists(os.path.join(tiles, name)): os.remove(os.path.join(site, 'tiles', name))
    for name in os.listdir(tiles):
        shutil.copy(os.path.join(tiles, name), os.path.join(site, 'tiles', name))
# the aerial photos on the ground (tools/ground_photos.py), for the site too
ground = os.path.join(ROOT, 'dist', 'ground')
if os.path.isdir(ground):
    shutil.rmtree(os.path.join(site, 'ground'), ignore_errors=True); shutil.copytree(ground, os.path.join(site, 'ground'))
# tile packs for the Claude-hosted page: dist/packs/p_<i//3>_<j//3>.json = {"i_j": tile, ...}
import collections, json
packs = os.path.join(ROOT, 'dist', 'packs')
if os.path.isdir(tiles):
    shutil.rmtree(packs, ignore_errors=True); os.makedirs(packs)
    groups = collections.defaultdict(list)
    for name in os.listdir(tiles):
        if name.startswith('t_'):
            i, j = map(int, name[2:-5].split('_')); groups[(i // PACK, j // PACK)].append((i, j, name))
    # the Claude-hosted page holds the Gold Coast only (it can't fit Brisbane): its packs and a map index for just that box
    REG = json.load(open(os.path.join(tiles, 'region.json'))) if os.path.exists(os.path.join(tiles, 'region.json')) else {}
    GCB = (REG.get('boxes') or [REG.get('bounds')])[0] if REG else None
    in_gc = lambda x, z: not GCB or (GCB[0] - 1 <= x <= GCB[2] + 1 and GCB[1] - 1 <= z <= GCB[3] + 1)
    tile_gc = lambda i, j: not GCB or (j + 1) * 1000 > GCB[1]  # everything south of where Brisbane starts (Brisbane's box sits on the Gold Coast's north edge)
    if REG and GCB:
        art = dict(REG); art['tiles'] = [t for t in REG['tiles'] if tile_gc(t[0], t[1])]
        art['search'] = [q for q in REG.get('search', []) if in_gc(q[2], q[3])]; art['suburbs'] = [q for q in REG.get('suburbs', []) if in_gc(q[0], q[1])]
        art['landmarks'] = [q for q in REG.get('landmarks', []) if in_gc(q[0], q[1])]; art['bounds'] = GCB; art['boxes'] = [GCB]
        os.makedirs(os.path.join(ROOT, 'dist', 'art'), exist_ok=True); json.dump(art, open(os.path.join(ROOT, 'dist', 'art', 'region.json'), 'w'), separators=(',', ':'))
    for (a, b), items in groups.items():
        items = [it for it in items if tile_gc(it[0], it[1])]
        if not items: continue
        with open(os.path.join(packs, 'p_%d_%d.json' % (a, b)), 'w', encoding='utf-8') as f:
            f.write('{' + ','.join('"%d_%d":%s' % (i, j, src('dist', 'tiles', name)) for i, j, name in items) + '}')
print('bundled', os.path.getsize(os.path.join(ROOT, 'dist', 'index.html')), 'bytes')
