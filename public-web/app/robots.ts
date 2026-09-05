import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { publicWebIndexingPolicy, publicWebRobotsTxtRules } from "../../shared/publicWebIndexing";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const headerStore = await headers();
  return {
    rules: publicWebRobotsTxtRules(
      publicWebIndexingPolicy({
        host: headerStore.get("host"),
        forwardedHost: headerStore.get("x-forwarded-host"),
      })
    ),
  };
}
