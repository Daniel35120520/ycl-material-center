import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { DbRole, error, getCurrentUser } from "../_shared";

const allowedRoles: DbRole[] = ["super_admin", "department_admin", "project_manager", "operator"];

export async function GET(request: Request) {
  const current = await getCurrentUser(request);
  if (!current || !["super_admin", "department_admin"].includes(current.role)) return error("沒有帳號管理權限。", 403);
  const query = current.role === "super_admin"
    ? env.DB.prepare(`SELECT id, employee_id AS employeeId, name, department, role, active, last_login_at AS lastLoginAt, created_at AS createdAt FROM users ORDER BY active ASC, created_at ASC`)
    : env.DB.prepare(`SELECT id, employee_id AS employeeId, name, department, role, active, last_login_at AS lastLoginAt, created_at AS createdAt FROM users WHERE department = ? AND role <> 'super_admin' ORDER BY active ASC, created_at ASC`).bind(current.department);
  const result = await query.all();
  return NextResponse.json({ users: result.results.map(row => ({ ...row, active: Boolean(row.active) })) });
}

export async function PATCH(request: Request) {
  const current = await getCurrentUser(request);
  if (!current || !["super_admin", "department_admin"].includes(current.role)) return error("沒有帳號管理權限。", 403);
  const body = await request.json() as { id?: string; active?: boolean; role?: DbRole; department?: string };
  if (!body.id || !body.role || !allowedRoles.includes(body.role)) return error("帳號設定不完整。", 400);
  if (current.role !== "super_admin" && body.role === "super_admin") return error("只有最高管理員可以指派最高管理員。", 403);
  if (body.id === current.id && body.active === false) return error("不能停用目前登入中的自己。", 400);
  if (body.id === current.id && body.role !== current.role) return error("不能變更目前登入中的自己角色。", 400);
  const target = await env.DB.prepare("SELECT department, role FROM users WHERE id = ? LIMIT 1").bind(body.id).first<{ department: string; role: DbRole }>();
  if (!target) return error("找不到指定帳號。", 404);
  if (current.role === "department_admin" && (target.department !== current.department || target.role === "super_admin" || String(body.department || "").trim() !== current.department)) return error("部門管理員只能管理自己部門的非最高管理員帳號。", 403);
  await env.DB.prepare("UPDATE users SET active = ?, role = ?, department = ? WHERE id = ?")
    .bind(body.active ? 1 : 0, body.role, String(body.department || "").trim(), body.id).run();
  await env.DB.prepare("UPDATE sessions SET revoked = 1 WHERE user_id = ? AND user_id <> ?").bind(body.id, current.id).run();
  return NextResponse.json({ ok: true });
}
