-- time played (signed in, counted from the game's once-a-minute ping), last seen, and bans
ALTER TABLE users ADD COLUMN play_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_seen INTEGER;
ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0;
-- money the admin gives (or takes): waits here until the player's game picks it up
CREATE TABLE gifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  note TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX gifts_user ON gifts(user_id);
-- everything the admin does, newest first
CREATE TABLE admin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT
);
