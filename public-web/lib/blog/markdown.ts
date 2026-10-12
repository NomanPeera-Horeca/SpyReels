import type { BlogFaqItem, BlogTocItem } from "./types";
import { MEEDRO_TOC_LABELS, shortTocLabel } from "./tocLabels";

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/--+/g, "-");
}

export function normalizeContentToMarkdown(raw: string): string {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const normalized: string[] = [];
  let inFaq = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      normalized.push("");
      continue;
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      normalized.push(trimmed);
      continue;
    }

    if (/^frequently asked questions/i.test(trimmed)) {
      inFaq = true;
      normalized.push(`## ${trimmed}`);
      continue;
    }

    const isListLine = /^[-*•]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed);
    const endsWithPeriod = trimmed.endsWith(".");
    const endsWithQuestion = trimmed.endsWith("?");
    const startsCapital = /^[A-Z]/.test(trimmed);
    const hasCommaEarly = trimmed.slice(0, 30).includes(",");
    const isShort = trimmed.length < 120;

    const isHeadingCandidate =
      isShort && !endsWithPeriod && startsCapital && !hasCommaEarly && !isListLine;

    if (isHeadingCandidate && endsWithQuestion && inFaq) {
      normalized.push(`### ${trimmed}`);
      continue;
    }

    if (isHeadingCandidate && endsWithQuestion && !inFaq) {
      normalized.push(`## ${trimmed}`);
      continue;
    }

    if (isHeadingCandidate) {
      normalized.push(`## ${trimmed}`);
      continue;
    }

    normalized.push(trimmed);
  }

  return normalized.join("\n\n").replace(/^(\|.*\|)\n\n(?=\|)/gm, "$1\n");
}

function stripMarkdownInline(value: string): string {
  return value
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .trim();
}

export function parseFaqFromContent(content: string): BlogFaqItem[] | null {
  if (!/##\s+(frequently asked questions|faq)\b/i.test(content)) {
    return null;
  }

  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let faqStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^##\s+(frequently asked questions|faq)\s*$/i.test(trimmed)) {
      faqStart = i + 1;
      break;
    }
  }
  if (faqStart < 0) {
    return null;
  }

  const items: BlogFaqItem[] = [];
  let currentQuestion: string | null = null;
  let answerParts: string[] = [];

  const flush = () => {
    const answer = answerParts.join("\n\n").trim();
    if (currentQuestion && answer) {
      items.push({ question: currentQuestion, answer });
    }
    currentQuestion = null;
    answerParts = [];
  };

  for (let i = faqStart; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^##\s+/.test(trimmed)) {
      break;
    }
    if (/^###\s+/.test(trimmed)) {
      flush();
      currentQuestion = stripMarkdownInline(trimmed.replace(/^###\s+/, ""));
      continue;
    }
    if (currentQuestion && trimmed) {
      answerParts.push(stripMarkdownInline(trimmed));
    }
  }
  flush();

  return items.length > 0 ? items : null;
}

/** Remove the FAQ section from article prose (rendered via MarketingFaq with H3s). */
export function stripFaqSection(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let faqStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+(frequently asked questions|faq)\s*$/i.test(lines[i].trim())) {
      faqStart = i;
      break;
    }
  }
  if (faqStart < 0) {
    return markdown;
  }
  return lines.slice(0, faqStart).join("\n").trimEnd();
}

export function extractToc(markdown: string, slug: string): BlogTocItem[] {
  const items: BlogTocItem[] = [];
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("## ") && !trimmed.startsWith("### ")) continue;
    const level = trimmed.startsWith("### ") ? 3 : 2;
    const text = trimmed.replace(/^###?\s+/, "");
    if (/^frequently asked questions|^faq$/i.test(text)) continue;
    if (level !== 2) continue;
    const label = shortTocLabel(text, slug, items.length);
    if (
      slug === "guide-meedro-alternative" &&
      !(MEEDRO_TOC_LABELS as readonly string[]).includes(label)
    ) {
      continue;
    }
    items.push({
      id: slugify(text),
      text,
      label,
      level,
    });
  }
  return items;
}

export function splitMarkdownForMidCta(markdown: string): { first: string; second: string } {
  if (!markdown) return { first: "", second: "" };
  const blocks = markdown.split("\n\n");
  const mid = Math.max(1, Math.ceil(blocks.length / 2));
  return {
    first: blocks.slice(0, mid).join("\n\n"),
    second: blocks.slice(mid).join("\n\n"),
  };
}
