import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const SEGMENTS = [
  { value: "all", label: "All segments" },
  { value: "canceled_paid", label: "Canceled paid" },
  { value: "at_risk_paid", label: "At risk paid" },
  { value: "engaged_free", label: "Engaged free" },
  { value: "ghost", label: "Ghost" },
  { value: "bug_hit", label: "Bug hit" },
] as const;

type SegmentFilter = (typeof SEGMENTS)[number]["value"];

type OutreachUser = {
  id: number;
  name: string | null;
  email: string | null;
  plan: string;
  status: string;
  segment: string;
  lastActiveAt: Date;
  recentScrapes: string[];
  recentScriptsCount: number;
  latestOutreachEmail: {
    id: number;
    subject: string | null;
    body: string | null;
    status: string | null;
    sentAt: Date | null;
    draftedAt: Date | null;
    errorMessage: string | null;
  } | null;
};

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export default function AdminOutreach() {
  const utils = trpc.useUtils();
  const list = trpc.outreach.listUsers.useQuery();

  const generateDraft = trpc.outreach.generateDraft.useMutation({
    onSuccess: async (data, variables) => {
      await utils.outreach.listUsers.invalidate();
      if (reviewUser?.id === variables.userId) {
        setSubject(data.subject);
        setBody(data.body);
        setSendError(null);
        setConfirmSend(false);
      }
      toast.success(
        reviewUser?.id === variables.userId ? "Draft regenerated" : "Draft generated"
      );
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkGenerate = trpc.outreach.bulkGenerateDrafts.useMutation({
    onSuccess: async (data) => {
      await utils.outreach.listUsers.invalidate();
      const ok = data.results.filter((r) => r.ok).length;
      const fail = data.results.length - ok;
      toast.success(`Generated ${ok} draft(s)${fail > 0 ? `, ${fail} failed` : ""}`);
      setSelectedIds(new Set());
    },
    onError: (err) => toast.error(err.message),
  });

  const updateDraft = trpc.outreach.updateDraft.useMutation({
    onSuccess: () => toast.success("Draft saved"),
    onError: (err) => toast.error(err.message),
  });

  const sendDraft = trpc.outreach.send.useMutation({
    onSuccess: async (data) => {
      await utils.outreach.listUsers.invalidate();
      setReviewUser(null);
      setConfirmSend(false);
      toast.success(`Sent to ${data.to}`);
    },
    onError: (err) => setSendError(err.message),
  });

  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [reviewUser, setReviewUser] = useState<OutreachUser | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const users = (list.data?.users ?? []) as OutreachUser[];

  const filtered = useMemo(() => {
    if (segmentFilter === "all") return users;
    return users.filter((u) => u.segment === segmentFilter);
  }, [users, segmentFilter]);

  const stats = list.data?.stats ?? { total: 0, draftsPending: 0, sentToday: 0 };

  const openReview = (user: OutreachUser) => {
    const draft = user.latestOutreachEmail;
    setReviewUser(user);
    setSubject(draft?.subject ?? "");
    setBody(draft?.body ?? "");
    setSendError(draft?.errorMessage ?? null);
    setConfirmSend(false);
  };

  const draftId = reviewUser?.latestOutreachEmail?.id;
  const canEdit =
    reviewUser?.latestOutreachEmail?.status === "draft" ||
    reviewUser?.latestOutreachEmail?.status === "failed";

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((u) => u.id)));
    }
  };

  const handleBulkGenerate = () => {
    const ids = Array.from(selectedIds).slice(0, 20);
    if (ids.length === 0) {
      toast.error("Select at least one user");
      return;
    }
    bulkGenerate.mutate({ userIds: ids });
  };

  const handleSaveEdits = async () => {
    if (!draftId) return;
    await updateDraft.mutateAsync({ draftId, subject, body });
    await utils.outreach.listUsers.invalidate();
  };

  const handleSend = () => {
    if (!draftId || !reviewUser?.email) return;
    sendDraft.mutate({ draftId });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Outreach</h2>
        <p className="text-sm text-muted-foreground">
          Review AI-drafted founder emails from{" "}
          <code className="text-xs">noah.perry@spyreels.ai</code>. Every send requires
          your confirmation.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="outreach-segment">Segment</Label>
          <select
            id="outreach-segment"
            className="flex h-9 w-full min-w-[200px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            value={segmentFilter}
            onChange={(e) => setSegmentFilter(e.target.value as SegmentFilter)}
          >
            {SEGMENTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={selectedIds.size === 0 || bulkGenerate.isPending}
          onClick={handleBulkGenerate}
        >
          Generate drafts for selected ({Math.min(selectedIds.size, 20)})
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={String(stats.total)} />
        <StatCard label="Drafts pending review" value={String(stats.draftsPending)} />
        <StatCard label="Sent today" value={String(stats.sentToday)} />
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Replies
          </p>
          <a
            href="mailto:noah.perry@spyreels.ai"
            className="mt-1 block text-lg font-semibold text-primary hover:underline"
          >
            noah.perry@spyreels.ai
          </a>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Name / Email</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Segment</TableHead>
              <TableHead>Last active</TableHead>
              <TableHead>Recent scrape</TableHead>
              <TableHead>Draft</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-sm text-muted-foreground">
                  No users match this filter.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((u) => {
                const draft = u.latestOutreachEmail;
                const isSent = draft?.status === "sent";
                const hasDraft =
                  draft &&
                  (draft.status === "draft" || draft.status === "failed");

                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(u.id)}
                        onCheckedChange={() => toggleSelect(u.id)}
                        aria-label={`Select ${u.email}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{u.name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell className="text-sm capitalize">{u.plan}</TableCell>
                    <TableCell className="text-xs">{u.status}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {u.segment}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatRelative(new Date(u.lastActiveAt))}
                    </TableCell>
                    <TableCell className="text-xs">
                      {u.recentScrapes[0] ? `@${u.recentScrapes[0]}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {!draft
                        ? "—"
                        : isSent
                          ? "Sent"
                          : draft.status === "failed"
                            ? "Failed"
                            : "Draft"}
                    </TableCell>
                    <TableCell className="text-right">
                      {isSent && draft?.sentAt ? (
                        <Badge
                          variant="secondary"
                          title={new Date(draft.sentAt).toLocaleString()}
                        >
                          Sent ✓
                        </Badge>
                      ) : hasDraft ? (
                        <Button size="sm" variant="outline" onClick={() => openReview(u)}>
                          Review
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={generateDraft.isPending}
                          onClick={() => generateDraft.mutate({ userId: u.id })}
                        >
                          Generate Draft
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={reviewUser != null}
        onOpenChange={(open) => {
          if (!open) {
            setReviewUser(null);
            setConfirmSend(false);
            setSendError(null);
          }
        }}
      >
        <DialogContent className="max-w-lg sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Review outreach email</DialogTitle>
            <DialogDescription>
              Plain text only. Max 10 sends per hour across all users.
            </DialogDescription>
          </DialogHeader>

          {reviewUser ? (
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">To: </span>
                <span className="font-medium">{reviewUser.email}</span>
              </div>
              <div>
                <span className="text-muted-foreground">From: </span>
                <span className="font-medium">noah.perry@spyreels.ai</span>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="outreach-subject">Subject</Label>
                <Input
                  id="outreach-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="outreach-body">Body</Label>
                <Textarea
                  id="outreach-body"
                  rows={8}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  disabled={!canEdit}
                />
                <p className="text-xs text-muted-foreground">
                  {body.length} characters · {wordCount(body)} words
                </p>
              </div>

              {sendError ? (
                <p className="text-sm text-destructive" role="alert">
                  {sendError}
                </p>
              ) : null}

              {confirmSend ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                  Send to {reviewUser.email}? This cannot be undone.
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setReviewUser(null);
                setConfirmSend(false);
              }}
            >
              Cancel
            </Button>
            {canEdit ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={generateDraft.isPending || !reviewUser}
                  onClick={() => {
                    if (!reviewUser) return;
                    generateDraft.mutate({ userId: reviewUser.id });
                  }}
                >
                  {generateDraft.isPending ? "Regenerating…" : "Regenerate draft"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={updateDraft.isPending || !draftId}
                  onClick={() => void handleSaveEdits()}
                >
                  Save edits
                </Button>
                {!confirmSend ? (
                  <Button
                    type="button"
                    disabled={!draftId || !subject.trim() || !body.trim()}
                    onClick={() => {
                      setSendError(null);
                      setConfirmSend(true);
                    }}
                  >
                    Send now
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={sendDraft.isPending || !draftId}
                    onClick={handleSend}
                  >
                    {sendDraft.isPending ? "Sending…" : "Confirm send"}
                  </Button>
                )}
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
