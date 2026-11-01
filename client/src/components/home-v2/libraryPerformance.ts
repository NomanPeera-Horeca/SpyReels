import type { ResultCardSignal } from "@/design-system/ResultCard";
import type { ViralPost } from "@shared/viralPosts";

/**
 * "↗ N×" pill for shared-library videos whose multiple is measured against the
 * creator's usual views (the one viral rule). The tooltip says why it is shown.
 */
export function libraryPerformanceSignal(
  post: Pick<ViralPost, "viralBasis" | "viralMultiple" | "relevanceLabel">
): ResultCardSignal | null {
  if (post.viralBasis !== "usual_views" || post.viralMultiple == null || post.viralMultiple < 5) return null;
  const n = Math.floor(post.viralMultiple);
  return {
    kind: "performance",
    label: `${n}×`,
    description: `${n}× this creator's usual views · ${post.relevanceLabel}`,
  };
}
