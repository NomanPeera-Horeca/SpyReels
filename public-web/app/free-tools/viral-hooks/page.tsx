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
import { MarketingSection } from "../../../components/MarketingSection";
import { MarketingSectionHeader } from "../../../components/MarketingSectionHeader";
import { wrapHyphenatedCompounds } from "../../../components/marketingNoBreak";
import { buildFaqPageJsonLd, jsonLdScript } from "../../../components/marketingFaqJsonLd";
import {
  buildViralHooksBreadcrumbJsonLd,
  buildViralHooksSoftwareJsonLd,
  VIRAL_HOOKS_FAQ_ITEMS,
  viralHooksMetadata,
} from "../../../lib/viralHooksPage";
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

          <h1 className="sr-text-marketing-display">Viral Hook Generator</h1>

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

        {/*
          TODO(agent1 + tool client): #tool island
          FieldTextarea (topic), FieldSelect (format/style; components ready), MarketingTabRow (tone),
          PrimaryButton (Generate 10 hooks), MarketingBadge, StaticCard (results/teasers),
          FieldInput (email unlock; component ready), SecondaryButton/Dialog if needed,
          Turn into script -> openHomepageAuth + handoff to app OnboardingAhaView.
        */}
        <MarketingSection id="tool" pair="start" className="shell" aria-label="Viral Hook Generator tool">
          {null}
        </MarketingSection>

        {/* TODO(page-only): HookOneClickDemo restyled with tokens under this header */}
        <MarketingSection className="shell">
          <MarketingSectionHeader
            title="Generate a viral hook in one click"
            subtitle="Watch it: one tap drops scroll-stopping on-screen text on your Reel."
            headingLevel="h2"
            size="large"
            align="center"
          />
        </MarketingSection>

        {/* TODO: MarketingProcessSteps (4 steps) after agent 1 Process Steps settle */}
        <MarketingSection className="shell">
          <MarketingSectionHeader
            title="How to generate viral hooks with SpyReels"
            subtitle="Four clear steps from blank idea to a scroll-stopping open you can film today."
            headingLevel="h2"
            size="large"
            align="start"
          />
        </MarketingSection>

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

        {/* TODO(StaticCard): trait cards under this header */}
        <MarketingSection className="shell">
          <MarketingSectionHeader
            eyebrow="Hooks"
            title="What makes a great viral hook?"
            subtitle="Short-form winners share the same four traits."
            headingLevel="h2"
            size="large"
            align="start"
          />
        </MarketingSection>

        {/* TODO(Article Table): 10 viral hook patterns (Pattern | Example) */}
        <MarketingSection className="shell">
          <MarketingSectionHeader
            title="10 viral hook patterns"
            subtitle="Steal the structure. Swap in your niche."
            headingLevel="h2"
            size="large"
            align="start"
          />
        </MarketingSection>

        {/* TODO(Article Table): Viral hook generator vs ChatGPT vs Copy.ai */}
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

        <MarketingFinalCta
          title="You've got the hook. Now make the Reel."
          body="This free tool wrote the first three seconds. SpyReels expands it into a ready-to-film script, then helps you spy competitor Reels and remake winners in your voice. Viral Hook Generator gives you the words. SpyReels gives you the script."
          buttonLabel="Try SpyReels free →"
          href="#tool"
        />

        {/* TODO(page-only): HookBeforeAfterSlider inside/near Final CTA */}

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
