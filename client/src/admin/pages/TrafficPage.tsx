import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DATE_RANGE_PRESET_OPTIONS, type DateRangePresetValue } from "@/lib/adminDateRange";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  Loader2,
  Mail,
  MousePointerClick,
  UserPlus,
  Users,
} from "lucide-react";

type FilterState = {
  dateRangePreset: DateRangePresetValue;
  startDate: string;
  endDate: string;
};

const defaultFilters: FilterState = {
  dateRangePreset: "30d",
  startDate: "",
  endDate: "",
};

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
}

function formatDay(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return String(isoOrDate);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function FunnelStep({
  label,
  value,
  pct,
  sub,
}: {
  label: string;
  value: string;
  pct?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {pct ? <p className="mt-0.5 text-xs text-primary">{pct}</p> : null}
      {sub ? <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export default function TrafficPage() {
  const [, navigate] = useLocation();
  const [draft, setDraft] = useState<FilterState>(defaultFilters);
  const [applied, setApplied] = useState<FilterState>(defaultFilters);

  const queryInput = useMemo(
    () => ({
      dateRangePreset: applied.dateRangePreset,
      startDate:
        applied.dateRangePreset === "custom" && applied.startDate
          ? applied.startDate
          : undefined,
      endDate:
        applied.dateRangePreset === "custom" && applied.endDate
          ? applied.endDate
          : undefined,
    }),
    [applied]
  );

  const report = trpc.admin.trafficConversionReport.useQuery(queryInput);

  const data = report.data;
  const rangeLabel = data?.dateRange.label ?? "Last 30 days";
  const visitors = data?.posthog.visitors;
  const visitorsLabel =
    visitors != null ? String(visitors) : data?.posthog.configured ? "—" : "Not wired";

  const setField = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const maxDailySignups = Math.max(1, ...(data?.daily.signups.map((d) => d.total) ?? [1]));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Traffic & conversion</h2>
        <p className="text-sm text-muted-foreground">
          See who visited, who left an email on the free hook tool, who signed up (Google vs
          email), and who actually started researching creators. Visitor counts come from PostHog
          when API keys are set; signups and leads come from your database.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
        <div>
          <Label className="text-xs uppercase text-muted-foreground">Date range</Label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DATE_RANGE_PRESET_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                size="sm"
                variant={draft.dateRangePreset === opt.value ? "default" : "outline"}
                className={cn("h-8 text-xs")}
                onClick={() => setField("dateRangePreset", opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          {draft.dateRangePreset === "custom" ? (
            <div className="mt-3 flex flex-wrap gap-3">
              <div className="space-y-1">
                <Label htmlFor="traffic-range-start" className="text-xs">
                  From
                </Label>
                <Input
                  id="traffic-range-start"
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => setField("startDate", e.target.value)}
                  className="w-[160px]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="traffic-range-end" className="text-xs">
                  To
                </Label>
                <Input
                  id="traffic-range-end"
                  type="date"
                  value={draft.endDate}
                  onChange={(e) => setField("endDate", e.target.value)}
                  className="w-[160px]"
                />
              </div>
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setApplied({ ...draft })}
          disabled={report.isFetching}
        >
          {report.isFetching ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Loading…
            </>
          ) : (
            "Apply range"
          )}
        </Button>
      </div>

      {report.isError ? (
        <p className="text-sm text-destructive">{report.error.message}</p>
      ) : null}

      {!data && report.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading report…
        </div>
      ) : null}

      {data ? (
        <>
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{rangeLabel}</span>
          </p>

          {!data.posthog.configured ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
              {data.posthog.note}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Unique visitors"
              value={visitorsLabel}
              hint={
                data.posthog.blogReaders != null
                  ? `${data.posthog.blogReaders} read blog content`
                  : undefined
              }
              icon={Users}
            />
            <SummaryCard
              label="Email leads"
              value={String(data.leads.uniqueEmails)}
              hint={`${data.leads.submissions} hook-tool submissions`}
              icon={Mail}
            />
            <SummaryCard
              label="New signups"
              value={String(data.signups.total)}
              hint={`${data.signups.google} Google · ${data.signups.email} email`}
              icon={UserPlus}
            />
            <SummaryCard
              label="Started research"
              value={String(data.activation.startedResearch)}
              hint={`${data.activation.completedFirstSpy} completed first spy`}
              icon={MousePointerClick}
            />
          </div>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Conversion funnel</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <FunnelStep
                label="Visitors"
                value={visitorsLabel}
                sub="PostHog $pageview"
              />
              <FunnelStep
                label="Email leads"
                value={String(data.leads.uniqueEmails)}
                pct={
                  visitors != null
                    ? `${formatPct(data.funnel.visitorToLeadPct)} of visitors`
                    : undefined
                }
                sub="Hook generator unlock"
              />
              <FunnelStep
                label="Signups"
                value={String(data.signups.total)}
                pct={
                  visitors != null
                    ? `${formatPct(data.funnel.visitorToSignupPct)} of visitors`
                    : undefined
                }
                sub="Real accounts created"
              />
              <FunnelStep
                label="Lead → signup"
                value={String(data.leads.convertedToSignup)}
                pct={`${formatPct(data.funnel.leadToSignupPct)} of leads`}
                sub="Same email in users table"
              />
              <FunnelStep
                label="Signup → research"
                value={String(data.activation.startedResearch)}
                pct={`${formatPct(data.funnel.signupToResearchPct)} of signups`}
                sub="Started a spy session"
              />
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Signup method</h3>
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Signups</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(data.signups.byLoginMethod)
                      .sort((a, b) => b[1] - a[1])
                      .map(([method, total]) => (
                        <TableRow key={method}>
                          <TableCell className="capitalize">{method}</TableCell>
                          <TableCell className="text-right tabular-nums">{total}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {data.signups.total > 0
                              ? formatPct(formatConversionPctLocal(total, data.signups.total))
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    {data.signups.total === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-muted-foreground">
                          No signups in this period
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Signup attribution (UTM source)</h3>
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Signups</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.signups.utmSourceBreakdown.map((row) => (
                      <TableRow key={row.source}>
                        <TableCell className="max-w-[200px] truncate">{row.source}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.total}</TableCell>
                      </TableRow>
                    ))}
                    {data.signups.utmSourceBreakdown.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground">
                          No signups in this period
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>

          {data.posthog.configured ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">PostHog intent signals</h3>
              <div className="flex flex-wrap gap-4 text-sm">
                <span>
                  Blog readers:{" "}
                  <strong className="tabular-nums">
                    {data.posthog.blogReaders ?? "—"}
                  </strong>
                </span>
                <span>
                  Hook tool views:{" "}
                  <strong className="tabular-nums">
                    {data.posthog.hookToolViews ?? "—"}
                  </strong>
                </span>
                <span>
                  Signup CTA clicks:{" "}
                  <strong className="tabular-nums">
                    {data.posthog.signupCtaClicks ?? "—"}
                  </strong>
                </span>
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Daily signups</h3>
            {data.daily.signups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No signups in this period.</p>
            ) : (
              <div className="space-y-2">
                {data.daily.signups.map((row) => (
                  <div key={row.day} className="flex items-center gap-3 text-sm">
                    <span className="w-16 shrink-0 text-muted-foreground tabular-nums">
                      {formatDay(row.day)}
                    </span>
                    <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/80"
                        style={{ width: `${(row.total / maxDailySignups) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right tabular-nums font-medium">{row.total}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Recent signups</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => navigate("/admin/users")}
                >
                  All users
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
              <div className="rounded-xl border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Research</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentSignups.map((u) => (
                      <TableRow
                        key={u.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/admin/users/${u.id}`)}
                      >
                        <TableCell className="max-w-[160px] truncate text-xs">
                          {u.email || "—"}
                        </TableCell>
                        <TableCell className="capitalize text-xs">{u.loginMethod}</TableCell>
                        <TableCell className="max-w-[100px] truncate text-xs text-muted-foreground">
                          {u.utmSource || "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {u.hasCompletedFirstSpy ? "First spy done" : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {data.recentSignups.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground">
                          No signups in this period
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Recent email leads (hook tool)</h3>
              <div className="rounded-xl border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Niche</TableHead>
                      <TableHead>Account?</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentLeads.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="max-w-[160px] truncate text-xs">{l.email}</TableCell>
                        <TableCell className="max-w-[140px] truncate text-xs text-muted-foreground">
                          {l.niche}
                        </TableCell>
                        <TableCell className="text-xs">
                          {l.hasAccount ? (
                            <span className="text-emerald-600 dark:text-emerald-400">Signed up</span>
                          ) : (
                            <span className="text-muted-foreground">Lead only</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {data.recentLeads.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-muted-foreground">
                          No hook-tool emails in this period
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

function formatConversionPctLocal(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}
