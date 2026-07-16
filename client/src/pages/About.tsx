import { useEffect } from "react";
import { Link } from "wouter";
import { useCanonical } from "@/hooks/useCanonical";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import {
  applyStandardPageMeta,
  cleanupSchemaScripts,
  injectSchemaScript,
  SPYREELS_LOGO_URL,
  SPYREELS_SITE_URL,
} from "@/lib/publicSeo";

const ABOUT_TITLE = "About SpyReels and Noah Perry";
const ABOUT_DESCRIPTION =
  "Learn about SpyReels and founder Noah Perry. We help nano and micro creators find viral Reels, plan 30 days of content, and write scripts with AI Personal Brand Coach.";
const ABOUT_CANONICAL = `${SPYREELS_SITE_URL}/about`;

function formatDisplayDate(value: Date): string {
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function About() {
  useCanonical("/about");
  const updatedLabel = formatDisplayDate(new Date());

  useEffect(() => {
    applyStandardPageMeta({
      title: ABOUT_TITLE,
      description: ABOUT_DESCRIPTION,
      canonicalUrl: ABOUT_CANONICAL,
    });

    injectSchemaScript("about-breadcrumb-schema", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: `${SPYREELS_SITE_URL}/`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "About",
          item: ABOUT_CANONICAL,
        },
      ],
    });

    injectSchemaScript("about-person-schema", {
      "@context": "https://schema.org",
      "@type": "Person",
      name: "Noah Perry",
      url: ABOUT_CANONICAL,
      jobTitle: "Founder",
      worksFor: {
        "@type": "Organization",
        name: "SpyReels",
      },
    });

    injectSchemaScript("about-organization-schema", {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "SpyReels",
      url: SPYREELS_SITE_URL,
      logo: SPYREELS_LOGO_URL,
      sameAs: [],
    });

    return () => {
      cleanupSchemaScripts([
        "about-breadcrumb-schema",
        "about-person-schema",
        "about-organization-schema",
      ]);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader />

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <p className="text-sm text-muted-foreground mb-6">
          By Noah Perry · Updated {updatedLabel}
        </p>

        <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
          About SpyReels and Noah Perry
        </h1>

        <p className="text-lg text-muted-foreground leading-relaxed mb-10">
          SpyReels is an AI-powered Instagram Reels platform built by Noah Perry for nano and micro creators under 50K followers. We help you find what is working in your niche, plan 30 days of content, and write scripts with AI Personal Brand Coach that sound like you.
        </p>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">About SpyReels</h2>
          <p className="text-muted-foreground leading-relaxed">
            SpyReels shows you which Reels are winning in your niche, transcribes them, and helps you ship a full content system: 30-day calendar, Spark Deck ideas, script studio, and teleprompter. It is built for creators who want clarity, not another generic AI writing tool.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">About Noah Perry</h2>
          <p className="text-muted-foreground leading-relaxed">
            Noah Perry is the founder of SpyReels. He builds products that help small Instagram creators compete with bigger accounts by studying what already works and shipping content faster.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">What we believe</h2>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>Creators deserve better tools than guessing from the feed.</li>
            <li>Curated viral examples beat random volume every time.</li>
            <li>Scripts should sound like you, not like a robot.</li>
            <li>Pricing should be transparent with no surprise credits.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">Contact</h2>
          <p className="text-muted-foreground leading-relaxed">
            Questions or press? Visit our{" "}
            <Link href="/contact" className="text-primary hover:underline">
              contact page
            </Link>
            .
          </p>
        </section>

        <p className="text-sm text-muted-foreground">
          <Link href="/" className="text-primary hover:underline">
            Home
          </Link>
          {" · "}
          <Link href="/pricing" className="text-primary hover:underline">
            Pricing
          </Link>
          {" · "}
          <Link href="/blog" className="text-primary hover:underline">
            Blog
          </Link>
          {" · "}
          <Link href="/free-tools/viral-hooks" className="text-primary hover:underline">
            Free viral hook generator
          </Link>
        </p>
      </main>

      <PublicFooter />
    </div>
  );
}
