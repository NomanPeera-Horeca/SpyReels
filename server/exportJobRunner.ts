import {
  countReelsForJob,
  getExportJobById,
  updateExportJob,
} from "./db";
import { buildExcelExportBuffer, fetchThumbnailBuffer } from "./exportExcel";
import { buildExportRows, prepareReelsForExport } from "./exportPipeline";
import { refreshViralFlagsForScrapeJob } from "./reelViralFlag";
import { ensureReelThumbnailOnR2 } from "./reelThumbnailR2";
import { storagePut } from "./storage";
import type { ExportScope } from "../shared/exportScope";

export const EXPORT_FILE_TTL_DAYS = 7;

export function exportFileR2Key(
  workspaceId: string,
  scrapeJobId: number,
  exportJobId: number
): string {
  return `exports/${workspaceId}/${scrapeJobId}/${exportJobId}.xlsx`;
}

export async function runExportJob(
  exportJobId: number,
  userId: number,
  openId: string,
  scrapeJobId: number,
  workspaceId: string
): Promise<void> {
  const exportJobRow = await getExportJobById(exportJobId);
  const scope: ExportScope = exportJobRow?.exportScope ?? "all";

  const report = async (
    update: Parameters<typeof updateExportJob>[1]
  ): Promise<void> => {
    await updateExportJob(exportJobId, update);
  };

  try {
    await report({
      status: "processing",
      currentStep: "transcribing",
      progressPercent: 0,
      progressLabel: "Starting export…",
    });

    await prepareReelsForExport(scrapeJobId, userId, openId, scope, async (p) => {
      await report({
        currentStep: p.currentStep,
        progressPercent: p.progressPercent,
        stepDone: p.stepDone ?? 0,
        stepTotal: p.stepTotal ?? 0,
        progressLabel: p.progressLabel ?? null,
      });
    });

    await report({
      currentStep: "analyzing",
      progressPercent: 86,
      progressLabel: "Scoring viral outliers…",
    });
    await refreshViralFlagsForScrapeJob(scrapeJobId);

    await report({
      currentStep: "building_excel",
      progressPercent: 88,
      progressLabel: "Building Excel file…",
    });

    const { rows, job } = await buildExportRows(scrapeJobId, scope);
    const thumbnailBuffers = new Map<number, Buffer>();

    let thumbIndex = 0;
    const thumbTotal = rows.length;
    for (const row of rows) {
      let url = row.thumbnailUrl;
      if (url) {
        url = await ensureReelThumbnailOnR2(row.shortcode, url);
      }
      const buf = url ? await fetchThumbnailBuffer(url) : null;
      if (buf) thumbnailBuffers.set(row.reelId, buf);
      thumbIndex++;
      if (thumbTotal > 0 && thumbIndex % 5 === 0) {
        const buildPct = 88 + Math.floor((thumbIndex / thumbTotal) * 7);
        await report({
          currentStep: "building_excel",
          progressPercent: Math.min(95, buildPct),
          progressLabel: `Building Excel (${thumbIndex}/${thumbTotal})…`,
        });
      }
    }

    await report({
      currentStep: "building_excel",
      progressPercent: 95,
      progressLabel: "Saving file…",
    });

    const xlsxBuffer = await buildExcelExportBuffer(rows, thumbnailBuffers);
    const scopeTag = scope === "top_viral_30" ? "_top30" : "";
    const filename = `reels_${job?.handle || "export"}${scopeTag}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const r2Key = exportFileR2Key(workspaceId, scrapeJobId, exportJobId);

    await storagePut(
      r2Key,
      xlsxBuffer,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    const reelCountAtExport = await countReelsForJob(scrapeJobId);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + EXPORT_FILE_TTL_DAYS);

    await report({
      status: "completed",
      currentStep: "complete",
      progressPercent: 100,
      progressLabel: "Ready to download",
      fileR2Key: r2Key,
      filename,
      fileSizeBytes: xlsxBuffer.length,
      reelCountAtExport,
      expiresAt,
      completedAt: new Date(),
      errorMessage: null,
    });

    console.log(
      `[runExportJob ${exportJobId}] completed scrapeJobId=${scrapeJobId} reels=${reelCountAtExport} bytes=${xlsxBuffer.length}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    console.error(`[runExportJob ${exportJobId}] failed:`, message);
    await updateExportJob(exportJobId, {
      status: "failed",
      currentStep: "failed",
      progressLabel: "Export failed",
      errorMessage: message.slice(0, 500),
    });
  }
}

export async function getExportJobIfAccessible(
  exportJobId: number,
  workspaceId: string
) {
  const row = await getExportJobById(exportJobId);
  if (!row) return null;
  if (row.workspaceId !== workspaceId) return null;
  return row;
}
