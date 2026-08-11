import * as dotenv from "dotenv";
import { emailTemplates } from "../drizzle/schema";
import { getDb } from "../server/db";

dotenv.config();

const SEED = [
  {
    slug: "welcome",
    name: "Welcome email",
    description: "Sent after Google or email/password signup.",
  },
  {
    slug: "password_reset",
    name: "Password reset",
    description: "Forgot-password flow with expiring link.",
  },
  {
    slug: "payment_confirmation",
    name: "Payment confirmation",
    description: "Stripe checkout success receipt and onboarding CTAs.",
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

  for (const row of SEED) {
    await db.insert(emailTemplates).values(row).onDuplicateKeyUpdate({
      set: { name: row.name, description: row.description },
    });
  }
  console.log(`Upserted ${SEED.length} email_templates rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
