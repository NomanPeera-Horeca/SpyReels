/**
 * Who sees the new onboarding and Home v2 (Phase 5, CEO approved 2026-10-16).
 *
 * The decision is made on the SERVER per signed-in user, from environment
 * settings, so it can change without a rebuild:
 *
 *   ONBOARDING_V2_MODE   off | internal | new_signups     (default off)
 *   HOME_V2_MODE         off | internal | new_signups     (default off)
 *   EXPERIENCE_V2_INTERNAL_EMAILS   comma separated allowlist
 *   EXPERIENCE_V2_NEW_SIGNUPS_FROM  ISO time; accounts created at or after it
 *
 * - off: nobody. This is the rollback: set it and restart.
 * - internal: admins (role = admin) and allowlisted emails only.
 * - new_signups: internal users, plus accounts created at or after the
 *   cutoff. Existing customers never qualify. If the cutoff is missing or
 *   invalid, only internal users qualify (fails closed).
 *
 * Home v2 is only ever on for a user who also gets onboarding v2, so Home
 * can never ship ahead of onboarding.
 *
 * Unknown values fail closed to off.
 */
export const EXPERIENCE_MODES = ["off", "internal", "new_signups"] as const;
export type ExperienceMode = (typeof EXPERIENCE_MODES)[number];

export const ONBOARDING_V2_MODE_ENV = "ONBOARDING_V2_MODE";
export const HOME_V2_MODE_ENV = "HOME_V2_MODE";
export const EXPERIENCE_V2_INTERNAL_EMAILS_ENV = "EXPERIENCE_V2_INTERNAL_EMAILS";
export const EXPERIENCE_V2_NEW_SIGNUPS_FROM_ENV = "EXPERIENCE_V2_NEW_SIGNUPS_FROM";

export function parseExperienceMode(raw: string | undefined | null): ExperienceMode {
  const v = (raw ?? "").trim().toLowerCase();
  return (EXPERIENCE_MODES as readonly string[]).includes(v)
    ? (v as ExperienceMode)
    : "off";
}

export function parseEmailAllowlist(raw: string | undefined | null): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map(e => e.trim().toLowerCase())
      .filter(e => e.includes("@"))
  );
}

export function parseCutoff(raw: string | undefined | null): Date | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type ExperienceConfig = {
  onboardingMode: ExperienceMode;
  homeMode: ExperienceMode;
  internalEmails: Set<string>;
  newSignupsFrom: Date | null;
};

export function readExperienceConfig(
  env: Record<string, string | undefined>
): ExperienceConfig {
  return {
    onboardingMode: parseExperienceMode(env[ONBOARDING_V2_MODE_ENV]),
    homeMode: parseExperienceMode(env[HOME_V2_MODE_ENV]),
    internalEmails: parseEmailAllowlist(env[EXPERIENCE_V2_INTERNAL_EMAILS_ENV]),
    newSignupsFrom: parseCutoff(env[EXPERIENCE_V2_NEW_SIGNUPS_FROM_ENV]),
  };
}

export type ExperienceUser = {
  role: string | null | undefined;
  email: string | null | undefined;
  createdAt: Date | string | null | undefined;
};

export type ExperienceAccess = {
  onboarding: "legacy" | "v2";
  home: "research" | "v2";
  /** True for admins and allowlisted testers (used to exclude from analytics). */
  internal: boolean;
};

export function isInternalUser(user: ExperienceUser, cfg: ExperienceConfig): boolean {
  if (user.role === "admin") return true;
  const email = (user.email ?? "").trim().toLowerCase();
  return email !== "" && cfg.internalEmails.has(email);
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function qualifies(
  mode: ExperienceMode,
  user: ExperienceUser,
  cfg: ExperienceConfig,
  internal: boolean
): boolean {
  if (mode === "off") return false;
  if (internal) return true;
  if (mode !== "new_signups" || !cfg.newSignupsFrom) return false;
  const created = toDate(user.createdAt);
  return created !== null && created.getTime() >= cfg.newSignupsFrom.getTime();
}

export function resolveExperienceAccess(
  user: ExperienceUser | null,
  cfg: ExperienceConfig
): ExperienceAccess {
  if (!user) return { onboarding: "legacy", home: "research", internal: false };
  const internal = isInternalUser(user, cfg);
  const onboardingV2 = qualifies(cfg.onboardingMode, user, cfg, internal);
  const homeV2 = onboardingV2 && qualifies(cfg.homeMode, user, cfg, internal);
  return {
    onboarding: onboardingV2 ? "v2" : "legacy",
    home: homeV2 ? "v2" : "research",
    internal,
  };
}
