export default function PublicWebFoundationPage() {
  return (
    <main>
      <section className="card">
        <p className="eyebrow">SpyReels Public Web v2</p>
        <h1>Next.js rendering foundation is isolated and ready for the first pilot.</h1>
        <p>
          This runtime does not own any production SpyReels URL yet. The existing Vite application
          and Express backend remain unchanged. The next milestone is to render the Viral Reel Finder
          here and validate its raw HTML before routing real traffic to it.
        </p>
        <ul>
          <li>Public acquisition pages will render meaningful HTML before JavaScript.</li>
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
