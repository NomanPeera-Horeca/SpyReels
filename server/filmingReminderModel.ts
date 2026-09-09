import {
  date,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { coachScripts, workspaces } from "../drizzle/schema";

/**
 * Filming reminders are intentionally separate from saved_scripts.postDate /
 * postTime. Those existing fields describe planned publishing, while this
 * table describes when and how the creator plans to record the content.
 */
export const filmingReminders = mysqlTable(
  "filming_reminders",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    workspaceId: varchar("workspaceId", { length: 36 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    coachScriptId: int("coachScriptId")
      .notNull()
      .references(() => coachScripts.id, { onDelete: "cascade" }),
    savedScriptId: int("savedScriptId"),
    title: varchar("title", { length: 256 }).notNull(),
    filmingDate: date("filmingDate", { mode: "string" }).notNull(),
    filmingTime: varchar("filmingTime", { length: 8 }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull(),
    setup: varchar("setup", { length: 32 }).notNull(),
    setupLabel: varchar("setupLabel", { length: 128 }).notNull(),
    openingVisual: text("openingVisual"),
    onScreenText: varchar("onScreenText", { length: 512 }),
    notes: text("notes"),
    status: mysqlEnum("status", ["scheduled", "completed", "cancelled"])
      .default("scheduled")
      .notNull(),
    reminderSentAt: timestamp("reminderSentAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    workspaceScriptUnique: uniqueIndex(
      "uniq_filming_reminders_workspace_script"
    ).on(table.workspaceId, table.coachScriptId),
    dueIdx: index("idx_filming_reminders_due").on(
      table.workspaceId,
      table.filmingDate,
      table.filmingTime,
      table.status
    ),
  })
);

export type FilmingReminder = typeof filmingReminders.$inferSelect;
export type InsertFilmingReminder = typeof filmingReminders.$inferInsert;
