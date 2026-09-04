export type HookOptionsArrivalPlan = {
  selectedIndex: number | null;
  autoApplyIndex: number | null;
};

/**
 * Hook options never change the current hook until the user clicks an option.
 * Arrival also does not decide whether the sheet is open.
 */
export function hookOptionsArrivalPlan(
  _variations?: readonly unknown[] | null
): HookOptionsArrivalPlan {
  return { selectedIndex: null, autoApplyIndex: null };
}

export function hookOptionsSheetShowsLoader(
  pending: boolean,
  variationCount: number
): boolean {
  return pending && variationCount < 1;
}
