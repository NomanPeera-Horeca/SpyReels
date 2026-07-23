import PlatformResearch from "@/pages/PlatformResearch";
import { youtubeResearchConfig } from "@/lib/platformResearchConfigs";

export default function YouTubeResearch({
  initialJobId,
}: {
  initialJobId?: number;
}) {
  return (
    <PlatformResearch
      config={youtubeResearchConfig}
      initialJobId={initialJobId}
    />
  );
}
