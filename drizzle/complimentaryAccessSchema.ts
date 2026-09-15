import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Admin-issued plan entitlements that sit alongside Stripe billing.
 *
 * Important: this table never represents a charge. Stripe remains the source
 * of truth for paid subscriptions. An active, unexpired grant can only raise
 * a user's effective plan; it must never downgrade a paid entitlement.
 */
export const complimentaryAccessGrants = mysqlTable(
  "complimentary_access_grants",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    plan: mysqlEnum("plan", ["starter", "pro", "business", "agency"]).notNull(),
    status: mysqlEnum("status", ["active", "revoked"])
      .default("active")
      .notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    grantedByUserId: int("grantedByUserId").notNull(),
    startsAt: timestamp("startsAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt"),
    revokedAt: timestamp("revokedAt"),
    revokedByUserId: int("revokedByUserId"),
    revokeReason: varchar("revokeReason", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userStatusIdx: index("idx_comp_access_user_status").on(
      table.userId,
      table.status
    ),
    expiresAtIdx: index("idx_comp_access_expires_at").on(table.expiresAt),
    createdAtIdx: index("idx_comp_access_created_at").on(table.createdAt),
  })
);

export type ComplimentaryAccessGrant =
  typeof complimentaryAccessGrants.$inferSelect;
export type InsertComplimentaryAccessGrant =
  typeof complimentaryAccessGrants.$inferInsert;
