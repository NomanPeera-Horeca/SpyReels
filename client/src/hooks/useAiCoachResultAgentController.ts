import { useEffect, useMemo, useRef } from "react";
import { createContentAgentStudioDeps } from "@/lib/contentAgentStudioDeps";
import { scheduleAgentFilmingReminder } from "@/lib/filmingReminderApi";
import { useContentAgentConversationController } from "@/hooks/useContentAgentConversationController";
import type { CoachHookVariation } from "@shared/coachScriptSections";

const ACTION_TIMEOUT_MS = 120_000;
const POLL_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export type AiCoachResultAgentControllerOptions = {
  scriptId: number;
  title: string;
  signature: string;
  refinePending: boolean;
  onRefineWithInstruction?: (instruction: string) => void;
  hookVariations: CoachHookVariation[] | null;
  hookVariationsPending: boolean;
  onRequestHookVariations: () => void;
  onOpenHookOptions: () => void;
  savedScriptId?: number | null;
  savePending?: boolean;
  onSaveToMyScripts?: () => void;
  onOpenCarousel: () => void;
  onDownload: () => Promise<void>;
  onOpenHealth: () => void;
  onNewScript?: () => void;
};

function hookSignature(values: CoachHookVariation[] | null): string {
  if (!values?.length) return "";
  return JSON.stringify(
    values.map((value) => [
      value.hookType,
      value.spokenHook,
      value.visualHook,
      value.onScreenText,
    ])
  );
}

/**
 * Live result-stage binding for SpyReels Agent.
 *
 * The shared Agent runtime chooses the creator-level tool. This hook only
 * connects that tool to the existing, proven Reel workflows already mounted on
 * AiCoachResultView. Promise adapters wait for the real mutation result before
 * returning a success receipt, so the chat never claims an edit or save before
 * it actually happened.
 */
export function useAiCoachResultAgentController(
  options: AiCoachResultAgentControllerOptions
) {
  const stateRef = useRef({
    scriptId: options.scriptId,
    title: options.title,
    signature: options.signature,
    refinePending: options.refinePending,
    hookVariations: options.hookVariations,
    hookVariationsPending: options.hookVariationsPending,
    savedScriptId: options.savedScriptId ?? null,
    savePending: Boolean(options.savePending),
  });

  useEffect(() => {
    stateRef.current = {
      scriptId: options.scriptId,
      title: options.title,
      signature: options.signature,
      refinePending: options.refinePending,
      hookVariations: options.hookVariations,
      hookVariationsPending: options.hookVariationsPending,
      savedScriptId: options.savedScriptId ?? null,
      savePending: Boolean(options.savePending),
    };
  }, [
    options.hookVariations,
    options.hookVariationsPending,
    options.refinePending,
    options.savePending,
    options.savedScriptId,
    options.scriptId,
    options.signature,
    options.title,
  ]);

  const deps = useMemo(
    () =>
      createContentAgentStudioDeps({
        async createScript() {
          throw new Error("Use New script to start a different Reel from this result.");
        },

        async refineScript(scriptId, instruction) {
          if (!options.onRefineWithInstruction) {
            throw new Error("This Reel cannot be refined right now.");
          }
          const before = stateRef.current.signature;
          options.onRefineWithInstruction(instruction);
          const startedAt = Date.now();
          let sawPending = false;

          while (Date.now() - startedAt < ACTION_TIMEOUT_MS) {
            await sleep(POLL_MS);
            sawPending ||= stateRef.current.refinePending;
            if (
              !stateRef.current.refinePending &&
              stateRef.current.signature !== before &&
              (sawPending || Date.now() - startedAt > 250)
            ) {
              return { id: scriptId, title: stateRef.current.title };
            }
          }
          throw new Error("The Reel update took too long. Your original Reel is still safe.");
        },

        async generateHookIdeas() {
          const before = hookSignature(stateRef.current.hookVariations);
          options.onOpenHookOptions();
          options.onRequestHookVariations();
          const startedAt = Date.now();
          let sawPending = false;

          while (Date.now() - startedAt < ACTION_TIMEOUT_MS) {
            await sleep(POLL_MS);
            sawPending ||= stateRef.current.hookVariationsPending;
            const after = hookSignature(stateRef.current.hookVariations);
            if (
              !stateRef.current.hookVariationsPending &&
              after &&
              (after !== before || before === "") &&
              (sawPending || Date.now() - startedAt > 250)
            ) {
              return;
            }
            if (!stateRef.current.hookVariationsPending && before && after === before) {
              // Existing options are already valid. Opening them is the requested action.
              return;
            }
          }
          throw new Error("Hook options took too long to load. Try again.");
        },

        async loadPlanCard() {
          throw new Error("Use New script to create from a 30-day plan idea.");
        },

        async startRemake() {
          throw new Error("Use New script to remake a different social video from this result.");
        },

        async convertExistingScript() {
          throw new Error("Use New script to convert a different pasted script from this result.");
        },

        async openCarousel() {
          options.onOpenCarousel();
        },

        async saveScript() {
          if (stateRef.current.savedScriptId) {
            return {
              savedScriptId: stateRef.current.savedScriptId,
              title: stateRef.current.title,
            };
          }
          if (!options.onSaveToMyScripts) {
            throw new Error("This Reel cannot be saved right now.");
          }
          options.onSaveToMyScripts();
          const startedAt = Date.now();

          while (Date.now() - startedAt < ACTION_TIMEOUT_MS) {
            await sleep(POLL_MS);
            if (stateRef.current.savedScriptId) {
              return {
                savedScriptId: stateRef.current.savedScriptId,
                title: stateRef.current.title,
              };
            }
          }
          throw new Error("Saving took too long. The Reel is still available here.");
        },

        async scheduleFilming(scriptId, scheduleText) {
          return scheduleAgentFilmingReminder({
            coachScriptId: scriptId,
            scheduleText,
          });
        },

        async downloadScript() {
          await options.onDownload();
        },

        async inspectScriptHealth() {
          options.onOpenHealth();
        },
      }),
    [
      options.onDownload,
      options.onOpenCarousel,
      options.onOpenHealth,
      options.onOpenHookOptions,
      options.onRefineWithInstruction,
      options.onRequestHookVariations,
      options.onSaveToMyScripts,
    ]
  );

  return useContentAgentConversationController({
    deps,
    context: { activeScriptId: options.scriptId },
    persistence: {
      enabled: true,
      restoreLatest: true,
      artifact: {
        kind: "reel",
        id: options.scriptId,
        title: options.title,
      },
    },
  });
}
