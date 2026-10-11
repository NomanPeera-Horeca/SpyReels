/**
 * Client-side B-roll clip download via fetch to blob.
 */

export async function downloadBrollClip(
  previewUrl: string,
  filename: string
): Promise<void> {
  const url = previewUrl.trim();
  if (!url) throw new Error("No clip URL to download");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}
