import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  publicWebIndexingPolicy,
  publicWebRobotsMetadata,
} from "../../shared/publicWebIndexing";
import PublicAnalytics from "./PublicAnalytics";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers();
  return {
    title: "SpyReels Public Web Architecture",
    description: "Isolated Next.js rendering foundation for SpyReels public acquisition pages.",
    robots: publicWebRobotsMetadata(
      publicWebIndexingPolicy({
        host: headerStore.get("host"),
        forwardedHost: headerStore.get("x-forwarded-host"),
      })
    ),
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PublicAnalytics />
        {children}
      </body>
    </html>
  );
}
