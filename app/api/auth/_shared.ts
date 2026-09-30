import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";

export type DbRole = "super_admin" | "department_admin" | "project_manager" | "operator";
export type AuthUser = { id: string; employeeId: string; name: string; department: string; role: DbRole; active: boolean };

const SESSION_COOKIE = "ycl_session";
const SESSION_SECONDS = 8 * 60 * 60;
const PBKDF2_ITERATIONS = 100_000;
const encoder = new TextEncoder();

export async function ensureAuthTables() {
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY NOT NULL,
      employee_id text NOT NULL,
      name text NOT NULL,
      department text NOT NULL,
      role text NOT NULL,
      password_hash text NOT NULL,
      salt text NOT NULL,
      active integer DEFAULT false NOT NULL,
      failed_attempts integer DEFAULT 0 NOT NULL,
      locked_until integer,
      last_login_at integer,
      created_at integer NOT NULL
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS users_employee_id_unique ON users (employee_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      id text PRIMARY KEY NOT NULL,
      token_hash text NOT NULL,
      user_id text NOT NULL,
      expires_at integer NOT NULL,
      last_seen_at integer NOT NULL,
      revoked integer DEFAULT false NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_unique ON sessions (token_hash)"),
    db.prepare("CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)"),
  ]);
}

const bytesToHex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
const hexToBytes = (hex: string) => new Uint8Array(hex.match(/.{2}/g)?.map(byte => Number.parseInt(byte, 16)) || []);

export async function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

export async function sha256(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

export function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return different === 0;
}

export function getCookie(request: Request, name = SESSION_COOKIE) {
  const cookies = request.headers.get("cookie") || "";
  const item = cookies.split(";").map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

export async function getCurrentUser(request: Request): Promise<AuthUser | null> {
  await ensureAuthTables();
  const token = getCookie(request);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = Date.now();
  const row = await env.DB.prepare(`SELECT u.id, u.employee_id AS employeeId, u.name, u.department, u.role, u.active
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked = 0 AND s.expires_at > ? AND u.active = 1 LIMIT 1`).bind(tokenHash, now).first<AuthUser>();
  if (!row) return null;
  await env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").bind(now, tokenHash).run();
  return { ...row, active: Boolean(row.active) };
}

export async function createSession(request: Request, userId: string) {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const now = Date.now();
  await env.DB.prepare("INSERT INTO sessions (id, token_hash, user_id, expires_at, last_seen_at, revoked) VALUES (?, ?, ?, ?, ?, 0)")
    .bind(crypto.randomUUID(), tokenHash, userId, now + SESSION_SECONDS * 1000, now).run();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: new URL(request.url).protocol === "https:", path: "/", maxAge: SESSION_SECONDS });
  return response;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", secure: true, path: "/", maxAge: 0 });
  return response;
}

export function publicUser(row: AuthUser) {
  return { id: row.id, employeeId: row.employeeId, name: row.name, department: row.department, role: row.role, active: Boolean(row.active) };
}

export function error(message: string, status = 400, code?: string) {
  return NextResponse.json({ ok: false, message, code }, { status });
}
