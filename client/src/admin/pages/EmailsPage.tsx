import { trpc } from "@/lib/trpc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function JsonSnippet({ value }: { value: unknown }) {
  const s = JSON.stringify(value, null, 0);
  const short = s.length > 120 ? `${s.slice(0, 120)}…` : s;
  return <code className="text-xs break-all text-muted-foreground">{short}</code>;
}

export default function EmailsPage() {
  const recent = trpc.admin.emailRecentEvents.useQuery({ limit: 60 });
  const bounces = trpc.admin.emailBounces.useQuery({ limit: 80 });
  const templates = trpc.admin.emailTemplatesList.useQuery();
  const stats = trpc.admin.emailTemplateStats.useQuery();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Emails</h2>
        <p className="text-sm text-muted-foreground">
          Resend webhooks populate <code className="text-xs">email_events</code>. Configure{" "}
          <code className="text-xs">RESEND_WEBHOOK_SECRET</code> and point Resend to{" "}
          <code className="text-xs">/api/resend/webhook</code>.
        </p>
      </div>

      <Tabs defaultValue="activity" className="w-full">
        <TabsList className="flex w-full flex-wrap gap-1 h-auto p-1">
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="bounces">Bounces</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="stats">Per-template volume</TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Template</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(recent.data?.items ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-sm text-muted-foreground">
                      {recent.isLoading ? "Loading…" : "No events yet. Send mail or replay a Resend webhook."}
                    </TableCell>
                  </TableRow>
                ) : (
                  recent.data!.items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(row.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.eventType}</TableCell>
                      <TableCell className="text-xs">{row.recipient || "—"}</TableCell>
                      <TableCell className="text-xs">{row.templateSlug || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="bounces" className="mt-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Payload</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(bounces.data?.items ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-sm text-muted-foreground">
                      {bounces.isLoading ? "Loading…" : "No bounces recorded."}
                    </TableCell>
                  </TableRow>
                ) : (
                  bounces.data!.items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(row.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.eventType}</TableCell>
                      <TableCell className="text-xs">{row.recipient || "—"}</TableCell>
                      <TableCell>
                        <JsonSnippet value={row.payload} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Slug</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(templates.data?.items ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-sm text-muted-foreground">
                      {templates.isLoading ? "Loading…" : "Run scripts/backfill-email-templates.ts after migrating."}
                    </TableCell>
                  </TableRow>
                ) : (
                  templates.data!.items.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{t.slug}</TableCell>
                      <TableCell className="text-sm">{t.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.description || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template tag</TableHead>
                  <TableHead className="text-right">Events (with slug)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(stats.data?.items ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-sm text-muted-foreground">
                      {stats.isLoading ? "Loading…" : "No tagged events yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  stats.data!.items.map((r) => (
                    <TableRow key={r.templateSlug}>
                      <TableCell className="font-mono text-xs">{r.templateSlug}</TableCell>
                      <TableCell className="text-right text-sm">{r.count}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
