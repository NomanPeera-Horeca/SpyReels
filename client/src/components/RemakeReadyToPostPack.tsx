/**
 * Phase C: ready-to-post pack outside Remake modal.
 * Reads the same durable Remake object (saved script + broll_generations).
 * No Instagram publish.
 */
import { Clipboard, Clapperboard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { BrollBeatsView } from "@/components/BrollResultsPanel";
import type { SuggestBrollResult } from "@shared/broll";

function parseHashtags(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((tag) => String(tag).replace(/^#/, "").trim())
        .filter(Boolean)
        .slice(0, 30);
    }
  } catch {
    /* plain text fallback */
  }
  return raw
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, 30);
}

async function copyText(value: string, ok: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(ok);
  } catch {
    toast.error("Could not copy");
  }
}

export function RemakeReadyToPostPack({
  scriptId,
  compact = false,
}: {
  scriptId: number;
  /** Sidebar-friendly layout (Script Reader). */
  compact?: boolean;
}) {
  const scriptQuery = trpc.scripts.get.useQuery(
    { id: scriptId },
    { staleTime: 10_000, retry: false }
  );
  const brollQuery = trpc.scripts.getBrollGeneration.useQuery(
    { scriptId },
    { staleTime: 30_000, retry: false }
  );

  const script = scriptQuery.data as
    | {
        generatedCaption?: string | null;
        generatedHashtags?: string | null;
        frame0OnScreenText?: string | null;
      }
    | undefined;

  const caption = script?.generatedCaption?.trim() || "";
  const hashtags = parseHashtags(script?.generatedHashtags);
  const frame0 = script?.frame0OnScreenText?.trim() || "";
  const broll = brollQuery.data?.result as SuggestBrollResult | undefined;
  const beatCount = broll?.beats?.length ?? 0;

  const captionBlock = caption
    ? hashtags.length
      ? `${caption}\n\n${hashtags.map((tag) => `#${tag}`).join(" ")}`
      : caption
    : "";

  if (scriptQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Remake pack…
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Ready to post
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Caption, Opening Hook, and B-roll from this Remake. Copy or download without reopening the workspace.
        </p>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">Caption</p>
          {captionBlock ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => void copyText(captionBlock, "Caption copied")}
            >
              <Clipboard className="h-3.5 w-3.5" /> Copy
            </Button>
          ) : null}
        </div>
        {caption ? (
          <div className="rounded-xl border border-border/70 bg-background/40 p-3">
            <p className={`text-[13px] leading-snug ${compact ? "line-clamp-5" : ""}`}>
              {caption}
            </p>
            {hashtags.length > 0 ? (
              <p className="mt-2 text-[12px] text-muted-foreground">
                {hashtags.map((tag) => `#${tag}`).join(" ")}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No caption saved yet. Generate one in Remake publishing.
          </p>
        )}
      </section>

      <section className="space-y-2 border-t border-border/60 pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">Opening Hook</p>
          {frame0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => void copyText(frame0, "Opening Hook copied")}
            >
              <Clipboard className="h-3.5 w-3.5" /> Copy
            </Button>
          ) : null}
        </div>
        {frame0 ? (
          <div className="rounded-xl border border-border/70 bg-[#111117] p-4">
            <p className="text-center text-lg font-black tracking-tight text-white">
              {frame0}
            </p>
            <p className="mt-2 text-center text-[10px] text-white/45">9:16 Frame 0</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Edit the Opening Hook in Remake Preview to save it here.
          </p>
        )}
      </section>

      <section className="space-y-2 border-t border-border/60 pt-3">
        <div className="flex items-center gap-2">
          <Clapperboard className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground">B-roll</p>
        </div>
        {brollQuery.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading B-roll…</p>
        ) : beatCount > 0 && broll ? (
          <div className={compact ? "max-h-[360px] overflow-y-auto pr-1" : undefined}>
            <BrollBeatsView result={broll} variant="workspace" />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No stock pack saved. Match clips in Remake Visuals.
          </p>
        )}
      </section>
    </div>
  );
}
