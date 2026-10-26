# 30-profile benchmark plan

Prepared against `e2587743b8e47fe6e6c4c1776b982a8a48974e29` on `fix/precise-niche-split`. Do not run this until a new budget is approved. No paid call is part of this plan.

Frozen prompts, unchanged by this plan:

- Goal `goal-v2`
- Audience `audience-v3`
- Pillars `pillars-v2`
- Niche `niche-v4`

Wedding photography returning category Business is an open taxonomy decision. Do not force Lifestyle and do not add a one-off classification patch before this run.

## Command

Recorded cumulative real-model spend before this plan is about $4.77 of the $5 cap. The focused validation added $0.133254 to the earlier $4.635069. A 30-case run is about $0.84 and does not fit in the remaining amount.

When a new cap is approved, run the existing harness. Do not raise `EVAL_SPEND_CAP_USD` and treat that per-run default as the cumulative cap.

```
pnpm exec tsx scripts/personalization-intelligence-eval.ts \
  --confirm-spend \
  --cap=<approved remainder> \
  --out=validation-30
```

The local recovery recorder in `server/personalization/intelligence/eval/runEval.ts` is not in `e258774`. Keep it out of the job-key commit. A later approved run should pass fixture `fallbackGoal` only after a real `needs_clarification`, and store that result on `recovery`. The first-pass goal, audience, pillar, and niche fields stay unanswered.

## Separate scores

Report these four numbers apart. Do not fold niche or recovery into the strategy average.

| Score | Source | What it measures |
| --- | --- | --- |
| Strategy quality | Independent judge `mean.strategy` | Goal 25, audience 20, pillars 25, specificity 15, clarity 10, evidence 5. Target remains 85/100 average and at least 27 of 30 cases at 75 or higher. |
| Niche accuracy | Independent judge `mean.niche` | Specific niche plus category, out of 30. Not part of the strategy sheet. |
| Clarification correctness | `benchmarkDecision` on the first pass | Required clarification was asked. An answerable profile was suggested. Empty evidence stays `no_model`. |
| Recovery | `recovery` on clarification cases only | After the user answer, category, specific niche, goal, audience, and pillars complete. A failed or skipped recovery is not a first-pass strategy score. |

Previous judged files `niche-quality-30` and `niche-strategy-focus` predate goal-v2 and niche-v4. They are not the release score.
