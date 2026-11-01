-- crews: a name and a short tag shown on name tags ([TAG]); one crew per player
CREATE TABLE crews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  tag_lc TEXT NOT NULL UNIQUE,
  owner INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created INTEGER NOT NULL
);
CREATE TABLE crew_members (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  crew_id INTEGER NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  joined INTEGER NOT NULL
);
CREATE INDEX crew_members_crew ON crew_members(crew_id);
