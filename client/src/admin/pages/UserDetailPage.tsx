import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function UserDetailPage({ userId }: { userId: number }) {
  const [, navigate] = useLocation();
  const q = trpc.admin.panelUserDetail.useQuery({ userId }, { enabled: Number.isFinite(userId) });

  if (!Number.isFinite(userId)) {
    return <p className="text-sm text-muted-foreground">Invalid user id.</p>;
  }

  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading user…</p>;
  }

  if (!q.data) {
    return <p className="text-sm text-destructive">User not found.</p>;
  }

  const { user, subscription, usageHistory, recentJobs, recentScripts } = q.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/users")}>
            ← Back to users
          </Button>
          <h2 className="mt-2 text-lg font-semibold">{user.name || "Unknown"}</h2>
          <p className="text-sm text-muted-foreground">{user.email || "No email"}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="text-xs font-medium uppercase text-muted-foreground">Login</p>
          <p className="mt-1">{user.loginMethod || "—"}</p>
          <p className="mt-2 text-xs text-muted-foreground">Role: {user.role}</p>
        </div>
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="text-xs font-medium uppercase text-muted-foreground">Test account</p>
          <p className="mt-1">{user.isTestAccount || user.inferredTestAccount ? "Flagged" : "No"}</p>
        </div>
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="text-xs font-medium uppercase text-muted-foreground">Attribution</p>
          <p className="mt-1 text-xs break-all">
            {[user.utmSource, user.utmMedium, user.utmCampaign].filter(Boolean).join(" / ") || "—"}
          </p>
        </div>
      </div>

      {subscription ? (
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Subscription</h3>
          <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <span className="text-muted-foreground">Plan</span>
              <p className="font-medium capitalize">{subscription.plan}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Status</span>
              <p className="font-medium">{subscription.status}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Billing</span>
              <p className="font-medium">{subscription.billingInterval || "monthly"}</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No active subscription row.</p>
      )}

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Monthly usage</h3>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-2">Month</th>
                <th className="p-2 text-right">Scrapes</th>
                <th className="p-2 text-right">Transcribe</th>
                <th className="p-2 text-right">Recreate</th>
              </tr>
            </thead>
            <tbody>
              {(usageHistory ?? []).map((u) => (
                <tr key={u.usageMonth} className="border-b border-border/60">
                  <td className="p-2">{u.usageMonth}</td>
                  <td className="p-2 text-right">{u.scrapeCount}</td>
                  <td className="p-2 text-right">{u.transcribeCount}</td>
                  <td className="p-2 text-right">{u.recreateCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Recent scrapes</h3>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {(recentJobs ?? []).map((j) => (
              <li key={j.id}>
                {j.handle} · {j.status} · {new Date(j.createdAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Recent scripts</h3>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {(recentScripts ?? []).map((s) => (
              <li key={s.id}>
                {s.title} · {s.status} · {new Date(s.createdAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
