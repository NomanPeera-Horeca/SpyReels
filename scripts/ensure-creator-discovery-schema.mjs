import { spawn } from "node:child_process";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.info("[creatorRadar.db] preflight_skipped_no_database_url");
  process.exit(0);
}

const connection = await mysql.createConnection(databaseUrl);

try {
  const [tables] = await connection.query(
    "SHOW TABLES LIKE 'creator_discovery_searches'"
  );

  if (!Array.isArray(tables) || tables.length === 0) {
    console.warn("[creatorRadar.db] creating_missing_history_table");
    await connection.query(`
      CREATE TABLE creator_discovery_searches (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        businessDescription VARCHAR(1000) NOT NULL,
        routedNiche VARCHAR(128) NULL,
        creatorCount INT NOT NULL DEFAULT 0,
        resultJson JSON NOT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_creator_discovery_searches_user
          FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    await connection.query(
      "CREATE INDEX idx_creator_discovery_searches_user_created ON creator_discovery_searches (userId, createdAt)"
    );
  }

  const [columns] = await connection.query(
    "SHOW COLUMNS FROM creator_discovery_searches"
  );
  const present = new Set(
    Array.isArray(columns)
      ? columns.map((row) => String(row.Field || ""))
      : []
  );
  const required = [
    "id",
    "userId",
    "businessDescription",
    "routedNiche",
    "creatorCount",
    "resultJson",
    "createdAt",
  ];
  const missing = required.filter((name) => !present.has(name));
  if (missing.length > 0) {
    throw new Error(
      `creator_discovery_searches schema is incomplete; missing: ${missing.join(", ")}`
    );
  }

  await connection.execute(
    "SELECT resultJson, createdAt FROM creator_discovery_searches WHERE userId = ? ORDER BY createdAt DESC LIMIT 1",
    [-1]
  );

  console.info("[creatorRadar.db] schema_ready");
} finally {
  await connection.end();
}

await import("./ensure-complimentary-access-schema.mjs");

const youtubeBenchmarkRunId = process.env.YOUTUBE_SHADOW_BENCHMARK_RUN_ID?.trim();
if (youtubeBenchmarkRunId) {
  console.info("[youtube.shadow] launch_requested", {
    runId: youtubeBenchmarkRunId,
    userExposure: false,
    youtubeFeedEnabled: false,
  });
  const child = spawn(
    "pnpm",
    ["tsx", "scripts/youtube-live-benchmark.ts"],
    {
      env: process.env,
      stdio: "inherit",
      detached: true,
    }
  );
  child.unref();
}

const youtubeProviderBenchmarkRunId =
  process.env.YOUTUBE_PROVIDER_BENCHMARK_RUN_ID?.trim();
if (youtubeProviderBenchmarkRunId) {
  console.info("[youtube.providerBenchmark] launch_requested", {
    runId: youtubeProviderBenchmarkRunId,
    semanticEvaluation: "not_run_provider_only",
    userExposure: false,
    youtubeFeedEnabled: false,
  });
  const child = spawn(
    "pnpm",
    ["tsx", "scripts/youtube-provider-live-benchmark.ts"],
    {
      env: process.env,
      stdio: "inherit",
      detached: true,
    }
  );
  child.unref();
}

// One-time broad-relevance semantic benchmark. It reuses the exact deterministic
// queries and retrieval settings from the successful provider benchmark, then
// evaluates semantic fit at 0.50 without changing the production 0.55 threshold.
const youtubeSemanticBenchmarkRunId =
  process.env.YOUTUBE_SEMANTIC_BENCHMARK_RUN_ID?.trim();
if (youtubeSemanticBenchmarkRunId) {
  console.info("[youtube.semanticBenchmark] launch_requested", {
    runId: youtubeSemanticBenchmarkRunId,
    benchmarkThreshold: 0.5,
    productionThresholdUnchanged: 0.55,
    userExposure: false,
    youtubeFeedEnabled: false,
  });
  const child = spawn(
    "pnpm",
    ["tsx", "scripts/youtube-semantic-live-benchmark.ts"],
    {
      env: process.env,
      stdio: "inherit",
      detached: true,
    }
  );
  child.unref();
}
