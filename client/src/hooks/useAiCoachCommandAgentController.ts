import { useMemo } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLibraryRemakeChain } from "@/hooks/useLibraryRemakeChain";
import { ingestUrlAndStartLibraryRemake } from "@/lib/ingestUrlAndStartLibraryRemake";
import { useContentAgentExecutor } from "@/hooks/useContentAgentExecutor";
import type {
  ContentAgentExecutionContext,
  ContentAgentExecutorDeps,
  ContentAgentToolResult,
} from "@shared/contentAgentExecutor";
import type { ContentAgentAction } from "@shared/contentAgentTools";

export type AiCoachCommandAgentControllerOptions = {
  description: string;
  attachedPlanCardId?: number | null;
  onDescriptionChange: (value: string) => void;
  onWriteIdea: () => void;
};

function started(message: string): ContentAgentToolResult {
  return { status: "started", message };
}

function unavailable(message: string): ContentAgentToolResult {
  return { status: "requires_input", message };
}

/**
 * Live binding for the Agent landing composer.
 *
 * The shared Agent router decides whether the creator supplied a new idea, a
 * pasted script, or a public social URL. Existing SpyReels workflows still do
 * the real work. This removes duplicate intent rules from the UI while keeping
 * the proven generation, conversion, and Remake pipelines intact.
 */
export function useAiCoachCommandAgentController(
  options: AiCoachCommandAgentControllerOptions
) {
  const trpcUtils = trpc.useUtils();
  const addByUrlMutation = trpc.collected.addByUrl.useMutation();
  const convertRoughMutation = trpc.studio.convertRough.useMutation();
  const { startRemake, RemakeDialogs } = useLibraryRemakeChain();

  const deps = useMemo<ContentAgentExecutorDeps>(() => ({
    async writeViralScript(_action: ContentAgentAction, _context: ContentAgentExecutionContext) {
      options.onWriteIdea();
      return started("Writing your Reel");
    },

    async refineScript() {
      return unavailable("Open a Reel first, then tell Agent what you want changed.");
    },

    async generateHookIdeas() {
      return unavailable("Open a Reel first, then ask Agent for hook options.");
    },

    async loadPlanCard() {
      options.onWriteIdea();
      return started("Using your plan idea");
    },

    async remakeSocialVideo(action) {
      const sourceUrl = action.sourceUrl?.trim();
      if (!sourceUrl) {
        return unavailable("Paste the Instagram, TikTok, or YouTube link you want me to remake.");
      }

      await ingestUrlAndStartLibraryRemake(sourceUrl, {
        addByUrl: async (url) => {
          const added = await addByUrlMutation.mutateAsync({ url });
          await trpcUtils.collected.list.invalidate();
          return { id: added.id, duplicate: added.duplicate };
        },
        fetchCollectedList: () =>
          trpcUtils.collected.list.fetch(undefined, { staleTime: 0 }),
        startRemake,
      });
      options.onDescriptionChange("");
      return started("Remake started");
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
      window.location.assign(`/studio?script=${converted.id}`);
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

    async createCarousel() {
      return unavailable("Open a Reel first, then ask Agent to turn it into a carousel.");
    },

    async saveScript() {
      return unavailable("Open a Reel first, then ask Agent to save it.");
    },

    async scheduleFilming() {
      return unavailable("Open a Reel first, then tell Agent when and where you want to film it.");
    },

    async downloadScript() {
      return unavailable("Open a Reel first, then ask Agent to download it.");
    },

    async inspectScriptHealth() {
      return unavailable("Open a Reel first, then ask Agent to check its script health.");
    },
  }), [
    addByUrlMutation,
    convertRoughMutation,
    options,
    startRemake,
    trpcUtils.collected.list,
  ]);

  const agent = useContentAgentExecutor(deps);

  const submit = async (): Promise<void> => {
    const input = options.description.trim();
    if (!input) return;

    try {
      const action = await agent.resolveMessage(input, {
        activeScriptId: null,
        attachedPlanCardId: options.attachedPlanCardId ?? null,
      });
      const result = await agent.executeAction(action, { inputText: input });
      if (result.status === "requires_input" && result.message) {
        toast.message(result.message);
      }
    } catch (error) {
      toast.error(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Agent could not start that request. Try again."
      );
    }
  };

  return {
    submit,
    isBusy:
      agent.isRouting ||
      addByUrlMutation.isPending ||
      convertRoughMutation.isPending,
    RemakeDialogs,
  };
}
