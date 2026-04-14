import { getDb } from '../server/db';
import { blogPosts } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  await db.update(blogPosts).set({ coverImageUrl: 'https://pub-059f1c24b0b4430da6a57824dd88b55e.r2.dev/blog/Noman_dark_purple_SaaS_dashboard_showing_Instagram_reels_grid_19d06033-a94a-4fe2-b06d-3ddf61708e80_0.png' }).where(eq(blogPosts.slug, 'how-to-go-viral-on-instagram-reels-2026'));
  await db.update(blogPosts).set({ coverImageUrl: 'https://pub-059f1c24b0b4430da6a57824dd88b55e.r2.dev/blog/Noman_dark_purple_SaaS_dashboard_showing_Instagram_reels_grid_19d06033-a94a-4fe2-b06d-3ddf61708e80_2.png' }).where(eq(blogPosts.slug, 'how-to-spy-on-viral-instagram-reels'));
  await db.update(blogPosts).set({ coverImageUrl: 'https://pub-059f1c24b0b4430da6a57824dd88b55e.r2.dev/blog/Noman_dark_minimal_workspace_screenplay_script_document_glowi_16deace4-fb10-452a-923c-16abc6b72adf_1.png' }).where(eq(blogPosts.slug, 'how-to-write-instagram-reels-scripts-that-go-viral'));
  console.log('Done!');
  process.exit(0);
}

main().catch(console.error);
