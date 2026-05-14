import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLocation } from "wouter";
import { useMemo, useState } from "react";

export default function UsersPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState<string>("");
  const [testOnly, setTestOnly] = useState(false);
  const [debounced, setDebounced] = useState({ search: "", plan: "", testOnly: false });

  const queryInput = useMemo(
    () => ({
      search: debounced.search || undefined,
      plan: debounced.plan || undefined,
      testOnly: debounced.testOnly || undefined,
      limit: 50,
      offset: 0,
    }),
    [debounced]
  );

  const list = trpc.admin.panelUserList.useQuery(queryInput);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Users</h2>
        <p className="text-sm text-muted-foreground">
          Owner-only view. Test accounts use the <code className="text-xs">isTestAccount</code> flag plus light
          heuristics on email and openId.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex-1 min-w-[200px] space-y-1.5">
          <Label htmlFor="admin-user-search">Search</Label>
          <Input
            id="admin-user-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or email"
          />
        </div>
        <div className="w-full space-y-1.5 sm:w-40">
          <Label htmlFor="admin-user-plan">Plan</Label>
          <Input
            id="admin-user-plan"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            placeholder="free, pro…"
          />
        </div>
        <div className="flex items-center gap-2 pb-1">
          <Checkbox
            id="admin-test-only"
            checked={testOnly}
            onCheckedChange={(v) => setTestOnly(v === true)}
          />
          <Label htmlFor="admin-test-only" className="text-sm font-normal">
            Test-like only
          </Label>
        </div>
        <Button
          type="button"
          onClick={() =>
            setDebounced({ search: search.trim(), plan: plan.trim().toLowerCase(), testOnly })
          }
        >
          Apply
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Retention</TableHead>
              <TableHead>Test?</TableHead>
              <TableHead className="text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : (list.data?.items ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-muted-foreground">
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
                  <TableCell className="text-sm capitalize">{u.plan}</TableCell>
                  <TableCell className="text-xs">{u.retentionStatus}</TableCell>
                  <TableCell className="text-xs">
                    {u.isTestAccount || u.inferredTestAccount ? "yes" : "no"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => navigate(`/admin/users/${u.id}`)}>
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
        <p className="text-xs text-muted-foreground">Showing {list.data.items.length} of {list.data.total}</p>
      ) : null}
    </div>
  );
}
