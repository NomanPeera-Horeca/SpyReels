/**
 * Google Sheets export module.
 * Uses a service account to create and populate a Google Sheet with reels data.
 * Falls back to CSV download if Google credentials are not configured.
 */
import { google } from "googleapis";
import type { ReelExportRow } from "./exportTypes";

/**
 * Check if Google Sheets credentials are configured.
 */
export function isGoogleSheetsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY
  );
}

/**
 * Create a new Google Sheet and populate it with reels data.
 * Returns the URL of the created spreadsheet.
 */
export async function exportToGoogleSheets(
  title: string,
  rows: ReelExportRow[],
  shareWithEmail?: string
): Promise<{ spreadsheetUrl: string; spreadsheetId: string }> {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!serviceAccountEmail || !privateKey) {
    throw new Error(
      "Google Sheets credentials not configured. Please add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY."
    );
  }

  const auth = new google.auth.JWT({
    email: serviceAccountEmail,
    key: privateKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [
        {
          properties: {
            title: "Reels Data",
            gridProperties: { frozenRowCount: 1 },
          },
        },
      ],
    },
  });

  const spreadsheetId = spreadsheet.data.spreadsheetId!;
  const spreadsheetUrl = spreadsheet.data.spreadsheetUrl!;

  const headers = [
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

  const dataRows = rows.map((r) => [
    r.reelUrl,
    r.shortcode,
    r.caption,
    r.viewCount,
    r.likeCount,
    r.commentCount,
    r.engagementRate,
    r.duration,
    r.postedAt,
    r.postedDay,
    r.postedHourUtc,
    r.hookText,
    r.productionFormatLabel,
    r.filmingTip,
    r.thumbnailText,
    r.hookPattern,
    r.contentType,
    r.remakeabilityScore,
    r.suggestedAction,
    r.classificationReason,
    r.niche,
    r.viralFlag,
    r.transcript,
    r.hookAnalysis,
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Reels Data!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers, ...dataRows] },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.2, green: 0.2, blue: 0.3 },
                textFormat: {
                  bold: true,
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                },
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat)",
          },
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId: 0,
              dimension: "COLUMNS",
              startIndex: 0,
              endIndex: headers.length,
            },
          },
        },
      ],
    },
  });

  if (shareWithEmail) {
    try {
      await drive.permissions.create({
        fileId: spreadsheetId,
        requestBody: {
          type: "user",
          role: "writer",
          emailAddress: shareWithEmail,
        },
        sendNotificationEmail: false,
      });
    } catch {
      await drive.permissions.create({
        fileId: spreadsheetId,
        requestBody: { type: "anyone", role: "writer" },
      });
    }
  } else {
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: { type: "anyone", role: "writer" },
    });
  }

  return { spreadsheetUrl, spreadsheetId };
}
