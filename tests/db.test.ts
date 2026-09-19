import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { openDb, deductCredits, grantCredits } from "../src/lib/db";
import { hashPassword, verifyPassword } from "../src/lib/auth";

function tmpDb() {
  const p = path.join(
    os.tmpdir(),
    `atomix-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  );
  const db = openDb(p);
  return { db, file: p };
}

describe("db schema + credits", () => {
  it("创建四张表并可插入用户", () => {
    const { db } = tmpDb();
    const r = db
      .prepare(
        "INSERT INTO users (email, password_hash) VALUES (?, ?)"
      )
      .run("a@t.com", "x:y");
    expect(r.lastInsertRowid).toBeGreaterThan(0);
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      )
      .all()
      .map((t: any) => t.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        "users",
        "projects",
        "messages",
        "credit_transactions",
      ])
    );
  });

  it("新用户默认 100 积分", () => {
    const { db } = tmpDb();
    const { lastInsertRowid } = db
      .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
      .run("b@t.com", "x:y");
    const u = db
      .prepare("SELECT credits FROM users WHERE id=?")
      .get(Number(lastInsertRowid)) as any;
    expect(u.credits).toBe(100);
  });

  it("原子扣减：余额 5 扣 10 失败且不留流水", () => {
    const { db } = tmpDb();
    const { lastInsertRowid } = db
      .prepare("INSERT INTO users (email, password_hash, credits) VALUES (?, ?, 5)")
      .run("c@t.com", "x:y");
    const id = Number(lastInsertRowid);
    const r = deductCredits(db, Number(id), 10, "generate");
    expect(r.ok).toBe(false);
    const n = (
      db
        .prepare("SELECT COUNT(*) c FROM credit_transactions WHERE user_id=?")
        .get(id) as any
    ).c;
    expect(n).toBe(0);
  });

  it("扣减成功：余额正确并写负流水；发放同理", () => {
    const { db } = tmpDb();
    const { lastInsertRowid } = db
      .prepare("INSERT INTO users (email, password_hash, credits) VALUES (?, ?, 20)")
      .run("d@t.com", "x:y");
    const id = Number(lastInsertRowid);
    const r1 = deductCredits(db, Number(id), 10, "generate");
    expect(r1).toEqual({ ok: true, credits: 10 });
    const g = grantCredits(db, Number(id), 5, "publish");
    expect(g).toBe(15);
    const rows = db
      .prepare(
        "SELECT amount, reason FROM credit_transactions WHERE user_id=? ORDER BY id"
      )
      .all(id) as any[];
    expect(rows).toEqual([
      { amount: -10, reason: "generate" },
      { amount: 5, reason: "publish" },
    ]);
  });
});

describe("password hashing", () => {
  it("hash/verify 往返", () => {
    const h = hashPassword("abc123");
    expect(h).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(verifyPassword("abc123", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
  });
});
