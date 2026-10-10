#!/usr/bin/env node
/**
 * Fail CI when two drizzle/*.sql files share the same migration number prefix.
 *
 * Prefix rule: leading digits plus optional single letter suffix before `_`
 * (examples: 0079_, 0079b_, 0096b_). Files under drizzle/legacy/ are ignored.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const drizzleDir = path.resolve("drizzle");
const prefixRe = /^(\d{4}[a-z]?)_/;

function listSqlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
}

export function findDuplicateMigrationPrefixes(fileNames) {
  const byPrefix = new Map();
  for (const name of fileNames) {
    const match = name.match(prefixRe);
    if (!match) continue;
    const prefix = match[1];
    const list = byPrefix.get(prefix) ?? [];
    list.push(name);
    byPrefix.set(prefix, list);
  }
  return [...byPrefix.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([prefix, files]) => ({ prefix, files }));
}

export function main(cwd = process.cwd()) {
  const files = listSqlFiles(path.join(cwd, "drizzle"));
  const duplicates = findDuplicateMigrationPrefixes(files);

  if (duplicates.length > 0) {
    console.error("Duplicate drizzle migration number prefixes:");
    for (const dup of duplicates) {
      console.error(`  ${dup.prefix}: ${dup.files.join(", ")}`);
    }
    console.error(
      "\nRename one file (prefer a unique number or letter suffix like 0096b_), " +
        "or move superseded SQL under drizzle/legacy/."
    );
    return 1;
  }

  console.log(
    `OK: ${files.length} drizzle/*.sql files, no duplicate migration prefixes.`
  );
  return 0;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  process.exit(main());
}
