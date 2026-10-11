import {
  isPublicWebAppHostSplit,
  resolvePublicAppOrigin,
} from "./appOrigin";

type TrpcEnvelope<T> = {
  result?: { data?: { json?: T } };
  error?: { message?: string; json?: { message?: string } };
};

function parseEnvelope<T>(envelope: TrpcEnvelope<T>): T {
  if (envelope.error?.message) {
    throw new Error(envelope.error.message);
  }
  const nested = envelope.error?.json?.message;
  if (nested) {
    throw new Error(nested);
  }
  const data = envelope.result?.data?.json;
  if (data === undefined) {
    throw new Error("Unexpected empty response from server.");
  }
  return data;
}

/**
 * Product API origin for browser tRPC.
 * Host split on → app.spyreels.ai (credentialed CORS).
 * Split off or already on app → same-origin relative.
 */
export function resolveBrowserTrpcOrigin(): string {
  if (typeof window === "undefined") return "";
  if (!isPublicWebAppHostSplit()) return "";
  const api = resolvePublicAppOrigin({
    hostname: window.location.hostname,
  }).replace(/\/$/, "");
  const here = window.location.origin.replace(/\/$/, "");
  return api === here ? "" : api;
}

function trpcUrl(procedure: string, query = ""): string {
  const origin = resolveBrowserTrpcOrigin();
  return `${origin}/api/trpc/${procedure}${query}`;
}

/** Browser tRPC query (GET) for public-web marketing tools. */
export async function trpcQuery<T>(
  procedure: string,
  input?: unknown,
  init?: RequestInit
): Promise<T> {
  const query =
    input === undefined
      ? ""
      : `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const response = await fetch(trpcUrl(procedure, query), {
    credentials: "include",
    headers: { accept: "application/json" },
    ...init,
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Request failed. Please try again.");
  }
  const envelope = (await response.json()) as TrpcEnvelope<T>;
  if (!response.ok) {
    throw new Error(
      envelope.error?.message ||
        envelope.error?.json?.message ||
        "Request failed. Please try again."
    );
  }
  return parseEnvelope(envelope);
}

/** Browser tRPC mutation (POST) for public-web marketing tools. */
export async function trpcMutate<T>(
  procedure: string,
  input?: unknown,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(trpcUrl(procedure), {
    method: "POST",
    credentials: "include",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ json: input ?? null }),
    ...init,
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Request failed. Please try again.");
  }
  const envelope = (await response.json()) as TrpcEnvelope<T>;
  if (!response.ok) {
    throw new Error(
      envelope.error?.message ||
        envelope.error?.json?.message ||
        "Request failed. Please try again."
    );
  }
  return parseEnvelope(envelope);
}
