import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers";

export const CURRENT_WORKSPACE_ID_KEY = "spyreels:currentWorkspaceId";

export function getCurrentWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = localStorage.getItem(CURRENT_WORKSPACE_ID_KEY);
    return id?.trim() || null;
  } catch {
    return null;
  }
}

export function setCurrentWorkspaceId(workspaceId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CURRENT_WORKSPACE_ID_KEY, workspaceId);
  } catch {
    // localStorage unavailable (private mode, quota, etc.)
  }
}

export const trpc = createTRPCReact<AppRouter>();
