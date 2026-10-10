import type { Metadata } from "next";
import { FinderMarketingPage } from "../../../components/FinderMarketingPage";
import { youtubeFinderConfig } from "../../../lib/finderConfigs/youtube";
import "../../homepage.css";

export const metadata: Metadata = youtubeFinderConfig.metadata;

export default function YouTubeShortsViralFinderPage() {
  return <FinderMarketingPage config={youtubeFinderConfig} />;
}
