export type PublicWebIndexingPolicy = {
  index: boolean;
  follow: boolean;
  reason: "approved-production-host" | "preview-or-unapproved-host" | "indexing-flag-disabled";
  host: string;
};

export type PublicWebIndexingRequest = {
  host?: string | null;
  forwardedHost?: string | null;
  indexingEnabled?: boolean;
};

export function publicWebIndexingEnabled(env: NodeJS.Dict<string> = process.env): boolean {
  return env.SPYREELS_PUBLIC_WEB_INDEXING_ENABLED === "true";
}

const APPROVED_PRODUCTION_HOSTS = new Set(["spyreels.ai", "www.spyreels.ai"]);

export function normalizePublicWebHost(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0];
}

export function resolvePublicWebRequestHost(input: PublicWebIndexingRequest = {}): string {
  return normalizePublicWebHost(input.forwardedHost) || normalizePublicWebHost(input.host);
}

/**
 * Indexing requires both an approved production host and an explicit server-side
 * approval flag. A forwarded host alone must never make a preview indexable.
 * Prefer x-forwarded-host because Express sets Host to the Next service and forwards
 * the visitor host when the production app proxies this renderer.
 */
export function publicWebIndexingPolicy(
  input: PublicWebIndexingRequest = {}
): PublicWebIndexingPolicy {
  const host = resolvePublicWebRequestHost(input);
  const approvedHost = APPROVED_PRODUCTION_HOSTS.has(host);
  if (approvedHost && input.indexingEnabled === true) {
    return { index: true, follow: true, reason: "approved-production-host", host };
  }
  if (approvedHost) {
    return { index: false, follow: false, reason: "indexing-flag-disabled", host };
  }
  return { index: false, follow: false, reason: "preview-or-unapproved-host", host };
}

export function publicWebRobotsMetadata(policy: PublicWebIndexingPolicy): {
  index: boolean;
  follow: boolean;
  googleBot: { index: boolean; follow: boolean };
} {
  return {
    index: policy.index,
    follow: policy.follow,
    googleBot: {
      index: policy.index,
      follow: policy.follow,
    },
  };
}

export function publicWebRobotsTxtRules(policy: PublicWebIndexingPolicy): {
  userAgent: string;
  allow?: string[];
  disallow: string[];
} {
  if (!policy.index) {
    return { userAgent: "*", disallow: ["/"] };
  }

  return {
    userAgent: "*",
    allow: ["/features/viral-reel-finder"],
    disallow: [
      "/",
      "/health",
      "/features/viral-reel-finder/demo",
      "/features/viral-reel-finder/profile",
    ],
  };
}
