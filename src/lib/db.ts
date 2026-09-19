// SQLite 数据层：better-sqlite3 同步 API，WAL 模式。
// 应用运行时用 getDb() 单例；测试通过 openDb(path) 注入临时路径。
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 100,
  last_checkin_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  html TEXT,
  icon TEXT,
  tagline TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  slug TEXT UNIQUE,
  remix_of INTEGER REFERENCES projects(id),
  remix_count INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS credit_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export function openDb(file: string): DB {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

// dev 热更新下避免重复打开连接
const g = globalThis as unknown as { __atomixDb?: DB };

export function getDb(): DB {
  if (!g.__atomixDb) {
    const file =
      process.env.ATOMIX_DB_PATH || path.join(process.cwd(), "data", "atomix.db");
    g.__atomixDb = openDb(file);
  }
  return g.__atomixDb;
}

/** 原子扣减：余额不足返回 {ok:false}，成功则同步写负流水（同一事务） */
export function deductCredits(
  db: DB,
  userId: number,
  n: number,
  reason: string
): { ok: boolean; credits?: number } {
  const tx = db.transaction((): { ok: boolean; credits?: number } => {
    const r = db
      .prepare(
        "UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?"
      )
      .run(n, userId, n);
    if (r.changes === 0) return { ok: false };
    db.prepare(
      "INSERT INTO credit_transactions (user_id, amount, reason) VALUES (?, ?, ?)"
    ).run(userId, -n, reason);
    const row = db.prepare("SELECT credits FROM users WHERE id = ?").get(userId) as
      | { credits: number }
      | undefined;
    return { ok: true, credits: row?.credits };
  });
  return tx();
}

/** 发放积分（奖励/退回），返回新余额 */
export function grantCredits(
  db: DB,
  userId: number,
  n: number,
  reason: string
): number {
  const tx = db.transaction((): number => {
    db.prepare("UPDATE users SET credits = credits + ? WHERE id = ?").run(
      n,
      userId
    );
    db.prepare(
      "INSERT INTO credit_transactions (user_id, amount, reason) VALUES (?, ?, ?)"
    ).run(userId, n, reason);
    const row = db.prepare("SELECT credits FROM users WHERE id = ?").get(userId) as
      | { credits: number }
      | undefined;
    return row?.credits ?? 0;
  });
  return tx();
}
