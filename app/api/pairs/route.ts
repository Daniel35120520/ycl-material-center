import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { error, getCurrentUser } from "../auth/_shared";

type ResultSummary = {
  batchNo: string;
  date: string;
  reporter: string;
  yield?: number;
  solid: number;
  viscosities: Record<string, number>;
  ti: number;
  resistivity: number;
  finenessMain: number;
  finenessSecond: number;
  film: number;
  mixer: string;
  tank?: string;
  mill: string;
  pourer?: string;
  press?: string;
  machines?: Record<string, string>;
  processRpm?: string;
  process?: Array<{ time: string; setTemp: string; actualTemp: string; rpm: string }>;
  note?: string;
  available?: boolean;
};

type Measurement = {
  pan?: string;
  wet?: string;
  dry?: string;
  viscosities?: Record<string, string>;
  sheet?: string[];
  exponents?: string[];
  thickness?: string[];
  finenessMain?: string;
  finenessSecond?: string;
  film?: string;
  note?: string;
};

type DoePayload = {
  batchNo: string;
  date: string;
  output?: string;
  ingredients?: unknown[];
  machines?: Record<string, string>;
  steps?: unknown[];
  measurement?: Measurement;
  summary: ResultSummary;
};

type CreatePayload = {
  projectId: string;
  projectName: string;
  config: { speeds: string[]; dashboardSpeed: string; tiNumerator: string; tiDenominator: string };
  branch: string;
  standard: { batchNo: string; date: string; measurement: Measurement; summary: ResultSummary };
  does: DoePayload[];
};

const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseJson = <T,>(value: unknown, fallback: T): T => {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const summaryFromRow = (row: Record<string, unknown>, prefix: "standard" | "doe"): ResultSummary => {
  const machines = parseJson<Record<string, string>>(row[`${prefix}Machines`], {});
  const process = parseJson<Array<{ time?: string; setTemp?: string; actualTemp?: string; rpm?: string }>>(row[`${prefix}Process`], []);
  const processRpm = [...new Set(process.map(step => String(step.rpm || "").trim()).filter(Boolean))].join("／") || "無";
  const storedBatchNo = String(row[`${prefix}BatchNo`] || "");
  const unavailable = prefix === "standard" && storedBatchNo.startsWith("__MISSING_STANDARD__");
  return {
    batchNo: unavailable ? "" : storedBatchNo,
    date: String(row[`${prefix}Date`] || ""),
    reporter: String(row[`${prefix}Reporter`] || ""),
    yield: prefix === "doe" && row.doeYield !== null ? Number(row.doeYield) : undefined,
    solid: Number(row[`${prefix}Solid`] || 0),
    viscosities: parseJson<Record<string, number>>(row[`${prefix}Viscosities`], {}),
    ti: Number(row[`${prefix}Ti`] || 0),
    resistivity: Number(row[`${prefix}Resistivity`] || 0),
    finenessMain: Number(row[`${prefix}FinenessMain`] || 0),
    finenessSecond: Number(row[`${prefix}FinenessSecond`] || 0),
    film: Number(row[`${prefix}Film`] || 0),
    mixer: prefix === "standard" ? "—" : machines.mixer || "無",
    tank: prefix === "standard" ? "—" : machines.tank || "無",
    mill: prefix === "standard" ? "—" : machines.mill || "無",
    pourer: prefix === "standard" ? "—" : machines.pourer || "無",
    press: prefix === "standard" ? "—" : machines.press || "無",
    machines: prefix === "standard" ? {} : machines,
    processRpm: prefix === "standard" ? "—" : processRpm,
    process: prefix === "standard" ? [] : process.map(step => ({ time: String(step.time || ""), setTemp: String(step.setTemp || ""), actualTemp: String(step.actualTemp || ""), rpm: String(step.rpm || "") })),
    note: String(row[`${prefix}Note`] || ""),
    available: !unavailable,
  };
};

async function listPairs() {
  const result = await env.DB.prepare(`SELECT
      d.id AS id, d.project_id AS projectId, COALESCE(br.name, '') AS branch,
      s.batch_no AS standardBatchNo, s.production_date AS standardDate, su.name AS standardReporter,
      s.solid_percent AS standardSolid, s.viscosities_json AS standardViscosities,
      s.ti_value AS standardTi, s.resistivity AS standardResistivity,
      s.fineness_main AS standardFinenessMain, s.fineness_second AS standardFinenessSecond,
      s.film_success AS standardFilm, s.machines_json AS standardMachines, s.note AS standardNote,
      d.batch_no AS doeBatchNo, d.production_date AS doeDate, du.name AS doeReporter,
      d.yield_percent AS doeYield, d.solid_percent AS doeSolid, d.viscosities_json AS doeViscosities,
      d.ti_value AS doeTi, d.resistivity AS doeResistivity,
      d.fineness_main AS doeFinenessMain, d.fineness_second AS doeFinenessSecond,
      d.film_success AS doeFilm, d.machines_json AS doeMachines, d.process_json AS doeProcess, d.note AS doeNote
    FROM batches d
    JOIN submission_groups g ON g.id = d.submission_group_id
    JOIN batches s ON s.id = g.standard_batch_id
    JOIN users su ON su.id = s.reporter_id
    JOIN users du ON du.id = d.reporter_id
    LEFT JOIN branches br ON br.id = d.branch_id
    WHERE d.is_standard = 0
    ORDER BY g.submitted_at DESC, d.created_at DESC`).all<Record<string, unknown>>();

  return result.results.map(row => ({
    id: String(row.id),
    projectId: String(row.projectId),
    branch: String(row.branch || ""),
    standard: summaryFromRow(row, "standard"),
    doe: summaryFromRow(row, "doe"),
  }));
}

async function listProjectSettings() {
  const [projectResult, branchResult, limitResult, machineResult] = await Promise.all([
    env.DB.prepare("SELECT id, name, viscosity_speeds AS speeds, recipe_template_json AS recipe, dashboard_speed AS dashboardSpeed, ti_numerator AS tiNumerator, ti_denominator AS tiDenominator FROM projects WHERE visible = 1 ORDER BY created_at ASC").all<Record<string, unknown>>(),
    env.DB.prepare("SELECT project_id AS projectId, name FROM branches WHERE visible = 1 ORDER BY created_at ASC").all<Record<string, unknown>>(),
    env.DB.prepare("SELECT project_id AS projectId, metric, ucl, lcl, usl, lsl FROM spc_limits").all<Record<string, unknown>>(),
    env.DB.prepare("SELECT project_id AS projectId, type, code FROM machines WHERE active = 1 AND project_id IS NOT NULL ORDER BY code ASC").all<Record<string, unknown>>(),
  ]);
  const branchMap = new Map<string, string[]>();
  branchResult.results.forEach(row => branchMap.set(String(row.projectId), [...(branchMap.get(String(row.projectId)) || []), String(row.name)]));
  const projects = projectResult.results.map(row => ({ id: String(row.id), name: String(row.name), branches: branchMap.get(String(row.id)) || [] }));
  const configs = Object.fromEntries(projectResult.results.map(row => [String(row.id), {
    speeds: parseJson<string[]>(row.speeds, []),
    dashboardSpeed: String(row.dashboardSpeed ?? ""),
    tiNumerator: String(row.tiNumerator ?? ""),
    tiDenominator: String(row.tiDenominator ?? ""),
  }]));
  const recipeTemplates = Object.fromEntries(projectResult.results.map(row => [String(row.id), parseJson<unknown[]>(row.recipe, [])]));
  const limits: Record<string, Record<string, { ucl: number; lcl: number; usl: number; lsl: number }>> = {};
  limitResult.results.forEach(row => { const projectId=String(row.projectId); (limits[projectId]||={})[String(row.metric)]={ucl:Number(row.ucl),lcl:Number(row.lcl),usl:Number(row.usl),lsl:Number(row.lsl)}; });
  const machinesByProject: Record<string, Record<string, string[]>> = {};
  machineResult.results.forEach(row => { const projectId=String(row.projectId), type=String(row.type); ((machinesByProject[projectId]||={})[type]||=[]).push(String(row.code)); });
  return { projects, configs, recipeTemplates, limits, machinesByProject };
}

export async function GET(request: Request) {
  const current = await getCurrentUser(request);
  if (!current) return error("請先登入。", 401);
  const settings = await listProjectSettings();
  return NextResponse.json({ pairs: await listPairs(), ...settings });
}

export async function POST(request: Request) {
  const current = await getCurrentUser(request);
  if (!current) return error("請先登入。", 401);
  const body = await request.json() as CreatePayload;
  if (!body.projectId || !body.projectName || !body.standard || !body.does?.length) {
    return error("專案與 DOE 資料不完整。", 400);
  }
  if (body.does.some(item => !item.batchNo?.trim() || !item.date)) return error("每組 DOE 都必須填寫批次與日期。", 400);

  const now = Date.now();
  await env.DB.prepare(`INSERT INTO projects
      (id, name, department, visible, viscosity_speeds, recipe_template_json, dashboard_speed, ti_numerator, ti_denominator, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, '[]', ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, viscosity_speeds = excluded.viscosity_speeds,
      dashboard_speed = excluded.dashboard_speed, ti_numerator = excluded.ti_numerator,
      ti_denominator = excluded.ti_denominator, updated_at = excluded.updated_at`)
    .bind(body.projectId, body.projectName, current.department, JSON.stringify(body.config.speeds), numberOrNull(body.config.dashboardSpeed) || 0,
      numberOrNull(body.config.tiNumerator), numberOrNull(body.config.tiDenominator), now, now).run();

  let branchId: string | null = null;
  if (body.branch.trim()) {
    const existing = await env.DB.prepare("SELECT id FROM branches WHERE project_id = ? AND name = ? LIMIT 1")
      .bind(body.projectId, body.branch.trim()).first<{ id: string }>();
    branchId = existing?.id || crypto.randomUUID();
    if (!existing) await env.DB.prepare("INSERT INTO branches (id, project_id, name, visible, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)")
      .bind(branchId, body.projectId, body.branch.trim(), now, now).run();
  }

  const groupId = crypto.randomUUID();
  const standardId = crypto.randomUUID();
  const standardMeasurement = body.standard.measurement || {};
  const standardSummary = body.standard.summary;
  const standardAvailable = Boolean(body.standard.batchNo?.trim());
  const storedStandardBatchNo = body.standard.batchNo?.trim() || `__MISSING_STANDARD__${standardId}`;
  const storedStandardDate = body.standard.date || body.does[0].date;
  const statements = [
    env.DB.prepare("INSERT INTO submission_groups (id, project_id, standard_batch_id, submitted_by, submitted_at) VALUES (?, ?, ?, ?, ?)")
      .bind(groupId, body.projectId, standardId, current.id, now),
    env.DB.prepare(`INSERT INTO batches
      (id, submission_group_id, project_id, branch_id, batch_no, production_date, reporter_id, is_standard,
       pan_weight, wet_weight, dry_weight, solid_percent, viscosities_json, ti_value,
       sheet_resistance_json, sheet_exponents_json, thickness_json, resistivity, fineness_main, fineness_second,
       film_success, machines_json, recipe_json, process_json, note, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', '[]', '[]', ?, ?, ?)`)
      .bind(standardId, groupId, body.projectId, storedStandardBatchNo, storedStandardDate, current.id,
        standardAvailable ? numberOrNull(standardMeasurement.pan) : null, standardAvailable ? numberOrNull(standardMeasurement.wet) : null, standardAvailable ? numberOrNull(standardMeasurement.dry) : null,
        standardAvailable ? numberOrNull(standardSummary.solid) : null, standardAvailable ? JSON.stringify(standardSummary.viscosities || {}) : "{}", standardAvailable ? numberOrNull(standardSummary.ti) : null,
        standardAvailable ? JSON.stringify(standardMeasurement.sheet || []) : "[]", JSON.stringify(standardMeasurement.exponents || ["-3", "-3", "-3"]),
        standardAvailable ? JSON.stringify(standardMeasurement.thickness || []) : "[]", standardAvailable ? numberOrNull(standardSummary.resistivity) : null,
        standardAvailable ? numberOrNull(standardSummary.finenessMain) : null, standardAvailable ? numberOrNull(standardSummary.finenessSecond) : null, standardAvailable ? (standardSummary.film ? 1 : 0) : null,
        standardAvailable ? (standardSummary.note || "") : "", now, now),
  ];

  body.does.forEach((item, index) => {
    const measurement = item.measurement || {};
    const result = item.summary;
    const inputWeight = (item.ingredients || []).reduce((total, ingredient) => total + Number((ingredient as { weight?: unknown }).weight || 0), 0);
    statements.push(env.DB.prepare(`INSERT INTO batches
      (id, submission_group_id, project_id, branch_id, batch_no, production_date, reporter_id, is_standard,
       input_weight, output_weight, yield_percent, pan_weight, wet_weight, dry_weight, solid_percent,
       viscosities_json, ti_value, sheet_resistance_json, sheet_exponents_json, thickness_json, resistivity,
       fineness_main, fineness_second, film_success, machines_json, recipe_json, process_json, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), groupId, body.projectId, branchId, item.batchNo.trim(), item.date, current.id,
        inputWeight || null, numberOrNull(item.output), numberOrNull(result.yield),
        numberOrNull(measurement.pan), numberOrNull(measurement.wet), numberOrNull(measurement.dry), numberOrNull(result.solid),
        JSON.stringify(result.viscosities || {}), numberOrNull(result.ti), JSON.stringify(measurement.sheet || []),
        JSON.stringify(measurement.exponents || ["-3", "-3", "-3"]), JSON.stringify(measurement.thickness || []),
        numberOrNull(result.resistivity), numberOrNull(result.finenessMain), numberOrNull(result.finenessSecond), result.film ? 1 : 0,
        JSON.stringify(item.machines || {}), JSON.stringify(item.ingredients || []), JSON.stringify(item.steps || []), result.note || "", now + index, now + index));
  });
  statements.push(env.DB.prepare("INSERT INTO audit_logs (id, user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, 'create', 'submission_group', ?, ?, ?)")
    .bind(crypto.randomUUID(), current.id, groupId, JSON.stringify({ standardBatchNo: body.standard.batchNo || null, doeCount: body.does.length }), now));

  try {
    await env.DB.batch(statements);
  } catch (reason) {
    const message = reason instanceof Error && reason.message.includes("UNIQUE") ? "批次編號已存在，請確認後再送出。" : "資料寫入失敗，請稍後再試。";
    return error(message, 409);
  }
  return NextResponse.json({ ok: true, pairs: await listPairs() }, { status: 201 });
}

export async function PATCH(request: Request) {
  const current = await getCurrentUser(request);
  if (!current || current.role === "operator") return error("沒有編輯資料的權限。", 403);
  const pair = await request.json() as { id?: string; standard?: ResultSummary; doe?: ResultSummary };
  if (!pair.id || !pair.standard || !pair.doe) return error("編輯資料不完整。", 400);
  const target = await env.DB.prepare(`SELECT g.standard_batch_id AS standardId FROM batches d
    JOIN submission_groups g ON g.id = d.submission_group_id WHERE d.id = ? AND d.is_standard = 0 LIMIT 1`)
    .bind(pair.id).first<{ standardId: string }>();
  if (!target) return error("找不到指定資料。", 404);
  const now = Date.now();
  const standardAvailable = Boolean(pair.standard.batchNo.trim());
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE batches SET batch_no = ?, production_date = ?, solid_percent = ?, viscosities_json = ?, ti_value = ?, resistivity = ?,
        fineness_main = ?, fineness_second = ?, film_success = ?, note = ?, updated_at = ? WHERE id = ?`)
        .bind(pair.standard.batchNo.trim() || `__MISSING_STANDARD__${target.standardId}`, pair.standard.date, standardAvailable ? numberOrNull(pair.standard.solid) : null, standardAvailable ? JSON.stringify(pair.standard.viscosities || {}) : "{}",
          standardAvailable ? numberOrNull(pair.standard.ti) : null, standardAvailable ? numberOrNull(pair.standard.resistivity) : null, standardAvailable ? numberOrNull(pair.standard.finenessMain) : null,
          standardAvailable ? numberOrNull(pair.standard.finenessSecond) : null, standardAvailable ? (pair.standard.film ? 1 : 0) : null, standardAvailable ? (pair.standard.note || "") : "", now, target.standardId),
      env.DB.prepare(`UPDATE batches SET batch_no = ?, production_date = ?, yield_percent = ?, solid_percent = ?, viscosities_json = ?, ti_value = ?,
        resistivity = ?, fineness_main = ?, fineness_second = ?, film_success = ?, machines_json = ?, process_json = ?, note = ?, updated_at = ? WHERE id = ?`)
        .bind(pair.doe.batchNo.trim(), pair.doe.date, numberOrNull(pair.doe.yield), numberOrNull(pair.doe.solid), JSON.stringify(pair.doe.viscosities || {}),
          numberOrNull(pair.doe.ti), numberOrNull(pair.doe.resistivity), numberOrNull(pair.doe.finenessMain),
          numberOrNull(pair.doe.finenessSecond), pair.doe.film ? 1 : 0, JSON.stringify({ mixer: pair.doe.mixer || "無", tank: pair.doe.tank || "無", mill: pair.doe.mill || "無", pourer: pair.doe.pourer || "無", press: pair.doe.press || "無", ...(pair.doe.machines || {}) }), JSON.stringify(pair.doe.process || []), pair.doe.note || "", now, pair.id),
      env.DB.prepare("INSERT INTO audit_logs (id, user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, 'update', 'batch_pair', ?, '{}', ?)")
        .bind(crypto.randomUUID(), current.id, pair.id, now),
    ]);
  } catch (reason) {
    const message = reason instanceof Error && reason.message.includes("UNIQUE") ? "批次編號已存在。" : "資料更新失敗。";
    return error(message, 409);
  }
  return NextResponse.json({ ok: true, pairs: await listPairs() });
}

export async function DELETE(request: Request) {
  const current = await getCurrentUser(request);
  if (!current || current.role === "operator") return error("沒有刪除資料的權限。", 403);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return error("缺少資料識別碼。", 400);
  const target = await env.DB.prepare("SELECT submission_group_id AS groupId, batch_no AS batchNo FROM batches WHERE id = ? AND is_standard = 0 LIMIT 1")
    .bind(id).first<{ groupId: string; batchNo: string }>();
  if (!target) return error("找不到指定資料。", 404);
  const remaining = await env.DB.prepare("SELECT COUNT(*) AS count FROM batches WHERE submission_group_id = ? AND is_standard = 0 AND id <> ?")
    .bind(target.groupId, id).first<{ count: number }>();
  const now = Date.now();
  const deletion = Number(remaining?.count || 0) === 0
    ? env.DB.prepare("DELETE FROM submission_groups WHERE id = ?").bind(target.groupId)
    : env.DB.prepare("DELETE FROM batches WHERE id = ?").bind(id);
  await env.DB.batch([
    deletion,
    env.DB.prepare("INSERT INTO audit_logs (id, user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, 'delete', 'batch_pair', ?, ?, ?)")
      .bind(crypto.randomUUID(), current.id, id, JSON.stringify({ batchNo: target.batchNo }), now),
  ]);
  return NextResponse.json({ ok: true, pairs: await listPairs() });
}
