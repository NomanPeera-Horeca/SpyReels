let activeTranscriptions = 0;

export const MAX_CONCURRENT_TRANSCRIPTIONS = 3;

export function getActiveTranscriptions(): number {
  return activeTranscriptions;
}

export async function acquireTranscriptionSlot(): Promise<void> {
  while (activeTranscriptions >= MAX_CONCURRENT_TRANSCRIPTIONS) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  activeTranscriptions++;
}

export function releaseTranscriptionSlot(): void {
  activeTranscriptions--;
}
