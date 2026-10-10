/**
 * Writes SEO baselines. Run only via:
 *   SPYREELS_PUBLIC_WEB_INDEXING_ENABLED=true pnpm start   # separate terminal
 *   pnpm test:seo:update
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  SEO_INDEXING_REQUEST_HEADERS,
  extractSeoContract,
} from "./seo/extractSeoContract";
import { SEO_MIGRATION_TARGET_PAGES, SEO_NEXT_PAGES } from "./seo/pages";

const SEO_DIR = join(__dirname, "seo");
const LIVE_ORIGIN = (process.env.SEO_LIVE_ORIGIN || "https://spyreels.ai").replace(
  /\/$/,
  ""
);

test.describe("Update SEO baselines", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "update once");
    test.skip(process.env.UPDATE_SEO_BASELINES !== "1", "set UPDATE_SEO_BASELINES=1");
  });

  test("write next + migration-target contracts", async ({ request }) => {
    mkdirSync(join(SEO_DIR, "baselines"), { recursive: true });
    mkdirSync(join(SEO_DIR, "migration-targets"), { recursive: true });

    for (const pageDef of SEO_NEXT_PAGES) {
      const response = await request.get(pageDef.path, {
        headers: SEO_INDEXING_REQUEST_HEADERS,
      });
      expect(response.status(), pageDef.path).toBe(200);
      const contract = extractSeoContract(
        await response.text(),
        pageDef.path,
        response.status()
      );
      expect(
        contract.robots,
        "Expected index,follow. Start Next with SPYREELS_PUBLIC_WEB_INDEXING_ENABLED=true"
      ).toMatch(/index/i);
      expect(contract.robots).not.toMatch(/noindex/i);
      const out = join(SEO_DIR, "baselines", `${pageDef.id}.json`);
      writeFileSync(out, `${JSON.stringify(contract, null, 2)}\n`);
      console.log(`wrote ${out} robots=${contract.robots}`);
    }

    for (const pageDef of SEO_MIGRATION_TARGET_PAGES) {
      const url = `${LIVE_ORIGIN}${pageDef.path}`;
      const response = await request.get(url);
      expect(response.status(), url).toBe(200);
      const contract = extractSeoContract(
        await response.text(),
        pageDef.path,
        response.status()
      );
      const out = join(SEO_DIR, "migration-targets", `${pageDef.id}.json`);
      writeFileSync(out, `${JSON.stringify(contract, null, 2)}\n`);
      console.log(`wrote ${out} from ${LIVE_ORIGIN}`);
    }
  });
});
