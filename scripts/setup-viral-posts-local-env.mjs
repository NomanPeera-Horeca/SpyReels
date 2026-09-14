import { randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

const desired = {
  VIRAL_POSTS_LIVE: "true",
  VIRAL_POSTS_INSTAGRAM_ENABLED: "true",
  VIRAL_POSTS_POOL_REFRESHER: "false",
  VIRAL_POSTS_POOL_REFRESH_MS: "10800000",
};

function upsertEnvValue(source, key, value) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}=.*$`, "m");
  if (pattern.test(source)) return source.replace(pattern, `${key}=${value}`);
  return `${source.replace(/\s*$/, "")}\n${key}=${value}\n`;
}

let envText;
if (existsSync(envPath)) {
  envText = await readFile(envPath, "utf8");
} else if (existsSync(examplePath)) {
  envText = await readFile(examplePath, "utf8");
} else {
  envText = "";
}

for (const [key, value] of Object.entries(desired)) {
  envText = upsertEnvValue(envText, key, value);
}

const jwtMatch = envText.match(/^JWT_SECRET=(.*)$/m);
if (!jwtMatch || !jwtMatch[1].trim()) {
  envText = upsertEnvValue(envText, "JWT_SECRET", randomBytes(64).toString("hex"));
}

await writeFile(envPath, envText, { encoding: "utf8", mode: 0o600 });
try {
  await chmod(envPath, 0o600);
} catch {
  // chmod can be unsupported on some Windows filesystems; writing still succeeds.
}

console.log("Local Viral Posts environment configured in .env.");
console.log("- Live Instagram feed: enabled");
console.log("- Pool refresher: disabled for the web process");
console.log("- Pool interval: 3 hours");
console.log("- JWT_SECRET: present (value not printed)");
console.log("Restart the dev server with: pnpm dev");
