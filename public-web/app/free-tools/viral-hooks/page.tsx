import {
  MarketingFooter,
  MarketingHeader,
} from "../../../components/MarketingChrome";
import { HomepageAuthGate } from "../../../components/HomepageAuthGate";
import { MarketingBreadcrumb } from "../../../components/MarketingBreadcrumb";
import { MarketingHeroEyebrow } from "../../../components/MarketingHeroEyebrow";
import {
  MarketingFaq,
  MarketingFinalCta,
  MarketingWorkspace,
} from "../../../components/MarketingPageSections";
import { MarketingProcessSteps } from "../../../components/MarketingProcessSteps";
import { MarketingSection } from "../../../components/MarketingSection";
import { MarketingSectionHeader } from "../../../components/MarketingSectionHeader";
import { wrapHyphenatedCompounds } from "../../../components/marketingNoBreak";
import { buildFaqPageJsonLd, jsonLdScript } from "../../../components/marketingFaqJsonLd";
import { VIRAL_HOOKS_HOW_IT_WORKS_STEPS } from "../../../lib/viralHooksCopy";
import {
  buildViralHooksBreadcrumbJsonLd,
  buildViralHooksSoftwareJsonLd,
  VIRAL_HOOKS_FAQ_ITEMS,
  viralHooksMetadata,
} from "../../../lib/viralHooksPage";
import {
  ViralHooksBeforeAfterSection,
  ViralHooksOneClickSection,
  ViralHooksTraitSection,
} from "./ViralHooksStaticSections";
import { ViralHooksToolClient } from "./ViralHooksToolClient";
import styles from "./ViralHooks.module.css";
import "../../homepage.css";

export const metadata = viralHooksMetadata;

export default function ViralHooksPage() {
  const faqJsonLd = buildFaqPageJsonLd([...VIRAL_HOOKS_FAQ_ITEMS]);

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(buildViralHooksBreadcrumbJsonLd()),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(buildViralHooksSoftwareJsonLd()),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd) }}
      />

      <MarketingHeader />

      <main>
        <MarketingSection pair="end" className={`shell ${styles.hero}`}>
          <MarketingBreadcrumb
            align="center"
            items={[
              { label: "Home", href: "/" },
              { label: "Free Tools", href: "/free-tools" },
              { label: "Viral Hook Generator" },
            ]}
          />

          <MarketingHeroEyebrow showDot>Free tool · Viral hooks</MarketingHeroEyebrow>

          <h1 className="sr-text-marketing-display">
            {wrapHyphenatedCompounds("Viral Hook Generator")}
          </h1>

          <p className={`${styles.heroLead} sr-text-marketing-body-large`}>
            {wrapHyphenatedCompounds(
              "Engage viewers from the first second. Free AI hooks for Reels, TikTok, and Shorts."
            )}
          </p>

          <p className={`${styles.heroDirect} sr-text-marketing-body-small`}>
            {wrapHyphenatedCompounds(
              "A viral hook generator writes the first 1 to 3 seconds of your short video so people stop scrolling. SpyReels gives you spoken lines plus on-screen text from proven Reel patterns, then lets you expand any hook into a full script."
            )}
          </p>
        </MarketingSection>

        <ViralHooksToolClient />

        <ViralHooksOneClickSection />

        <MarketingProcessSteps
          presentation="numbered"
          title="How to generate viral hooks with SpyReels"
          subtitle="Four clear steps from blank idea to a scroll-stopping open you can film today."
          steps={VIRAL_HOOKS_HOW_IT_WORKS_STEPS.map((step) => ({
            number: step.number,
            title: step.title,
            body: step.body,
          }))}
        />

        <MarketingSection className="shell">
          <MarketingSectionHeader
            title="Why video hooks matter"
            headingLevel="h2"
            size="large"
            align="start"
          />
          <p className={`${styles.bodySecondary} sr-text-marketing-body-large`}>
            {wrapHyphenatedCompounds(
              "You have about two seconds before someone scrolls. A strong hook sets the promise, sparks curiosity, and signals to Instagram, TikTok, and YouTube that your video deserves more watch time."
            )}
          </p>
        </MarketingSection>

        <ViralHooksTraitSection />

        {/*
          TODO(blog-agent MarketingArticleTable): 10 viral hook patterns table
          Pattern | Example. Hidden until Article Table merges. Do not invent a second table.
        */}
        <MarketingSection className="shell">
          <MarketingSectionHeader
            title="10 viral hook patterns"
            subtitle="Steal the structure. Swap in your niche."
            headingLevel="h2"
            size="large"
            align="start"
          />
        </MarketingSection>

        {/*
          TODO(blog-agent MarketingArticleTable): comparison table
          Viral hook generator vs ChatGPT vs Copy.ai.
        */}
        <MarketingSection className="shell">
          <MarketingSectionHeader
            title="Viral hook generator vs ChatGPT vs Copy.ai"
            subtitle="ChatGPT and Copy.ai write generic openings. SpyReels is trained on millions of viral videos and hooks, so the output is built for short-form that already works."
            headingLevel="h2"
            size="large"
            align="start"
          />
        </MarketingSection>

        <MarketingWorkspace
          toolsPage="instagram"
          title="Other free creator tools"
          hiddenToolIds={["hooks"]}
        />

        <ViralHooksBeforeAfterSection />

        <MarketingFinalCta
          title="You've got the hook. Now make the Reel."
          body="This free tool wrote the first three seconds. SpyReels expands it into a ready-to-film script, then helps you spy competitor Reels and remake winners in your voice. Viral Hook Generator gives you the words. SpyReels gives you the script."
          buttonLabel="Try SpyReels free →"
          href="#tool"
        />

        <MarketingFaq
          title="Frequently asked questions"
          description=""
          items={[...VIRAL_HOOKS_FAQ_ITEMS]}
        />
      </main>

      {/* Bottom banner intentionally omitted (Decision 39). */}

      <MarketingFooter />
      <HomepageAuthGate />
    </div>
  );
}
