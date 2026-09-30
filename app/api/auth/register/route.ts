import { env } from "cloudflare:workers";
import { ensureAuthTables, error, hashPassword } from "../_shared";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  await ensureAuthTables();
  const body = await request.json() as { employeeId?: string; name?: string; department?: string; password?: string };
  const employeeId = String(body.employeeId || "").trim().toUpperCase();
  const name = String(body.name || "").trim();
  const department = String(body.department || "").trim();
  const password = String(body.password || "");
  if (!/^[A-Z0-9._-]{3,30}$/.test(employeeId)) return error("工號需為 3～30 碼英數字，可包含 . _ -。", 400);
  if (name.length < 2 || department.length < 2) return error("請完整填寫姓名與部門。", 400);
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return error("密碼至少 10 碼，且必須同時包含英文字母與數字。", 400);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE employee_id = ? LIMIT 1").bind(employeeId).first();
  if (existing) return error("此工號已申請或建立。", 409);
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
  const firstUser = Number(count?.count || 0) === 0;
  const passwordData = await hashPassword(password);
  const userId = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO users (id, employee_id, name, department, role, password_hash, salt, active, failed_attempts, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`).bind(userId, employeeId, name, department, firstUser ? "super_admin" : "operator", passwordData.hash, passwordData.salt, firstUser ? 1 : 0, Date.now()).run();
  return NextResponse.json({ ok: true, firstUser, message: firstUser ? "最高管理員建立完成，請使用工號與密碼登入。" : "帳號申請已送出，請等待管理員啟用。" });
}

