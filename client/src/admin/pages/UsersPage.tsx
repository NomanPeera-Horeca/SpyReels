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
import { formatActiveDuration, formatRelativeActive } from "@/lib/formatActivity";
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
  sortBy:
    | "lastActiveAt"
    | "visitCount"
    | "totalActiveSeconds"
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
  sortBy: "lastActiveAt",
  sortOrder: "desc",
};

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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Users</h2>
        <p className="text-sm text-muted-foreground">
          Visit days, last active, time in app, plan, and subscription status. Visits count once per
          UTC day; time updates while the dashboard is open (about every 60s).
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
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
                <SelectItem value="visitCount">Visits</SelectItem>
                <SelectItem value="totalActiveSeconds">Time in app</SelectItem>
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
                <SelectItem value="desc">Newest first</SelectItem>
                <SelectItem value="asc">Oldest first</SelectItem>
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

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Package</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Visits</TableHead>
              <TableHead>Last active</TableHead>
              <TableHead className="text-right">Time in app</TableHead>
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
                  <TableCell className="text-right text-sm tabular-nums">{u.visitCount}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    <span title={new Date(u.lastActiveAt).toLocaleString()}>
                      {formatRelativeActive(new Date(u.lastActiveAt))}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatActiveDuration(u.totalActiveSeconds)}
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
          Showing {list.data.items.length} of {list.data.total} matching users
        </p>
      ) : null}
    </div>
  );
}
