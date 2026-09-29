import PlatformResearch from "@/pages/PlatformResearch";
import { tiktokResearchConfig } from "@/lib/platformResearchConfigs";

export default function TikTokResearch({
  initialJobId,
  initialHandle,
}: {
  initialJobId?: number;
  initialHandle?: string;
}) {
  return (
    <PlatformResearch
      config={tiktokResearchConfig}
      initialJobId={initialJobId}
      initialHandle={initialHandle}
    />
  );
}
