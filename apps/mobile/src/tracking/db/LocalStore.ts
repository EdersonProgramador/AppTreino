import * as SQLite from "expo-sqlite";
import type { FilteredFix, PointRow, SessionStatus, Sport, TrackingSession } from "../types";

const DB_NAME = "tracking_core.sqlite";

const SCHEMA_SQL = `
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS tracking_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  server_id TEXT,
  sport TEXT NOT NULL,
  status TEXT NOT NULL,
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
`;

function mapSession(row: Record<string, unknown>): TrackingSession {
  return {
    id: String(row.id),
    serverId: row.server_id == null ? null : String(row.server_id),
    sport: row.sport as Sport,
    status: row.status as SessionStatus,
    startedAt: Number(row.started_at),
    endedAt: row.ended_at == null ? null : Number(row.ended_at),
    pauseMs: Number(row.pause_ms ?? 0),
    pausedAt: row.paused_at == null ? null : Number(row.paused_at),
    deviceId: String(row.device_id),
    appVersion: row.app_version == null ? null : String(row.app_version),
    distanceM: Number(row.distance_m ?? 0),
    movingTimeMs: Number(row.moving_time_ms ?? 0),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

function mapPoint(row: Record<string, unknown>): PointRow {
  return {
    id: Number(row.id),
    sessionId: String(row.session_id),
    t: Number(row.t),
    lat: Number(row.lat),
    lng: Number(row.lng),
    ele: row.ele == null ? null : Number(row.ele),
    accuracyM: row.accuracy_m == null ? null : Number(row.accuracy_m),
    speedMps: row.speed_mps == null ? null : Number(row.speed_mps),
    heading: row.heading == null ? null : Number(row.heading),
    filteredLat: row.filtered_lat == null ? null : Number(row.filtered_lat),
    filteredLng: row.filtered_lng == null ? null : Number(row.filtered_lng),
    filteredSpeedMps: row.filtered_speed_mps == null ? null : Number(row.filtered_speed_mps),
    paceSecKm: row.pace_sec_km == null ? null : Number(row.pace_sec_km),
    isAccepted: Number(row.is_accepted ?? 1),
    rejectReason: row.reject_reason == null ? null : String(row.reject_reason),
    seq: Number(row.seq),
    h3r9: row.h3_r9 == null ? null : String(row.h3_r9),
    h3r11: row.h3_r11 == null ? null : String(row.h3_r11)
  };
}

/**
 * Persistência local via expo-sqlite (funciona no Expo Go e em builds nativos).
 * Cada ponto é gravado imediatamente — base do crash recovery.
 */
export class LocalStore {
  private db: SQLite.SQLiteDatabase | null = null;
  private boot: Promise<void> | null = null;

  async init(): Promise<void> {
    if (!this.boot) {
      this.boot = (async () => {
        this.db = await SQLite.openDatabaseAsync(DB_NAME);
        await this.db.execAsync(SCHEMA_SQL);
      })();
    }
    await this.boot;
  }

  private conn(): SQLite.SQLiteDatabase {
    if (!this.db) throw new Error("LocalStore não inicializado.");
    return this.db;
  }

  async createSession(input: {
    id: string;
    sport: Sport;
    deviceId: string;
    appVersion?: string | null;
  }): Promise<TrackingSession> {
    const now = Date.now();
    await this.conn().runAsync(
      `INSERT INTO tracking_sessions
        (id, sport, status, started_at, pause_ms, device_id, app_version, distance_m, moving_time_ms, created_at, updated_at)
       VALUES (?, ?, 'LIVE', ?, 0, ?, ?, 0, 0, ?, ?)`,
      input.id,
      input.sport,
      now,
      input.deviceId,
      input.appVersion ?? null,
      now,
      now
    );
    const session = await this.getSession(input.id);
    if (!session) throw new Error("Falha ao criar sessão.");
    return session;
  }

  async getSession(id: string): Promise<TrackingSession | null> {
    const row = await this.conn().getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM tracking_sessions WHERE id = ? LIMIT 1`,
      id
    );
    return row ? mapSession(row) : null;
  }

  async findActiveSessions(): Promise<TrackingSession[]> {
    const rows = await this.conn().getAllAsync<Record<string, unknown>>(
      `SELECT * FROM tracking_sessions
       WHERE status IN ('LIVE','PAUSED','ORPHAN')
       ORDER BY updated_at DESC`
    );
    return rows.map(mapSession);
  }

  async updateSession(
    id: string,
    patch: Partial<{
      status: SessionStatus;
      endedAt: number | null;
      pauseMs: number;
      pausedAt: number | null;
      distanceM: number;
      movingTimeMs: number;
      serverId: string | null;
    }>
  ): Promise<void> {
    const current = await this.getSession(id);
    if (!current) return;
    await this.conn().runAsync(
      `UPDATE tracking_sessions SET
        status = ?, ended_at = ?, pause_ms = ?, paused_at = ?,
        distance_m = ?, moving_time_ms = ?, server_id = ?, updated_at = ?
       WHERE id = ?`,
      patch.status ?? current.status,
      patch.endedAt !== undefined ? patch.endedAt : current.endedAt,
      patch.pauseMs ?? current.pauseMs,
      patch.pausedAt !== undefined ? patch.pausedAt : current.pausedAt,
      patch.distanceM ?? current.distanceM,
      patch.movingTimeMs ?? current.movingTimeMs,
      patch.serverId !== undefined ? patch.serverId : current.serverId,
      Date.now(),
      id
    );
  }

  async touchSession(id: string): Promise<void> {
    await this.conn().runAsync(`UPDATE tracking_sessions SET updated_at = ? WHERE id = ?`, Date.now(), id);
  }

  async appendPoint(
    sessionId: string,
    fix: FilteredFix,
    distanceM: number,
    movingTimeMs: number
  ): Promise<void> {
    await this.conn().withTransactionAsync(async () => {
      await this.conn().runAsync(
        `INSERT INTO tracking_points
          (session_id, t, lat, lng, ele, accuracy_m, speed_mps, heading,
           filtered_lat, filtered_lng, filtered_speed_mps, pace_sec_km,
           is_accepted, reject_reason, h3_r9, h3_r11, seq)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        sessionId,
        fix.t,
        fix.lat,
        fix.lng,
        fix.ele,
        fix.accuracyM,
        fix.speedMps,
        fix.heading,
        fix.filteredLat,
        fix.filteredLng,
        fix.filteredSpeedMps,
        fix.paceSecKm,
        fix.isAccepted ? 1 : 0,
        fix.rejectReason,
        fix.h3r9 ?? null,
        fix.h3r11 ?? null,
        fix.seq
      );
      await this.conn().runAsync(
        `UPDATE tracking_sessions SET distance_m = ?, moving_time_ms = ?, updated_at = ? WHERE id = ?`,
        distanceM,
        movingTimeMs,
        Date.now(),
        sessionId
      );
    });
  }

  async lastAcceptedPoint(sessionId: string): Promise<PointRow | null> {
    const row = await this.conn().getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM tracking_points
       WHERE session_id = ? AND is_accepted = 1
       ORDER BY seq DESC LIMIT 1`,
      sessionId
    );
    return row ? mapPoint(row) : null;
  }

  async listAcceptedPoints(sessionId: string): Promise<PointRow[]> {
    const rows = await this.conn().getAllAsync<Record<string, unknown>>(
      `SELECT * FROM tracking_points
       WHERE session_id = ? AND is_accepted = 1
       ORDER BY seq ASC`,
      sessionId
    );
    return rows.map(mapPoint);
  }

  async enqueueOutbox(sessionId: string, kind: string, payload: unknown): Promise<void> {
    await this.conn().runAsync(
      `INSERT INTO tracking_outbox (session_id, kind, payload_json, attempts, next_attempt_at, created_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
      sessionId,
      kind,
      JSON.stringify(payload),
      Date.now(),
      Date.now()
    );
  }

  async listDueOutbox(now = Date.now(), limit = 20): Promise<
    Array<{ id: number; sessionId: string; kind: string; payload: Record<string, unknown>; attempts: number }>
  > {
    const rows = await this.conn().getAllAsync<Record<string, unknown>>(
      `SELECT * FROM tracking_outbox
       WHERE next_attempt_at <= ?
       ORDER BY id ASC
       LIMIT ?`,
      now,
      limit
    );
    return rows.map((row) => {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(String(row.payload_json ?? "{}")) as Record<string, unknown>;
      } catch {
        payload = {};
      }
      return {
        id: Number(row.id),
        sessionId: String(row.session_id),
        kind: String(row.kind),
        payload,
        attempts: Number(row.attempts ?? 0)
      };
    });
  }

  async bumpOutbox(id: number, attempts: number, nextAttemptAt: number): Promise<void> {
    await this.conn().runAsync(
      `UPDATE tracking_outbox SET attempts = ?, next_attempt_at = ? WHERE id = ?`,
      attempts,
      nextAttemptAt,
      id
    );
  }

  async deleteOutbox(id: number): Promise<void> {
    await this.conn().runAsync(`DELETE FROM tracking_outbox WHERE id = ?`, id);
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.conn().runAsync(
      `INSERT INTO tracking_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      key,
      value
    );
  }

  async getMeta(key: string): Promise<string | null> {
    const row = await this.conn().getFirstAsync<{ value?: string }>(
      `SELECT value FROM tracking_meta WHERE key = ? LIMIT 1`,
      key
    );
    return row?.value ?? null;
  }
}

export const localStore = new LocalStore();
