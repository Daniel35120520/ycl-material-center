import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  name: text("name").notNull(),
  department: text("department").notNull(),
  role: text("role", { enum: ["super_admin", "department_admin", "project_manager", "operator"] }).notNull(),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
  lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("users_employee_id_unique").on(table.employeeId)]);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
  revoked: integer("revoked", { mode: "boolean" }).notNull().default(false),
}, (table) => [uniqueIndex("sessions_token_hash_unique").on(table.tokenHash), index("sessions_user_idx").on(table.userId)]);

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(), name: text("name").notNull(), department: text("department").notNull(),
  visible: integer("visible", { mode: "boolean" }).notNull().default(true),
  viscositySpeeds: text("viscosity_speeds", { mode: "json" }).notNull(),
  recipeTemplateJson: text("recipe_template_json", { mode: "json" }),
  dashboardSpeed: real("dashboard_speed").notNull(), tiNumerator: real("ti_numerator"), tiDenominator: real("ti_denominator"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const branches = sqliteTable("branches", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(), detail: text("detail"), visible: integer("visible", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("branches_project_idx").on(table.projectId)]);

export const machines = sqliteTable("machines", {
  id: text("id").primaryKey(), projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(), code: text("code").notNull(), active: integer("active", { mode: "boolean" }).notNull().default(true),
}, (table) => [uniqueIndex("machines_project_type_code_unique").on(table.projectId, table.type, table.code), index("machines_project_idx").on(table.projectId)]);

export const submissionGroups = sqliteTable("submission_groups", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => projects.id),
  standardBatchId: text("standard_batch_id"), submittedBy: text("submitted_by").notNull().references(() => users.id),
  submittedAt: integer("submitted_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("submission_groups_project_date_idx").on(table.projectId, table.submittedAt)]);

export const batches = sqliteTable("batches", {
  id: text("id").primaryKey(), submissionGroupId: text("submission_group_id").notNull().references(() => submissionGroups.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id), branchId: text("branch_id").references(() => branches.id),
  batchNo: text("batch_no").notNull(), productionDate: text("production_date").notNull(), reporterId: text("reporter_id").notNull().references(() => users.id),
  isStandard: integer("is_standard", { mode: "boolean" }).notNull().default(false), inputWeight: real("input_weight"), outputWeight: real("output_weight"), yieldPercent: real("yield_percent"),
  panWeight: real("pan_weight"), wetWeight: real("wet_weight"), dryWeight: real("dry_weight"), solidPercent: real("solid_percent"),
  viscosity: real("viscosity"), viscositiesJson: text("viscosities_json", { mode: "json" }).notNull(), tiValue: real("ti_value"),
  sheetResistanceJson: text("sheet_resistance_json", { mode: "json" }).notNull(), sheetExponent: integer("sheet_exponent"),
  sheetExponentsJson: text("sheet_exponents_json", { mode: "json" }).notNull().default(["-3", "-3", "-3"]),
  thicknessJson: text("thickness_json", { mode: "json" }).notNull(), resistivity: real("resistivity"),
  finenessMain: real("fineness_main"), finenessSecond: real("fineness_second"), filmSuccess: integer("film_success", { mode: "boolean" }),
  machinesJson: text("machines_json", { mode: "json" }).notNull(), recipeJson: text("recipe_json", { mode: "json" }).notNull(), processJson: text("process_json", { mode: "json" }).notNull(), note: text("note"),
  version: integer("version").notNull().default(1), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("batches_batch_no_unique").on(table.batchNo), index("batches_project_date_idx").on(table.projectId, table.productionDate), index("batches_submission_group_idx").on(table.submissionGroupId)]);

export const spcLimits = sqliteTable("spc_limits", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }), metric: text("metric").notNull(),
  ucl: real("ucl"), lcl: real("lcl"), usl: real("usl"), lsl: real("lsl"), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("spc_project_metric_unique").on(table.projectId, table.metric)]);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => users.id), action: text("action").notNull(), targetType: text("target_type").notNull(), targetId: text("target_id").notNull(), detail: text("detail", { mode: "json" }), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("audit_created_idx").on(table.createdAt)]);
