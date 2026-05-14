import { trpc } from "@/lib/trpc";

export default function BlogStudioPage() {
  const summary = trpc.admin.blogStudioSummary.useQuery();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Blog Studio</h2>
      <p className="text-sm text-muted-foreground">
        Keyword opportunities, drafts, and publish flow ship in Phase 1 Prompt 6.
      </p>
      <p className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        {summary.data?.note}
      </p>
    </div>
  );
}
