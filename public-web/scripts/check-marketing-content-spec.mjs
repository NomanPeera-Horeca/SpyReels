/**
 * Figma Decision 32 content-spec gate (no browser, no tsx).
 * Reads finder config + shared copy TypeScript sources and enforces limits.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const LIMITS = {
  heroOrSectionTitle: 50,
  finalCta: 55,
  supporting: 120,
  faqQuestion: 70,
  eyebrow: 30,
  buttonWords: 4,
  cardTitle: 30,
  cardDescription: 70,
};

/** @typedef {"heroOrSectionTitle"|"finalCta"|"supporting"|"faqQuestion"|"eyebrow"|"button"|"cardTitle"|"cardDescription"} Kind */
/** @typedef {{ slot: string, value: string, kind: Kind }} Slot */

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function firstString(source, key) {
  const re = new RegExp(`${key}:\\s*"((?:\\\\.|[^"\\\\])*)"`, "m");
  const match = source.match(re);
  if (!match) throw new Error(`Missing string field ${key}`);
  return match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
}

function allFaqQuestions(source) {
  const questions = [];
  const re = /\bq:\s*"((?:\\.|[^"\\])*)"/g;
  let match;
  while ((match = re.exec(source))) {
    questions.push(match[1].replace(/\\"/g, '"'));
  }
  return questions;
}

function stepBlocks(howItWorksBlock) {
  const steps = [];
  const re =
    /\{\s*number:\s*"[^"]+",\s*title:\s*"((?:\\.|[^"\\])*)",\s*body:\s*"((?:\\.|[^"\\])*)"/g;
  let match;
  while ((match = re.exec(howItWorksBlock))) {
    steps.push({
      title: match[1].replace(/\\"/g, '"'),
      body: match[2].replace(/\\"/g, '"'),
    });
  }
  return steps;
}

function howItWorksBlock(source) {
  const start = source.indexOf("howItWorks:");
  const end = source.indexOf("workspace:", start);
  if (start < 0 || end < 0) throw new Error("howItWorks block missing");
  return source.slice(start, end);
}

function wordCount(value) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

/** @param {string} prefix @param {string} source */
function slotsForFinder(prefix, source) {
  const titleBefore = firstString(source, "titleBefore");
  const titleAfter = firstString(source, "titleAfter");
  const heroTitle = `${titleBefore}viral${titleAfter}`;
  /** @type {Slot[]} */
  const slots = [
    { slot: `${prefix}.hero.eyebrow`, value: firstString(source, "eyebrow"), kind: "eyebrow" },
    { slot: `${prefix}.hero.title`, value: heroTitle, kind: "heroOrSectionTitle" },
    { slot: `${prefix}.hero.lead`, value: firstString(source, "lead"), kind: "supporting" },
    {
      slot: `${prefix}.howItWorks.title`,
      value: firstString(howItWorksBlock(source), "title"),
      kind: "heroOrSectionTitle",
    },
    {
      slot: `${prefix}.workspace.title`,
      value: firstString(source.slice(source.indexOf("workspace:")), "title"),
      kind: "heroOrSectionTitle",
    },
    {
      slot: `${prefix}.faq.title`,
      value: firstString(source.slice(source.indexOf("faq:")), "title"),
      kind: "heroOrSectionTitle",
    },
    {
      slot: `${prefix}.faq.description`,
      value: firstString(source.slice(source.indexOf("faq:")), "description"),
      kind: "supporting",
    },
    {
      slot: `${prefix}.finalCta.title`,
      value: firstString(source.slice(source.indexOf("finalCta:")), "title"),
      kind: "finalCta",
    },
    {
      slot: `${prefix}.finalCta.body`,
      value: firstString(source.slice(source.indexOf("finalCta:")), "body"),
      kind: "supporting",
    },
    {
      slot: `${prefix}.finalCta.button`,
      value: firstString(source.slice(source.indexOf("finalCta:")), "buttonLabel"),
      kind: "button",
    },
    {
      slot: `${prefix}.search.submit`,
      value: firstString(source.slice(source.indexOf("search:")), "submitLabel"),
      kind: "button",
    },
  ];

  const how = howItWorksBlock(source);
  if (/description:\s*"/.test(how)) {
    slots.push({
      slot: `${prefix}.howItWorks.description`,
      value: firstString(how, "description"),
      kind: "supporting",
    });
  }

  stepBlocks(how).forEach((step, index) => {
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

  allFaqQuestions(source).forEach((q, index) => {
    slots.push({
      slot: `${prefix}.faq.items[${index}].q`,
      value: q,
      kind: "faqQuestion",
    });
  });

  return slots;
}

function sharedSlots(source) {
  const get = (key) => firstString(source, key);
  /** @type {Slot[]} */
  const slots = [
    { slot: "shared.footer.headline", value: get("headline"), kind: "heroOrSectionTitle" },
    { slot: "shared.footer.support", value: get("support"), kind: "supporting" },
    {
      slot: "shared.homepage.workflowSupport",
      value: get("workflowSupport"),
      kind: "supporting",
    },
    {
      slot: "shared.homepage.processSupport",
      value: get("processSupport"),
      kind: "supporting",
    },
    {
      slot: "shared.integrations.telegram",
      value: get("telegram"),
      kind: "cardDescription",
    },
    { slot: "shared.integrations.ai", value: get("ai"), kind: "cardDescription" },
    {
      slot: "shared.responsibleResearch.support",
      value: firstString(source.slice(source.indexOf("responsibleResearch:")), "support"),
      kind: "supporting",
    },
    { slot: "shared.productDemo.kicker", value: get("kicker"), kind: "eyebrow" },
    { slot: "shared.productDemo.badge", value: get("badge"), kind: "eyebrow" },
    { slot: "shared.productDemo.voiceBadge", value: get("voiceBadge"), kind: "eyebrow" },
    { slot: "shared.productDemo.hookLabel", value: get("hookLabel"), kind: "eyebrow" },
    { slot: "shared.productDemo.bodyLabel", value: get("bodyLabel"), kind: "eyebrow" },
    { slot: "shared.productDemo.findButton", value: get("findButton"), kind: "button" },
    {
      slot: "shared.productDemo.scriptHeading",
      value: get("scriptHeading"),
      kind: "heroOrSectionTitle",
    },
    { slot: "shared.productDemo.finalLine", value: get("finalLine"), kind: "supporting" },
  ];

  const categoriesMatch = source.match(/categories:\s*\[((?:.|\n)*?)\]\s*as const/);
  if (!categoriesMatch) throw new Error("footer categories missing");
  [...categoriesMatch[1].matchAll(/"((?:\\.|[^"\\])*)"/g)].forEach((m, index) => {
    slots.push({
      slot: `shared.footer.categories[${index}]`,
      value: m[1],
      kind: "eyebrow",
    });
  });

  const groupsMatch = source.match(/headerGroupLabels:\s*\[((?:.|\n)*?)\]\s*as const/);
  if (!groupsMatch) throw new Error("headerGroupLabels missing");
  [...groupsMatch[1].matchAll(/"((?:\\.|[^"\\])*)"/g)].forEach((m, index) => {
    slots.push({
      slot: `shared.headerGroupLabels[${index}]`,
      value: m[1],
      kind: "eyebrow",
    });
  });

  return slots;
}

/** @param {Slot[]} slots */
function failuresFor(slots) {
  /** @type {string[]} */
  const failures = [];
  for (const { slot, value, kind } of slots) {
    if (kind === "button") {
      const words = wordCount(value);
      if (words > LIMITS.buttonWords) {
        failures.push(`${slot}: ${words} words > ${LIMITS.buttonWords} words (${JSON.stringify(value)})`);
      }
      continue;
    }
    const limit = LIMITS[kind];
    if (value.length > limit) {
      failures.push(`${slot}: length ${value.length} > ${limit} (${JSON.stringify(value)})`);
    }
  }
  return failures;
}

const ig = read("lib/finderConfigs/instagram.ts");
const tt = read("lib/finderConfigs/tiktok.ts");
const shared = read("lib/marketingSharedCopy.ts");
const slots = [...slotsForFinder("instagram", ig), ...slotsForFinder("tiktok", tt), ...sharedSlots(shared)];
const failures = failuresFor(slots);

if (failures.length > 0) {
  console.error(`Marketing content-spec failed (${failures.length}):`);
  for (const line of failures) console.error(`  - ${line}`);
  process.exit(1);
}
console.log(`Marketing content-spec OK (${slots.length} slots)`);
