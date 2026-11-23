import type { LucideIcon } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useExperienceAccess } from "@/lib/experienceAccess";

/**
 * A page-level link to a page that left the simplified sidebar (sidebarV2.ts),
 * e.g. "Paste a script" on My Scripts. Shown only to users on sidebar v2;
 * everyone else still has the page in their sidebar.
 */
export function SidebarV2PageLink({
  href,
  label,
  icon: Icon,
  testId,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  testId?: string;
}) {
  const { access } = useExperienceAccess();
  if (access.sidebar !== "v2") return null;
  return (
    <Button asChild variant="outline" size="sm" className="gap-1.5">
      <Link href={href} data-testid={testId}>
        <Icon className="h-4 w-4" />
        {label}
      </Link>
    </Button>
  );
}
