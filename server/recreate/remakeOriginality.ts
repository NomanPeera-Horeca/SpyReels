function normalizeWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

export function longestCommonWordRun(a: string, b: string): number {
  const x = normalizeWords(a);
  const y = normalizeWords(b);
  if (!x.length || !y.length) return 0;

  const previous = new Uint16Array(y.length + 1);
  let best = 0;

  for (let i = 1; i <= x.length; i++) {
    const current = new Uint16Array(y.length + 1);
    for (let j = 1; j <= y.length; j++) {
      if (x[i - 1] === y[j - 1]) {
        current[j] = previous[j - 1] + 1;
        if (current[j] > best) best = current[j];
      }
    }
    previous.set(current);
  }

  return best;
}

export function remakeCopyRisk(input: {
  source: string;
  remake: string;
  maxRunWords?: number;
}): {
  safe: boolean;
  longestRunWords: number;
  threshold: number;
} {
  const threshold = input.maxRunWords ?? 12;
  const longestRunWords = longestCommonWordRun(input.source, input.remake);
  return {
    safe: longestRunWords < threshold,
    longestRunWords,
    threshold,
  };
}
