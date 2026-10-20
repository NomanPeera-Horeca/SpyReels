/**
 * A failed optional read must not hide saved onboarding answers.
 * Analysis, topic rows and similar extras use this. Profile, answers and
 * progress do not: those are required to restore the step.
 */
export async function readOptional<T>(
  label: string,
  read: () => Promise<T>,
  fallback: T,
  warn: (message: string) => void = console.warn
): Promise<T> {
  try {
    return await read();
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error";
    warn(`[onboarding] ${label} unavailable (${name})`);
    return fallback;
  }
}
