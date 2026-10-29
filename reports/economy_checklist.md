# Economy and businesses checklist

What actually works in the game (each line tested by `tests/regression.js` in the running game unless marked *visual only*).

| Feature | Where | Status | Tested |
|---|---|---|---|
| Safe purchases (same item twice within 250 ms ignored; no charge without enough money) | every shop | complete | scripted |
| Café menus differ by café (13 café items; bakeries: pies and sausage rolls; juice bars: smoothies, açaí) | every café | complete | scripted |
| Food heals; coffee gives a time-limited energy boost (no stacking past the cap) | food, cafés | complete | scripted |
| Barista job: 5 orders a shift, tap the right items, $16 per correct order, raise every 5 shifts, 60 s cooldown | cafés | complete | scripted |
| Shelf-stacker job: 8 items into the right aisle, $6 each | supermarkets, convenience, general shops | complete | not yet scripted |
| Delivery-driver job: 3 timed deliveries to real streets, walk or drive, $22 + distance (late: $8) | restaurants and takeaway | complete | scripted |
| Car dealerships: range differs by brand, 7 car types, buy, test drive (2 min), owned cars saved | shops tagged shop=car or named after car brands | complete | scripted (buy + reload) |
| Call your owned car to the nearest road (bag, B) | anywhere | complete | visual only |
| Bank: savings account, deposit/withdraw, savings survive being wasted or busted | every bank | complete | scripted |
| Hotel room: $80, full health, morning, becomes your home (respawn point), saved | every hotel | complete | scripted |
| Gym: day pass + timing workout, fitness 0–10 (+1.5% sprint each), one gain per 10 minutes | shops named as gyms | complete | not yet scripted |
| Clothes and money persist after reload | wardrobe | complete (existing) | scripted |
| Apartments to rent, furniture, haircuts, electronics upgrades, souvenirs checklist, taxi/tour jobs | — | missing | — |
| NPC customers inside shops, opening hours | — | missing | — |
