/**
 * Carousel Studio planning/selection handoff helpers.
 * Router stays responsible for quota, source resolve, and DB auth.
 */

import {
  findBriefByOriginalStoredIndex,
  identityCarouselBriefEntries,
  isLegacyCreativeBrief,
  originalIndexFromNormalizedIndex,
  selectRecommendedCreativeBrief,
  studioPlannedSlideCount,
  type CarouselCreativeBrief,
  type NormalizedCarouselBrief,
  type NormalizedStoredCarouselBriefEntry,
} from "@shared/carouselStudio";

export type StudioRemakeHandoff = {
  creativeBrief?: CarouselCreativeBrief;
  angleDirection?: string;
};

export type StudioAnglePersistRow = {
  angleOptionsJson: NormalizedCarouselBrief[];
  selectedAngleIndex: number | null;
};

export function angleDirectionFromBrief(brief: NormalizedCarouselBrief): string {
  return `${brief.title.trim()}\n\n${brief.description.trim()}`;
}

export function buildStudioRemakeHandoff(
  selected: NormalizedCarouselBrief
): StudioRemakeHandoff {
  if (isLegacyCreativeBrief(selected)) {
    return { angleDirection: angleDirectionFromBrief(selected) };
  }
  return { creativeBrief: selected };
}

export function planGenerateAngles(briefs: NormalizedCarouselBrief[]): {
  angles: NormalizedCarouselBrief[];
  recommendedBriefIndex: number | null;
  selectedAngleIndex: null;
  selected: NormalizedCarouselBrief | null;
  shouldFireRemake: false;
} {
  const { index, brief } = selectRecommendedCreativeBrief(briefs);
  return {
    angles: briefs,
    recommendedBriefIndex: index,
    selectedAngleIndex: null,
    selected: brief,
    shouldFireRemake: false,
  };
}

export function planGenerateFromInput(briefs: NormalizedCarouselBrief[]): {
  angles: NormalizedCarouselBrief[];
  recommendedBriefIndex: number | null;
  selectedAngleIndex: number | null;
  selected: NormalizedCarouselBrief | null;
  remakeHandoff: StudioRemakeHandoff | null;
  shouldFireRemake: true;
} {
  const { index, brief } = selectRecommendedCreativeBrief(briefs);
  const entries = identityCarouselBriefEntries(briefs);
  const storedSelectedIndex =
    index == null ? null : originalIndexFromNormalizedIndex(entries, index);
  return {
    angles: briefs,
    recommendedBriefIndex: index,
    selectedAngleIndex: storedSelectedIndex,
    selected: brief,
    remakeHandoff: brief ? buildStudioRemakeHandoff(brief) : null,
    shouldFireRemake: true,
  };
}

/**
 * generateCarousel input is a display index from Review Plan.
 * Persist selectedAngleIndex as the original stored index.
 */
export function planGenerateCarousel(
  entries: NormalizedStoredCarouselBriefEntry[],
  displaySelectedIndex: number
): {
  recommendedBriefIndex: number | null;
  selectedAngleIndex: number | null;
  selected: NormalizedCarouselBrief | null;
  remakeHandoff: StudioRemakeHandoff | null;
} {
  const briefs = entries.map((entry) => entry.brief);
  const recommendedBriefIndex = selectRecommendedCreativeBrief(briefs).index;
  const storedSelectedIndex = originalIndexFromNormalizedIndex(
    entries,
    displaySelectedIndex
  );
  const selected =
    storedSelectedIndex == null
      ? null
      : findBriefByOriginalStoredIndex(entries, storedSelectedIndex);
  return {
    recommendedBriefIndex,
    selectedAngleIndex: storedSelectedIndex,
    selected,
    remakeHandoff: selected ? buildStudioRemakeHandoff(selected) : null,
  };
}

export function plannedSlideCountFromBrief(
  brief: NormalizedCarouselBrief
): number {
  return studioPlannedSlideCount(brief.estimatedSlideCount);
}

export async function orchestrateStudioGenerateAngles<TId>(deps: {
  proposeAngles: () => Promise<NormalizedCarouselBrief[]>;
  persistAngles: (row: StudioAnglePersistRow) => Promise<TId>;
}): Promise<{
  remakeId: TId;
  angles: NormalizedCarouselBrief[];
  recommendedBriefIndex: number | null;
  selectedAngleIndex: null;
}> {
  const briefs = await deps.proposeAngles();
  const plan = planGenerateAngles(briefs);
  if (plan.recommendedBriefIndex == null || !plan.selected) {
    throw new Error("Could not generate carousel angles.");
  }
  const remakeId = await deps.persistAngles({
    angleOptionsJson: plan.angles,
    selectedAngleIndex: plan.selectedAngleIndex,
  });
  return {
    remakeId,
    angles: plan.angles,
    recommendedBriefIndex: plan.recommendedBriefIndex,
    selectedAngleIndex: plan.selectedAngleIndex,
  };
}

export async function orchestrateStudioGenerateFromInput<TId>(deps: {
  proposeAngles: () => Promise<NormalizedCarouselBrief[]>;
  persistAngles: (row: StudioAnglePersistRow) => Promise<TId>;
  fireRemake: (args: {
    remakeId: TId;
    selected: NormalizedCarouselBrief;
    remakeHandoff: StudioRemakeHandoff;
  }) => void;
}): Promise<{
  remakeId: TId;
  angles: NormalizedCarouselBrief[];
  recommendedBriefIndex: number | null;
  selectedAngleIndex: number;
}> {
  const briefs = await deps.proposeAngles();
  const plan = planGenerateFromInput(briefs);
  if (
    plan.recommendedBriefIndex == null ||
    plan.selectedAngleIndex == null ||
    !plan.selected ||
    !plan.remakeHandoff
  ) {
    throw new Error("Could not generate carousel angles.");
  }
  const remakeId = await deps.persistAngles({
    angleOptionsJson: plan.angles,
    selectedAngleIndex: plan.selectedAngleIndex,
  });
  deps.fireRemake({
    remakeId,
    selected: plan.selected,
    remakeHandoff: plan.remakeHandoff,
  });
  return {
    remakeId,
    angles: plan.angles,
    recommendedBriefIndex: plan.recommendedBriefIndex,
    selectedAngleIndex: plan.selectedAngleIndex,
  };
}

export async function orchestrateStudioGenerateCarousel<TId>(deps: {
  loadAngles: () => Promise<NormalizedCarouselBrief[]>;
  selectedAngleIndex: number;
  persistSelection: (selectedAngleIndex: number) => Promise<TId>;
  fireRemake: (args: {
    remakeId: TId;
    selected: NormalizedCarouselBrief;
    remakeHandoff: StudioRemakeHandoff;
  }) => void;
}): Promise<{
  remakeId: TId;
  recommendedBriefIndex: number | null;
  selectedAngleIndex: number;
}> {
  const briefs = await deps.loadAngles();
  const plan = planGenerateCarousel(
    identityCarouselBriefEntries(briefs),
    deps.selectedAngleIndex
  );
  if (
    plan.selectedAngleIndex == null ||
    !plan.selected ||
    !plan.remakeHandoff
  ) {
    throw new Error("Selected angle is missing. Generate angles again.");
  }
  const remakeId = await deps.persistSelection(plan.selectedAngleIndex);
  deps.fireRemake({
    remakeId,
    selected: plan.selected,
    remakeHandoff: plan.remakeHandoff,
  });
  return {
    remakeId,
    recommendedBriefIndex: plan.recommendedBriefIndex,
    selectedAngleIndex: plan.selectedAngleIndex,
  };
}
