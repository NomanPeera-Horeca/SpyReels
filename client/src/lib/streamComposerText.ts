const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function streamComposerText(
  fullText: string,
  onUpdate: (value: string) => void,
  options?: { signal?: AbortSignal }
): Promise<void> {
  let value = "";
  for (let i = 0; i < fullText.length; i++) {
    if (options?.signal?.aborted) return;
    value += fullText[i];
    onUpdate(value);
    const ch = fullText[i];
    const delay =
      ch === "\n" ? 22 : ch === " " ? 10 : 14 + Math.floor(Math.random() * 18);
    await sleep(delay);
  }
}
