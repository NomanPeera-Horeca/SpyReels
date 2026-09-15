import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  pkceS256Challenge,
  randomOpaqueToken,
  sha256Hex,
  verifyPkceS256,
} from "./crypto";

describe("AI Gateway OAuth crypto", () => {
  it("matches the RFC 7636 S256 example", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    expect(pkceS256Challenge(verifier)).toBe(challenge);
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
    expect(verifyPkceS256(`${verifier}x`, challenge)).toBe(false);
  });

  it("creates opaque tokens without padding", () => {
    const token = randomOpaqueToken(32);
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain("=");
  });

  it("hashes deterministically and compares in constant-time form", () => {
    const left = sha256Hex("secret");
    const right = sha256Hex("secret");
    const other = sha256Hex("different");
    expect(left).toBe(right);
    expect(constantTimeEqual(left, right)).toBe(true);
    expect(constantTimeEqual(left, other)).toBe(false);
  });
});
