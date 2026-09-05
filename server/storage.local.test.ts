import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  localObjectStorageDir,
  resolveLocalObjectPath,
  storagePut,
} from "./storage";

const ENV_KEYS = [
  "LOCAL_OBJECT_STORAGE_DIR",
  "LOCAL_OBJECT_STORAGE_PUBLIC_ORIGIN",
  "PORT",
  "CLOUDFLARE_R2_ENDPOINT",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_R2_BUCKET",
] as const;

const saved = new Map<string, string | undefined>();

function setLocalEnv(dir: string) {
  for (const key of ENV_KEYS) {
    saved.set(key, process.env[key]);
  }
  process.env.LOCAL_OBJECT_STORAGE_DIR = dir;
  process.env.LOCAL_OBJECT_STORAGE_PUBLIC_ORIGIN = "http://127.0.0.1:3006";
}

afterEach(async () => {
  for (const key of ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
});

describe("local object storage fallback", () => {
  it("does not fall back to disk when LOCAL_OBJECT_STORAGE_DIR is unset", async () => {
    for (const key of ENV_KEYS) saved.set(key, process.env[key]);
    delete process.env.LOCAL_OBJECT_STORAGE_DIR;
    delete process.env.CLOUDFLARE_R2_ENDPOINT;
    delete process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    delete process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
    delete process.env.CLOUDFLARE_R2_BUCKET;
    expect(localObjectStorageDir()).toBeNull();
    await expect(
      storagePut("carousel-uploads/1/nope.jpg", Buffer.from("x"), "image/jpeg")
    ).rejects.toThrow(/Cloudflare R2 credentials missing/);
  });

  it("rejects path traversal keys", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "spyreels-local-uploads-"));
    setLocalEnv(dir);
    try {
      expect(() => resolveLocalObjectPath("../secret.txt")).toThrow(/invalid object key/);
      expect(() => resolveLocalObjectPath("..\\secret.txt")).toThrow(/invalid object key/);
      expect(() =>
        resolveLocalObjectPath("carousel-uploads/../../../etc/passwd")
      ).toThrow(/invalid object key/);
      const abs = resolveLocalObjectPath("carousel-uploads/1/ok.jpg");
      expect(abs.startsWith(path.resolve(dir) + path.sep)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes to disk and never requires R2 when LOCAL_OBJECT_STORAGE_DIR is set", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "spyreels-local-uploads-"));
    setLocalEnv(dir);
    try {
      const result = await storagePut(
        "carousel-uploads/1/proof.jpg",
        Buffer.from("local-proof"),
        "image/jpeg"
      );
      expect(result.url).toBe(
        "http://127.0.0.1:3006/local-uploads/carousel-uploads/1/proof.jpg"
      );
      expect(result.url).not.toContain("r2.dev");
      const written = await readFile(
        path.join(dir, "carousel-uploads/1/proof.jpg"),
        "utf8"
      );
      expect(written).toBe("local-proof");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
