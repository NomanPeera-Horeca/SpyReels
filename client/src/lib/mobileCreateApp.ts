import { isNativeApp, isPwaStandalone } from "@/lib/nativeApp";

export {
  MOBILE_CREATE_TAB_PATHS,
  mobileCreateTabForPath,
  isMobileCreateAllowedPath,
  type MobileCreateTabId,
} from "@shared/mobileCreateApp";

/**
 * True when the user is in the installed mobile create experience
 * (PWA home screen or Capacitor iOS/Android shell).
 * Desktop browser and mobile browser without install keep the full dashboard.
 */
export function isMobileCreateApp(): boolean {
  if (typeof window === "undefined") return false;
  return isNativeApp() || isPwaStandalone();
}
