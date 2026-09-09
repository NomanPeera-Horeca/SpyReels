import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import type { TrpcContext } from "../../_core/context";

const mockGetUserSubscription = vi.fn();
const mockCountCarouselRemakesThisMonth = vi.fn();
const mockGetDb = vi.fn();

vi.mock("../../stripe/stripe-service", () => ({
  getUserSubscription: (...args: unknown[]) => mockGetUserSubscription(...args),
}));

vi.mock("../db", () => ({
  countCarouselRemakesThisMonth: (...args: unknown[]) =>
    mockCountCarouselRemakesThisMonth(...args),
}));

vi.mock("../../db", () => ({
  getDb: (...args: unknown[]) => mockGetDb(...args),
}));

import { carouselStudioRouter } from "../../routers/carouselStudioRouter";
import { studioSidebarRoleLabel } from "../../../client/src/components/carousel-studio/studioSidebarRole";

const here = dirname(fileURLToPath(import.meta.url));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createUser(role: AuthenticatedUser["role"] = "user"): AuthenticatedUser {
  return {
    id: 42,
    openId: "email_normal_user@example.com",
    email: "normal.user@example.com",
    name: "Normal User",
    loginMethod: "email",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function createAuthContext(
  role: AuthenticatedUser["role"] = "user"
): TrpcContext {
  return {
    user: createUser(role),
    workspaceId: "00000000-0000-4000-8000-000000000042",
    workspaceRole: "owner",
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    workspaceId: null,
    workspaceRole: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

const IDEA = "How to simplify a restaurant menu without hurting revenue";

describe("Carousel Studio access source contract", () => {
  const studioRouter = readFileSync(
    join(here, "../../routers/carouselStudioRouter.ts"),
    "utf8"
  );
  const studioPage = readFileSync(
    join(here, "../../../client/src/pages/CarouselStudio.tsx"),
    "utf8"
  );
  const appTsx = readFileSync(join(here, "../../../client/src/App.tsx"), "utf8");
  const remakeRouter = readFileSync(
    join(here, "../../routers/carouselRemakeRouter.ts"),
    "utf8"
  );
  const adminRouter = readFileSync(
    join(here, "../../routers/adminRouter.ts"),
    "utf8"
  );
  const studioApp = readFileSync(
    join(here, "../../../client/src/components/carousel-studio/CarouselStudioApp.tsx"),
    "utf8"
  );

  it("uses protectedProcedure on Studio endpoints, not adminPanelProcedure", () => {
    expect(studioRouter).toContain("import { protectedProcedure, router }");
    expect(studioRouter).not.toContain("adminPanelProcedure");
    expect(studioRouter).toMatch(/resolveSource:\s*protectedProcedure/);
    expect(studioRouter).toMatch(/generateAngles:\s*protectedProcedure/);
    expect(studioRouter).toMatch(/generateFromInput:\s*protectedProcedure/);
    expect(studioRouter).toMatch(/generateCarousel:\s*protectedProcedure/);
  });

  it("keeps generateCarousel scoped to the caller workspace", () => {
    expect(studioRouter).toMatch(
      /generateCarousel:[\s\S]*eq\(carouselRemakes\.workspaceId,\s*workspaceId\)/
    );
    expect(studioRouter).toMatch(
      /generateCarousel:[\s\S]*eq\(carouselRemakes\.id,\s*input\.remakeId\)/
    );
  });

  it("still runs carousel quota on Studio generation", () => {
    expect(studioRouter).toMatch(
      /generateAngles:[\s\S]*await assertCarouselRemakeQuota\(/
    );
    expect(studioRouter).toMatch(
      /generateFromInput:[\s\S]*await assertCarouselRemakeQuota\(/
    );
    expect(remakeRouter).toContain("export async function assertCarouselRemakeQuota");
  });

  it("does not use an admin client gate on the Carousel editor page", () => {
    const editorPage = readFileSync(
      join(here, "../../../client/src/pages/CarouselEditor.tsx"),
      "utf8"
    );
    expect(editorPage).not.toContain("isAdminPanelClient");
    expect(editorPage).toContain("CarouselStudioApp");
    expect(editorPage).toContain("LandingPage");
    expect(editorPage).toMatch(/if\s*\(!user\)/);
    expect(studioPage).toContain("legacyStudioRedirectPath");
  });

  it("keeps /carousel-studio as a backward-compatible redirect", () => {
    expect(appTsx).toContain('path="/carousel-studio"');
    expect(appTsx).toContain('path="/carousels/:remakeId/edit"');
    expect(appTsx).toContain('path="/carousels/new"');
    expect(appTsx).toContain("Legacy Studio URL");
  });

  it("does not weaken other adminPanelProcedure routes", () => {
    expect(adminRouter).toContain("adminPanelProcedure");
    expect(adminRouter).toMatch(/ping:\s*adminPanelProcedure/);
  });

  it("does not render a second Studio application sidebar", () => {
    expect(studioApp).not.toContain("STUDIO_NAV_ITEMS");
    expect(studioApp).not.toMatch(/>Create<\/span>/);
    expect(studioApp).not.toMatch(/>Performance</);
    expect(studioApp).not.toMatch(/>Brand</);
    expect(studioApp).toContain("Back to Carousels");
  });
});

describe("Carousel Studio sidebar role label", () => {
  it("shows Member for a normal user", () => {
    expect(studioSidebarRoleLabel("user")).toBe("Member");
    expect(studioSidebarRoleLabel(null)).toBe("Member");
    expect(studioSidebarRoleLabel(undefined)).toBe("Member");
  });

  it("shows Admin for an admin user", () => {
    expect(studioSidebarRoleLabel("admin")).toBe("Admin");
  });
});

describe("Carousel Studio procedure access", () => {
  beforeEach(() => {
    mockGetUserSubscription.mockReset();
    mockCountCarouselRemakesThisMonth.mockReset();
    mockGetDb.mockReset();
    mockGetUserSubscription.mockResolvedValue({
      plan: "free",
      status: "active",
      billingInterval: "monthly",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    mockCountCarouselRemakesThisMonth.mockResolvedValue(0);
  });

  it("lets an authenticated normal user call resolveSource", async () => {
    const caller = carouselStudioRouter.createCaller(createAuthContext("user"));
    const result = await caller.resolveSource({ content: IDEA });
    expect(result.sourceContent).toBe(IDEA);
    expect(result.sourceUrl).toBeNull();
  });

  it("lets an admin user call resolveSource", async () => {
    const caller = carouselStudioRouter.createCaller(createAuthContext("admin"));
    const result = await caller.resolveSource({ content: IDEA });
    expect(result.sourceContent).toBe(IDEA);
  });

  it("rejects an unauthenticated caller", async () => {
    const caller = carouselStudioRouter.createCaller(createUnauthContext());
    await expect(caller.resolveSource({ content: IDEA })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: UNAUTHED_ERR_MSG,
    });
    await expect(
      caller.generateFromInput({ content: IDEA })
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("still enforces monthly carousel quota for a normal user", async () => {
    mockCountCarouselRemakesThisMonth.mockResolvedValue(1);
    const caller = carouselStudioRouter.createCaller(createAuthContext("user"));
    await expect(caller.generateAngles({ content: IDEA })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.generateFromInput({ content: IDEA })).rejects.toMatchObject(
      {
        code: "FORBIDDEN",
      }
    );
    expect(mockCountCarouselRemakesThisMonth).toHaveBeenCalled();
  });

  it("does not operate on a remake outside the caller workspace", async () => {
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
    });
    const caller = carouselStudioRouter.createCaller(createAuthContext("user"));
    await expect(
      caller.generateCarousel({ remakeId: 99, selectedAngleIndex: 0 })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Remake not found",
    });
  });
});
