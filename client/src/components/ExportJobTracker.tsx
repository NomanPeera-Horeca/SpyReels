import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  downloadExportFile,
  markExportAutoDownloaded,
  readTrackedExportJobs,
  untrackExportJob,
} from "@/lib/exportJobs";

/**
 * Polls background Excel exports started on any dashboard page.
 * Shows completion toasts and auto-downloads when the tab is visible.
 */
export default function ExportJobTracker() {
  const utils = trpc.useUtils();
  const downloadExport = trpc.export.download.useMutation();
  const pollingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (pollingRef.current) return;
      const tracked = readTrackedExportJobs();
      if (tracked.length === 0) return;

      pollingRef.current = true;
      try {
        for (const job of tracked) {
          if (cancelled) return;
          try {
            const status = await utils.export.status.fetch({
              exportJobId: job.exportJobId,
            });

            if (status.status === "failed") {
              untrackExportJob(job.exportJobId);
              toast.error("Export failed", {
                description: status.errorMessage ?? "Please try again.",
              });
              continue;
            }

            if (status.status !== "completed") continue;

            untrackExportJob(job.exportJobId);
            void utils.export.latestForScrapeJob.invalidate({
              jobId: job.scrapeJobId,
            });

            const doDownload = async () => {
              const file = await downloadExport.mutateAsync({
                exportJobId: job.exportJobId,
              });
              downloadExportFile(file);
            };

            toast.success(`Export ready for @${job.handle}`, {
              description: status.filename ?? "Excel file is ready.",
              duration: 15000,
              action: {
                label: "Download",
                onClick: () => {
                  void doDownload();
                },
              },
            });

            if (!job.autoDownloaded && document.visibilityState === "visible") {
              markExportAutoDownloaded(job.exportJobId);
              void doDownload();
            }
          } catch {
            // Keep polling on transient errors
          }
        }
      } finally {
        pollingRef.current = false;
      }
    };

    void poll();
    const id = window.setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [utils, downloadExport]);

  return null;
}
