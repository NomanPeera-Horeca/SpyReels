import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export function randomOpaqueToken(bytes: number = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

export function pkceS256Challenge(codeVerifier: string): string {
  return sha256Base64Url(codeVerifier);
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyPkceS256(
  codeVerifier: string,
  expectedChallenge: string
): boolean {
  return constantTimeEqual(pkceS256Challenge(codeVerifier), expectedChallenge);
}

export function hashClientSecret(secret: string): string {
  return sha256Hex(secret);
}
