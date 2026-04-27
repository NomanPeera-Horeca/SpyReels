/**
 * Seeds the niches table with the 30 SpyReels niches across 5 groups.
 * Run with: tsx scripts/seed-niches.ts
 * Requires DATABASE_URL env var pointing to target DB.
 * Idempotent - safe to re-run (uses ON DUPLICATE KEY UPDATE).
 */

import mysql from "mysql2/promise";

const NICHES_DATA = [
  // BUSINESS & MONEY (8)
  { name: "Marketing & Sales", slug: "marketing-sales", groupName: "business-money", iconName: "Megaphone", description: "Marketing strategy, copywriting, and sales tactics", sortOrder: 1 },
  { name: "Business & Entrepreneurship", slug: "business-entrepreneurship", groupName: "business-money", iconName: "Briefcase", description: "Building businesses, founder lessons, and startup strategy", sortOrder: 2 },
  { name: "Personal Finance", slug: "personal-finance", groupName: "business-money", iconName: "Wallet", description: "Budgeting, saving, and financial literacy", sortOrder: 3 },
  { name: "Investing & Crypto", slug: "investing-crypto", groupName: "business-money", iconName: "TrendingUp", description: "Stock market, crypto, and wealth building", sortOrder: 4 },
  { name: "Real Estate", slug: "real-estate", groupName: "business-money", iconName: "Home", description: "Real estate investing, agents, and property", sortOrder: 5 },
  { name: "E-commerce & DTC", slug: "ecommerce-dtc", groupName: "business-money", iconName: "ShoppingBag", description: "Online stores, dropshipping, and DTC brands", sortOrder: 6 },
  { name: "Career & Jobs", slug: "career-jobs", groupName: "business-money", iconName: "Target", description: "Career advice, interviews, and professional growth", sortOrder: 7 },
  { name: "Make Money Online", slug: "make-money-online", groupName: "business-money", iconName: "DollarSign", description: "Side hustles, online income streams, and digital products", sortOrder: 8 },

  // CREATOR ECONOMY (5)
  { name: "AI & Tech Creators", slug: "ai-tech-creators", groupName: "creator-economy", iconName: "Cpu", description: "AI tools, prompts, and tech tutorials", sortOrder: 9 },
  { name: "Content Marketing", slug: "content-marketing", groupName: "creator-economy", iconName: "PenTool", description: "Content strategy, growth tactics, and creator advice", sortOrder: 10 },
  { name: "Faceless Content", slug: "faceless-content", groupName: "creator-economy", iconName: "EyeOff", description: "Faceless reels and anonymous content strategies", sortOrder: 11 },
  { name: "Photography & Videography", slug: "photography-videography", groupName: "creator-economy", iconName: "Camera", description: "Photo and video creators, gear reviews, and tutorials", sortOrder: 12 },
  { name: "Tutorials & How-To", slug: "tutorials-how-to", groupName: "creator-economy", iconName: "BookOpen", description: "Step-by-step guides and educational tutorials", sortOrder: 13 },

  // LIFESTYLE (8)
  { name: "Fashion & Style", slug: "fashion-style", groupName: "lifestyle", iconName: "Shirt", description: "Fashion, outfits, and personal style", sortOrder: 14 },
  { name: "Beauty & Skincare", slug: "beauty-skincare", groupName: "lifestyle", iconName: "Sparkles", description: "Makeup, skincare routines, and beauty tips", sortOrder: 15 },
  { name: "Health & Fitness", slug: "health-fitness", groupName: "lifestyle", iconName: "Dumbbell", description: "Workouts, fitness coaching, and physical health", sortOrder: 16 },
  { name: "Mental Health & Mindfulness", slug: "mental-health-mindfulness", groupName: "lifestyle", iconName: "Brain", description: "Mental health, mindfulness, and emotional wellbeing", sortOrder: 17 },
  { name: "Food & Cooking", slug: "food-cooking", groupName: "lifestyle", iconName: "ChefHat", description: "Recipes, cooking techniques, and food creators", sortOrder: 18 },
  { name: "Restaurants & Cafes", slug: "restaurants-cafes", groupName: "lifestyle", iconName: "UtensilsCrossed", description: "Restaurant owners, cafe brands, and food businesses", sortOrder: 19 },
  { name: "Travel", slug: "travel", groupName: "lifestyle", iconName: "Plane", description: "Travel destinations, tips, and adventure content", sortOrder: 20 },
  { name: "Home & Interior Design", slug: "home-interior-design", groupName: "lifestyle", iconName: "Sofa", description: "Interior design, home decor, and renovation", sortOrder: 21 },

  // PERSONAL & FAMILY (4)
  { name: "Parenting & Family", slug: "parenting-family", groupName: "personal-family", iconName: "Baby", description: "Parenting tips, family content, and child development", sortOrder: 22 },
  { name: "Dating & Relationships", slug: "dating-relationships", groupName: "personal-family", iconName: "Heart", description: "Dating advice, relationship tips, and love content", sortOrder: 23 },
  { name: "Pets & Animals", slug: "pets-animals", groupName: "personal-family", iconName: "Dog", description: "Pet content, training, and animal entertainment", sortOrder: 24 },
  { name: "Education & Teaching", slug: "education-teaching", groupName: "personal-family", iconName: "GraduationCap", description: "Educators, teaching strategies, and learning content", sortOrder: 25 },

  // ENTERTAINMENT & CULTURE (5)
  { name: "Comedy & Memes", slug: "comedy-memes", groupName: "entertainment-culture", iconName: "Laugh", description: "Comedy creators, skits, and meme content", sortOrder: 26 },
  { name: "Music & Musicians", slug: "music-musicians", groupName: "entertainment-culture", iconName: "Music", description: "Musicians, music production, and audio content", sortOrder: 27 },
  { name: "Sports & Athletes", slug: "sports-athletes", groupName: "entertainment-culture", iconName: "Trophy", description: "Athletes, sports highlights, and training content", sortOrder: 28 },
  { name: "Cars & Automotive", slug: "cars-automotive", groupName: "entertainment-culture", iconName: "Car", description: "Car reviews, automotive content, and motorsports", sortOrder: 29 },
  { name: "Spirituality & Astrology", slug: "spirituality-astrology", groupName: "entertainment-culture", iconName: "Moon", description: "Spirituality, astrology, and personal growth", sortOrder: 30 },
];

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL env var not set");
    process.exit(1);
  }

  // Safety check - log which DB we're targeting
  const dbHost = new URL(databaseUrl).hostname;
  const dbType = dbHost.includes("shinkansen")
    ? "STAGING"
    : dbHost.includes("maglev")
    ? "PRODUCTION"
    : "UNKNOWN";
  console.log(`Connecting to: ${dbHost}`);
  console.log(`Database environment: ${dbType}`);
  console.log("Proceeding in 3 seconds. Ctrl+C to abort.");
  await new Promise((r) => setTimeout(r, 3000));

  const conn = await mysql.createConnection(databaseUrl);

  console.log(`\nSeeding ${NICHES_DATA.length} niches...`);

  for (const niche of NICHES_DATA) {
    await conn.execute(
      `INSERT INTO niches (name, slug, groupName, iconName, description, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         groupName = VALUES(groupName),
         iconName = VALUES(iconName),
         description = VALUES(description),
         sortOrder = VALUES(sortOrder)`,
      [niche.name, niche.slug, niche.groupName, niche.iconName, niche.description, niche.sortOrder]
    );
    console.log(`  ✓ ${niche.name} (${niche.groupName})`);
  }

  // Verify by group
  const [rows] = await conn.execute(
    `SELECT groupName, COUNT(*) as count FROM niches GROUP BY groupName ORDER BY MIN(sortOrder)`
  );
  console.log("\nFinal counts by group:");
  console.table(rows);

  const [totalRows] = await conn.execute(`SELECT COUNT(*) as total FROM niches`);
  console.log(`\nTotal niches: ${(totalRows as any)[0].total}`);

  await conn.end();
  console.log("\n✓ Seed complete");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
