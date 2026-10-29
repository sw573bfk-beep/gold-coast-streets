# Gold Coast Streets

A GTA-style open-world browser game set on the real Gold Coast, Queensland, built with Three.js from real map data.

- **Surfers Paradise core** (hand-detailed): Cavill Mall with every shop walk-in, the Soul octopus, Q1, Timezone arcade, escape room, banks, beachfront.
- **Streamed region** (Southport to Burleigh, inland to Robina, Carrara and Benowa): every road and building, houses with yards, street shops, petrol stations and traffic lights, loaded in 1 km tiles as you move.
- Driving with drift handling, police chases and arrests, punches and guns, outfits, money and shops.

## Play

The game is a single page in `dist/`. The region tiles load over HTTP, so serve the folder rather than opening the file:

```bash
python3 -m http.server 8765 --directory dist
```

Then open http://localhost:8765/gold-coast-streets.html.

Controls: WASD to move or drive, Shift to sprint, E or F to enter a car or shop, Q to punch, 1–4 for weapons, B for your bag, C for the car camera, M for the map, Esc to pause.

## Build from source

```bash
python3 tools/build_map.py        # Surfers core from data/osm.json
python3 tools/fetch_region.py     # download the region from OpenStreetMap (slow; writes data/region/)
python3 tools/build_tiles.py      # cut the region into dist/tiles/
python3 tools/bundle.py           # src/ -> dist/gold-coast-streets.html
```

`tools/extract_ms_buildings.py` adds house outlines from Microsoft's Global ML Building Footprints. It needs that dataset's Gold Coast extract first.

Regression tests run in the browser console on the served page: `(0, eval)(await (await fetch('tests/regression.js')).text()); await runRegression();`

## Data and credits

- Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the Open Database License (ODbL).
- Extra building outlines from [Microsoft Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints), ODbL. These are machine-detected and their heights are estimates.
- 3D rendering by [three.js](https://threejs.org) (MIT).

This is a fan-made game. It is not affiliated with Rockstar Games or any business shown in it.
