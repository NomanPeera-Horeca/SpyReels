/**
 * One in-flight playback resolution per player.
 * A timeout, close, switch, or newer attempt invalidates the earlier request
 * so a late provider response cannot start playback or clear a failure.
 */

export const PLAYBACK_REFRESH_TIMEOUT_MS = 20_000;

export type PlaybackAttemptStatus<T> =
  | { status: "ready"; value: T; generation: number }
  | { status: "failed"; reason: "timeout" | "unavailable"; generation: number }
  | { status: "stale"; generation: number };

type Inflight = {
  controller: AbortController;
  timer: ReturnType<typeof setTimeout> | null;
  settled: boolean;
};

export class PlaybackSession {
  private generationValue = 0;
  private inflight: Inflight | null = null;

  get generation(): number {
    return this.generationValue;
  }

  /** Abort the current attempt. Its result must not be applied. */
  cancel(): void {
    this.generationValue += 1;
    const current = this.inflight;
    this.inflight = null;
    if (!current) return;
    current.settled = true;
    if (current.timer != null) clearTimeout(current.timer);
    current.timer = null;
    current.controller.abort();
  }

  /**
   * Run `load`. Only a "ready" or "failed" result whose generation still
   * matches `session.generation` may update the player.
   * Timeout aborts `load` without advancing the generation, so the failure
   * stays current and a late resolution is not "ready".
   */
  async run<T>(
    load: (signal: AbortSignal) => Promise<T | null>,
    timeoutMs = PLAYBACK_REFRESH_TIMEOUT_MS
  ): Promise<PlaybackAttemptStatus<T>> {
    this.cancel();
    const generation = this.generationValue;
    const attempt: Inflight = {
      controller: new AbortController(),
      timer: null,
      settled: false,
    };
    this.inflight = attempt;
    const signal = attempt.controller.signal;

    const timeout = new Promise<"timeout">((resolve) => {
      attempt.timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    const aborted = new Promise<"aborted">((resolve) => {
      if (signal.aborted) {
        resolve("aborted");
        return;
      }
      signal.addEventListener("abort", () => resolve("aborted"), { once: true });
    });
    // Start the request before yielding so cancel/timeout can abort a live subscription.
    const loaded = new Promise<{ kind: "load"; value: T | null }>((resolve) => {
      try {
        Promise.resolve(load(signal)).then(
          (value) => resolve({ kind: "load", value }),
          () => resolve({ kind: "load", value: null })
        );
      } catch {
        resolve({ kind: "load", value: null });
      }
    });

    const winner = await Promise.race([loaded, timeout, aborted]);
    if (attempt.timer != null) clearTimeout(attempt.timer);
    attempt.timer = null;

    if (attempt.settled || this.generationValue !== generation || this.inflight !== attempt) {
      return { status: "stale", generation };
    }
    attempt.settled = true;
    this.inflight = null;

    if (winner === "aborted" || signal.aborted) {
      return { status: "stale", generation };
    }
    if (winner === "timeout") {
      attempt.controller.abort();
      return { status: "failed", reason: "timeout", generation };
    }
    if (winner.value == null) {
      return { status: "failed", reason: "unavailable", generation };
    }
    return { status: "ready", value: winner.value, generation };
  }
}

/** True when this result is still the attempt the player should show. */
export function playbackResultIsCurrent<T>(
  sessionGeneration: number,
  result: PlaybackAttemptStatus<T>
): boolean {
  return result.status !== "stale" && result.generation === sessionGeneration;
}
