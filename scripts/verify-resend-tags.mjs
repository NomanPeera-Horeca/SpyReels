/**
 * Ensures every `resend.emails.send(` in tracked mail helpers includes a Resend
 * `tags: [{ name: "template", value: "..." }]` block near the top of the payload.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["server/utils/email.js", "server/utils/email.ts"];
const TAG_SNIPPET = /tags:\s*\[\s*\{\s*name:\s*["']template["']/;

let failed = false;
for (const rel of FILES) {
  const abs = path.join(root, rel);
  const s = fs.readFileSync(abs, "utf8");
  const re = /resend\.emails\.send\(/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const head = s.slice(m.index, m.index + 900);
    if (!TAG_SNIPPET.test(head)) {
      console.error(`[verify-resend-tags] Missing template tags after resend.emails.send in ${rel} near index ${m.index}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log("[verify-resend-tags] OK: all resend.emails.send calls include template tags.");
