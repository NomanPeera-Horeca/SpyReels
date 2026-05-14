import { trpc } from "@/lib/trpc";

export default function CreatorsPage() {
  const summary = trpc.admin.creatorsSummary.useQuery();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Creators</h2>
      <p className="text-sm text-muted-foreground">
        Featured catalog controls and scrape health ship in Phase 1 Prompt 4.
      </p>
      <p className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        {summary.data?.note}
      </p>
    </div>
  );
}
