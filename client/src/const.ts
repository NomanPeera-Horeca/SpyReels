export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { buildGoogleAuthUrlWithAttribution } from "./utils/utm-capture";

export const getLoginUrl = (opts?: { returnTo?: string }) =>
  buildGoogleAuthUrlWithAttribution("/api/auth/google", opts);
