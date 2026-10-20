import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { loadOnboardingViralStack } from "../featuredDemo/loadOnboardingViralStack";
import { clientIpFromRequest, isPublicIpRateLimited } from "../publicRateLimit";

/**
 * Read-only slice of the Viral Finder catalogs for the first onboarding
 * screen. Does not scrape, refresh expired CDN urls, or call a model.
 */
export const onboardingPreviewRouter = router({
  viralStack: publicProcedure.query(async ({ ctx }) => {
    const ip = clientIpFromRequest(ctx.req);
    if (isPublicIpRateLimited(ip)) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests. Please try again in a minute.",
      });
    }
    return loadOnboardingViralStack();
  }),
});
