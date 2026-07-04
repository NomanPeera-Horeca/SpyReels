export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { resolveAppUrl } from "@/lib/nativeApp";
import { buildGoogleAuthUrlWithAttribution } from "./utils/utm-capture";

export const getLoginUrl = (opts?: { returnTo?: string }) =>
  buildGoogleAuthUrlWithAttribution(resolveAppUrl("/api/auth/google"), opts);
