import Tooltip from "@/components/Tooltip";

type HelpTipBadgeProps = {
  label: string;
  tip: string;
  className?: string;
};

export function HelpTipBadge({ label, tip, className }: HelpTipBadgeProps) {
  return (
    <Tooltip content={tip}>
      <span
        className={`cursor-help underline decoration-dotted underline-offset-2 ${className ?? ""}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {label}
      </span>
    </Tooltip>
  );
}
