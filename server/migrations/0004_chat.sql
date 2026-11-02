-- the global chat (phone -> Chat): every message as it was shown (after the filter), and muted players
CREATE TABLE chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  crew TEXT,
  text TEXT NOT NULL,
  at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX chat_at ON chat(id);
CREATE INDEX chat_user ON chat(user_id, at);
ALTER TABLE users ADD COLUMN muted INTEGER NOT NULL DEFAULT 0;
