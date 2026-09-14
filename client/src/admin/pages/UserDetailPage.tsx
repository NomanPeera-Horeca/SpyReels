import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  formatActiveDuration,
  formatRelativeActive,
} from "@/lib/formatActivity";
import { useLocation } from "wouter";

type ComplimentaryPlan = "starter" | "pro" | "business" | "agency";
type GrantDuration = "7d" | "30d" | "90d" | "none";

const PLAN_OPTIONS: { value: ComplimentaryPlan; label: string }[] = [
  { value: "starter", label: "Starter" },
  { value: "pro", label: "PRO" },
  { value: "business", label: "Business" },
  { value: "agency", label: "Agency" },
];

const DURATION_OPTIONS: { value: GrantDuration; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "none", label: "No expiry" },
];

function expiryForDuration(duration: GrantDuration): string | null {
  if (duration === "none") return null;
  const days = Number.parseInt(duration, 10);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "No expiry";
  return new Date(value).toLocaleString();
}

export default function UserDetailPage({ userId }: { userId: number }) {
  const [, navigate] = useLocation();
  const [grantPlan, setGrantPlan] = useState<ComplimentaryPlan>("pro");
  const [grantDuration, setGrantDuration] = useState<GrantDuration>("none");
  const [grantReason, setGrantReason] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const q = trpc.admin.panelUserDetail.useQuery(
    { userId },
    { enabled: Number.isFinite(userId) }
  );

  const grantMutation = trpc.admin.grantComplimentaryAccess.useMutation({
    onSuccess: async (result) => {
      setActionMessage(
        `Complimentary ${result.effectivePlan.toUpperCase()} access is active.`
      );
      setGrantReason("");
      await q.refetch();
    },
    onError: (error) => setActionMessage(error.message),
  });

  const revokeMutation = trpc.admin.revokeComplimentaryAccess.useMutation({
    onSuccess: async (result) => {
      setActionMessage(
        `Complimentary access revoked. Effective billing plan is ${result.billingPlan.toUpperCase()}.`
      );
      setRevokeReason("");
      await q.refetch();
    },
    onError: (error) => setActionMessage(error.message),
  });

  if (!Number.isFinite(userId)) {
    return <p className="text-sm text-muted-foreground">Invalid user id.</p>;
  }

  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading user…</p>;
  }

  if (!q.data) {
    return <p className="text-sm text-destructive">User not found.</p>;
  }

  const {
    user,
    subscription,
    entitlement,
    complimentaryAccessHistory,
    usageHistory,
    recentJobs,
    recentScripts,
  } = q.data;
  const activeGrant = entitlement.complimentaryAccess;
  const isAdminTarget = user.role === "admin";
  const mutationError = grantMutation.error?.message || revokeMutation.error?.message;

  const submitGrant = () => {
    setActionMessage(null);
    grantMutation.mutate({
      userId,
      plan: grantPlan,
      expiresAt: expiryForDuration(grantDuration),
      reason: grantReason.trim(),
    });
  };

  const submitRevoke = () => {
    setActionMessage(null);
    revokeMutation.mutate({
      userId,
      reason: revokeReason.trim(),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/admin/users")}
          >
            ← Back to users
          </Button>
          <h2 className="mt-2 text-lg font-semibold">
            {user.name || "Unknown"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {user.email || "No email"}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Paid account
          </p>
          <p className="mt-1 font-medium">{user.isPaid ? "Yes" : "No"}</p>
          {user.hasComplimentaryAccess ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Complimentary access is separate from billing.
            </p>
          ) : null}
        </div>
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Visits ({q.data.dateRange?.label ?? "30d"})
          </p>
          <p className="mt-1 font-medium tabular-nums">
            {user.periodVisits ?? 0}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Lifetime: {user.visitCount}
          </p>
        </div>
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Last active
          </p>
          <p className="mt-1 font-medium">
            {formatRelativeActive(new Date(user.lastActiveAt))}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(user.lastActiveAt).toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Time in app ({q.data.dateRange?.label ?? "30d"})
          </p>
          <p className="mt-1 font-medium">
            {formatActiveDuration(user.periodActiveSeconds ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Lifetime: {formatActiveDuration(user.totalActiveSeconds)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground capitalize">
            Retention: {user.retentionStatus} · {user.daysSinceActive}d idle
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Login
          </p>
          <p className="mt-1">{user.loginMethod || "Not set"}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Role: {user.role}
          </p>
        </div>
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Test account
          </p>
          <p className="mt-1">
            {user.isTestAccount || user.inferredTestAccount ? "Flagged" : "No"}
          </p>
        </div>
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Attribution
          </p>
          <p className="mt-1 break-all text-xs">
            {[user.utmSource, user.utmMedium, user.utmCampaign]
              .filter(Boolean)
              .join(" / ") || "Not set"}
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">Access</h3>
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium uppercase">
                {entitlement.effectivePlan}
              </span>
              {entitlement.accessSource === "complimentary" ? (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium">
                  Complimentary
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Effective access is resolved independently from Stripe billing.
              Complimentary users keep normal plan limits so their behavior is
              representative of a paying customer.
            </p>
          </div>
        </div>

        <div className="grid gap-px bg-border sm:grid-cols-4">
          <div className="bg-card p-4">
            <p className="text-xs uppercase text-muted-foreground">
              Effective plan
            </p>
            <p className="mt-1 font-medium uppercase">
              {entitlement.effectivePlan}
            </p>
          </div>
          <div className="bg-card p-4">
            <p className="text-xs uppercase text-muted-foreground">
              Billing plan
            </p>
            <p className="mt-1 font-medium capitalize">
              {entitlement.billingPlan}
            </p>
          </div>
          <div className="bg-card p-4">
            <p className="text-xs uppercase text-muted-foreground">
              Access source
            </p>
            <p className="mt-1 font-medium capitalize">
              {entitlement.accessSource}
            </p>
          </div>
          <div className="bg-card p-4">
            <p className="text-xs uppercase text-muted-foreground">Expires</p>
            <p className="mt-1 text-sm font-medium">
              {activeGrant ? formatDate(activeGrant.expiresAt) : "Not applicable"}
            </p>
          </div>
        </div>

        {isAdminTarget ? (
          <div className="px-5 py-4 text-sm text-muted-foreground">
            Admin accounts already bypass product plan limits. Complimentary
            access cannot be granted to an admin account.
          </div>
        ) : (
          <div className="grid gap-6 px-5 py-5 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <h4 className="text-sm font-semibold">
                {activeGrant
                  ? "Change complimentary access"
                  : "Grant complimentary access"}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                No Stripe charge is created. The user remains a normal user and
                all usage is still counted against the selected plan.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">
                    Plan
                  </span>
                  <select
                    value={grantPlan}
                    onChange={(event) =>
                      setGrantPlan(event.target.value as ComplimentaryPlan)
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    {PLAN_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">
                    Duration
                  </span>
                  <select
                    value={grantDuration}
                    onChange={(event) =>
                      setGrantDuration(event.target.value as GrantDuration)
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    {DURATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="mt-3 block space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">
                  Reason
                </span>
                <textarea
                  value={grantReason}
                  onChange={(event) => setGrantReason(event.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Example: Social media agency product QA"
                  className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                />
              </label>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  onClick={submitGrant}
                  disabled={
                    grantReason.trim().length < 3 || grantMutation.isPending
                  }
                >
                  {grantMutation.isPending
                    ? "Saving…"
                    : activeGrant
                      ? "Replace access"
                      : "Grant access"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Billing records and payment methods are not changed.
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <h4 className="text-sm font-semibold">Current grant</h4>
              {activeGrant ? (
                <div className="mt-3 space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Plan</p>
                      <p className="font-medium uppercase">{activeGrant.plan}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Expires</p>
                      <p className="font-medium">
                        {formatDate(activeGrant.expiresAt)}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Reason</p>
                    <p className="mt-1">
                      {activeGrant.reason || "No reason recorded"}
                    </p>
                  </div>
                  <div className="border-t border-border pt-3">
                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        Revocation reason
                      </span>
                      <input
                        value={revokeReason}
                        onChange={(event) => setRevokeReason(event.target.value)}
                        maxLength={500}
                        placeholder="Why is access being removed?"
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                      />
                    </label>
                    <Button
                      className="mt-3"
                      variant="outline"
                      onClick={submitRevoke}
                      disabled={
                        revokeReason.trim().length < 3 || revokeMutation.isPending
                      }
                    >
                      {revokeMutation.isPending
                        ? "Revoking…"
                        : "Revoke complimentary access"}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No active complimentary access.
                </p>
              )}
            </div>
          </div>
        )}

        {actionMessage || mutationError ? (
          <div className="border-t border-border px-5 py-3 text-sm text-muted-foreground">
            {actionMessage || mutationError}
          </div>
        ) : null}
      </section>

      {subscription ? (
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Stripe subscription
          </h3>
          <div className="mt-2 grid gap-2 text-sm sm:grid-cols-4">
            <div>
              <span className="text-muted-foreground">Package</span>
              <p className="font-medium capitalize">{subscription.plan}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Status</span>
              <p className="font-medium capitalize">{subscription.status}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Billing</span>
              <p className="font-medium">
                {subscription.billingInterval || "monthly"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Signed up</span>
              <p className="font-medium">
                {new Date(user.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          No Stripe subscription row. Billing plan is free.
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Complimentary access history
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Permanent audit trail for grants, replacements, expirations and
              revocations.
            </p>
          </div>
        </div>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-2">Plan</th>
                <th className="p-2">State</th>
                <th className="p-2">Reason</th>
                <th className="p-2">Granted</th>
                <th className="p-2">Expires</th>
              </tr>
            </thead>
            <tbody>
              {complimentaryAccessHistory.length ? (
                complimentaryAccessHistory.map((grant) => (
                  <tr key={grant.id} className="border-b border-border/60">
                    <td className="p-2 font-medium uppercase">{grant.plan}</td>
                    <td className="p-2 capitalize">{grant.lifecycle}</td>
                    <td className="max-w-[360px] p-2 text-muted-foreground">
                      {grant.reason}
                      {grant.revokeReason ? (
                        <p className="mt-1 text-xs">
                          Revoked: {grant.revokeReason}
                        </p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap p-2">
                      {new Date(grant.createdAt).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap p-2">
                      {grant.expiresAt
                        ? new Date(grant.expiresAt).toLocaleDateString()
                        : "No expiry"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="p-4 text-center text-muted-foreground"
                  >
                    No complimentary access history.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Monthly usage
        </h3>
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
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recent scrapes
          </h3>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {(recentJobs ?? []).map((j) => (
              <li key={j.id}>
                {j.handle} · {j.status} ·{" "}
                {new Date(j.createdAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recent scripts
          </h3>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {(recentScripts ?? []).map((s) => (
              <li key={s.id}>
                {s.title} · {s.status} ·{" "}
                {new Date(s.createdAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
