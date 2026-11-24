import { Redirect, useSearch } from "wouter";
import { useExperienceAccess } from "@/lib/experienceAccess";
import { SavedV2 } from "@/components/saved/SavedV2";
import SavedReels from "@/pages/SavedReels";
import CollectedReels from "@/pages/CollectedReels";

/** /saved: the combined Saved page (SAVED_V2_MODE) or today's Saved page. */
export default function SavedPage() {
  const { ready, access } = useExperienceAccess();
  if (!ready) return null;
  return access.saved === "v2" ? <SavedV2 /> : <SavedReels />;
}

/** /collected: forwards to Saved · From links when the combined page is on. */
export function CollectedPage() {
  const { ready, access } = useExperienceAccess();
  const search = useSearch();
  if (!ready) return null;
  if (access.saved === "v2") {
    const add = new URLSearchParams(search).get("add") === "1";
    return <Redirect to={`/saved?tab=links${add ? "&add=1" : ""}`} />;
  }
  return <CollectedReels />;
}
