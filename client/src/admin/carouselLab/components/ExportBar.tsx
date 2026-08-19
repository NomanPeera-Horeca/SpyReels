import { Copy, Download, FileText, Share2 } from "lucide-react";
import { toast } from "sonner";
import { toPng } from "html-to-image";

export function ExportBar({
  getSlideNode,
  caption,
  disabled,
}: {
  getSlideNode: () => HTMLElement | null;
  caption: string;
  disabled: boolean;
}) {
  const downloadPng = async () => {
    const slideNode = getSlideNode();
    if (!slideNode) {
      toast.error("Nothing to export yet");
      return;
    }
    try {
      const dataUrl = await toPng(slideNode, {
        cacheBust: true,
        pixelRatio: 2,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `carousel-slide-${Date.now()}.png`;
      a.click();
      toast.success("PNG downloaded");
    } catch {
      toast.error("PNG export failed");
    }
  };

  const copyCaption = async () => {
    if (!caption.trim()) {
      toast.error("No caption yet");
      return;
    }
    try {
      await navigator.clipboard.writeText(caption);
      toast.success("Caption copied");
    } catch {
      toast.error("Could not copy caption");
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <ActionBtn disabled={disabled} onClick={downloadPng} icon={<Download className="h-3.5 w-3.5" />}>
        Download PNG
      </ActionBtn>
      <ActionBtn
        disabled={disabled}
        onClick={() => toast.message("PDF export coming soon")}
        icon={<FileText className="h-3.5 w-3.5" />}
      >
        Download PDF
      </ActionBtn>
      <ActionBtn
        disabled={disabled}
        onClick={() => {
          if (!caption.trim()) toast.error("Generate a carousel first");
          else toast.success("Caption ready below. Use Copy Caption.");
        }}
        icon={<FileText className="h-3.5 w-3.5" />}
      >
        Generate Caption
      </ActionBtn>
      <ActionBtn disabled={disabled} onClick={copyCaption} icon={<Copy className="h-3.5 w-3.5" />}>
        Copy Caption
      </ActionBtn>
      <ActionBtn disabled title="Publishing disabled in prototype" icon={<Share2 className="h-3.5 w-3.5" />}>
        Publish Later
      </ActionBtn>
    </div>
  );
}

function ActionBtn({
  children,
  icon,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      {icon}
      {children}
    </button>
  );
}
