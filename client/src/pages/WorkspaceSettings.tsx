import { useAuth } from "@/_core/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Building2, Copy, Loader2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type RecentInvite = {
  email: string;
  acceptUrl: string;
};

type MemberRow = {
  userId: number;
  email: string | null;
  name: string | null;
  role: string;
  joinedAt: Date | string | null;
};

function formatRole(role: string): string {
  return role === "owner" ? "Owner" : "Member";
}

function formatJoinedDate(joinedAt: Date | string | null): string {
  if (!joinedAt) return "Joined recently";
  const date = joinedAt instanceof Date ? joinedAt : new Date(joinedAt);
  if (Number.isNaN(date.getTime())) return "Joined recently";
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
  return `Joined ${formatted}`;
}

function getDisplayName(member: MemberRow): string {
  const trimmed = member.name?.trim();
  if (trimmed) return trimmed;
  return member.email ?? "Unknown member";
}

function getWorkspaceTitle(name: string, isPersonal: boolean): string {
  return isPersonal ? "Personal" : name;
}

async function copyInviteLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  } catch {
    toast.error("Failed to copy link");
  }
}

export default function WorkspaceSettings() {
  const { user } = useAuth();
  const [inviteEmail, setInviteEmail] = useState("");
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);
  const [recentInvites, setRecentInvites] = useState<RecentInvite[]>([]);
  const [memberToRemove, setMemberToRemove] = useState<MemberRow | null>(null);

  const workspaceQuery = trpc.workspaces.getCurrent.useQuery();
  const membersQuery = trpc.workspaces.listMembers.useQuery();

  const utils = trpc.useUtils();

  const removeMemberMutation = trpc.workspaces.removeMember.useMutation({
    onSuccess: async () => {
      toast.success("Member removed");
      setMemberToRemove(null);
      await utils.workspaces.listMembers.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const inviteMutation = trpc.workspaces.invite.useMutation({
    onSuccess: data => {
      const email = inviteEmail.trim().toLowerCase();
      toast.success("Invitation created");
      setLatestInviteUrl(data.acceptUrl);
      setRecentInvites(prev => {
        const next = [{ email, acceptUrl: data.acceptUrl }, ...prev];
        return next.slice(0, 5);
      });
      setInviteEmail("");
    },
    onError: error => toast.error(error.message),
  });

  const workspace = workspaceQuery.data;
  const members = membersQuery.data ?? [];
  const isOwner = workspace?.role === "owner";
  const isPersonal = workspace?.isPersonal === true;

  const ownerCount = useMemo(
    () => members.filter(member => member.role === "owner").length,
    [members]
  );

  const canRemoveMember = (member: MemberRow): boolean => {
    if (!isOwner || !user) return false;
    if (member.userId === user.id && member.role === "owner" && ownerCount <= 1) {
      return false;
    }
    return true;
  };

  const handleInviteSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const email = inviteEmail.trim();
    if (!email) {
      toast.error("Please enter an email address");
      return;
    }
    inviteMutation.mutate({ email });
  };

  const handleConfirmRemove = () => {
    if (!memberToRemove) return;
    removeMemberMutation.mutate({ userId: memberToRemove.userId });
  };

  const isPageLoading = workspaceQuery.isLoading || membersQuery.isLoading;

  if (isPageLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (workspaceQuery.isError || !workspace) {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="text-sm text-destructive">
          {workspaceQuery.error?.message ?? "Unable to load workspace."}
        </p>
      </div>
    );
  }

  const workspaceTitle = getWorkspaceTitle(workspace.name, workspace.isPersonal);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Building2 className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Workspace settings
        </h1>
      </div>

      <section className="rounded-lg border border-border/50 bg-card p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">
          Workspace info
        </h2>
        <p className="text-2xl font-semibold tracking-tight text-foreground">
          {workspaceTitle}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {isPersonal ? "Personal workspace" : "Team workspace"}
        </p>
      </section>

      <section className="rounded-lg border border-border/50 bg-card p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">
          {isPersonal ? "Your workspace" : `Members (${members.length})`}
        </h2>

        {isPersonal ? (
          <p className="text-sm text-muted-foreground">
            This is your personal workspace. It is just for you. Create a team
            workspace from the sidebar switcher to collaborate with others.
          </p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members yet</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {members.map(member => (
              <li
                key={member.userId}
                className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      {getDisplayName(member)}
                    </p>
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {formatRole(member.role)}
                    </Badge>
                  </div>
                  {member.email ? (
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">
                      {member.email}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatJoinedDate(member.joinedAt)}
                  </p>
                </div>
                {canRemoveMember(member) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 self-start sm:self-center"
                    onClick={() => setMemberToRemove(member)}
                  >
                    Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOwner && !isPersonal ? (
        <section className="rounded-lg border border-border/50 bg-card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Invite people</h2>
          <p className="text-xs text-muted-foreground">
            Invite teammates by email. They will join using the link below.
          </p>

          <form onSubmit={handleInviteSubmit} className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 space-y-2">
              <Label htmlFor="invite-email" className="sr-only">
                Email address
              </Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="teammate@example.com"
                value={inviteEmail}
                disabled={inviteMutation.isPending}
                onChange={event => setInviteEmail(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={inviteMutation.isPending}
              className="shrink-0"
            >
              {inviteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send invite"
              )}
            </Button>
          </form>

          {latestInviteUrl ? (
            <div className="space-y-2 rounded-md border border-border/50 bg-muted/30 p-3">
              <p className="text-xs font-medium text-foreground">
                Invitation link
              </p>
              <p className="break-all text-xs text-muted-foreground">
                {latestInviteUrl}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1.5"
                onClick={() => copyInviteLink(latestInviteUrl)}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy link
              </Button>
            </div>
          ) : null}

          {recentInvites.length > 0 ? (
            <div className="space-y-3 pt-2 border-t border-border/50">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  Recent invites
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Send these links to your teammates manually for now.
              </p>
              <ul className="space-y-2">
                {recentInvites.map(invite => (
                  <li
                    key={`${invite.email}-${invite.acceptUrl}`}
                    className="flex flex-col gap-2 rounded-md border border-border/50 bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-sm text-foreground truncate">
                      {invite.email}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 shrink-0"
                      onClick={() => copyInviteLink(invite.acceptUrl)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy link
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <AlertDialog
        open={memberToRemove !== null}
        onOpenChange={open => {
          if (!open) setMemberToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              {memberToRemove
                ? `${getDisplayName(memberToRemove)} will lose access to this workspace.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMemberMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                removeMemberMutation.isPending && "pointer-events-none opacity-50"
              )}
              onClick={event => {
                event.preventDefault();
                handleConfirmRemove();
              }}
            >
              {removeMemberMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
