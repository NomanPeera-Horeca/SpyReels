# SpyReels Content Agent Runtime V1

Status: foundation milestone, do not merge or deploy yet.

## Product rule

The Agent decides what creator-level job the user wants. Existing SpyReels workflows decide how to execute that job.

Natural language is the primary control surface. Buttons are shortcuts to the exact same Agent actions. The content artifact remains the source of truth, and the conversation explains what happened.

The Agent must not invent capabilities, claim an action completed before the underlying workflow succeeds, or expose internal implementation steps as if they were creator-facing tools.

## Creator-level tools

The V1 registry contains formal actions for:

- create Reel script
- refine current script
- generate hook ideas
- load a 30-day plan idea
- remake a public Instagram, TikTok, or YouTube video
- convert an existing pasted script
- create a carousel from the current Reel
- save to My Scripts
- schedule filming
- download a branded script
- inspect script health

## Routing

High-confidence requests use deterministic rules. Examples:

- a supported social URL routes to Remake
- a full pasted script routes to script conversion
- `save this` routes to save
- `schedule filming Friday at 10` routes to filming schedule
- `turn this into a carousel` routes to Carousel Studio
- `give me hook options` routes to hook generation
- requests to change the current Reel route to refine
- a new idea with no current artifact routes to script creation

Only low-confidence requests use the lightweight LLM classifier. The classifier can choose only from the registered tools and cannot invent a script-required action when no script exists.

## One executor

`executeContentAgentAction(...)` is the creator-level execution switch.

Both natural-language requests and explicit UI controls become a `ContentAgentAction` and enter the same executor. Existing workflows remain responsible for their own generation, persistence, navigation, and product-specific behavior.

The client bridge exposes separate resolution and execution steps so the UI can show truthful working copy after the Agent knows what it is actually doing.

## Conversation controller

`useContentAgentConversationController(...)` owns the shared Agent thread behavior:

1. append the creator's message
2. resolve one creator-level action
3. execute through the shared executor
4. render the real result as an action receipt, clarification, or error
5. keep the current tool active when the Agent needs one more answer

This prevents follow-up answers from being reclassified incorrectly. For example:

`Schedule this` -> `When do you want to film this Reel?` -> `Friday at 10`

The final answer stays inside `schedule_filming` instead of being mistaken for a script rewrite.

## Conversation presentation

The reusable conversation layer supports:

- small right-aligned creator messages
- plain left-aligned Agent responses
- compact action receipts
- clarification turns
- failures without fake success
- truthful work events
- `Worked for Ns` summaries when duration is known
- the content artifact as the visual hero
- one sticky composer
- current artifact and source context near the composer

## Reliability requirements

1. Tool calls are creator-level jobs, not tiny infrastructure calls.
2. Existing deterministic workflows remain authoritative.
3. Social remake remains responsible for ingest, transcription, remakeability checks, and generation.
4. Long-running jobs must report real tool events to the Agent UI.
5. Tool execution must be auditable and retry-safe before multi-step autonomous chains are enabled.
6. No em dash characters in user-facing SpyReels copy or Agent-generated content.
7. A clarification reply must continue the pending tool instead of being sent through general intent routing again.
8. Buttons and chat must enter the same executor and update the same artifact state.

## Current migration boundary

The runtime, executor, conversation model, presentation helpers, and conversation controller are now in place on the feature branch.

The live Agent result component still contains legacy local regex command routing and must be migrated to the shared controller before this work is considered release-ready. The empty Agent composer must also use the same execution layer.

The next wiring milestone is to connect real workflow adapters for:

- existing script generation and refine
- hook generation
- social URL ingestion into the existing Remake chain
- existing pasted-script conversion
- Carousel Studio
- My Scripts save
- filming reminders
- branded download
- script health

After that, add persistence for Agent/tool runs and bounded multi-step chains.

## Release rule

Do not merge or deploy this foundation until the live Agent surfaces use the shared execution layer and the branch has passed focused tests, app checks, and final product QA.
