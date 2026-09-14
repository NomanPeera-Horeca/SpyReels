import {
  bigint,
  boolean,
  datetime,
  index,
  int,
  json,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { users } from "./schema";

export const aiOAuthClients = mysqlTable(
  "ai_oauth_clients",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: varchar("clientId", { length: 128 }).notNull(),
    /** SHA-256 hex for confidential clients. Public PKCE clients leave this null. */
    clientSecretHash: varchar("clientSecretHash", { length: 64 }),
    clientName: varchar("clientName", { length: 255 }).notNull(),
    /** Trusted attribution source, never accepted directly from end-user input. */
    source: varchar("source", { length: 32 }).default("unknown").notNull(),
    redirectUris: json("redirectUris").$type<string[]>().notNull(),
    allowedScopes: json("allowedScopes").$type<string[] | null>(),
    isPublic: boolean("isPublic").default(true).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    clientIdUq: uniqueIndex("uq_ai_oauth_clients_client_id").on(table.clientId),
    sourceIdx: index("idx_ai_oauth_clients_source").on(table.source),
  })
);

export const aiOAuthAuthorizationCodes = mysqlTable(
  "ai_oauth_authorization_codes",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    /** Only the SHA-256 hash is persisted. The raw code exists only in the redirect. */
    codeHash: varchar("codeHash", { length: 64 }).notNull(),
    clientId: varchar("clientId", { length: 128 })
      .notNull()
      .references(() => aiOAuthClients.clientId, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    redirectUri: varchar("redirectUri", { length: 1024 }).notNull(),
    scope: varchar("scope", { length: 1000 }).notNull(),
    codeChallenge: varchar("codeChallenge", { length: 128 }).notNull(),
    codeChallengeMethod: varchar("codeChallengeMethod", { length: 16 })
      .default("S256")
      .notNull(),
    expiresAt: datetime("expiresAt", { mode: "date" }).notNull(),
    consumedAt: datetime("consumedAt", { mode: "date" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    codeHashUq: uniqueIndex("uq_ai_oauth_authorization_codes_hash").on(table.codeHash),
    clientUserIdx: index("idx_ai_oauth_authorization_codes_client_user").on(
      table.clientId,
      table.userId
    ),
    expiresIdx: index("idx_ai_oauth_authorization_codes_expires").on(table.expiresAt),
  })
);

export const aiOAuthRefreshTokens = mysqlTable(
  "ai_oauth_refresh_tokens",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    /** Only the SHA-256 hash is persisted. */
    tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
    /** Rotation family used to revoke the entire chain on token reuse. */
    familyId: varchar("familyId", { length: 64 }).notNull(),
    clientId: varchar("clientId", { length: 128 })
      .notNull()
      .references(() => aiOAuthClients.clientId, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 32 }).default("unknown").notNull(),
    scope: varchar("scope", { length: 1000 }).notNull(),
    expiresAt: datetime("expiresAt", { mode: "date" }).notNull(),
    revokedAt: datetime("revokedAt", { mode: "date" }),
    replacedByHash: varchar("replacedByHash", { length: 64 }),
    lastUsedAt: datetime("lastUsedAt", { mode: "date" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    tokenHashUq: uniqueIndex("uq_ai_oauth_refresh_tokens_hash").on(table.tokenHash),
    familyIdx: index("idx_ai_oauth_refresh_tokens_family").on(table.familyId),
    clientUserIdx: index("idx_ai_oauth_refresh_tokens_client_user").on(
      table.clientId,
      table.userId
    ),
    expiresIdx: index("idx_ai_oauth_refresh_tokens_expires").on(table.expiresAt),
  })
);

export type AiOAuthClient = typeof aiOAuthClients.$inferSelect;
export type InsertAiOAuthClient = typeof aiOAuthClients.$inferInsert;
export type AiOAuthAuthorizationCode = typeof aiOAuthAuthorizationCodes.$inferSelect;
export type AiOAuthRefreshToken = typeof aiOAuthRefreshTokens.$inferSelect;
