import type { Metadata } from "next";
import Script from "next/script";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import "./homepage.css";

const title = "SpyReels | Research Viral Reels and Remake Scripts in Your Voice";
const description = "SpyReels helps creators find viral Reels on Instagram, TikTok, and YouTube Shorts, then turn proven ideas into original scripts ready to film. Research, remake, and create in one workspace.";
const url = "https://spyreels.ai/";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  openGraph: { type: "website", url, siteName: "SpyReels", title, description },
  twitter: { card: "summary_large_image", title, description },
};

const html = readFileSync(join(process.cwd(), "app", "homepage.html"), "utf8");
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${url}#organization`, name: "SpyReels", url, logo: `${url}marketing/0a709293985f.png` },
    { "@type": "WebSite", "@id": `${url}#website`, name: "SpyReels", url, publisher: { "@id": `${url}#organization` } },
    {
      "@type": "SoftwareApplication", "@id": `${url}#software`, name: "SpyReels",
      applicationCategory: "MultimediaApplication", operatingSystem: "Web Browser", url,
      description, provider: { "@id": `${url}#organization` },
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free tier available" },
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <Script src="/marketing/homepage.js" strategy="afterInteractive" />
    </>
  );
}
