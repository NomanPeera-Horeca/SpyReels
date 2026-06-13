const STORAGE_KEY = "spyreels_active_export_jobs";

export type TrackedExportJob = {
  exportJobId: number;
  scrapeJobId: number;
  handle: string;
  autoDownloaded?: boolean;
};

export function readTrackedExportJobs(): TrackedExportJob[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TrackedExportJob[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeTrackedExportJobs(jobs: TrackedExportJob[]): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

export function trackExportJob(job: TrackedExportJob): void {
  const existing = readTrackedExportJobs().filter(
    (j) => j.exportJobId !== job.exportJobId
  );
  writeTrackedExportJobs([...existing, job]);
}

export function untrackExportJob(exportJobId: number): void {
  writeTrackedExportJobs(
    readTrackedExportJobs().filter((j) => j.exportJobId !== exportJobId)
  );
}

export function markExportAutoDownloaded(exportJobId: number): void {
  writeTrackedExportJobs(
    readTrackedExportJobs().map((j) =>
      j.exportJobId === exportJobId ? { ...j, autoDownloaded: true } : j
    )
  );
}

export function downloadExportFile(data: {
  fileBase64: string;
  filename: string;
  mimeType: string;
}): void {
  const binary = atob(data.fileBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: data.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = data.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
