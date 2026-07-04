import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ReelPreviewPhone } from "@/components/ReelPreviewPhone";
import { formatHookPatternLabel, type ViralHook } from "@shared/hookGenerator";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

type HookResultCardProps = {
  hook: ViralHook;
  index: number;
  label?: string;
  showSafeZones?: boolean;
  onTurnIntoScript?: () => void;
  turnIntoScriptPending?: boolean;
  actions?: React.ReactNode;
};

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Could not copy");
  }
}

export function HookResultCard({
  hook,
  index,
  label,
  showSafeZones = false,
  onTurnIntoScript,
  turnIntoScriptPending,
  actions,
}: HookResultCardProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = async (text: string, key: string, toastLabel: string) => {
    await copyText(text, toastLabel);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const onScreen = hook.onScreenText?.trim() || "";

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px]">
        <div className="p-4 sm:p-5">
          <div className="mb-2 text-sm font-extrabold text-primary">
            {label ?? `Hook ${index + 1}`}
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Say this
          </p>
          <p className="mt-1 text-[15px] font-semibold leading-snug">{hook.hook}</p>

          {onScreen ? (
            <div className="mt-3 rounded-lg border border-dashed border-border bg-background px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                On-screen text
              </p>
              <p className="mt-1 text-sm font-bold">{onScreen}</p>
            </div>
          ) : null}

          <p className="mt-2.5 text-xs text-muted-foreground">
            <span className="font-medium">Pattern:</span> {formatHookPatternLabel(hook.pattern)}
            {hook.reasoning ? `: ${hook.reasoning}` : ""}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleCopy(hook.hook, "spoken", "Spoken hook")}
              className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-background px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/5"
            >
              {copied === "spoken" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              Copy spoken
            </button>
            {onScreen ? (
              <button
                type="button"
                onClick={() => void handleCopy(onScreen, "screen", "On-screen text")}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold hover:bg-muted/50"
              >
                {copied === "screen" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                Copy on-screen
              </button>
            ) : null}
            {onScreen ? (
              <button
                type="button"
                onClick={() =>
                  void handleCopy(`${hook.hook}\n\nOn-screen: ${onScreen}`, "both", "Hook + on-screen")
                }
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold hover:bg-muted/50"
              >
                Copy both
              </button>
            ) : null}
            {actions}
          </div>

          {onTurnIntoScript ? (
            <Button
              type="button"
              size="sm"
              className="mt-3 w-full bg-gradient-to-r from-violet-700 to-primary shadow-md shadow-primary/20 sm:w-auto"
              onClick={onTurnIntoScript}
              disabled={turnIntoScriptPending}
            >
              {turnIntoScriptPending ? "Generating script..." : "Turn into full script"}
            </Button>
          ) : null}
        </div>

        <div className="flex flex-col items-center justify-center border-t border-border bg-zinc-950/40 p-3 sm:border-l sm:border-t-0">
          <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Reel preview
          </p>
          <ReelPreviewPhone
            onScreenText={onScreen || hook.hook.split(/\s+/).slice(0, 4).join(" ")}
            showSafeZones={showSafeZones}
          />
        </div>
      </div>
    </article>
  );
}
