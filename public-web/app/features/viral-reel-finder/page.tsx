import type { Metadata } from "next";
import { FinderMarketingPage } from "../../../components/FinderMarketingPage";
import { instagramFinderConfig } from "../../../lib/finderConfigs/instagram";
import "../../homepage.css";

export const metadata: Metadata = instagramFinderConfig.metadata;

export default function ViralReelFinderPilotPage() {
  return <FinderMarketingPage config={instagramFinderConfig} />;
}
