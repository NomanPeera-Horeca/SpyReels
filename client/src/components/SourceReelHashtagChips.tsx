import { Copy } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/copyToClipboard";
import { cn } from "@/lib/utils";

export function SourceReelHashtagChips({
  hashtags,
  className,
}: {
  hashtags: string[];
  className?: string;
}) {
  if (hashtags.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {hashtags.map(tag => (
        <button
          key={tag}
          type="button"
          className="group/chip inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:bg-muted"
          onClick={async () => {
            const ok = await copyToClipboard(`#${tag}`);
            if (ok) toast.success("Hashtag copied");
            else toast.error("Could not copy hashtag");
          }}
        >
          #{tag}
          <Copy className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/chip:opacity-60" />
        </button>
      ))}
    </div>
  );
}
