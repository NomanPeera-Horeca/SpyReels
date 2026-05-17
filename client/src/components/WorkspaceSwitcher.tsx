import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { OPEN_CREATE_WORKSPACE_MODAL_EVENT } from "@/components/CreateWorkspaceModal";
import {
  getCurrentWorkspaceId,
  setCurrentWorkspaceId,
  trpc,
} from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Building2, Check, ChevronDown, Plus, Settings } from "lucide-react";
import { useMemo } from "react";
import { useLocation } from "wouter";

type WorkspaceRow = {
  id: string;
  name: string;
  isPersonal: boolean;
  role: string;
};

function formatRole(role: string): string {
  return role === "owner" ? "Owner" : "Member";
}

function getWorkspaceDisplayName(
  workspace: WorkspaceRow,
  options?: { personalOnlyAccount?: boolean }
): string {
  if (workspace.isPersonal) {
    return options?.personalOnlyAccount ? "Personal (you)" : "Personal";
  }
  return workspace.name;
}

function resolveCurrentWorkspaceId(
  workspaces: WorkspaceRow[] | undefined,
  storedId: string | null
): string | null {
  if (!workspaces?.length) return null;
  if (storedId && workspaces.some(w => w.id === storedId)) {
    return storedId;
  }
  return workspaces.find(w => w.isPersonal)?.id ?? workspaces[0].id;
}

export function WorkspaceSwitcher() {
  const { state } = useSidebar();
  const [, setLocation] = useLocation();
  const isCollapsed = state === "collapsed";
  const storedWorkspaceId = getCurrentWorkspaceId();

  const { data: workspaces, isLoading, isError } = trpc.workspaces.list.useQuery(
    undefined,
    {
      retry: 1,
    }
  );

  const personalOnlyAccount =
    (workspaces?.length ?? 0) === 1 && workspaces?.[0]?.isPersonal === true;

  const currentWorkspaceId = useMemo(
    () => resolveCurrentWorkspaceId(workspaces, storedWorkspaceId),
    [workspaces, storedWorkspaceId]
  );

  const currentWorkspace = workspaces?.find(w => w.id === currentWorkspaceId);

  const triggerLabel = (() => {
    if (isLoading) return "Loading...";
    if (isError || !workspaces?.length) return "Personal";
    if (currentWorkspace) {
      return getWorkspaceDisplayName(currentWorkspace, { personalOnlyAccount });
    }
    return "Personal";
  })();

  const handleSelectWorkspace = (workspaceId: string) => {
    if (workspaceId === currentWorkspaceId) return;
    setCurrentWorkspaceId(workspaceId);
    window.location.reload();
  };

  const handleOpenCreateModal = () => {
    window.dispatchEvent(new Event(OPEN_CREATE_WORKSPACE_MODAL_EVENT));
  };

  const triggerButton = (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors",
        "hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
      )}
      aria-label="Switch workspace"
      title={isCollapsed ? triggerLabel : undefined}
    >
      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-medium text-foreground",
          "group-data-[collapsible=icon]:hidden"
        )}
      >
        {triggerLabel}
      </span>
      <ChevronDown
        className={cn(
          "h-4 w-4 shrink-0 text-muted-foreground",
          "group-data-[collapsible=icon]:hidden"
        )}
      />
    </button>
  );

  return (
    <div className="border-b border-border px-2 py-2 group-data-[collapsible=icon]:px-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={isLoading}>
          {triggerButton}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side={isCollapsed ? "right" : "bottom"}
          className="w-64"
        >
          {isLoading ? (
            <DropdownMenuItem disabled className="text-muted-foreground">
              Loading...
            </DropdownMenuItem>
          ) : isError || !workspaces?.length ? (
            <DropdownMenuItem disabled className="text-muted-foreground">
              Personal
            </DropdownMenuItem>
          ) : (
            workspaces.map(workspace => {
              const isCurrent = workspace.id === currentWorkspaceId;
              const displayName = getWorkspaceDisplayName(workspace, {
                personalOnlyAccount,
              });
              return (
                <DropdownMenuItem
                  key={workspace.id}
                  className={cn(
                    "cursor-pointer items-center justify-between gap-2",
                    isCurrent && "bg-accent/50"
                  )}
                  onSelect={() => handleSelectWorkspace(workspace.id)}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      {isCurrent ? (
                        <Check className="h-4 w-4 text-primary" />
                      ) : null}
                    </span>
                    <span className="truncate">{displayName}</span>
                  </span>
                  <Badge
                    variant="secondary"
                    className="h-5 shrink-0 px-1.5 py-0 text-[10px] font-normal"
                  >
                    {formatRole(workspace.role)}
                  </Badge>
                </DropdownMenuItem>
              );
            })
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer gap-2"
            onSelect={() => setLocation("/workspace/settings")}
          >
            <Settings className="h-4 w-4" />
            <span>Workspace settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer gap-2"
            onSelect={event => {
              event.preventDefault();
              handleOpenCreateModal();
            }}
          >
            <Plus className="h-4 w-4" />
            <span>Create new workspace</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
