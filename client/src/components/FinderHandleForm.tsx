import type { ReactNode } from "react";
import { CheckCircle2, Loader2, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FinderHandleStatus = "idle" | "loading" | "found" | "error";

type FinderHandleFormProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  platformMark: ReactNode;
  ariaLabel: string;
  compact?: boolean;
  isLoading?: boolean;
  status?: FinderHandleStatus;
  className?: string;
};

/**
 * Shared handle search for Instagram / TikTok / YouTube finder marketing pages.
 * Mobile: input pill + full-width CTA stacked. Desktop: single pill row.
 */
export function FinderHandleForm({
  value,
  onChange,
  onSubmit,
  submitLabel,
  platformMark,
  ariaLabel,
  compact = false,
  isLoading = false,
  status = "idle",
  className,
}: FinderHandleFormProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={cn(
        compact
          ? "flex w-full items-center gap-2 rounded-full border border-primary/35 bg-background p-1 pl-3"
          : "flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-2 sm:rounded-full sm:border sm:border-primary/35 sm:bg-card/70 sm:p-1.5 sm:pl-4 sm:shadow-[0_0_0_1px_hsl(var(--primary)/0.12)]",
        className
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden",
          compact
            ? "min-h-9 px-1"
            : "min-h-12 rounded-full border border-primary/35 bg-background px-3.5 sm:min-h-11 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0"
        )}
      >
        <span className="pointer-events-none flex h-5 w-5 shrink-0 items-center justify-center text-foreground [&_svg]:h-5 [&_svg]:w-5">
          {platformMark}
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="@username"
          aria-label={ariaLabel}
          name="spyreels-finder-handle"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="text"
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
          className={cn(
            "min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground",
            compact ? "py-2 text-sm" : "py-2.5 text-base sm:py-2 sm:text-sm"
          )}
        />
        {status === "loading" ? (
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
            aria-hidden
          />
        ) : null}
        {status === "found" ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
        ) : null}
        {status === "error" ? (
          <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
        ) : null}
      </div>
      <Button
        type="submit"
        size={compact ? "sm" : "lg"}
        disabled={isLoading}
        className={cn(
          "shrink-0 rounded-full",
          compact
            ? "h-10 px-4"
            : "min-h-12 w-full text-base font-semibold sm:min-h-11 sm:w-auto sm:text-sm"
        )}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Search className="h-4 w-4" aria-hidden />
        )}
        {submitLabel}
      </Button>
    </form>
  );
}
