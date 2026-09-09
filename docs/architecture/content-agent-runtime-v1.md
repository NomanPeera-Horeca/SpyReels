# SpyReels Content Agent Runtime V1 Architecture

## North star

**Agent decides what to do. Existing SpyReels systems decide how to do it.**

The Agent is an orchestrator over proven creator workflows, not a replacement for them.

## Execution shape

Creator request
-> shared intent resolution
-> creator-level tool
-> existing SpyReels workflow adapter
-> structured tool result
-> current artifact update
-> Agent decides whether another bounded step is required

Natural language and explicit UI buttons enter the same creator-level executor.

## Tool boundary

V1 tools intentionally describe creator jobs rather than infrastructure calls:

- create Reel
- refine Reel
- generate hooks
- load plan idea
- remake social video
- convert pasted script
- create carousel
- save script
- schedule filming
- download script
- inspect script health

Internal transcription polling, collected Reel ingestion, storage, and other implementation details remain owned by their existing workflows.

## Live adapters

### New idea

The shared Agent routes the idea once, then hands the text directly to the existing Studio analyze and generation flow. It does not send the same request through the legacy intent resolver again.

### Pasted script

Uses `studio.convertRough` and returns the finished Studio Reel artifact. A later step can therefore refine, save, schedule, or repurpose that Reel.

### Public social URL

Uses the existing URL ingestion and `useLibraryRemakeChain` workflow. The Agent waits for the existing chain to reach a real ready state, reads the generated script, imports it into Studio, and returns that Reel as the next artifact.

This makes requests such as `remake this TikTok, save it, then turn it into a carousel` possible without duplicating Remake logic.

The existing Remake chain is still browser-managed. It is not yet a durable server job, so refresh during the Remake itself can interrupt that specific workflow.

### Result actions

The finished Reel conversation and toolbar share the same Agent executor for refine, hooks, save, filming schedule, download, carousel, and script health. Selected-text editing remains a deliberately local exact replacement flow because it edits a precise range rather than issuing a creator-level artifact action.

## Bounded multi-step planning

Explicit sequential requests are capped at five creator-level steps. Each step resolves against the artifact produced by the previous step.

If a tool has only started and has not returned the artifact required by the next step, execution pauses. The Agent never runs the next action against an older Reel just to keep the conversation moving.

## Persistence

`content_agent_runs` records the creator request and overall execution state.

`content_agent_tool_runs` records each tool step, typed action payload, result, status, and error.

The finished Reel conversation restores the latest persisted run for that artifact after refresh. Clarification state can also be restored. In-flight side effects are not replayed automatically because duplicate save, schedule, or generation actions would be worse than requiring an explicit continue.

## Filming reminders

Filming reminder persistence is separate from publishing calendar fields. The system stores date, time, timezone, filming setup, opening visual, on-screen text, notes, and reminder status.

Ambiguous schedule language asks for missing detail instead of guessing.

## Migration practice

This repository's later production migrations use explicit one-off Render Shell scripts and intentionally do not update the legacy Drizzle journal. Content Agent schema is applied with:

`node scripts/apply-0096-0097-content-agent.mjs`

The runner is safe to re-run, verifies required columns and indexes, and fails closed on unexpected partial schema.

## Release requirements

The branch stays draft until end-to-end browser QA is complete and database migration behavior is verified on the target environment. The generic Instagram profile-preview test failure is pre-existing and should not be changed as part of Agent work unless causality is demonstrated.

Known V1 limits are explicit:

- new-idea generation is still page-managed, so a brand-new asynchronous generation cannot yet automatically continue into a later repurpose step in the same request
- the existing social Remake chain is not yet durable across browser refresh
- active mutation cancellation is not offered until the underlying workflows support safe cancellation

## Guardrails

- never merge or deploy this branch without explicit approval
- no em dash character in Agent UI copy or generated user-facing content
- preserve current AI Coach generation quality architecture unless a real blocker is found
- preserve existing Carousel editor behavior
- do not expose unsupported capabilities in the UI
- do not let the classifier choose a script-required tool when there is no current script
- do not silently invent schedule dates or times
- do not show a completion receipt before the underlying workflow has actually completed
