// 认证：scrypt 密码哈希 + jose JWT(HS256)
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { getDb } from "./db";
import type { UserDTO } from "./types";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-atomix-do-not-use-in-prod"
);

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return (
    actual.length === expected.length && timingSafeEqual(actual, expected)
  );
}

export async function signToken(user: { id: number; email: string }): Promise<string> {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

/** 从请求头解析用户（实时读库拿最新积分），无效返回 null */
export async function getUserFromRequest(req: Request): Promise<UserDTO | null> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const id = Number(payload.sub);
    if (!Number.isFinite(id)) return null;
    const row = getDb()
      .prepare("SELECT id, email, credits FROM users WHERE id = ?")
      .get(id) as UserDTO | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}
