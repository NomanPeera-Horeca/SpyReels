import ExcelJS from "exceljs";
import type { ReelExportRow } from "./exportTypes";
import {
  PRODUCTION_FORMAT_GUIDES,
  PRODUCTION_FORMAT_VALUES,
} from "../shared/productionFormats";

const THUMB_COL_WIDTH = 14;
const THUMB_ROW_HEIGHT = 52;
const THUMB_PX = 72;

export async function buildExcelExportBuffer(
  rows: ReelExportRow[],
  thumbnailBuffers: Map<number, Buffer>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SpyReels";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Reels", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headers = [
    "Thumbnail",
    "Reel URL",
    "Shortcode",
    "Caption",
    "Views",
    "Likes",
    "Comments",
    "Engagement Rate (%)",
    "Duration (s)",
    "Posted At",
    "Posted Day",
    "Posted Hour (UTC)",
    "Hook Text",
    "Production Format",
    "How To Film",
    "Thumbnail Text",
    "Hook Pattern",
    "Content Type",
    "Remakeability Score",
    "Suggested Action",
    "Classification Reason",
    "Niche",
    "Viral Flag",
    "Transcript",
    "Hook Analysis",
  ];

  sheet.addRow(headers);
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF33334D" },
  };
  headerRow.alignment = { vertical: "middle", wrapText: true };
  headerRow.height = 22;

  sheet.getColumn(1).width = THUMB_COL_WIDTH;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const excelRowIndex = i + 2;
    sheet.addRow([
      "",
      row.reelUrl,
      row.shortcode,
      row.caption,
      row.viewCount,
      row.likeCount,
      row.commentCount,
      row.engagementRate,
      row.duration,
      row.postedAt,
      row.postedDay,
      row.postedHourUtc,
      row.hookText,
      row.productionFormatLabel,
      row.filmingTip,
      row.thumbnailText,
      row.hookPattern,
      row.contentType,
      row.remakeabilityScore,
      row.suggestedAction,
      row.classificationReason,
      row.niche,
      row.viralFlag,
      row.transcript,
      row.hookAnalysis,
    ]);

    const dataRow = sheet.getRow(excelRowIndex);
    dataRow.height = THUMB_ROW_HEIGHT;
    dataRow.alignment = { vertical: "top", wrapText: true };

    const thumbBuf = thumbnailBuffers.get(row.reelId);
    if (thumbBuf && thumbBuf.length > 0) {
      const imageId = workbook.addImage({
        buffer: thumbBuf as unknown as ExcelJS.Buffer,
        extension: "jpeg",
      });
      sheet.addImage(imageId, {
        tl: { col: 0, row: excelRowIndex - 1 },
        ext: { width: THUMB_PX, height: THUMB_PX },
      });
    }
  }

  for (let c = 2; c <= headers.length; c++) {
    const col = sheet.getColumn(c);
    if (col.number === 15) {
      col.width = 36;
    } else if (col.number === 4 || col.number === 24) {
      col.width = 28;
    } else {
      col.width = 16;
    }
  }

  const guideSheet = workbook.addWorksheet("Format Guide");
  guideSheet.addRow(["Format", "What It Looks Like", "How To Film (Phone Tips)"]);
  const guideHeader = guideSheet.getRow(1);
  guideHeader.font = { bold: true };
  guideHeader.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8E8F0" },
  };

  for (const key of PRODUCTION_FORMAT_VALUES) {
    const g = PRODUCTION_FORMAT_GUIDES[key];
    guideSheet.addRow([g.label, g.shortDescription, g.filmingSteps]);
  }

  guideSheet.getColumn(1).width = 22;
  guideSheet.getColumn(2).width = 40;
  guideSheet.getColumn(3).width = 55;
  for (let r = 2; r <= PRODUCTION_FORMAT_VALUES.length + 1; r++) {
    guideSheet.getRow(r).alignment = { wrapText: true, vertical: "top" };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function fetchThumbnailBuffer(
  url: string
): Promise<Buffer | null> {
  const src = url.trim();
  if (!src) return null;
  try {
    const { gotScraping: gs } = await import("got-scraping");
    const res = await gs({
      url: src,
      responseType: "buffer",
      timeout: { request: 12_000 },
      retry: { limit: 1 },
    });
    if (res.statusCode !== 200 || !res.rawBody) return null;
    const raw = res.rawBody;
    return Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  } catch {
    return null;
  }
}
