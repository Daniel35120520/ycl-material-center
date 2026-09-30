import { env } from "cloudflare:workers";
import { createSession, ensureAuthTables, error, hashPassword, safeEqual } from "../_shared";

type LoginRow = { id: string; passwordHash: string; salt: string; active: number; failedAttempts: number; lockedUntil: number | null };

export async function POST(request: Request) {
  await ensureAuthTables();
  const body = await request.json() as { employeeId?: string; password?: string };
  const employeeId = String(body.employeeId || "").trim().toUpperCase();
  const password = String(body.password || "");
  const row = await env.DB.prepare(`SELECT id, password_hash AS passwordHash, salt, active, failed_attempts AS failedAttempts, locked_until AS lockedUntil
    FROM users WHERE employee_id = ? LIMIT 1`).bind(employeeId).first<LoginRow>();
  if (!row) return error("工號或密碼錯誤。", 401, "INVALID_CREDENTIALS");
  if (!row.active) return error("帳號尚未啟用，請聯絡管理員。", 403, "PENDING_ACTIVATION");
  if (row.lockedUntil && row.lockedUntil > Date.now()) return error("登入失敗次數過多，請 15 分鐘後再試。", 423, "LOCKED");
  const attempt = await hashPassword(password, row.salt);
  if (!safeEqual(attempt.hash, row.passwordHash)) {
    const failures = Number(row.failedAttempts || 0) + 1;
    const lockedUntil = failures >= 5 ? Date.now() + 15 * 60 * 1000 : null;
    await env.DB.prepare("UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?").bind(failures, lockedUntil, row.id).run();
    return error(failures >= 5 ? "登入失敗次數過多，帳號暫時鎖定 15 分鐘。" : "工號或密碼錯誤。", 401, "INVALID_CREDENTIALS");
  }
  await env.DB.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?").bind(Date.now(), row.id).run();
  return createSession(request, row.id);
}

