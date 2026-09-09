import { z } from "zod";
import { REEL_NICHE_VALUES } from "@shared/reelNiches";

export const reelNicheInputEnum = z.enum(
  REEL_NICHE_VALUES as unknown as [string, ...string[]]
);
