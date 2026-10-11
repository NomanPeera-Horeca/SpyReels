import posthog from "posthog-js";

const STORAGE_PREFIX = "spyreels:signup_completed:";
/** Only treat accounts created within this window as a fresh signup. */
const SIGNUP_WINDOW_MS = 15 * 60 * 1000;

export type SignupMethod = "google" | "email" | "unknown";

export function signupMethodFromLoginMethod(
  loginMethod: string | null | undefined
): SignupMethod {
  if (loginMethod === "google") return "google";
  if (loginMethod === "email") return "email";
  return "unknown";
}

function storageKey(userId: string | number): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/**
 * Fire signup_completed once per user id when the account is brand new.
 * Covers Google OAuth and email register after the app session loads.
 */
export function maybeCaptureSignupCompleted(user: {
  id: number | string;
  loginMethod?: string | null;
  createdAt?: Date | string | null;
}): void {
  if (typeof window === "undefined") return;
  if (!import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN) return;

  const createdAt =
    user.createdAt instanceof Date
      ? user.createdAt
      : user.createdAt
        ? new Date(user.createdAt)
        : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) return;
  if (Date.now() - createdAt.getTime() > SIGNUP_WINDOW_MS) return;

  const key = storageKey(user.id);
  try {
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, "1");
  } catch {
    /* still attempt capture if storage is blocked */
  }

  const method = signupMethodFromLoginMethod(user.loginMethod);
  posthog.capture("signup_completed", {
    method,
    return_to: `${window.location.pathname}${window.location.search}`,
    source_path: window.location.pathname,
  });
}
