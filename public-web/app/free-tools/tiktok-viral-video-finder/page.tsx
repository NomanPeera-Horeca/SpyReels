import type { Metadata } from "next";
import { FinderMarketingPage } from "../../../components/FinderMarketingPage";
import { tiktokFinderConfig } from "../../../lib/finderConfigs/tiktok";
import "../../homepage.css";

export const metadata: Metadata = tiktokFinderConfig.metadata;

export default function TikTokViralVideoFinderPage() {
  return <FinderMarketingPage config={tiktokFinderConfig} />;
}
