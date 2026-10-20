import { useEffect, useState } from "react";
import { RECOVERY_BOUND_MS } from "./classifyServerQuery";

/**
 * Turns a read that is still pending into a timeout once the bound passes.
 * `resetKey` restarts the bound when the user retries. This does not start a job.
 */
export function useRecoveryBound(
  pending: boolean,
  resetKey = 0,
  boundMs = RECOVERY_BOUND_MS
): boolean {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!pending) {
      setTimedOut(false);
      return;
    }
    setTimedOut(false);
    const timer = window.setTimeout(() => setTimedOut(true), boundMs);
    return () => window.clearTimeout(timer);
  }, [boundMs, pending, resetKey]);

  return pending && timedOut;
}
