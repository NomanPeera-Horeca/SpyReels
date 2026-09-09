import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLibraryRemakeChain } from "@/hooks/useLibraryRemakeChain";
import { ingestUrlAndStartLibraryRemake } from "@/lib/ingestUrlAndStartLibraryRemake";
import { useContentAgentExecutor } from "@/hooks/useContentAgentExecutor";
import { scheduleAgentFilmingReminder } from "@/lib/filmingReminderApi";
import { buildCarouselGenerateHref } from "@/components/carousel-studio/carouselsHub";
import { flattenCoachScriptForCopy } from "@shared/coachScriptSections";
import { splitContentAgentRequest } from "@shared/contentAgentMultiStep";
import type {
  ContentAgentExecutionContext,
  ContentAgentExecutorDeps,
  ContentAgentToolResult,
} from "@shared/contentAgentExecutor";
import type {
  ContentAgentAction,
  SocialSourcePlatform,
} from "@shared/contentAgentTools";

const REMAKE_WAIT_MS = 240_000;
const REMAKE_POLL_MS = 300;

export type AiCoachCommandAgentControllerOptions = {
  description: string;
  attachedPlanCardId?: number | null;
  onDescriptionChange: (value: string) => void;
  onWriteIdea: (idea: string) => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function started(message: string): ContentAgentToolResult {
  return { status: "started", message };
}

function unavailable(message: string): ContentAgentToolResult {
  return { status: "requires_input", message };
}

function remakePlatformLabel(
  platform?: SocialSourcePlatform
): "Instagram Reel" | "TikTok video" | "YouTube Short" | undefined {
  if (platform === "instagram") return "Instagram Reel";
  if (platform === "tiktok") return "TikTok video";
  if (platform === "youtube") return "YouTube Short";
  return undefined;
}

/**
 * Live binding for the Agent landing composer.
 *
 * The shared Agent router decides what the creator is asking for. Existing
 * SpyReels workflows still do the actual work. Multi-step creator requests are
 * bounded by the shared planner and each completed Reel becomes context for the
 * next action, so a public social URL can be remade and then repurposed without
 * teaching the creator how SpyReels is wired internally.
 */
export function useAiCoachCommandAgentController(
  options: AiCoachCommandAgentControllerOptions
) {
  const trpcUtils = trpc.useUtils();
  const addByUrlMutation = trpc.collected.addByUrl.useMutation();
  const convertRoughMutation = trpc.studio.convertRough.useMutation();
  const importRemakeMutation = trpc.studio.importRemake.useMutation();
  const refineMutation = trpc.studio.refine.useMutation();
  const hookVariationsMutation = trpc.studio.hookVariations.useMutation();
  const saveToLibraryMutation = trpc.studio.saveToLibrary.useMutation();
  const [executing, setExecuting] = useState(false);
  const {
    startRemake,
    getRemakeState,
    RemakeDialogs,
  } = useLibraryRemakeChain();
  const getRemakeStateRef = useRef(getRemakeState);
  getRemakeStateRef.current = getRemakeState;

  const waitForRemakeReady = async (remakeKey: string) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < REMAKE_WAIT_MS) {
      const state = getRemakeStateRef.current(remakeKey);
      if (state.stage === "ready" && state.scriptId) return state;
      if (state.stage === "error") {
        throw new Error(
          state.errorMessage?.trim() || "The remake could not be completed. Try again."
        );
      }
      if (state.stage === "inspiration") {
        throw new Error(
          state.classificationReason?.trim() ||
            "This video is better suited for inspiration than a spoken-script remake."
        );
      }
      await sleep(REMAKE_POLL_MS);
    }
    throw new Error("The remake is taking longer than expected. You can reopen it from Collected Reels.");
  };

  const deps = useMemo<ContentAgentExecutorDeps>(() => ({
    async writeViralScript(_action: ContentAgentAction, context: ContentAgentExecutionContext) {
      const idea = context.inputText?.trim() || options.description.trim();
      if (!idea) return unavailable("What do you want this Reel to be about?");
      options.onWriteIdea(idea);
      return started("Writing your Reel");
    },

    async refineScript(action, context) {
      const scriptId = action.scriptId;
      const instruction = action.refineInstruction?.trim() || context.inputText?.trim();
      if (!scriptId) return unavailable("Open a Reel first, then tell Agent what you want changed.");
      if (!instruction) return unavailable("What do you want me to change in this Reel?");
      const refined = await refineMutation.mutateAsync({ id: scriptId, instruction });
      return {
        status: "completed",
        message: "Reel updated",
        artifact: {
          kind: "reel",
          id: refined.id,
          title: refined.title ?? null,
        },
      };
    },

    async generateHookIdeas(action) {
      if (!action.scriptId) return unavailable("Open a Reel first, then ask Agent for hook options.");
      await hookVariationsMutation.mutateAsync({ id: action.scriptId });
      return { status: "completed", message: "Hook options ready" };
    },

    async loadPlanCard(_action, context) {
      const idea = context.inputText?.trim() || options.description.trim();
      if (!idea) return unavailable("Choose a plan idea first.");
      options.onWriteIdea(idea);
      return started("Using your plan idea");
    },

    async remakeSocialVideo(action) {
      const sourceUrl = action.sourceUrl?.trim();
      if (!sourceUrl) {
        return unavailable("Paste the Instagram, TikTok, or YouTube link you want me to remake.");
      }

      const ingested = await ingestUrlAndStartLibraryRemake(sourceUrl, {
        addByUrl: async (url) => {
          const added = await addByUrlMutation.mutateAsync({ url });
          await trpcUtils.collected.list.invalidate();
          return { id: added.id, duplicate: added.duplicate };
        },
        fetchCollectedList: () =>
          trpcUtils.collected.list.fetch(undefined, { staleTime: 0 }),
        startRemake,
      });

      const ready = await waitForRemakeReady(ingested.remakeKey);
      const savedScript = await trpcUtils.scripts.get.fetch(
        { id: ready.scriptId! },
        { staleTime: 0 }
      );
      const flatScript = savedScript.content?.trim() ?? "";
      if (flatScript.length < 20) {
        throw new Error("The remake finished without usable script content. Try again.");
      }

      const imported = await importRemakeMutation.mutateAsync({
        script: flatScript,
        title: savedScript.title?.trim() || undefined,
        platformLabel: remakePlatformLabel(action.platform),
      });
      options.onDescriptionChange("");
      return {
        status: "completed",
        message: "Remake ready",
        artifact: {
          kind: "reel",
          id: imported.id,
          title: imported.title ?? null,
        },
      };
    },

    async convertExistingScript(_action, context) {
      const roughScript = context.inputText?.trim() ?? "";
      if (roughScript.length < 20) {
        return unavailable("Paste the script you want me to convert.");
      }
      if (roughScript.length > 12_000) {
        return unavailable("That script is too long. Keep it under 12,000 characters.");
      }

      const converted = await convertRoughMutation.mutateAsync({ roughScript });
      options.onDescriptionChange("");
      return {
        status: "completed",
        message: "Script converted",
        artifact: {
          kind: "reel",
          id: converted.id,
          title: converted.title ?? null,
        },
      };
    },

    async createCarousel(action) {
      if (!action.scriptId) {
        return unavailable("Open a Reel first, then ask Agent to turn it into a carousel.");
      }
      const script = await trpcUtils.studio.get.fetch(
        { id: action.scriptId },
        { staleTime: 0 }
      );
      const text = flattenCoachScriptForCopy({
        title: script.title,
        hook: script.hook,
        sections: {
          explain: script.explain,
          illustrate: script.illustrate,
          teach: script.teach,
          cta: script.cta,
        },
        userFriendly: true,
      });
      window.location.assign(buildCarouselGenerateHref(text));
      return started("Opening Carousel Studio");
    },

    async saveScript(action) {
      if (!action.scriptId) {
        return unavailable("Open a Reel first, then ask Agent to save it.");
      }
      const saved = await saveToLibraryMutation.mutateAsync({
        id: action.scriptId,
        addToCalendar: false,
      });
      return {
        status: "completed",
        message: "Saved to My Scripts",
        artifact: saved.savedScriptId
          ? { kind: "script", id: saved.savedScriptId }
          : undefined,
      };
    },

    async scheduleFilming(action, context) {
      if (!action.scriptId) {
        return unavailable("Open a Reel first, then tell Agent when and where you want to film it.");
      }
      const scheduleText = action.scheduleText?.trim() || context.inputText?.trim() || "";
      if (!scheduleText) return unavailable("When do you want to film this Reel?");
      const scheduled = await scheduleAgentFilmingReminder({
        coachScriptId: action.scriptId,
        scheduleText,
      });
      if (scheduled.status === "requires_input") {
        return unavailable(scheduled.question);
      }
      return {
        status: "completed",
        message: "Filming reminder set",
        detail: scheduled.label,
      };
    },

    async downloadScript() {
      return unavailable("Open the finished Reel, then ask Agent to download it.");
    },

    async inspectScriptHealth(action) {
      if (!action.scriptId) {
        return unavailable("Open a Reel first, then ask Agent to check its script health.");
      }
      window.location.assign(`/studio?script=${action.scriptId}`);
      return started("Opening script health");
    },
  }), [
    addByUrlMutation,
    convertRoughMutation,
    hookVariationsMutation,
    importRemakeMutation,
    options,
    refineMutation,
    saveToLibraryMutation,
    startRemake,
    trpcUtils.collected.list,
    trpcUtils.scripts.get,
    trpcUtils.studio.get,
  ]);

  const agent = useContentAgentExecutor(deps);

  const submit = async (): Promise<void> => {
    const input = options.description.trim();
    if (!input || executing) return;

    setExecuting(true);
    try {
      const segments = splitContentAgentRequest(input);
      let activeScriptId: number | null = null;
      let finalResult: ContentAgentToolResult | null = null;

      for (const segment of segments) {
        const action = await agent.resolveMessage(segment.text, {
          activeScriptId,
          attachedPlanCardId: options.attachedPlanCardId ?? null,
        });
        const result = await agent.executeAction(action, { inputText: segment.text });
        finalResult = result;

        if (result.status === "requires_input") {
          if (result.message) toast.message(result.message);
          return;
        }
        if (result.status === "failed") {
          throw new Error(result.message || "Agent could not complete that step.");
        }
        if (result.artifact?.kind === "reel" && result.artifact.id) {
          activeScriptId = result.artifact.id;
        }

        // New-idea generation stays on the existing Studio progress flow. It is
        // asynchronous and will mount the finished artifact when generation ends.
        if (action.tool === "write_viral_script" || action.tool === "load_plan_card") {
          return;
        }

        // Carousel navigation is the terminal handoff to the existing editor.
        if (action.tool === "create_carousel") return;
      }

      if (
        finalResult?.status === "completed" &&
        activeScriptId &&
        window.location.pathname.includes("/studio")
      ) {
        window.location.assign(`/studio?script=${activeScriptId}`);
      }
    } catch (error) {
      toast.error(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Agent could not start that request. Try again."
      );
    } finally {
      setExecuting(false);
    }
  };

  return {
    submit,
    isBusy:
      executing ||
      agent.isRouting ||
      addByUrlMutation.isPending ||
      convertRoughMutation.isPending ||
      importRemakeMutation.isPending ||
      refineMutation.isPending ||
      hookVariationsMutation.isPending ||
      saveToLibraryMutation.isPending,
    RemakeDialogs,
  };
}
