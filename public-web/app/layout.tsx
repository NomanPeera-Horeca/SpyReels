import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import {
  publicWebIndexingEnabled,
  publicWebIndexingPolicy,
  publicWebRobotsMetadata,
} from "../../shared/publicWebIndexing";
import PublicAnalytics from "./PublicAnalytics";
import "./globals.css";

// CSS uses 400, 500, 560, 600, 650, 700, 750, 800, 850, 900.
// Variable Inter (wght 100-900) so non-standard weights render as true axes,
// not nearest static-face fallback.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  weight: "variable",
});

export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers();
  return {
    title: "SpyReels Public Web Architecture",
    description: "Isolated Next.js rendering foundation for SpyReels public acquisition pages.",
    robots: publicWebRobotsMetadata(
      publicWebIndexingPolicy({
        host: headerStore.get("host"),
        forwardedHost: headerStore.get("x-forwarded-host"),
        indexingEnabled: publicWebIndexingEnabled(),
      })
    ),
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <PublicAnalytics />
        {children}
      </body>
    </html>
  );
}
