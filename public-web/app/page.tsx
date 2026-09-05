export default function PublicWebFoundationPage() {
  return (
    <main className="foundationMain">
      <section className="foundationCard">
        <p className="foundationEyebrow">SpyReels Public Web v2</p>
        <h1>Next.js rendering foundation is isolated and ready for the first pilot.</h1>
        <p>
          This runtime does not own any production SpyReels URL yet. The existing Vite application
          and Express backend remain unchanged. The first pilot route now lives at
          <code> /features/viral-reel-finder</code> inside this isolated renderer for validation before
          any production routing changes.
        </p>
        <ul>
          <li>Public acquisition pages render meaningful HTML before JavaScript.</li>
          <li>Product routes remain in the existing Vite SPA.</li>
          <li>API, sitemap, robots and other system routes remain owned by Express.</li>
          <li>No crawler-only duplicate content is required in the target architecture.</li>
        </ul>
        <p>
          Runtime health endpoint: <code>/health</code>
        </p>
      </section>
    </main>
  );
}
