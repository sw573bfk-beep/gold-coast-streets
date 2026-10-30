-- players: a name and a scrambled (PBKDF2) password; no email or other personal details
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_lc TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
-- multiplayer progress (money, cars, houses...), one row per player
CREATE TABLE saves (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated INTEGER NOT NULL
);
-- each player's best on each board (money, a time trial route, biggest fish, best wave)
CREATE TABLE records (
  board TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value REAL NOT NULL,
  detail TEXT,
  at INTEGER NOT NULL,
  PRIMARY KEY (board, user_id)
);
CREATE INDEX records_board ON records(board, value);
-- sign-up and log-in attempts, to slow down guessing
CREATE TABLE attempts (
  ip TEXT NOT NULL,
  kind TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX attempts_ip ON attempts(ip, kind, at);
