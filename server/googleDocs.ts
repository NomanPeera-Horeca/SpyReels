/**
 * Google Docs export module.
 * Uses a service account to create a Google Doc with formatted script content.
 * Reuses the same GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY credentials
 * as the Google Sheets integration.
 */
import { google } from "googleapis";

interface ScriptExportData {
  title: string;
  content: string;
  sourceHandle?: string | null;
  gradeLevel?: string | null;
  postDate?: string | null;
  wordCount?: number | null;
  notes?: string | null;
}

/**
 * Check if Google Docs credentials are configured.
 */
export function isGoogleDocsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY
  );
}

/**
 * Create a new Google Doc with formatted script content.
 * Returns the URL of the created document.
 */
export async function exportToGoogleDocs(
  data: ScriptExportData,
  shareWithEmail?: string
): Promise<{ documentUrl: string; documentId: string }> {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!serviceAccountEmail || !privateKey) {
    throw new Error(
      "Google credentials not configured. Please add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in Settings > Secrets."
    );
  }

  // Authenticate with service account
  const auth = new google.auth.JWT({
    email: serviceAccountEmail,
    key: privateKey.replace(/\\n/g, "\n"),
    scopes: [
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive",
    ],
  });

  const docs = google.docs({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  // Create a new blank document
  const document = await docs.documents.create({
    requestBody: {
      title: data.title,
    },
  });

  const documentId = document.data.documentId!;
  const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;

  // Build the content to insert
  // We insert text in reverse order (from bottom to top) because each insert
  // shifts indices. Inserting at index 1 each time in reverse order is simpler.
  const requests: any[] = [];

  // We'll build the full text first, then apply formatting
  let fullText = "";
  const formatRanges: Array<{
    start: number;
    end: number;
    bold?: boolean;
    italic?: boolean;
    fontSize?: number;
    color?: { red: number; green: number; blue: number };
  }> = [];

  // Title
  const titleText = `${data.title}\n\n`;
  formatRanges.push({
    start: 1,
    end: 1 + data.title.length,
    bold: true,
    fontSize: 20,
  });
  fullText += titleText;

  // Metadata line
  const metaParts: string[] = [];
  if (data.sourceHandle) metaParts.push(`Source: @${data.sourceHandle}`);
  if (data.gradeLevel) metaParts.push(`Grade Level: ${data.gradeLevel}`);
  if (data.postDate) {
    const dateStr = new Date(data.postDate).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    metaParts.push(`Post Date: ${dateStr}`);
  }
  if (data.wordCount) metaParts.push(`Word Count: ${data.wordCount}`);

  if (metaParts.length > 0) {
    const metaLine = metaParts.join("  |  ") + "\n";
    const metaStart = 1 + fullText.length;
    formatRanges.push({
      start: metaStart,
      end: metaStart + metaLine.length - 1,
      italic: true,
      fontSize: 10,
      color: { red: 0.5, green: 0.5, blue: 0.5 },
    });
    fullText += metaLine;

    // Separator
    fullText += "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  }

  // Script content
  const contentStart = 1 + fullText.length;
  fullText += data.content;
  formatRanges.push({
    start: contentStart,
    end: contentStart + data.content.length,
    fontSize: 12,
  });

  // Notes section
  if (data.notes) {
    fullText += "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

    const notesHeaderStart = 1 + fullText.length;
    const notesHeader = "Notes\n";
    formatRanges.push({
      start: notesHeaderStart,
      end: notesHeaderStart + notesHeader.length - 1,
      bold: true,
      fontSize: 14,
    });
    fullText += notesHeader;

    const notesStart = 1 + fullText.length;
    fullText += data.notes;
    formatRanges.push({
      start: notesStart,
      end: notesStart + data.notes.length,
      italic: true,
      fontSize: 11,
      color: { red: 0.4, green: 0.4, blue: 0.4 },
    });
  }

  fullText += "\n";

  // Insert all text at once
  requests.push({
    insertText: {
      location: { index: 1 },
      text: fullText,
    },
  });

  // Apply formatting
  for (const range of formatRanges) {
    const textStyle: any = {};
    if (range.bold !== undefined) textStyle.bold = range.bold;
    if (range.italic !== undefined) textStyle.italic = range.italic;
    if (range.fontSize !== undefined) {
      textStyle.fontSize = { magnitude: range.fontSize, unit: "PT" };
    }
    if (range.color) {
      textStyle.foregroundColor = { color: { rgbColor: range.color } };
    }

    const fields: string[] = [];
    if (range.bold !== undefined) fields.push("bold");
    if (range.italic !== undefined) fields.push("italic");
    if (range.fontSize !== undefined) fields.push("fontSize");
    if (range.color) fields.push("foregroundColor");

    requests.push({
      updateTextStyle: {
        range: {
          startIndex: range.start,
          endIndex: range.end,
        },
        textStyle,
        fields: fields.join(","),
      },
    });
  }

  // Apply all requests in a batch
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests,
    },
  });

  // Share the document
  if (shareWithEmail) {
    try {
      await drive.permissions.create({
        fileId: documentId,
        requestBody: {
          type: "user",
          role: "writer",
          emailAddress: shareWithEmail,
        },
        sendNotificationEmail: false,
      });
    } catch {
      // Fallback: make accessible via link
      await drive.permissions.create({
        fileId: documentId,
        requestBody: {
          type: "anyone",
          role: "writer",
        },
      });
    }
  } else {
    // Make accessible via link so anyone with the link can edit
    await drive.permissions.create({
      fileId: documentId,
      requestBody: {
        type: "anyone",
        role: "writer",
      },
    });
  }

  return { documentUrl, documentId };
}
