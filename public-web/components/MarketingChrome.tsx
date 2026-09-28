import { readFileSync } from "node:fs";
import { join } from "node:path";

const headerHtml = readFileSync(join(process.cwd(), "app", "marketing-header.html"), "utf8");
const footerHtml = readFileSync(join(process.cwd(), "app", "marketing-footer.html"), "utf8");
const finderMotionHtml = readFileSync(join(process.cwd(), "app", "marketing-finder-motion.html"), "utf8");

/** The homepage and product landing pages use the same markup and navigation behavior. */
export function MarketingHeader() {
  return <header className="nav" dangerouslySetInnerHTML={{ __html: headerHtml }} />;
}

export function MarketingFooter() {
  return <footer className="footer" dangerouslySetInnerHTML={{ __html: footerHtml }} />;
}

export function MarketingFinderMotion() {
  return <div dangerouslySetInnerHTML={{ __html: finderMotionHtml }} />;
}
