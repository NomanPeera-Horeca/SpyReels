/**
 * Print Planning IR beats compiled from remake 73's stored Creative Brief.
 */
import remakeDump from "../docs/qa/carousel-breakdown-real-runtime/remake-dump.json";
import { compileCreativeBriefToPlanningIR } from "../shared/carouselPlanningIR";
import type { CarouselCreativeBrief } from "../shared/carouselStudio";

const brief = remakeDump.angleOptionsJson[0] as CarouselCreativeBrief;
const planningIR = compileCreativeBriefToPlanningIR({
  brief,
  sourceContent: "The 6 Silent Cash Drains Killing Small Businesses",
});

console.log(
  JSON.stringify(
    {
      preferredFamily: planningIR.strategy.preferredFamily,
      beatCount: planningIR.beats.length,
      beats: planningIR.beats.map((beat) => ({
        id: beat.id,
        role: beat.role,
        objective: beat.objective,
        sequence: beat.sequence,
        listItemIndex: beat.listItemIndex ?? null,
        recommendedVisual: beat.recommendedVisual ?? null,
      })),
    },
    null,
    2
  )
);
