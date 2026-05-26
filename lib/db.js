import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const DB_PATH = process.env.HAZARD_DB_PATH || path.join(DATA_DIR, "hazard-detect.db");

let _db = null;

export function getDb() {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("busy_timeout = 5000");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      phone         TEXT NOT NULL UNIQUE,
      created_at    INTEGER NOT NULL,
      last_login_at INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
  `);

  _db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL,
      user_phone      TEXT    NOT NULL,
      created_at      INTEGER NOT NULL,
      scenario        TEXT    NOT NULL,
      scenario_label  TEXT,
      hazard_count    INTEGER NOT NULL DEFAULT 0,
      report_json     TEXT    NOT NULL,
      duration_ms     INTEGER,
      ip              TEXT,
      user_agent      TEXT,
      image_base64    TEXT,
      image_mime      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reports_user      ON reports(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reports_phone     ON reports(user_phone, created_at DESC);
  `);

  // 老表 additive migration（first user-touched request 时跑一次）
  const existing = _db.prepare("PRAGMA table_info(reports)").all();
  const cols = new Set(existing.map((c) => c.name));
  if (!cols.has("image_base64")) {
    _db.exec("ALTER TABLE reports ADD COLUMN image_base64 TEXT");
  }
  if (!cols.has("image_mime")) {
    _db.exec("ALTER TABLE reports ADD COLUMN image_mime TEXT");
  }

  return _db;
}

export function upsertUserByPhone(phone) {
  const db = getDb();
  const now = Date.now();
  const existing = db.prepare("SELECT id FROM users WHERE phone = ?").get(phone);
  if (existing) {
    db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now, existing.id);
    return existing.id;
  }
  const info = db
    .prepare("INSERT INTO users(phone, created_at, last_login_at) VALUES (?, ?, ?)")
    .run(phone, now, now);
  return Number(info.lastInsertRowid);
}

export function insertReport(payload) {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO reports(
        user_id, user_phone, created_at,
        scenario, scenario_label, hazard_count,
        report_json, duration_ms, ip, user_agent,
        image_base64, image_mime
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      payload.userId,
      payload.userPhone,
      payload.createdAt,
      payload.scenario,
      payload.scenarioLabel || null,
      payload.hazardCount,
      JSON.stringify(payload.report),
      payload.durationMs ?? null,
      payload.ip ?? null,
      payload.userAgent ?? null,
      payload.imageBase64 ?? null,
      payload.imageMime ?? null,
    );
  return Number(info.lastInsertRowid);
}
