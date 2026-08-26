-- Tracking Core — schema local (expo-sqlite)
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS tracking_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  server_id TEXT,
  sport TEXT NOT NULL CHECK (sport IN ('RUN','WALK','RIDE')),
  status TEXT NOT NULL CHECK (status IN ('LIVE','PAUSED','FINISHED','ORPHAN')),
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  pause_ms INTEGER NOT NULL DEFAULT 0,
  paused_at INTEGER,
  device_id TEXT NOT NULL,
  app_version TEXT,
  distance_m REAL NOT NULL DEFAULT 0,
  moving_time_ms INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tracking_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  t INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  ele REAL,
  accuracy_m REAL,
  speed_mps REAL,
  heading REAL,
  filtered_lat REAL,
  filtered_lng REAL,
  filtered_speed_mps REAL,
  pace_sec_km REAL,
  is_accepted INTEGER NOT NULL DEFAULT 1,
  reject_reason TEXT,
  h3_r9 TEXT,
  h3_r11 TEXT,
  seq INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES tracking_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_points_session_seq ON tracking_points(session_id, seq);
CREATE INDEX IF NOT EXISTS idx_points_session_t ON tracking_points(session_id, t);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON tracking_sessions(status);

CREATE TABLE IF NOT EXISTS tracking_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tracking_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
