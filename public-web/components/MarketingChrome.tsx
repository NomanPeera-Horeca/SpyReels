import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MarketingFooter } from "./MarketingFooter";
import { MarketingHeader } from "./MarketingHeader";

const finderMotionHtml = readFileSync(
  join(process.cwd(), "app", "marketing-finder-motion.html"),
  "utf8"
);

export { MarketingHeader, MarketingFooter };

/** Finder demo motion markup shared by product landing pages. */
export function MarketingFinderMotion() {
  return <div dangerouslySetInnerHTML={{ __html: finderMotionHtml }} />;
}
