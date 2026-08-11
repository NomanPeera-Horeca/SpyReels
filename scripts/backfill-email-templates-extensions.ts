import * as dotenv from "dotenv";
import { emailTemplates } from "../drizzle/schema";
import { getDb } from "../server/db";

dotenv.config();

/** Phase 2.2b: templates reserved for future Resend sends (webhook + admin stats). */
const EXTENSION_SEED = [
  {
    slug: "payment_failed",
    name: "Payment failed",
    description: "When Stripe charge fails",
  },
  {
    slug: "weekly_digest",
    name: "Weekly digest",
    description: "Sunday summary",
  },
  {
    slug: "launch_announcement",
    name: "Launch announcement",
    description: "Broadcast email",
  },
  {
    slug: "affiliate_welcome",
    name: "Affiliate welcome",
    description: "When user joins affiliate program",
  },
  {
    slug: "support_reply",
    name: "Support reply",
    description: "Manual reply via Resend",
  },
  {
    slug: "watermark_download_ready",
    name: "Watermark download ready",
    description: "Free-tier B-roll clip ready email with direct download link.",
  },
] as const;

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL missing or database unreachable.");

  for (const row of EXTENSION_SEED) {
    await db.insert(emailTemplates).values(row).onDuplicateKeyUpdate({
      set: { name: row.name, description: row.description },
    });
  }
  console.log(`Upserted ${EXTENSION_SEED.length} extension email_templates rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
