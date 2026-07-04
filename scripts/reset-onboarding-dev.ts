/**
 * Reset onboarding for a user so you can re-run /onboarding locally.
 *
 * Usage:
 *   pnpm exec tsx scripts/reset-onboarding-dev.ts --email you@example.com
 *   pnpm exec tsx scripts/reset-onboarding-dev.ts --userId 123
 */
import "dotenv/config";
import mysql from "mysql2/promise";

function readArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1]?.trim() || null;
}

async function main() {
  const email = readArg("--email");
  const userIdRaw = readArg("--userId");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing in .env");
  if (!email && !userIdRaw) {
    throw new Error("Pass --email you@example.com or --userId 123");
  }

  const conn = await mysql.createConnection(url);
  let userId: number | null = userIdRaw ? Number(userIdRaw) : null;
  if (userIdRaw && (!Number.isFinite(userId) || userId! <= 0)) {
    throw new Error("Invalid --userId");
  }

  if (email) {
    const [rows] = await conn.query<{ id: number; email: string }[]>(
      "SELECT id, email FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1",
      [email]
    );
    if (!rows[0]) throw new Error(`No user found for email ${email}`);
    userId = rows[0].id;
    console.log(`Found user ${userId} (${rows[0].email})`);
  }

  await conn.query(
    `UPDATE users SET
      onboardingCompletedAt = NULL,
      onboardingSkippedAt = NULL,
      selectedNicheSlugs = NULL,
      selectedCreatorHandles = NULL,
      demoSeededAt = NULL,
      businessDescription = NULL,
      targetAudience = NULL
    WHERE id = ?`,
    [userId]
  );

  const [workspaceRows] = await conn.query<{ id: string }[]>(
    "SELECT id FROM workspaces WHERE ownerUserId = ? LIMIT 1",
    [userId]
  );
  const workspaceId = workspaceRows[0]?.id;

  await conn.query("DELETE FROM coach_scripts WHERE userId = ?", [userId]);
  if (workspaceId) {
    await conn.query("DELETE FROM plan_cards WHERE workspaceId = ?", [workspaceId]);
    console.log(`Cleared plan_cards for workspace ${workspaceId}`);
  }
  console.log(`Cleared coach_scripts for user ${userId}`);

  await conn.end();
  console.log("Onboarding reset. Open http://localhost:3000/onboarding (clear sessionStorage first).");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
