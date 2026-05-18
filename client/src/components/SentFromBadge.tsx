import { Badge } from "@/components/ui/badge";
import Tooltip from "@/components/Tooltip";

type SentFromBadgeProps = {
  workspaceName: string;
  senderName: string;
  sentAt: Date | string | null;
};

function formatSentDate(sentAt: Date | string | null): string {
  if (!sentAt) return "recently";
  const date = sentAt instanceof Date ? sentAt : new Date(sentAt);
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function SentFromBadge({
  workspaceName,
  senderName,
  sentAt,
}: SentFromBadgeProps) {
  const tip = `Sent by ${senderName} from ${workspaceName} on ${formatSentDate(sentAt)}`;

  return (
    <Tooltip content={tip} side="right">
      <Badge
        variant="outline"
        className="text-[10px] font-normal shrink-0 cursor-default"
      >
        Sent from {workspaceName}
      </Badge>
    </Tooltip>
  );
}
