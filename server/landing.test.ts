import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * Landing page routing tests.
 *
 * The landing page is shown when `user` is null (unauthenticated).
 * The dashboard is shown when `user` is present (authenticated).
 *
 * We test this by verifying the auth.me endpoint returns the correct
 * state for authenticated vs unauthenticated contexts, which is what
 * DashboardLayout uses to decide whether to render LandingPage or the dashboard.
 */

function createUnauthenticatedContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createAuthenticatedContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user-123",
      email: "creator@example.com",
      name: "Test Creator",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Landing page routing logic", () => {
  it("returns null user for unauthenticated requests (landing page should show)", async () => {
    const ctx = createUnauthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).toBeNull();
  });

  it("returns user object for authenticated requests (dashboard should show)", async () => {
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      id: 1,
      openId: "test-user-123",
      email: "creator@example.com",
      name: "Test Creator",
    });
  });

  it("unauthenticated user can call auth.me and get null (landing page trigger)", async () => {
    const ctx = createUnauthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    // auth.me is a public procedure that returns null for unauthenticated users
    // This null value is what triggers the landing page in DashboardLayout
    const me = await caller.auth.me();
    expect(me).toBeNull();
  });

  it("authenticated user gets full user data (dashboard trigger)", async () => {
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    const me = await caller.auth.me();
    expect(me).toBeTruthy();
    expect(me?.email).toBe("creator@example.com");
    expect(me?.name).toBe("Test Creator");
  });
});
