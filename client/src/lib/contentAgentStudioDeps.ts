import type {
  ContentAgentExecutionContext,
  ContentAgentExecutorDeps,
  ContentAgentToolResult,
} from "@shared/contentAgentExecutor";
import type {
  ContentAgentAction,
  SocialSourcePlatform,
} from "@shared/contentAgentTools";

export type ContentAgentStudioArtifact = {
  id?: number | null;
  title?: string | null;
};

export type ContentAgentStudioBindings = {
  createScript: (
    idea: string,
    options: { planCardId?: number }
  ) => Promise<ContentAgentStudioArtifact>;
  refineScript: (
    scriptId: number,
    instruction: string
  ) => Promise<ContentAgentStudioArtifact>;
  generateHookIdeas: (scriptId: number) => Promise<void>;
  loadPlanCard: (planCardId?: number) => Promise<{ title?: string | null }>;
  startRemake: (
    sourceUrl: string,
    platform?: SocialSourcePlatform
  ) => Promise<ContentAgentStudioArtifact | void>;
  convertExistingScript: (
    script: string
  ) => Promise<ContentAgentStudioArtifact>;
  openCarousel: (scriptId: number) => Promise<void> | void;
  saveScript: (
    scriptId: number
  ) => Promise<{ savedScriptId?: number | null; title?: string | null }>;
  scheduleFilming: (
    scriptId: number,
    scheduleText: string
  ) => Promise<
    | { status: "completed"; label: string }
    | { status: "requires_input"; question: string }
  >;
  downloadScript: (scriptId: number) => Promise<void> | void;
  inspectScriptHealth: (scriptId: number) => Promise<void> | void;
};

function inputText(context: ContentAgentExecutionContext): string {
  return context.inputText?.trim() ?? "";
}

function currentScriptId(action: ContentAgentAction): number {
  return action.scriptId as number;
}

function completed(
  message: string,
  artifact?: ContentAgentStudioArtifact
): ContentAgentToolResult {
  return {
    status: "completed",
    message,
    artifact: artifact?.id
      ? {
          kind: "reel",
          id: artifact.id,
          title: artifact.title ?? null,
        }
      : undefined,
  };
}

/**
 * Bind the formal Content Agent executor to the existing Studio workflows.
 *
 * This file intentionally does not reimplement generation, Remake, save, or
 * Carousel logic. The page supplies bindings to the already proven workflows.
 * The adapter only validates creator-level input and normalizes real outcomes
 * into ContentAgentToolResult values for the conversation layer.
 */
export function createContentAgentStudioDeps(
  bindings: ContentAgentStudioBindings
): ContentAgentExecutorDeps {
  return {
    async writeViralScript(action, context) {
      const idea = inputText(context);
      if (!idea) {
        return {
          status: "requires_input",
          message: "What do you want this Reel to be about?",
        };
      }
      const artifact = await bindings.createScript(idea, {
        planCardId: action.planCardId,
      });
      return completed("Reel created", artifact);
    },

    async refineScript(action, context) {
      const instruction = action.refineInstruction?.trim() || inputText(context);
      if (!instruction) {
        return {
          status: "requires_input",
          message: "What do you want me to change in this Reel?",
        };
      }
      const artifact = await bindings.refineScript(
        currentScriptId(action),
        instruction
      );
      return completed("Reel updated", artifact);
    },

    async generateHookIdeas(action) {
      await bindings.generateHookIdeas(currentScriptId(action));
      return { status: "completed", message: "Hook options ready" };
    },

    async loadPlanCard(action) {
      const plan = await bindings.loadPlanCard(action.planCardId);
      return {
        status: "completed",
        message: "Plan idea attached",
        detail: plan.title?.trim() || undefined,
      };
    },

    async remakeSocialVideo(action) {
      const artifact = await bindings.startRemake(
        action.sourceUrl as string,
        action.platform
      );
      return {
        status: "started",
        message: "Remake started",
        artifact: artifact?.id
          ? {
              kind: "reel",
              id: artifact.id,
              title: artifact.title ?? null,
            }
          : undefined,
      };
    },

    async convertExistingScript(_action, context) {
      const script = inputText(context);
      if (script.length < 20) {
        return {
          status: "requires_input",
          message: "Paste the script you want me to convert.",
        };
      }
      const artifact = await bindings.convertExistingScript(script);
      return completed("Script converted", artifact);
    },

    async createCarousel(action) {
      await bindings.openCarousel(currentScriptId(action));
      return { status: "started", message: "Opening Carousel Studio" };
    },

    async saveScript(action) {
      const saved = await bindings.saveScript(currentScriptId(action));
      return {
        status: "completed",
        message: "Saved to My Scripts",
        detail: saved.title?.trim() || undefined,
        artifact: saved.savedScriptId
          ? {
              kind: "script",
              id: saved.savedScriptId,
              title: saved.title ?? null,
            }
          : undefined,
      };
    },

    async scheduleFilming(action, context) {
      const scheduleText = action.scheduleText?.trim() || inputText(context);
      if (!scheduleText || /^schedule( this)?$/i.test(scheduleText)) {
        return {
          status: "requires_input",
          message: "When do you want to film this Reel?",
        };
      }

      const scheduled = await bindings.scheduleFilming(
        currentScriptId(action),
        scheduleText
      );
      if (scheduled.status === "requires_input") {
        return {
          status: "requires_input",
          message: scheduled.question,
        };
      }

      return {
        status: "completed",
        message: "Filming reminder set",
        detail: scheduled.label,
      };
    },

    async downloadScript(action) {
      await bindings.downloadScript(currentScriptId(action));
      return { status: "completed", message: "Downloaded branded script" };
    },

    async inspectScriptHealth(action) {
      await bindings.inspectScriptHealth(currentScriptId(action));
      return { status: "started", message: "Opening script health" };
    },
  };
}
