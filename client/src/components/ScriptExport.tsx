import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Download, FileText, FileType, File, Loader2, ChevronDown, ExternalLink, Lock } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useFeatureLock } from "@/components/UpgradeSidesheet";

interface ScriptExportProps {
  title: string;
  content: string;
  sourceHandle?: string | null;
  gradeLevel?: string | null;
  postDate?: string | Date | null;
  wordCount?: number;
  notes?: string | null;
}

/**
 * Export a script to various formats (TXT, DOCX, PDF, Google Docs).
 */
export function ScriptExport({
  title,
  content,
  sourceHandle,
  gradeLevel,
  postDate,
  wordCount,
  notes,
}: ScriptExportProps) {
  const [exporting, setExporting] = useState<string | null>(null);
  const pdfLock = useFeatureLock("pdfExport");
  const docsLock = useFeatureLock("googleDocs");

  // Check if Google Docs is configured
  const { data: docsConfig } = trpc.googleDocs.isConfigured.useQuery();

  // Google Docs export mutation
  const exportToGoogleDocs = trpc.googleDocs.exportScript.useMutation({
    onSuccess: (data) => {
      toast.success("Exported to Google Docs!", {
        description: "Opening document in a new tab...",
        action: {
          label: "Open",
          onClick: () => window.open(data.documentUrl, "_blank"),
        },
        duration: 8000,
      });
      window.open(data.documentUrl, "_blank");
    },
    onError: (err) => {
      toast.error("Failed to export to Google Docs", {
        description: err.message,
      });
    },
    onSettled: () => {
      setExporting(null);
    },
  });

  const sanitizeFilename = (name: string) => {
    return name.replace(/[^a-zA-Z0-9\s-_]/g, "").replace(/\s+/g, "_").slice(0, 100) || "script";
  };

  const filename = sanitizeFilename(title);

  // ── Export as TXT ──
  const exportTxt = () => {
    setExporting("txt");
    try {
      let txt = `${title}\n${"=".repeat(title.length)}\n\n`;

      if (sourceHandle) txt += `Source: @${sourceHandle}\n`;
      if (gradeLevel) txt += `Grade Level: ${gradeLevel}\n`;
      if (postDate) txt += `Post Date: ${new Date(postDate).toLocaleDateString("en-US", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}\n`;
      if (wordCount) txt += `Word Count: ${wordCount}\n`;
      if (sourceHandle || gradeLevel || postDate || wordCount) txt += "\n---\n\n";

      txt += content;

      if (notes) {
        txt += `\n\n---\nNotes:\n${notes}`;
      }

      const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
      downloadBlob(blob, `${filename}.txt`);
      toast.success("Exported as TXT");
    } catch (err) {
      toast.error("Failed to export as TXT");
    } finally {
      setExporting(null);
    }
  };

  // ── Export as DOCX ──
  const exportDocx = async () => {
    setExporting("docx");
    try {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = await import("docx");

      const children: any[] = [];

      // Title
      children.push(
        new Paragraph({
          text: title,
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 },
        })
      );

      // Metadata
      const metaParts: string[] = [];
      if (sourceHandle) metaParts.push(`Source: @${sourceHandle}`);
      if (gradeLevel) metaParts.push(`Grade Level: ${gradeLevel}`);
      if (postDate) metaParts.push(`Post Date: ${new Date(postDate).toLocaleDateString("en-US", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}`);
      if (wordCount) metaParts.push(`Word Count: ${wordCount}`);

      if (metaParts.length > 0) {
        children.push(
          new Paragraph({
            children: metaParts.map(
              (part, i) =>
                new TextRun({
                  text: i < metaParts.length - 1 ? `${part}  |  ` : part,
                  size: 20,
                  color: "888888",
                  italics: true,
                })
            ),
            spacing: { after: 200 },
          })
        );

        // Separator
        children.push(
          new Paragraph({
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
            },
            spacing: { after: 300 },
          })
        );
      }

      // Script content - split by paragraphs
      const paragraphs = content.split(/\n\n+/);
      for (const para of paragraphs) {
        const lines = para.split("\n");
        const runs: any[] = [];
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) runs.push(new TextRun({ break: 1 }));
          runs.push(
            new TextRun({
              text: lines[i],
              size: 24,
            })
          );
        }
        children.push(
          new Paragraph({
            children: runs,
            spacing: { after: 200 },
            alignment: AlignmentType.LEFT,
          })
        );
      }

      // Notes
      if (notes) {
        children.push(
          new Paragraph({
            border: {
              top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
            },
            spacing: { before: 400, after: 200 },
          })
        );
        children.push(
          new Paragraph({
            text: "Notes",
            heading: HeadingLevel.HEADING_2,
            spacing: { after: 100 },
          })
        );
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: notes,
                size: 22,
                color: "666666",
                italics: true,
              }),
            ],
          })
        );
      }

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 1440,
                  right: 1440,
                  bottom: 1440,
                  left: 1440,
                },
              },
            },
            children,
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      downloadBlob(blob, `${filename}.docx`);
      toast.success("Exported as DOCX");
    } catch (err) {
      console.error("DOCX export error:", err);
      toast.error("Failed to export as DOCX");
    } finally {
      setExporting(null);
    }
  };

  // ── Export as PDF (using print-friendly HTML) ──
  const exportPdf = () => {
    setExporting("pdf");
    try {
      // Create a print-friendly HTML document and use the browser's print to PDF
      const metaParts: string[] = [];
      if (sourceHandle) metaParts.push(`Source: @${sourceHandle}`);
      if (gradeLevel) metaParts.push(`Grade Level: ${gradeLevel}`);
      if (postDate) metaParts.push(`Post Date: ${new Date(postDate).toLocaleDateString("en-US", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}`);
      if (wordCount) metaParts.push(`Word Count: ${wordCount}`);

      const escapedContent = content
        .split(/\n\n+/)
        .map((p) => `<p style="margin-bottom:12px;line-height:1.6;">${p.replace(/\n/g, "<br>")}</p>`)
        .join("");

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #222; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .meta { color: #888; font-size: 13px; font-style: italic; margin-bottom: 16px; }
    hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
    .content { font-size: 16px; }
    .notes { margin-top: 24px; padding-top: 16px; border-top: 1px solid #ddd; }
    .notes h2 { font-size: 18px; margin-bottom: 8px; }
    .notes p { color: #666; font-style: italic; font-size: 14px; }
    @media print { body { margin: 0; padding: 20px; } }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${metaParts.length > 0 ? `<div class="meta">${metaParts.join(" | ")}</div><hr>` : ""}
  <div class="content">${escapedContent}</div>
  ${notes ? `<div class="notes"><h2>Notes</h2><p>${notes.replace(/\n/g, "<br>")}</p></div>` : ""}
</body>
</html>`;

      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        // Give a moment for content to render
        setTimeout(() => {
          printWindow.print();
        }, 500);
        toast.success("PDF print dialog opened - save as PDF");
      } else {
        toast.error("Pop-up blocked. Please allow pop-ups for this site.");
      }
    } catch (err) {
      toast.error("Failed to generate PDF");
    } finally {
      setExporting(null);
    }
  };

  // ── Export to Google Docs ──
  const exportGoogleDocs = () => {
    setExporting("gdocs");
    exportToGoogleDocs.mutate({
      title,
      content,
      sourceHandle: sourceHandle ?? null,
      gradeLevel: gradeLevel ?? null,
      postDate: postDate ? (typeof postDate === "string" ? postDate : postDate.toISOString()) : null,
      wordCount: wordCount ?? null,
      notes: notes ?? null,
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          {exporting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          Export
          <ChevronDown className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs">Download As</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={exportTxt} disabled={!!exporting}>
          <FileText className="w-3.5 h-3.5 mr-2" />
          Plain Text (.txt)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            if (pdfLock.locked) {
              e.preventDefault();
              pdfLock.requireUpgrade();
              return;
            }
            exportDocx();
          }}
          disabled={!!exporting}
        >
          <FileType className="w-3.5 h-3.5 mr-2" />
          Word Document (.docx)
          {pdfLock.locked ? (
            <Lock className="ml-auto h-3 w-3 text-primary" />
          ) : null}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            if (pdfLock.locked) {
              e.preventDefault();
              pdfLock.requireUpgrade();
              return;
            }
            exportPdf();
          }}
          disabled={!!exporting}
        >
          <File className="w-3.5 h-3.5 mr-2" />
          PDF (via Print)
          {pdfLock.locked ? (
            <Lock className="ml-auto h-3 w-3 text-primary" />
          ) : null}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">Cloud Export</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={(e) => {
            if (docsLock.locked) {
              e.preventDefault();
              docsLock.requireUpgrade();
              return;
            }
            exportGoogleDocs();
          }}
          disabled={!!exporting || !docsConfig?.configured}
        >
          <svg className="w-3.5 h-3.5 mr-2" viewBox="0 0 24 24" fill="none">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M8 13h8M8 17h8M8 9h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Google Docs
          {docsLock.locked ? (
            <Lock className="ml-auto h-3 w-3 text-primary" />
          ) : (
            <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
          )}
        </DropdownMenuItem>

        {!docsConfig?.configured && (
          <div className="px-2 py-1.5">
            <p className="text-[10px] text-muted-foreground leading-tight">
              Google Docs requires service account credentials.
              Add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in Settings.
            </p>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Helper ──
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
