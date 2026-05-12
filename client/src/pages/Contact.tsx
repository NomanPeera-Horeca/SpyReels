import { ArrowLeft, Bug, Handshake, Mail, MessageCircle } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";

const LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/spyreels-logo-2-transparent_d64117e8.png";

const CONTACT_EMAIL = "noah.perry@spyreels.ai";

const contactSections = [
  {
    title: "General Support",
    description:
      "For product questions, account help, billing questions, or feedback about SpyReels.",
    href: `mailto:${CONTACT_EMAIL}?subject=General%20Support`,
    cta: "Email support",
    icon: MessageCircle,
  },
  {
    title: "Press & Partnerships",
    description:
      "For media requests, founder interviews, creator partnerships, or business inquiries.",
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

export default function Contact() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <img
                src={LOGO_URL}
                alt="SpyReels"
                className="h-9 w-9 rounded-lg"
              />
              <span className="text-lg font-semibold tracking-tight">
                SpyReels
              </span>
            </Link>
            <Link
              href="/"
              className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <section className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Contact Us
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Questions, feedback, or press inquiries? We'd love to hear from you.
          </p>
          <div className="mt-6 rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Primary email</p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="mt-1 inline-block text-base font-semibold text-primary underline-offset-4 hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
            <p className="mt-3 text-sm text-muted-foreground">
              We typically respond within 24 hours.
            </p>
          </div>
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {contactSections.map((section) => {
            const Icon = section.icon;
            return (
              <Card key={section.title} className="border-border bg-card">
                <CardContent className="flex h-full flex-col p-5">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-base font-semibold text-foreground">
                    {section.title}
                  </h2>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {section.description}
                  </p>
                  <a
                    href={section.href}
                    className="mt-4 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {section.cta}
                  </a>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted-foreground">
          SpyReels is an AI-powered Instagram Reels analytics tool for nano and
          micro creators.
        </p>
      </main>

      <footer className="border-t border-border/50 py-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 text-xs text-muted-foreground/60 sm:px-6 lg:px-8">
          <span>&copy; {new Date().getFullYear()} SpyReels</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/contact" className="hover:text-foreground">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
