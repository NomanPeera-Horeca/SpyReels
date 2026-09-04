export type HookOptionsArrivalPlan = {
  openSheet: boolean;
  selectedIndex: number | null;
  autoApplyIndex: number | null;
};

/**
 * Hook options never change the current hook until the user clicks an option.
 */
export function hookOptionsArrivalPlan(
  variations: readonly unknown[] | null | undefined
): HookOptionsArrivalPlan {
  if (!variations || variations.length === 0) {
    return { openSheet: false, selectedIndex: null, autoApplyIndex: null };
  }
  return { openSheet: true, selectedIndex: null, autoApplyIndex: null };
}
