import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
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
import { downloadExportFile } from "@/lib/exportJobs";
import { cn } from "@/lib/utils";
import { Download, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type FilterState = {
  dateRangePreset: DateRangePresetValue;
  startDate: string;
  endDate: string;
};

const defaultFilters: FilterState = {
  dateRangePreset: "7d",
  startDate: "",
  endDate: "",
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

function formatDay(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return String(isoOrDate);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ScriptQualityPage() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const queryInput = useMemo(
    () => ({
      dateRangePreset: filters.dateRangePreset,
      startDate: filters.dateRangePreset === "custom" ? filters.startDate || undefined : undefined,
      endDate: filters.dateRangePreset === "custom" ? filters.endDate || undefined : undefined,
    }),
    [filters]
  );

  const reportQuery = trpc.admin.coachScriptQualitySummary.useQuery(queryInput);
  const downloadMutation = trpc.admin.coachScriptQualityDownload.useMutation({
    onSuccess: (data) => {
      downloadExportFile(data);
      toast.success(`Downloaded ${data.filename}`);
    },
    onError: (err) => toast.error(err.message || "Download failed"),
  });

  const summary = reportQuery.data?.summary;
  const items = reportQuery.data?.items ?? [];

  const handleDownload = (format: "html" | "csv") => {
    downloadMutation.mutate({ ...queryInput, format });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Script Quality</h2>
        <p className="text-sm text-muted-foreground">
          AI Coach scripts with judge scores and thumbs feedback. Default window is 7 days.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="script-quality-range">Date range</Label>
          <select
            id="script-quality-range"
            value={filters.dateRangePreset}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                dateRangePreset: e.target.value as DateRangePresetValue,
              }))
            }
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {DATE_RANGE_PRESET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {filters.dateRangePreset === "custom" ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="script-quality-start">Start</Label>
              <input
                id="script-quality-start"
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="script-quality-end">End</Label>
              <input
                id="script-quality-end"
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          </>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={downloadMutation.isPending || reportQuery.isLoading}
            onClick={() => handleDownload("html")}
          >
            {downloadMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download HTML
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={downloadMutation.isPending || reportQuery.isLoading}
            onClick={() => handleDownload("csv")}
          >
            {downloadMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download CSV
          </Button>
        </div>
      </div>

      {reportQuery.data?.dateRange ? (
        <p className="text-sm text-muted-foreground">Window: {reportQuery.data.dateRange.label}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Scripts"
          value={summary ? String(summary.totalScripts) : "—"}
          hint="AI Coach scripts in range"
        />
        <SummaryCard
          label="Thumbs"
          value={summary ? `${summary.thumbsUp} up / ${summary.thumbsDown} down` : "—"}
        />
        <SummaryCard
          label="Avg judge"
          value={summary?.avgJudge != null ? `${summary.avgJudge}/10` : "—"}
          hint={summary ? `${summary.withJudge} scored` : undefined}
        />
        <SummaryCard
          label="Below 7"
          value={summary ? String(summary.belowBar) : "—"}
          hint="Judge overall under 7"
        />
      </div>

      <div className="rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Judge</TableHead>
              <TableHead>Feedback</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reportQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No AI Coach scripts in this window.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap">{formatDay(item.createdAt)}</TableCell>
                  <TableCell>
                    <div className="max-w-[180px] truncate text-sm">{item.userEmail ?? "no email"}</div>
                  </TableCell>
                  <TableCell>{item.sourceLabel}</TableCell>
                  <TableCell>
                    <div className="max-w-[220px] truncate font-medium">{item.title}</div>
                    <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                      {item.hookPreview}
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.judgeOverall != null ? (
                      <span
                        className={cn(
                          "text-sm font-medium",
                          item.judgeOverall < 7 ? "text-red-600" : "text-emerald-700"
                        )}
                      >
                        {item.judgeOverall}/10
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">n/a</span>
                    )}
                    {item.judgePass != null ? (
                      <div className="text-xs text-muted-foreground">
                        {item.judgePass ? "pass" : "fail"}
                        {item.regenCount != null ? ` · regen ${item.regenCount}` : ""}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {item.feedbackRating === "up" ? (
                      <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
                        <ThumbsUp className="h-3.5 w-3.5" />
                        Up
                      </span>
                    ) : item.feedbackRating === "down" ? (
                      <span className="inline-flex items-center gap-1 text-sm text-red-600">
                        <ThumbsDown className="h-3.5 w-3.5" />
                        {item.feedbackReason ?? "Down"}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
