import { trpc } from "@/lib/trpc";

export default function TrafficPage() {
  const ping = trpc.admin.ping.useQuery();
  const overview = trpc.admin.trafficOverview.useQuery();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Traffic</h2>
      <p className="text-sm text-muted-foreground">
        Overnight visitors, channels, and funnels will land here (Phase 1 Prompt 5).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-background/60 p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">API</p>
          <p className="mt-1 font-mono text-sm">
            ping: {ping.data ? "ok" : ping.isLoading ? "…" : "error"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background/60 p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">Overview stub</p>
          <p className="mt-1 text-sm text-muted-foreground">{overview.data?.note}</p>
        </div>
      </div>
    </div>
  );
}
