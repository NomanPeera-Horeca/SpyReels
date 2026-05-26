import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../_core/trpc";
import {
  DISCOVERY_NOT_ENABLED_MESSAGE,
  isDiscoveryV1Enabled,
} from "./featureFlag";

export const discoveryProcedure = protectedProcedure.use(({ next }) => {
  if (!isDiscoveryV1Enabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: DISCOVERY_NOT_ENABLED_MESSAGE,
    });
  }
  return next();
});
