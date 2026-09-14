import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.info("[complimentaryAccess.db] preflight_skipped_no_database_url");
  process.exit(0);
}

const connection = await mysql.createConnection(databaseUrl);

const PLAN_RANK = {
  free: 0,
  starter: 1,
  pro: 2,
  business: 3,
  agency: 4,
};

const quoteIdentifier = (name) => `\`${String(name).replace(/`/g, "``")}\``;

try {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS complimentary_access_grants (
      id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
      userId INT NOT NULL,
      plan ENUM('starter','pro','business','agency') NOT NULL,
      status ENUM('active','revoked') NOT NULL DEFAULT 'active',
      reason VARCHAR(500) NOT NULL,
      grantedByUserId INT NOT NULL,
      startsAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expiresAt TIMESTAMP NULL DEFAULT NULL,
      revokedAt TIMESTAMP NULL DEFAULT NULL,
      revokedByUserId INT NULL DEFAULT NULL,
      revokeReason VARCHAR(500) NULL DEFAULT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [indexRows] = await connection.query(
    "SHOW INDEX FROM complimentary_access_grants"
  );
  const existingIndexes = new Set(
    Array.isArray(indexRows)
      ? indexRows.map((row) => String(row.Key_name || ""))
      : []
  );

  const indexes = [
    ["idx_comp_access_user_status", "userId, status"],
    ["idx_comp_access_expires_at", "expiresAt"],
    ["idx_comp_access_created_at", "createdAt"],
  ];

  for (const [name, columns] of indexes) {
    if (!existingIndexes.has(name)) {
      await connection.query(
        `CREATE INDEX ${quoteIdentifier(name)} ON complimentary_access_grants (${columns})`
      );
    }
  }

  const [columns] = await connection.query(
    "SHOW COLUMNS FROM complimentary_access_grants"
  );
  const present = new Set(
    Array.isArray(columns)
      ? columns.map((row) => String(row.Field || ""))
      : []
  );
  const required = [
    "id",
    "userId",
    "plan",
    "status",
    "reason",
    "grantedByUserId",
    "startsAt",
    "expiresAt",
    "revokedAt",
    "revokedByUserId",
    "revokeReason",
    "createdAt",
    "updatedAt",
  ];
  const missing = required.filter((name) => !present.has(name));
  if (missing.length > 0) {
    throw new Error(
      `complimentary_access_grants schema is incomplete; missing: ${missing.join(", ")}`
    );
  }

  console.info("[complimentaryAccess.db] schema_ready");

  const bootstrapEnabled =
    process.env.COMPLIMENTARY_ACCESS_BOOTSTRAP_ENABLED?.trim().toLowerCase() ===
    "true";

  if (!bootstrapEnabled) {
    process.exitCode = 0;
  } else {
    const email = process.env.COMPLIMENTARY_ACCESS_BOOTSTRAP_EMAIL?.trim().toLowerCase();
    const plan = process.env.COMPLIMENTARY_ACCESS_BOOTSTRAP_PLAN?.trim().toLowerCase();
    const reason = process.env.COMPLIMENTARY_ACCESS_BOOTSTRAP_REASON?.trim();

    if (!email) throw new Error("Bootstrap email is required when enabled");
    if (!["starter", "pro", "business", "agency"].includes(plan || "")) {
      throw new Error("Bootstrap plan must be starter, pro, business, or agency");
    }
    if (!reason) throw new Error("Bootstrap reason is required when enabled");

    const [userRows] = await connection.execute(
      "SELECT id, email, role FROM users WHERE LOWER(email) = ? LIMIT 1",
      [email]
    );
    const user = Array.isArray(userRows) ? userRows[0] : null;
    if (!user) throw new Error(`Bootstrap target user not found: ${email}`);
    if (String(user.role) === "admin") {
      throw new Error("Refusing complimentary bootstrap for an admin account");
    }

    const [adminRows] = await connection.query(
      "SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1"
    );
    const admin = Array.isArray(adminRows) ? adminRows[0] : null;
    if (!admin) throw new Error("No admin user available for bootstrap audit attribution");

    const [subRows] = await connection.execute(
      "SELECT plan, status, stripeSubscriptionId FROM subscriptions WHERE userId = ? LIMIT 1",
      [user.id]
    );
    const subscription = Array.isArray(subRows) ? subRows[0] : null;
    const billingPlan = String(subscription?.plan || "free");

    const [grantRows] = await connection.execute(
      `SELECT id, plan, status, expiresAt
       FROM complimentary_access_grants
       WHERE userId = ?
         AND status = 'active'
         AND startsAt <= NOW()
         AND (expiresAt IS NULL OR expiresAt > NOW())
       ORDER BY createdAt DESC
       LIMIT 1`,
      [user.id]
    );
    const activeGrant = Array.isArray(grantRows) ? grantRows[0] : null;
    const desiredAlreadyActive =
      activeGrant &&
      String(activeGrant.plan) === plan &&
      activeGrant.expiresAt == null;

    if (!desiredAlreadyActive) {
      await connection.beginTransaction();
      try {
        await connection.execute(
          `UPDATE complimentary_access_grants
           SET status = 'revoked',
               revokedAt = NOW(),
               revokedByUserId = ?,
               revokeReason = ?
           WHERE userId = ? AND status = 'active'`,
          [
            admin.id,
            "Replaced by complimentary access bootstrap",
            user.id,
          ]
        );

        await connection.execute(
          `INSERT INTO complimentary_access_grants
            (userId, plan, status, reason, grantedByUserId, startsAt, expiresAt)
           VALUES (?, ?, 'active', ?, ?, NOW(), NULL)`,
          [user.id, plan, reason, admin.id]
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    const [verifyRows] = await connection.execute(
      `SELECT id, plan, status, expiresAt, reason, grantedByUserId
       FROM complimentary_access_grants
       WHERE userId = ?
         AND status = 'active'
         AND startsAt <= NOW()
         AND (expiresAt IS NULL OR expiresAt > NOW())
       ORDER BY createdAt DESC
       LIMIT 1`,
      [user.id]
    );
    const grant = Array.isArray(verifyRows) ? verifyRows[0] : null;
    if (!grant) throw new Error("Bootstrap verification failed: no active grant");

    const effectivePlan =
      (PLAN_RANK[String(grant.plan)] || 0) > (PLAN_RANK[billingPlan] || 0)
        ? String(grant.plan)
        : billingPlan;
    const source =
      effectivePlan === String(grant.plan) &&
      (PLAN_RANK[String(grant.plan)] || 0) > (PLAN_RANK[billingPlan] || 0)
        ? "complimentary"
        : billingPlan === "free"
          ? "free"
          : "stripe";

    console.info(
      `[complimentaryAccess.bootstrap] target_user_id=${user.id} email=${user.email} role=${user.role}`
    );
    console.info(
      `[complimentaryAccess.bootstrap] billing_plan=${billingPlan} billing_status=${subscription?.status || "none"} stripe_subscription=${subscription?.stripeSubscriptionId ? "yes" : "no"}`
    );
    console.info(
      `[complimentaryAccess.bootstrap] grant_plan=${grant.plan} grant_status=${grant.status} expires=${grant.expiresAt ? new Date(grant.expiresAt).toISOString() : "none"}`
    );
    console.info(
      `[complimentaryAccess.bootstrap] effective_plan=${effectivePlan} source=${source}`
    );
  }
} finally {
  await connection.end();
}
