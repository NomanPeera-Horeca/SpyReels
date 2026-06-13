import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const getS3Client = () => {
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("Cloudflare R2 credentials missing: set CLOUDFLARE_R2_ENDPOINT, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY");
  }

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
};

const getBucket = () => {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET;
  if (!bucket) throw new Error("CLOUDFLARE_R2_BUCKET is not set");
  return bucket;
};

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

let warnedMissingR2PublicUrl = false;

/**
 * Public URL for a stored object, suitable for `<img src>` in the browser.
 * Prefers `CLOUDFLARE_R2_PUBLIC_URL` (r2.dev or custom public domain) because
 * the S3 API endpoint (`...r2.cloudflarestorage.com/.../bucket/key`) is not
 * publicly readable. Falls back to the old endpoint+bucket+key pattern if the
 * public base URL is not set.
 */
export function r2ObjectPublicUrl(relKey: string): string {
  const key = normalizeKey(relKey);
  const publicBase = process.env.CLOUDFLARE_R2_PUBLIC_URL?.trim().replace(
    /\/+$/,
    ""
  );
  if (publicBase) {
    return `${publicBase}/${key}`;
  }
  if (!warnedMissingR2PublicUrl) {
    warnedMissingR2PublicUrl = true;
    console.warn(
      "[storage] CLOUDFLARE_R2_PUBLIC_URL is not set; using S3 API URL for R2 object links. " +
        "Set CLOUDFLARE_R2_PUBLIC_URL to your r2.dev or custom public domain so browser can load files."
    );
  }
  const bucket = getBucket();
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
  if (!endpoint) {
    throw new Error("Cloudflare R2 endpoint missing: set CLOUDFLARE_R2_ENDPOINT");
  }
  return `${endpoint}/${bucket}/${key}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const client = getS3Client();
  const bucket = getBucket();
  const key = normalizeKey(relKey);

  const body = typeof data === "string" ? Buffer.from(data) : data;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  const url = r2ObjectPublicUrl(key);
  return { key, url };
}

export async function storageReadBuffer(relKey: string): Promise<Buffer> {
  const client = getS3Client();
  const bucket = getBucket();
  const key = normalizeKey(relKey);
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes || bytes.length === 0) {
    throw new Error(`R2 object empty or missing: ${key}`);
  }
  return Buffer.from(bytes);
}

/** @returns true if the object exists in the bucket, false if missing, throws on other S3 errors. */
export async function storageHead(relKey: string): Promise<boolean> {
  const client = getS3Client();
  const bucket = getBucket();
  const key = normalizeKey(relKey);
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e: unknown) {
    const err = e as { $metadata?: { httpStatusCode?: number }; name?: string; Code?: string };
    const code = err?.$metadata?.httpStatusCode;
    if (code === 404) return false;
    if (err?.name === "NotFound" || err?.Code === "NotFound") return false;
    if ((e as { Code?: string })?.Code === "NotFound") return false;
    throw e;
  }
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const client = getS3Client();
  const bucket = getBucket();
  const key = normalizeKey(relKey);

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 3600 }
  );

  return { key, url };
}
