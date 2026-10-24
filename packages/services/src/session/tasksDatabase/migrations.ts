import { TASK_GROUP_ADMISSIONS_SQL } from "#src/task-groups/migration-v6.js";
import { basename, dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { databaseMigrationIdSchema, type DatabaseMigrationFacts } from "@zcode/shared";
import type { DatabaseSync } from "node:sqlite";
import { sqliteMigrations, type SqliteMigration } from "@zcode/shared/sqlite-migrations";
import {
  AUTOMATION_SCHEMA,
  OFF_PEAK_SCHEMA,
  TASK_INDEX_SCHEMA,
} from "#src/session/tasksDatabase/schema-v1.js";
import { importLegacyAutomationSelections } from "#src/session/tasksDatabase/provider-selection-v2.js";
import { OFFICIAL_GLM_SELECTION_MIGRATION_SQL } from "#src/session/tasksDatabase/official-glm-selection-v3.js";
<<<<<<< HEAD
import { WORKSPACE_REGISTRY_MIGRATION_SQL } from "#src/session/tasksDatabase/workspace-registry-v1.js";
import { WORKSPACE_REGISTRY_ACTIVE_SESSION_COUNT_MIGRATION_SQL } from "#src/session/tasksDatabase/workspace-registry-v2.js";
=======
import { CONTROLLER_REMOTE_SCHEMA_SQL } from "#src/session/tasksDatabase/controller-remote-schema-v4.js";
import {
  adoptSourceServerWorkspaceSchema,
  SOURCE_SERVER_SCHEMA_CHECKSUM_INPUT,
} from "#src/session/tasksDatabase/source-server-schema-v5.js";
>>>>>>> zai-org/main

// 冻结历史列声明，不能以实时 Repo/schema 代替，否则新版构建会改变已应用 checksum。
const columns = [
  ["tasks", "title_overridden", "INTEGER NOT NULL DEFAULT 0"],
  ["tasks", "last_unread_at", "INTEGER NOT NULL DEFAULT 0"],
  ["tasks", "searchable_text", "TEXT NOT NULL DEFAULT ''"],
  ["tasks", "cron_automation_id", "TEXT"],
  ["tasks", "off_peak_task_id", "TEXT"],
  ["automations", "target_task_id", "TEXT"],
  ["automations", "bot_delivery_target", "TEXT"],
  ["automations", "mode", "TEXT"],
  ["automations", "end_at", "INTEGER"],
  ["automations", "schedule_rule", "TEXT"],
  ["automations", "schedule_edited_by_user", "INTEGER NOT NULL DEFAULT 0"],
  ["automations", "thought_level", "TEXT"],
  ["automations", "model_selection", "TEXT"],
  ["automations", "scheduled_run_count", "INTEGER NOT NULL DEFAULT 0"],
  ["automation_runs", "model_selection", "TEXT"],
  ["off_peak_tasks", "thought_level", "TEXT"],
  ["off_peak_tasks", "model_selection", "TEXT"],
  ["off_peak_tasks", "history_deleted_at", "INTEGER"],
] as const;
const indexes = `
  CREATE INDEX IF NOT EXISTS idx_tasks_cron_automation ON tasks(cron_automation_id, updated_at DESC)
    WHERE cron_automation_id IS NOT NULL AND deleted=0;
  CREATE INDEX IF NOT EXISTS idx_tasks_off_peak_task ON tasks(off_peak_task_id, updated_at DESC)
    WHERE off_peak_task_id IS NOT NULL AND deleted=0;
  CREATE INDEX IF NOT EXISTS idx_automations_target_task ON automations(target_task_id) WHERE target_task_id IS NOT NULL;
`;
const terminalStatuses = "'completed','failed','cancelled'";
const activePredicate = `session_id IS NOT NULL AND status NOT IN (${terminalStatuses})`;
const boundIndex = `CREATE UNIQUE INDEX IF NOT EXISTS idx_off_peak_bound_active ON off_peak_tasks(workspace_key,session_id) WHERE ${activePredicate}`;
const executionColumns = [
  ["automations", "project_id"],
  ["automations", "host_id"],
  ["automations", "additional_directories"],
  ["off_peak_tasks", "project_id"],
  ["off_peak_tasks", "host_id"],
  ["off_peak_tasks", "additional_directories"],
] as const;

// 与 Agent 同样是库级串行事务，但不跨域依赖其具体 adapter。TS 转换使用冻结语义版本，
// 禁用 function.toString 哈希：Electron/SEA 打包会改变函数文本而非迁移语义。
const definitions = [
  {
    id: "0001_adopt_task_schema",
    touchedTables: [
      "tasks",
      "task_groups",
      "task_group_members",
      "task_group_view_node_orders",
      "task_group_workspace_bootstraps",
      "automations",
      "automation_runs",
      "off_peak_tasks",
    ],
    apply: adoptSchema,
    checksumInput: [
      TASK_INDEX_SCHEMA,
      AUTOMATION_SCHEMA,
      OFF_PEAK_SCHEMA,
      columns,
      indexes,
      boundIndex,
      "scheduled-count-backfill-v1",
    ],
  },
  {
    id: "0002_provider_selection",
    touchedTables: ["automations"],
    apply: importLegacyAutomationSelections,
    checksumInput: ["legacy-automation-selection-v1", "no-provider-for-legacy-off-peak-v1"],
  },
  {
    id: "0003_official_glm_selection",
    touchedTables: ["automations"],
    apply: (db: DatabaseSync) => db.exec(OFFICIAL_GLM_SELECTION_MIGRATION_SQL),
    checksumInput: [OFFICIAL_GLM_SELECTION_MIGRATION_SQL],
  },
  {
<<<<<<< HEAD
    // 0004：工作区注册表（可见工作区的唯一真相源）。只增不改：不 ALTER 既有表。
    id: "0004_workspace_registry",
    checksumInput: [WORKSPACE_REGISTRY_MIGRATION_SQL],
  },
  {
    // 0005：注册表增加未归档会话数（active_session_count），修「说已有 N 个会话、点开是空的」。
    // 只对 0004 建出的表 ADD COLUMN；兼容策略见 workspace-registry-v2.ts 顶部注释。
    id: "0005_workspace_registry_active_session_count",
    checksumInput: [WORKSPACE_REGISTRY_ACTIVE_SESSION_COUNT_MIGRATION_SQL],
  },
] as const;

/**
 * 迁移 id → 执行动作（显式分派）。
 *
 * 依据（修缺陷，不是改语义）：迁移循环此前用的是 if 0001 / else if 0002 / **else 执行 0003 的 SQL**
 * 兜底分支（原 migrations.ts:122-126）—— 任何新增 id 都会被静默执行成官方 GLM 迁移，是一条静默
 * 数据污染路径。现在未知 id 显式抛错（fail-closed），既有 0001-0004 的行为逐字不变。
 * 新增迁移必须在这里登记分支，否则 packages/services/test/workspaceRegistryRepo.test.ts
 * 的「未知 id 必须抛错」断言会失败。
 */
export function resolveTaskDatabaseMigrationAction(id: string): (db: DatabaseSync) => void {
  if (id === "0001_adopt_task_schema") return adoptSchema;
  if (id === "0002_provider_selection") return importLegacyAutomationSelections;
  if (id === "0003_official_glm_selection")
    return (db) => db.exec(OFFICIAL_GLM_SELECTION_MIGRATION_SQL);
  if (id === "0004_workspace_registry") return (db) => db.exec(WORKSPACE_REGISTRY_MIGRATION_SQL);
  if (id === "0005_workspace_registry_active_session_count")
    return (db) => db.exec(WORKSPACE_REGISTRY_ACTIVE_SESSION_COUNT_MIGRATION_SQL);
  throw new Error("Unknown task database migration id: " + id);
}

export function runTasksDatabaseMigrations(
=======
    id: "0004_project_execution_scopes",
    touchedTables: ["automations", "off_peak_tasks"],
    checksumInput: [executionColumns, "nullable-text-v1"],
    apply: (db: DatabaseSync) => {
      // 原因：调度器可独立打开 Repo，不能等待项目归属转换，也不能把新列写进上游冻结 schema。
      for (const [table, column] of executionColumns) {
        if (
          !db
            .prepare(`PRAGMA table_info(${table})`)
            .all()
            .some((entry) => entry.name === column)
        )
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`);
      }
    },
  },
  {
    id: "0006_task_group_admissions",
    touchedTables: ["task_group_admissions"],
    checksumInput: [TASK_GROUP_ADMISSIONS_SQL],
    apply: (db: DatabaseSync) => db.exec(TASK_GROUP_ADMISSIONS_SQL),
  },
] as const;

export type TasksDatabaseMigrationScope = "base" | "controller-remote" | "source-server";

interface TasksDatabaseMigrationOptions {
  scope?: TasksDatabaseMigrationScope;
  dbPath?: string;
  transactionOpen?: boolean;
  migration?: DatabaseMigrationFacts;
  onProgress?: (phase: "migrating" | "committing", migration: DatabaseMigrationFacts) => void;
}

function prepareMigrations(scope: TasksDatabaseMigrationScope) {
  // 两端专属表仍归同库账本协调，不会为另一端创建无关表。
  const migrations =
    scope === "base"
      ? definitions
      : scope === "controller-remote"
        ? [
            {
              id: "0004_controller_remote_identity",
              checksumInput: [CONTROLLER_REMOTE_SCHEMA_SQL],
              touchedTables: ["controller_remote_identity_migrations"],
              apply: (db: DatabaseSync) => db.exec(CONTROLLER_REMOTE_SCHEMA_SQL),
            },
          ]
        : [
            {
              id: "0005_source_server_workspace_schema",
              checksumInput: SOURCE_SERVER_SCHEMA_CHECKSUM_INPUT,
              touchedTables: [
                "workspace_alias",
                "workspace_migration_schema_version",
                "workspace_migration_ledger",
                "workspace_migration_conflicts",
                "workspace_migration_ledger_v2",
                "workspace_migration_conflicts_v2",
              ],
              apply: adoptSourceServerWorkspaceSchema,
            },
          ];
  return migrations.map((migration) => ({
    id: migration.id,
    appVersion: "3.12.0",
    sql: JSON.stringify(migration.checksumInput),
    touchedTables: migration.touchedTables,
    apply: migration.apply,
    checksum: createHash("sha256").update(JSON.stringify(migration.checksumInput)).digest("hex"),
  }));
}

export async function runTasksDatabaseMigrations(
>>>>>>> zai-org/main
  db: DatabaseSync,
  scopeOrOptions: string | TasksDatabaseMigrationOptions = "base",
) {
  const options: TasksDatabaseMigrationOptions =
    typeof scopeOrOptions === "string"
      ? ["base", "controller-remote", "source-server"].includes(scopeOrOptions)
        ? { scope: scopeOrOptions as TasksDatabaseMigrationScope }
        : { dbPath: scopeOrOptions }
      : scopeOrOptions;
  const scope = options.scope ?? "base";
  const migrations = prepareMigrations(scope);
  if (!options.transactionOpen && areTasksDatabaseMigrationsApplied(db, scope))
    return { applied: [], backupSkipped: false };
  const facts = options.migration ?? {
    kind: inspectTasksMigrationKind(db, scope),
    executedCount: 0,
    committedCount: 0,
  };
  const path =
    options.dbPath ??
    String(
      db
        .prepare("pragma database_list")
        .all()
        .find((row) => row.name === "main")?.file ?? ":memory:",
    );
  const directory = dirname(path);
  const dataRoot = basename(directory) === "v2" ? dirname(directory) : directory;
  let currentMigrationId: string | undefined;
  try {
<<<<<<< HEAD
    if (!options.migration) migrationFacts.kind = inspectTasksMigrationKind(db);
    db.exec(`CREATE TABLE IF NOT EXISTS tasks_schema_migration (
      id TEXT PRIMARY KEY, checksum TEXT NOT NULL, time_applied INTEGER NOT NULL
    )`);
    // 锁内、版本 SQL 之前采集；空账本是 none，异常编号不作为遥测原文发送。
    const baseline = db
      .prepare("SELECT id FROM tasks_schema_migration ORDER BY id DESC LIMIT 1")
      .get();
    migrationFacts.lastAppliedMigrationId = baseline
      ? databaseMigrationIdSchema.safeParse(baseline.id).data
      : null;
    for (const migration of definitions) {
      currentMigrationId = migration.id;
      const checksum = createHash("sha256")
        .update(JSON.stringify(migration.checksumInput))
        .digest("hex");
      const applied = db
        .prepare("SELECT checksum FROM tasks_schema_migration WHERE id=?")
        .get(migration.id);
      if (applied) {
        if (applied.checksum !== checksum)
          throw Object.assign(
            new Error(`Task database migration checksum mismatch: ${migration.id}`),
            { kind: "checksum_mismatch" },
          );
        continue;
      }
      if (migrationFacts.kind === "none") migrationFacts.kind = "upgrade";
      options.onProgress?.("migrating", { ...migrationFacts });
      resolveTaskDatabaseMigrationAction(migration.id)(db);
      migrationFacts.executedCount++;
      db.prepare("INSERT INTO tasks_schema_migration VALUES(?,?,?)").run(
        migration.id,
        checksum,
        Date.now(),
      );
    }
    options.onProgress?.("committing", { ...migrationFacts });
    db.exec("COMMIT");
    migrationFacts.committedCount = migrationFacts.executedCount;
=======
    const result = await sqliteMigrations.migrate(db, migrations, {
      database: "tasks_schema",
      journalTable: "tasks_schema_migration",
      backupDirectories: [join(dataRoot, "backup")],
      transactionOpen: options.transactionOpen,
      onBeforeApply: (id) => {
        currentMigrationId = id;
        if (facts.kind === "none") facts.kind = "upgrade";
        if (facts.lastAppliedMigrationId === undefined) {
          const baseline = db
            .prepare("SELECT id FROM tasks_schema_migration ORDER BY id DESC LIMIT 1")
            .get();
          facts.lastAppliedMigrationId = baseline
            ? databaseMigrationIdSchema.safeParse(baseline.id).data
            : null;
        }
        options.onProgress?.("migrating", { ...facts });
      },
      onApplied: () => {
        facts.executedCount++;
      },
      onCommitting: () => {
        if (facts.lastAppliedMigrationId === undefined) {
          const baseline = db
            .prepare("SELECT id FROM tasks_schema_migration ORDER BY id DESC LIMIT 1")
            .get();
          facts.lastAppliedMigrationId = baseline
            ? databaseMigrationIdSchema.safeParse(baseline.id).data
            : null;
        }
        options.onProgress?.("committing", { ...facts });
      },
    });
    facts.committedCount = facts.executedCount;
    return result;
>>>>>>> zai-org/main
  } catch (error) {
    if (error && typeof error === "object" && currentMigrationId)
      Object.assign(error, { migrationId: currentMigrationId });
    throw error;
  }
}

function isMigrationApplied(db: DatabaseSync, id: string, checksum: string): boolean {
  const applied = db.prepare("SELECT checksum FROM tasks_schema_migration WHERE id=?").get(id);
  if (!applied) return false;
  if (applied.checksum !== checksum)
    throw Object.assign(new Error(`Task database migration checksum mismatch: ${id}`), {
      kind: "checksum_mismatch",
      migrationId: id,
    });
  return true;
}

/** 交接只复用已完成初始化；每个新连接按冻结账本确认，替换/清空文件不能假 ready。 */
export function areTasksDatabaseMigrationsApplied(
  db: DatabaseSync,
  scope: TasksDatabaseMigrationScope = "base",
): boolean {
  if (
    !db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tasks_schema_migration'")
      .get()
  )
    return false;
  return prepareMigrations(scope).every(({ id, checksum }) => isMigrationApplied(db, id, checksum));
}

/** 只读账本的展示预检，不授权执行；runner 拿锁后仍复查每一项。 */
export function inspectTasksMigrationKind(
  db: DatabaseSync,
  scope: TasksDatabaseMigrationScope = "base",
): DatabaseMigrationFacts["kind"] {
  const hasLedger = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tasks_schema_migration'")
    .get();
  let pending = false;
  for (const { id, checksum } of prepareMigrations(scope)) {
    if (!hasLedger || !isMigrationApplied(db, id, checksum)) pending = true;
  }
  if (!pending) return "none";
  return db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT IN ('tasks_schema_migration', 'sqlite_sequence') LIMIT 1",
    )
    .get()
    ? "upgrade"
    : "initialize";
}

function adoptSchema(db: DatabaseSync): void {
  db.exec(TASK_INDEX_SCHEMA + AUTOMATION_SCHEMA + OFF_PEAK_SCHEMA);
  for (const [table, column, definition] of columns) {
    const existing = db.prepare(`PRAGMA table_info(${table})`).all();
    if (existing.some((entry) => entry.name === column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    if (table === "automations" && column === "scheduled_run_count") {
      db.exec("UPDATE automations SET scheduled_run_count=run_count");
    }
  }
  db.exec(indexes);
  // 沿用已裁决的旧重复绑定保留策略，但不再吞掉权限/语法/磁盘等真实 SQL 错误。
  const duplicate = db
    .prepare(`SELECT 1 FROM off_peak_tasks WHERE ${activePredicate}
    GROUP BY workspace_key, session_id HAVING count(*)>1 LIMIT 1`)
    .get();
  if (!duplicate) db.exec(boundIndex);
}
