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

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const client = getS3Client();
  const bucket = getBucket();
  const key = normalizeKey(relKey);

  const body = typeof data === "string" ? Buffer.from(data) : data;

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));

  const url = `${process.env.CLOUDFLARE_R2_ENDPOINT}/${bucket}/${key}`;
  return { key, url };
}

/** Public object URL (same form as return value from {@link storagePut}). */
export function r2ObjectPublicUrl(relKey: string): string {
  const bucket = getBucket();
  const key = normalizeKey(relKey);
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
  if (!endpoint) {
    throw new Error("Cloudflare R2 endpoint missing: set CLOUDFLARE_R2_ENDPOINT");
  }
  return `${endpoint}/${bucket}/${key}`;
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
