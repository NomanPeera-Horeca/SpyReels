import { useEffect } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Bug,
  Clock,
  Handshake,
  Mail,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { useCanonical } from "@/hooks/useCanonical";
import {
  applyStandardPageMeta,
  cleanupSchemaScripts,
  injectSchemaScript,
  SPYREELS_SITE_URL,
} from "@/lib/publicSeo";

const CONTACT_EMAIL = "noah.perry@spyreels.ai";

const contactSections = [
  {
    title: "General Support",
    description:
      "Product questions, account help, billing, or feedback about SpyReels.",
    href: `mailto:${CONTACT_EMAIL}?subject=General%20Support`,
    cta: "Email support",
    icon: MessageCircle,
  },
  {
    title: "Press and Partnerships",
    description:
      "Media requests, founder interviews, creator partnerships, or business inquiries.",
    href: `mailto:${CONTACT_EMAIL}?subject=Press%20%26%20Partnerships`,
    cta: "Contact press",
    icon: Handshake,
  },
  {
    title: "Bug Reports",
    description:
      "Found something broken? Send the page, browser, and steps to reproduce so we can investigate.",
    href: `mailto:${CONTACT_EMAIL}?subject=Bug%20Report`,
    cta: "Report a bug",
    icon: Bug,
  },
];

const CONTACT_TITLE = "Contact SpyReels";
const CONTACT_DESCRIPTION =
  "Contact SpyReels for product support, press, partnerships, or bug reports. We typically respond within 24 hours.";
const CONTACT_CANONICAL = `${SPYREELS_SITE_URL}/contact`;

export default function Contact() {
  useCanonical("/contact");

  useEffect(() => {
    applyStandardPageMeta({
      title: CONTACT_TITLE,
      description: CONTACT_DESCRIPTION,
      canonicalUrl: CONTACT_CANONICAL,
    });

    injectSchemaScript("contact-breadcrumb-schema", {
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
          name: "Contact",
          item: CONTACT_CANONICAL,
        },
      ],
    });

    injectSchemaScript("contact-organization-schema", {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "SpyReels",
      url: SPYREELS_SITE_URL,
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: CONTACT_EMAIL,
        availableLanguage: "English",
      },
    });

    return () => {
      cleanupSchemaScripts(["contact-breadcrumb-schema", "contact-organization-schema"]);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader />

      <main className="relative mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent"
          aria-hidden
        />

        <section className="relative text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" />
            We are here to help
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
            Contact SpyReels
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            Questions, feedback, or press inquiries? Reach the team directly. We
            usually reply within one business day.
          </p>
        </section>

        <section className="relative mt-10">
          <Card className="overflow-hidden border-primary/20 bg-card/80 shadow-lg shadow-primary/5 backdrop-blur-sm">
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left sm:gap-6">
                <div className="mb-4 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 sm:mb-0">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    Primary email
                  </p>
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="mt-1 block break-all text-xl font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline sm:text-2xl"
                  >
                    {CONTACT_EMAIL}
                  </a>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    Typical response within 24 hours
                  </div>
                </div>
                <Button asChild size="lg" className="mt-5 w-full shrink-0 sm:mt-0 sm:w-auto">
                  <a href={`mailto:${CONTACT_EMAIL}`}>
                    Send email
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="relative mt-8 grid gap-4 sm:grid-cols-3">
          {contactSections.map((section) => {
            const Icon = section.icon;
            return (
              <Card
                key={section.title}
                className="group border-border/60 bg-card/50 transition-colors hover:border-primary/25 hover:bg-card"
              >
                <CardContent className="flex h-full flex-col p-5">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 transition-colors group-hover:border-primary/30 group-hover:bg-primary/15">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-base font-semibold text-foreground">
                    {section.title}
                  </h2>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {section.description}
                  </p>
                  <Button
                    asChild
                    variant="ghost"
                    className="mt-4 min-h-10 justify-start px-0 text-primary hover:bg-transparent hover:text-primary/80"
                  >
                    <a href={section.href}>
                      {section.cta}
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </a>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="relative mt-12 rounded-2xl border border-border/60 bg-muted/30 p-6 text-center sm:p-8">
          <p className="text-sm leading-relaxed text-muted-foreground">
            SpyReels is an AI-powered Instagram Reels platform for nano and micro
            creators. Find viral content in your niche, transcribe it, and turn
            ideas into scripts you can film today.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
            <Link href="/about" className="font-medium text-primary hover:underline">
              About Noah and SpyReels
            </Link>
            <span className="text-border" aria-hidden>
              ·
            </span>
            <Link href="/pricing" className="font-medium text-primary hover:underline">
              Pricing
            </Link>
            <span className="text-border" aria-hidden>
              ·
            </span>
            <Link
              href="/free-tools/viral-hooks"
              className="font-medium text-primary hover:underline"
            >
              Free hook generator
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
