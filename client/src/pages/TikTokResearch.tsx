import PlatformResearch from "@/pages/PlatformResearch";
import { tiktokResearchConfig } from "@/lib/platformResearchConfigs";

export default function TikTokResearch({
  initialJobId,
}: {
  initialJobId?: number;
}) {
  return (
    <PlatformResearch
      config={tiktokResearchConfig}
      initialJobId={initialJobId}
    />
  );
}
