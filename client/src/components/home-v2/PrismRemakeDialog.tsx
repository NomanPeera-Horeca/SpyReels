/**
 * Content Prism for the creator's OWN viral video: pick one of 10 formats and
 * the Agent remakes the same topic, with the same hook formula, in that format.
 * No invented facts: unknown personal details become blanks to fill in.
 */
import { useEffect, useId } from "react";
import type { ViralPost } from "@shared/viralPosts";
import { IconClose } from "@/design-system/icons";
import { HOME_COPY as C } from "./copy";
import styles from "./home.module.css";

const cx = (...p: Array<string | false | null | undefined>) => p.filter(Boolean).join(" ");

/** The 10 Prism angles (same topic, new format). */
export const PRISM_FORMATS: Array<{ id: string; label: string; how: string }> = [
  { id: "question", label: "Top question", how: "answer the #1 question people ask about this topic" },
  { id: "before_after", label: "Before / after", how: "show the before and the after, and what changed in between" },
  { id: "story", label: "Story", how: "tell it as a short personal story with a turning point" },
  { id: "result", label: "Result", how: "lead with the result, then show how it happened" },
  { id: "how_to", label: "How-to", how: "teach it as clear steps someone can follow today" },
  { id: "myth", label: "Myth-bust", how: "name a common belief about this topic and prove it wrong" },
  { id: "meme", label: "Meme / skit", how: "turn it into a short relatable meme or skit" },
  { id: "problem_solution", label: "Problem → solution", how: "open with the painful problem, then give the fix" },
  { id: "mistake", label: "Mistake", how: "show the mistake most people make here and what to do instead" },
  { id: "list", label: "List", how: "make it a quick numbered list (3-5 points)" },
];

/** The Agent brief for one format. Pure; exported for tests. */
export function prismBrief(post: Pick<ViralPost, "platform" | "caption" | "sourceUrl" | "viralMultiple">, formatId: string): string {
  const f = PRISM_FORMATS.find(x => x.id === formatId) ?? PRISM_FORMATS[0]!;
  const platform = post.platform === "tiktok" ? "TikTok" : post.platform === "youtube" ? "YouTube" : "Instagram";
  const multiple = post.viralMultiple ? ` that got ${Math.round(post.viralMultiple * 10) / 10}x my usual views` : "";
  const caption = (post.caption ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
  return [
    `Remake my own ${platform} video${multiple} in a new format: ${f.label} (${f.how}).`,
    caption ? `My original video: "${caption}"` : null,
    post.sourceUrl ? `Link: ${post.sourceUrl}` : null,
    "",
    "Keep the exact same topic and reuse the hook formula from its first seconds, so it feels like the same winning idea in a new format, not a copy.",
    "Only use facts from my original video. Where a personal number, result or story detail is needed that you don't know, write [add your real result here] instead of inventing it.",
  ]
    .filter(line => line !== null)
    .join("\n");
}

export function PrismRemakeDialog({
  post,
  onPick,
  onClose,
}: {
  post: ViralPost;
  onPick: (formatId: string) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const caption = (post.caption ?? "").replace(/\s+/g, " ").trim();
  return (
    <div className={cx("sr-scope-light", styles.overlay)} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div
        className={cx(styles.theme, styles.modal)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="home-prism-dialog"
      >
        <div className={styles.modalHeader}>
          <div className={styles.sectionTitles}>
            <h2 id={titleId} className={cx("sr-text-product-heading-4", styles.h2)}>
              {C.ownWinners.prismTitle}
            </h2>
            <p className={cx("sr-text-product-body-small", styles.muted)}>{C.ownWinners.prismBody}</p>
          </div>
          <button
            type="button"
            className={cx(styles.iconButton, styles.iconButtonBare)}
            onClick={onClose}
            aria-label={C.profiles.close}
          >
            <IconClose />
          </button>
        </div>
        {caption ? (
          <p className={cx("sr-text-product-body-small", styles.addBio, styles.prismSource)}>“{caption}”</p>
        ) : null}
        <div className={styles.prismGrid}>
          {PRISM_FORMATS.map(f => (
            <button key={f.id} type="button" className={styles.prismOption} onClick={() => onPick(f.id)}>
              <span className={cx("sr-text-product-label", styles.h2)}>{f.label}</span>
              <span className={cx("sr-text-product-body-small", styles.muted)}>{f.how}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
