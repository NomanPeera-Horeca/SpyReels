import { instagramFinderConfig } from "./finderConfigs/instagram";
import { tiktokFinderConfig } from "./finderConfigs/tiktok";
import type { FinderConfig } from "./finderConfigs/types";
import type { MarketingCopySlot } from "./marketingContentSpec";
import { marketingSharedCopy } from "./marketingSharedCopy";

function finderHeroTitle(config: FinderConfig): string {
  return `${config.hero.titleBefore}viral${config.hero.titleAfter}`;
}

function slotsForFinder(prefix: string, config: FinderConfig): MarketingCopySlot[] {
  const slots: MarketingCopySlot[] = [
    { slot: `${prefix}.hero.eyebrow`, value: config.hero.eyebrow, kind: "eyebrow" },
    { slot: `${prefix}.hero.title`, value: finderHeroTitle(config), kind: "heroOrSectionTitle" },
    { slot: `${prefix}.hero.lead`, value: config.hero.lead, kind: "supporting" },
    {
      slot: `${prefix}.howItWorks.title`,
      value: config.howItWorks.title,
      kind: "heroOrSectionTitle",
    },
    {
      slot: `${prefix}.workspace.title`,
      value: config.workspace.title,
      kind: "heroOrSectionTitle",
    },
    { slot: `${prefix}.faq.title`, value: config.faq.title, kind: "heroOrSectionTitle" },
    { slot: `${prefix}.faq.description`, value: config.faq.description, kind: "supporting" },
    { slot: `${prefix}.finalCta.title`, value: config.finalCta.title, kind: "finalCta" },
    { slot: `${prefix}.finalCta.body`, value: config.finalCta.body, kind: "supporting" },
    { slot: `${prefix}.finalCta.button`, value: config.finalCta.buttonLabel, kind: "button" },
    { slot: `${prefix}.search.submit`, value: config.search.submitLabel, kind: "button" },
  ];

  if (config.howItWorks.description) {
    slots.push({
      slot: `${prefix}.howItWorks.description`,
      value: config.howItWorks.description,
      kind: "supporting",
    });
  }

  config.howItWorks.steps.forEach((step, index) => {
    slots.push(
      {
        slot: `${prefix}.howItWorks.steps[${index}].title`,
        value: step.title,
        kind: "heroOrSectionTitle",
      },
      {
        slot: `${prefix}.howItWorks.steps[${index}].body`,
        value: step.body,
        kind: "supporting",
      }
    );
  });

  config.faq.items.forEach((item, index) => {
    slots.push({
      slot: `${prefix}.faq.items[${index}].q`,
      value: item.q,
      kind: "faqQuestion",
    });
  });

  return slots;
}

function sharedSlots(): MarketingCopySlot[] {
  const shared = marketingSharedCopy;
  return [
    {
      slot: "shared.footer.headline",
      value: shared.footer.headline,
      kind: "heroOrSectionTitle",
    },
    { slot: "shared.footer.support", value: shared.footer.support, kind: "supporting" },
    ...shared.footer.categories.map((value, index) => ({
      slot: `shared.footer.categories[${index}]`,
      value,
      kind: "eyebrow" as const,
    })),
    ...shared.headerGroupLabels.map((value, index) => ({
      slot: `shared.headerGroupLabels[${index}]`,
      value,
      kind: "eyebrow" as const,
    })),
    {
      slot: "shared.homepage.workflowSupport",
      value: shared.homepage.workflowSupport,
      kind: "supporting",
    },
    {
      slot: "shared.homepage.processSupport",
      value: shared.homepage.processSupport,
      kind: "supporting",
    },
    {
      slot: "shared.integrations.telegramTitle",
      value: shared.integrations.telegramTitle,
      kind: "cardTitle",
    },
    {
      slot: "shared.integrations.telegram",
      value: shared.integrations.telegram,
      kind: "cardDescription",
    },
    {
      slot: "shared.integrations.aiTitle",
      value: shared.integrations.aiTitle,
      kind: "cardTitle",
    },
    {
      slot: "shared.integrations.ai",
      value: shared.integrations.ai,
      kind: "cardDescription",
    },
    {
      slot: "shared.responsibleResearch.support",
      value: shared.responsibleResearch.support,
      kind: "supporting",
    },
    {
      slot: "shared.productDemo.kicker",
      value: shared.productDemo.kicker,
      kind: "eyebrow",
    },
    {
      slot: "shared.productDemo.badge",
      value: shared.productDemo.badge,
      kind: "eyebrow",
    },
    {
      slot: "shared.productDemo.voiceBadge",
      value: shared.productDemo.voiceBadge,
      kind: "eyebrow",
    },
    {
      slot: "shared.productDemo.hookLabel",
      value: shared.productDemo.hookLabel,
      kind: "eyebrow",
    },
    {
      slot: "shared.productDemo.bodyLabel",
      value: shared.productDemo.bodyLabel,
      kind: "eyebrow",
    },
    {
      slot: "shared.productDemo.findButton",
      value: shared.productDemo.findButton,
      kind: "button",
    },
    {
      slot: "shared.productDemo.scriptHeading",
      value: shared.productDemo.scriptHeading,
      kind: "heroOrSectionTitle",
    },
    {
      slot: "shared.productDemo.finalLine",
      value: shared.productDemo.finalLine,
      kind: "supporting",
    },
  ];
}

/** Every copy slot checked by the Decision 32 content-spec CI test. */
export function collectMarketingCopySlots(): MarketingCopySlot[] {
  return [
    ...slotsForFinder("instagram", instagramFinderConfig),
    ...slotsForFinder("tiktok", tiktokFinderConfig),
    ...sharedSlots(),
  ];
}
