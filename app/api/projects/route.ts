import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { error, getCurrentUser } from "../auth/_shared";

type ProjectConfig = { speeds: string[]; dashboardSpeed: string; tiNumerator: string; tiDenominator: string };
type ProjectLimits = Record<string, { ucl: number; lcl: number; usl: number; lsl: number }>;
const canManage = (role: string) => role === "super_admin" || role === "department_admin";
const numberOrNull = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };

export async function POST(request: Request) {
  const current = await getCurrentUser(request);
  if (!current || !canManage(current.role)) return error("只有管理員可以管理大專案。", 403);
  const body = await request.json() as { action?: "project" | "branch" | "machine"; id?: string; projectId?: string; name?: string; type?: string; code?: string; config?: ProjectConfig };
  const name = body.name?.trim();
  const now = Date.now();

  if (body.action === "machine") {
    const type = body.type?.trim(), code = body.code?.trim();
    if (!body.projectId || !type || !code) return error("機台設定不完整。", 400);
    try {
      await env.DB.prepare("INSERT INTO machines (id, project_id, type, code, active) VALUES (?, ?, ?, ?, 1)").bind(crypto.randomUUID(), body.projectId, type, code).run();
    } catch { return error("此機台編號已存在。", 409); }
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  if (!name) return error("請輸入名稱。", 400);

  if (body.action === "branch") {
    if (!body.projectId) return error("找不到所屬大專案。", 400);
    const duplicate = await env.DB.prepare("SELECT id FROM branches WHERE project_id = ? AND name = ? AND visible = 1 LIMIT 1").bind(body.projectId, name).first();
    if (duplicate) return error("此分支專案名稱已存在。", 409);
    const branchId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO branches (id, project_id, name, visible, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").bind(branchId, body.projectId, name, now, now),
      env.DB.prepare("INSERT INTO audit_logs (id, user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, 'create', 'branch', ?, ?, ?)").bind(crypto.randomUUID(), current.id, branchId, JSON.stringify({ projectId: body.projectId, name }), now),
    ]);
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  if (!body.id || !body.config?.speeds?.length) return error("大專案設定不完整。", 400);
  const duplicate = await env.DB.prepare("SELECT id FROM projects WHERE name = ? AND visible = 1 LIMIT 1").bind(name).first();
  if (duplicate) return error("此大專案名稱已存在。", 409);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects
      (id, name, department, visible, viscosity_speeds, recipe_template_json, dashboard_speed, ti_numerator, ti_denominator, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, '[]', ?, ?, ?, ?, ?)`)
      .bind(body.id, name, current.department, JSON.stringify(body.config.speeds), numberOrNull(body.config.dashboardSpeed) ?? 0,
        numberOrNull(body.config.tiNumerator), numberOrNull(body.config.tiDenominator), now, now),
    env.DB.prepare("INSERT INTO audit_logs (id, user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, 'create', 'project', ?, ?, ?)").bind(crypto.randomUUID(), current.id, body.id, JSON.stringify({ name }), now),
  ]);
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const current = await getCurrentUser(request);
  if (!current || !canManage(current.role)) return error("只有管理員可以儲存專案設定。", 403);
  const body = await request.json() as { projectId?: string; config?: ProjectConfig; recipe?: unknown[]; limits?: ProjectLimits };
  if (!body.projectId) return error("找不到大專案。", 400);
  const exists = await env.DB.prepare("SELECT id FROM projects WHERE id = ? AND visible = 1 LIMIT 1").bind(body.projectId).first();
  if (!exists) return error("大專案不存在或已刪除。", 404);
  const now = Date.now();
  const statements = [];
  if (body.config) statements.push(env.DB.prepare(`UPDATE projects SET viscosity_speeds = ?, dashboard_speed = ?, ti_numerator = ?, ti_denominator = ?, updated_at = ? WHERE id = ?`)
    .bind(JSON.stringify(body.config.speeds), numberOrNull(body.config.dashboardSpeed) ?? 0, numberOrNull(body.config.tiNumerator), numberOrNull(body.config.tiDenominator), now, body.projectId));
  if (body.recipe) statements.push(env.DB.prepare("UPDATE projects SET recipe_template_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(body.recipe), now, body.projectId));
  if (body.limits) {
    statements.push(env.DB.prepare("DELETE FROM spc_limits WHERE project_id = ?").bind(body.projectId));
    Object.entries(body.limits).forEach(([metric, value]) => statements.push(env.DB.prepare("INSERT INTO spc_limits (id, project_id, metric, ucl, lcl, usl, lsl, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), body.projectId, metric, numberOrNull(value.ucl), numberOrNull(value.lcl), numberOrNull(value.usl), numberOrNull(value.lsl), now)));
  }
  if (!statements.length) return error("沒有可儲存的設定。", 400);
  statements.push(env.DB.prepare("INSERT INTO audit_logs (id, user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, 'update', 'project_settings', ?, '{}', ?)").bind(crypto.randomUUID(), current.id, body.projectId, now));
  await env.DB.batch(statements);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const current = await getCurrentUser(request);
  if (!current || !canManage(current.role)) return error("只有管理員可以刪除專案設定。", 403);
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const projectId = url.searchParams.get("projectId");
  const name = url.searchParams.get("name")?.trim();
  const machineType = url.searchParams.get("machineType")?.trim();
  const code = url.searchParams.get("code")?.trim();
  if (!projectId) return error("找不到大專案。", 400);
  const now = Date.now();

  if (type === "machine") {
    if (!machineType || !code) return error("找不到機台設定。", 400);
    const result = await env.DB.prepare("DELETE FROM machines WHERE project_id = ? AND type = ? AND code = ?").bind(projectId, machineType, code).run();
    if (!result.meta.changes) return error("機台設定不存在或已刪除。", 404);
    return NextResponse.json({ ok: true });
  }

  if (type === "branch") {
    if (!name) return error("找不到分支專案。", 400);
    const branch = await env.DB.prepare("SELECT id FROM branches WHERE project_id = ? AND name = ? AND visible = 1 LIMIT 1").bind(projectId, name).first<{ id: string }>();
    if (!branch) return error("分支專案不存在或已刪除。", 404);
    const usage = await env.DB.prepare("SELECT COUNT(*) AS count FROM batches WHERE branch_id = ?").bind(branch.id).first<{ count: number }>();
    if (Number(usage?.count || 0) > 0) return error("此分支已有正式 DOE 資料，請先刪除相關資料後再刪除分支。", 409);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM branches WHERE id = ?").bind(branch.id),
      env.DB.prepare("INSERT INTO audit_logs (id, user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, 'delete', 'branch', ?, ?, ?)").bind(crypto.randomUUID(), current.id, branch.id, JSON.stringify({ projectId, name }), now),
    ]);
    return NextResponse.json({ ok: true });
  }

  const usage = await env.DB.prepare("SELECT COUNT(*) AS count FROM batches WHERE project_id = ?").bind(projectId).first<{ count: number }>();
  if (Number(usage?.count || 0) > 0) return error("此大專案已有正式資料，請先在專案大盤刪除該專案的所有 DOE，再刪除大專案。", 409);
  const project = await env.DB.prepare("SELECT name FROM projects WHERE id = ? AND visible = 1 LIMIT 1").bind(projectId).first<{ name: string }>();
  if (!project) return error("大專案不存在或已刪除。", 404);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM spc_limits WHERE project_id = ?").bind(projectId),
    env.DB.prepare("DELETE FROM machines WHERE project_id = ?").bind(projectId),
    env.DB.prepare("DELETE FROM branches WHERE project_id = ?").bind(projectId),
    env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(projectId),
    env.DB.prepare("INSERT INTO audit_logs (id, user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, 'delete', 'project', ?, ?, ?)").bind(crypto.randomUUID(), current.id, projectId, JSON.stringify({ name: project.name }), now),
  ]);
  return NextResponse.json({ ok: true });
}
