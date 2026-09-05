import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  // This runtime is intentionally isolated during the architecture pilot.
  // Production robots.txt remains owned by the existing Express server.
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
