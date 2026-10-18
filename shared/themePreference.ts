/**
 * Account theme preference (user_preferences.theme). Shared by server and client.
 *
 * - New accounts are written as NEW_ACCOUNT_THEME at creation (Light).
 * - Legacy accounts keep a null value and keep their existing behavior.
 * - "system" is an explicit Settings choice only; it is never the default.
 */
export const THEME_PREFERENCE_VALUES = ["light", "dark", "system"] as const;

export type AccountThemePreference = (typeof THEME_PREFERENCE_VALUES)[number];

export const NEW_ACCOUNT_THEME: AccountThemePreference = "light";

/** Returns the stored value when it is a known preference, otherwise null (legacy/unset). */
export function parseAccountTheme(value: unknown): AccountThemePreference | null {
  return typeof value === "string" && (THEME_PREFERENCE_VALUES as readonly string[]).includes(value)
    ? (value as AccountThemePreference)
    : null;
}
