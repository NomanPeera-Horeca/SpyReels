import {
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { workspaces } from "../drizzle/schema";

export const contentAgentRuns = mysqlTable(
  "content_agent_runs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: int("userId").notNull(),
    workspaceId: varchar("workspaceId", { length: 36 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    request: text("request").notNull(),
    status: mysqlEnum("status", [
      "running",
      "waiting_for_input",
      "completed",
      "failed",
      "cancelled",
    ])
      .default("running")
      .notNull(),
    currentArtifactKind: varchar("currentArtifactKind", { length: 24 }),
    currentArtifactId: int("currentArtifactId"),
    currentArtifactTitle: varchar("currentArtifactTitle", { length: 256 }),
    pendingTool: varchar("pendingTool", { length: 64 }),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    workspaceUpdatedIdx: index("idx_content_agent_runs_workspace_updated").on(
      table.workspaceId,
      table.updatedAt
    ),
    workspaceStatusIdx: index("idx_content_agent_runs_workspace_status").on(
      table.workspaceId,
      table.status
    ),
  })
);

export const contentAgentToolRuns = mysqlTable(
  "content_agent_tool_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    runId: varchar("runId", { length: 36 })
      .notNull()
      .references(() => contentAgentRuns.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspaceId", { length: 36 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    stepIndex: int("stepIndex").default(0).notNull(),
    tool: varchar("tool", { length: 64 }).notNull(),
    status: mysqlEnum("status", [
      "running",
      "waiting_for_input",
      "completed",
      "failed",
      "cancelled",
    ])
      .default("running")
      .notNull(),
    argsJson: json("argsJson").$type<Record<string, unknown> | null>(),
    resultJson: json("resultJson").$type<Record<string, unknown> | null>(),
    errorMessage: text("errorMessage"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    runStepUnique: uniqueIndex("uniq_content_agent_tool_run_step").on(
      table.runId,
      table.stepIndex
    ),
    workspaceIdx: index("idx_content_agent_tool_runs_workspace").on(
      table.workspaceId,
      table.createdAt
    ),
  })
);

export type ContentAgentRunRecord = typeof contentAgentRuns.$inferSelect;
export type ContentAgentToolRunRecord = typeof contentAgentToolRuns.$inferSelect;
