import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DATE_RANGE_PRESET_OPTIONS, type DateRangePresetValue } from "@/lib/adminDateRange";
import { formatActiveDuration, formatRelativeActive } from "@/lib/formatActivity";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useMemo, useState } from "react";

type FilterState = {
  search: string;
  plan: string;
  testOnly: boolean;
  paidOnly: boolean;
  freeOnly: boolean;
  retentionStatus: "" | "active" | "at_risk" | "churned";
  subscriptionStatus: "" | "active" | "canceled" | "past_due" | "trialing";
  minVisits: string;
  maxDaysSinceActive: string;
  dateRangePreset: DateRangePresetValue;
  startDate: string;
  endDate: string;
  sortBy:
    | "lastActiveAt"
    | "periodVisits"
    | "periodActiveSeconds"
    | "createdAt"
    | "name";
  sortOrder: "asc" | "desc";
};

const defaultFilters: FilterState = {
  search: "",
  plan: "",
  testOnly: false,
  paidOnly: false,
  freeOnly: false,
  retentionStatus: "",
  subscriptionStatus: "",
  minVisits: "",
  maxDaysSinceActive: "",
  dateRangePreset: "30d",
  startDate: "",
  endDate: "",
  sortBy: "lastActiveAt",
  sortOrder: "desc",
};

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default function UsersPage() {
  const [, navigate] = useLocation();
  const [draft, setDraft] = useState<FilterState>(defaultFilters);
  const [applied, setApplied] = useState<FilterState>(defaultFilters);

  const queryInput = useMemo(() => {
    const minVisits = applied.minVisits.trim();
    const maxDays = applied.maxDaysSinceActive.trim();
    return {
      search: applied.search || undefined,
      plan: applied.plan || undefined,
      testOnly: applied.testOnly || undefined,
      paidOnly: applied.paidOnly || undefined,
      freeOnly: applied.freeOnly || undefined,
      retentionStatus: applied.retentionStatus || undefined,
      subscriptionStatus: applied.subscriptionStatus || undefined,
      minVisits: minVisits ? Number(minVisits) : undefined,
      maxDaysSinceActive: maxDays ? Number(maxDays) : undefined,
      dateRangePreset: applied.dateRangePreset,
      startDate:
        applied.dateRangePreset === "custom" && applied.startDate
          ? applied.startDate
          : undefined,
      endDate:
        applied.dateRangePreset === "custom" && applied.endDate
          ? applied.endDate
          : undefined,
      sortBy: applied.sortBy,
      sortOrder: applied.sortOrder,
      limit: 100,
      offset: 0,
    };
  }, [applied]);

  const list = trpc.admin.panelUserList.useQuery(queryInput);

  const setField = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const summary = list.data?.summary;
  const rangeLabel = list.data?.dateRange?.label ?? "Last 30 days";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Users</h2>
        <p className="text-sm text-muted-foreground">
          Metrics below use the selected date range. Visits count active days (logins or product
          use). Time in app uses live heartbeat tracking plus historical scrape days as visit
          proxy.
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
                <Label htmlFor="admin-range-start" className="text-xs">
                  From
                </Label>
                <Input
                  id="admin-range-start"
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => setField("startDate", e.target.value)}
                  className="w-[160px]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="admin-range-end" className="text-xs">
                  To
                </Label>
                <Input
                  id="admin-range-end"
                  type="date"
                  value={draft.endDate}
                  onChange={(e) => setField("endDate", e.target.value)}
                  className="w-[160px]"
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label htmlFor="admin-user-search">Search</Label>
            <Input
              id="admin-user-search"
              value={draft.search}
              onChange={(e) => setField("search", e.target.value)}
              placeholder="Name or email"
            />
          </div>
          <div className="w-full space-y-1.5 sm:w-36">
            <Label htmlFor="admin-user-plan">Plan</Label>
            <Input
              id="admin-user-plan"
              value={draft.plan}
              onChange={(e) => setField("plan", e.target.value)}
              placeholder="free, pro…"
            />
          </div>
          <div className="w-full space-y-1.5 sm:w-40">
            <Label>Retention</Label>
            <Select
              value={draft.retentionStatus || "all"}
              onValueChange={(v) =>
                setField("retentionStatus", v === "all" ? "" : (v as FilterState["retentionStatus"]))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="at_risk">At risk</SelectItem>
                <SelectItem value="churned">Churned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-40">
            <Label>Sub. status</Label>
            <Select
              value={draft.subscriptionStatus || "all"}
              onValueChange={(v) =>
                setField(
                  "subscriptionStatus",
                  v === "all" ? "" : (v as FilterState["subscriptionStatus"])
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="trialing">Trialing</SelectItem>
                <SelectItem value="past_due">Past due</SelectItem>
                <SelectItem value="canceled">Canceled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-28">
            <Label htmlFor="admin-min-visits">Min visits</Label>
            <Input
              id="admin-min-visits"
              type="number"
              min={0}
              value={draft.minVisits}
              onChange={(e) => setField("minVisits", e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="w-full space-y-1.5 sm:w-36">
            <Label htmlFor="admin-max-days">Max days idle</Label>
            <Input
              id="admin-max-days"
              type="number"
              min={0}
              value={draft.maxDaysSinceActive}
              onChange={(e) => setField("maxDaysSinceActive", e.target.value)}
              placeholder="e.g. 7"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="w-full space-y-1.5 sm:w-44">
            <Label>Sort by</Label>
            <Select
              value={draft.sortBy}
              onValueChange={(v) => setField("sortBy", v as FilterState["sortBy"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lastActiveAt">Last active</SelectItem>
                <SelectItem value="periodVisits">Visits in range</SelectItem>
                <SelectItem value="periodActiveSeconds">Time in range</SelectItem>
                <SelectItem value="createdAt">Signed up</SelectItem>
                <SelectItem value="name">Name</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-32">
            <Label>Order</Label>
            <Select
              value={draft.sortOrder}
              onValueChange={(v) => setField("sortOrder", v as "asc" | "desc")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Highest first</SelectItem>
                <SelectItem value="asc">Lowest first</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-4 pb-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="admin-paid-only"
                checked={draft.paidOnly}
                onCheckedChange={(v) => {
                  const on = v === true;
                  setDraft((prev) => ({
                    ...prev,
                    paidOnly: on,
                    freeOnly: on ? false : prev.freeOnly,
                  }));
                }}
              />
              <Label htmlFor="admin-paid-only" className="text-sm font-normal">
                Paid only
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="admin-free-only"
                checked={draft.freeOnly}
                onCheckedChange={(v) => {
                  const on = v === true;
                  setDraft((prev) => ({
                    ...prev,
                    freeOnly: on,
                    paidOnly: on ? false : prev.paidOnly,
                  }));
                }}
              />
              <Label htmlFor="admin-free-only" className="text-sm font-normal">
                Free only
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="admin-test-only"
                checked={draft.testOnly}
                onCheckedChange={(v) => setField("testOnly", v === true)}
              />
              <Label htmlFor="admin-test-only" className="text-sm font-normal">
                Test-like only
              </Label>
            </div>
          </div>
          <div className="flex gap-2 pb-1">
            <Button type="button" onClick={() => setApplied({ ...draft })}>
              Apply
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(defaultFilters);
                setApplied(defaultFilters);
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      </div>

      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading summary…</p>
      ) : summary ? (
        <div>
          <p className="mb-3 text-xs font-medium text-muted-foreground">
            Overview · {rangeLabel}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <SummaryCard label="Users" value={String(summary.totalUsers)} hint="After filters" />
            <SummaryCard
              label="Active in period"
              value={String(summary.activeInPeriod)}
              hint="Had visits or time"
            />
            <SummaryCard
              label="Visit days"
              value={String(summary.totalPeriodVisits)}
              hint="Sum across users"
            />
            <SummaryCard
              label="Time in app"
              value={formatActiveDuration(summary.totalPeriodActiveSeconds)}
            />
            <SummaryCard label="Paid" value={String(summary.paidUsers)} />
            <SummaryCard label="New signups" value={String(summary.newSignupsInPeriod)} />
            <SummaryCard
              label="Avg / active user"
              value={`${summary.avgVisitsPerActive}d · ${formatActiveDuration(summary.avgSecondsPerActive)}`}
              hint="Visits and time"
            />
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Package</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">
                Visits
                <span className="block text-[10px] font-normal normal-case text-muted-foreground">
                  {rangeLabel}
                </span>
              </TableHead>
              <TableHead>Last active</TableHead>
              <TableHead className="text-right">
                Time in app
                <span className="block text-[10px] font-normal normal-case text-muted-foreground">
                  {rangeLabel}
                </span>
              </TableHead>
              <TableHead>Retention</TableHead>
              <TableHead className="text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : (list.data?.items ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-sm text-muted-foreground">
                  No users match.
                </TableCell>
              </TableRow>
            ) : (
              list.data!.items.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell className="text-xs">{u.isPaid ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-sm capitalize">{u.plan}</TableCell>
                  <TableCell className="text-xs capitalize">
                    {u.subscriptionStatus ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{u.periodVisits}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    <span title={new Date(u.lastActiveAt).toLocaleString()}>
                      {formatRelativeActive(new Date(u.lastActiveAt))}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatActiveDuration(u.periodActiveSeconds)}
                  </TableCell>
                  <TableCell className="text-xs capitalize">{u.retentionStatus}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/admin/users/${u.id}`)}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {list.data ? (
        <p className="text-xs text-muted-foreground">
          Showing {list.data.items.length} of {list.data.total} matching users · {rangeLabel}
        </p>
      ) : null}
    </div>
  );
}
