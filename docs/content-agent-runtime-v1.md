# SpyReels Content Agent Runtime V1

Status: foundation milestone, do not merge or deploy yet.

## Product rule

Agent decides what creator-level job to do. Existing SpyReels systems decide how to execute it.

The Agent must not invent capabilities, claim an action completed before the underlying workflow succeeds, or expose internal implementation steps as if they were creator-facing tools.

## Current creator-level tool registry

- `write_viral_script`
- `refine_script`
- `generate_hook_ideas`
- `load_plan_card`
- `remake_social_video`
- `convert_existing_script`
- `create_carousel`
- `save_script`
- `schedule_filming`
- `download_script`
- `inspect_script_health`

These map to capabilities that already exist in SpyReels. The next milestone is to move the remaining UI-local command execution behind one Agent executor so button actions and natural-language actions share the same path.

## Routing rules

High-confidence deterministic intents should not pay an LLM routing cost. Examples: public social URLs, save, download, schedule filming, carousel, hook options.

Ambiguous creator requests are allowed to use the lightweight LLM intent classifier. The classifier receives current artifact context and is prevented from selecting tools that require a script when no current script exists.

## Reliability requirements

1. Tool calls are creator-level jobs, not tiny infrastructure calls.
2. Existing deterministic workflows remain authoritative.
3. Social remake remains responsible for ingest, transcription, remakeability checks, and generation.
4. Long-running jobs must eventually report real tool events to the Agent UI.
5. Tool execution must be auditable and retry-safe before multi-step autonomous chains are enabled.
6. No em dash characters in user-facing SpyReels copy or Agent-generated content.

## Next milestone

Create the unified Agent executor and route these through it:

- result composer commands
- artifact buttons
- empty-state composer
- social-source remake
- script conversion
- carousel handoff
- save and filming reminder actions

After that, add persisted Agent runs and tool runs, then enable bounded multi-step plans such as:

`remake_social_video -> create_carousel -> save_script`
