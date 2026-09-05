import { useMemo } from "react";
import { useSearch } from "wouter";
import ViralPostsExplore from "./ViralPostsExplore";
import ViralPostsLegacy from "./ViralPostsLegacy";

/**
 * Keep the proven For You / Saved implementation unchanged while Explore
 * moves to the browse-first experience. This route wrapper makes the change
 * isolated and easy to remove once the tabs are consolidated again.
 */
export default function ViralPosts() {
  const searchString = useSearch();
  const tab = useMemo(
    () => new URLSearchParams(searchString).get("tab"),
    [searchString]
  );

  if (tab === "explore") {
    return <ViralPostsExplore />;
  }

  return <ViralPostsLegacy />;
}
