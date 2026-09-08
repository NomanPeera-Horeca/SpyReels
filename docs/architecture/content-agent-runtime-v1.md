# SpyReels Content Agent Runtime V1

## Product rule

Agent decides what creator-level job to do. Existing SpyReels workflows decide how to execute it.

The Agent should never expose internal APIs to creators. It should reason in creator jobs such as remake this Reel, make the hook stronger, create a carousel, save this, or schedule filming.

## Runtime layers

1. Creator request
2. Content Agent intent and current context
3. Typed creator-level tool selection
4. Unified executor
5. Existing SpyReels workflow
6. Tool result
7. Agent decides whether another step is needed
8. Content artifact and conversation update together

## V1 tool registry

- write_viral_script
- refine_script
- generate_hook_ideas
- load_plan_card
- remake_social_video
- convert_existing_script
- create_carousel
- save_script
- schedule_filming
- download_script
- inspect_script_health

## Tool boundaries

Tools are intentionally creator-level.

For example, remake_social_video should own the existing sequence of URL ingestion, metadata readiness, transcription, remakeability checks, generation, and opening the remake workspace. The Agent should not independently reason through each internal network or database step.

## Conversation UX

The Agent runtime and chat UI are one product. The UI should feel as effortless as a mature general AI assistant, while being more useful for short-form content creation.

The conversation should use:

- small right-aligned user bubbles
- mostly plain left-aligned Agent responses
- compact action receipts for completed actions
- truthful live work events driven by real tool activity
- a collapsed Worked for Ns summary after completion when duration is known
- the content artifact as the visual hero
- one sticky composer for follow-up actions
- current artifact and source context near the composer
- local selected-text editing for precise wording changes
- clarification only when required information is missing
- recovery messages that preserve completed work if a later tool fails

The Agent must never show fake chain-of-thought or pretend a tool ran when it did not.

## Unified executor milestone

The next implementation step is one executor used by all Agent entry points.

The following must converge on the same tool execution path:

- empty Agent composer
- result conversation composer
- artifact toolbar actions
- More menu actions
- social URL remake entry
- pasted script conversion
- save and filming schedule
- Carousel handoff

Buttons are shortcuts. Natural language is the primary control surface.

## State and multi-step work

After the unified executor is stable, add persisted Agent runs and tool runs so work can survive refresh, avoid duplicate tool calls, support retries, and provide real progress events.

Then support bounded multi-step requests such as:

Remake this TikTok for coffee shops, make it 30 seconds, turn it into a carousel, and save both.

The Agent should execute a bounded sequence of creator-level tools and stop if a tool fails or required information is missing.

## Guardrails

- never merge or deploy this branch without explicit approval
- no em dash character in Agent UI copy or generated user-facing content
- preserve current AI Coach generation quality architecture unless a real blocker is found
- preserve existing Carousel editor behavior
- do not expose unsupported capabilities in the UI
- do not let the classifier choose a script-required tool when there is no current script
- do not silently invent schedule dates or times
