import { trpc } from "@/lib/trpc";
import { useEffect, useRef } from "react";

const HEARTBEAT_INTERVAL_MS = 60_000;
const HEARTBEAT_SECONDS = 60;

/** Reports foreground usage time for admin analytics (owner dashboard). */
export function useActivityHeartbeat(enabled: boolean) {
  const heartbeat = trpc.activity.recordHeartbeat.useMutation();
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const send = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastSentRef.current < HEARTBEAT_INTERVAL_MS - 5000) return;
      lastSentRef.current = now;
      heartbeat.mutate({ seconds: HEARTBEAT_SECONDS });
    };

    const id = window.setInterval(send, HEARTBEAT_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") send();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
}
