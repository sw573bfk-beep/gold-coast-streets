-- the one shared online Gold Coast: each house (or apartment) belongs to one player, keeps a safe, and can be robbed
-- (up to half the safe, once a day, only while its owner is offline)
CREATE TABLE houses (
  prop_id TEXT PRIMARY KEY,
  owner INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  x REAL NOT NULL,
  z REAL NOT NULL,
  price INTEGER NOT NULL,
  safe INTEGER NOT NULL DEFAULT 0,
  robbed_at INTEGER NOT NULL DEFAULT 0,
  bought INTEGER NOT NULL
);
CREATE INDEX houses_owner ON houses(owner);
-- who robbed whom, so the owner hears about it next time they play
CREATE TABLE robberies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prop_id TEXT NOT NULL,
  owner INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  robber INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  at INTEGER NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX robberies_owner ON robberies(owner, seen);
-- money the server itself moved into (or out of) a player's wallet since their last save: robberies, the safe, selling
-- a house, the admin's gifts. A save may change the wallet by that much more than play alone could earn.
ALTER TABLE users ADD COLUMN credit INTEGER NOT NULL DEFAULT 0;
-- what a player can still earn by playing before a save looks too good to be true: it refills by the minute up to a cap
ALTER TABLE users ADD COLUMN budget INTEGER NOT NULL DEFAULT 150000;
ALTER TABLE users ADD COLUMN budget_at INTEGER NOT NULL DEFAULT 0;
