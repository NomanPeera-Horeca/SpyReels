import PlatformResearch from "@/pages/PlatformResearch";
import { youtubeResearchConfig } from "@/lib/platformResearchConfigs";

export default function YouTubeResearch({
  initialJobId,
  initialHandle,
}: {
  initialJobId?: number;
  initialHandle?: string;
}) {
  return (
    <PlatformResearch
      config={youtubeResearchConfig}
      initialJobId={initialJobId}
      initialHandle={initialHandle}
    />
  );
}
