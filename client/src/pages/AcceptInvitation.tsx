import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { setCurrentWorkspaceId, trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useRoute } from "wouter";

export const PENDING_INVITATION_KEY = "spyreels:pendingInvitation";

type PageStatus =
  | "checking_auth"
  | "redirecting_login"
  | "accepting"
  | "joined"
  | "already_member"
  | "error_invalid"
  | "error_expired"
  | "error_email_mismatch"
  | "error_generic";

function classifyInvitationError(message: string): PageStatus {
  const lower = message.toLowerCase();
  if (lower.includes("not found")) return "error_invalid";
  if (lower.includes("expired")) return "error_expired";
  if (lower.includes("different email")) return "error_email_mismatch";
  return "error_generic";
}

function getWorkspaceDisplayName(name: string | undefined, isPersonal: boolean): string {
  if (isPersonal) return "Personal";
  return name?.trim() || "this workspace";
}

export default function AcceptInvitation() {
  const [, routeParams] = useRoute("/invitations/accept/:token");
  const token = routeParams?.token?.trim() ?? "";
  const { user, loading: authLoading, logout } = useAuth();
  const [status, setStatus] = useState<PageStatus>("checking_auth");
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const acceptStartedRef = useRef(false);
  const loginRedirectRef = useRef(false);

  const utils = trpc.useUtils();

  const acceptMutation = trpc.workspaces.acceptInvitation.useMutation({
    onSuccess: async data => {
      setCurrentWorkspaceId(data.workspaceId);
      try {
        const workspace = await utils.workspaces.getCurrent.fetch();
        setWorkspaceName(
          getWorkspaceDisplayName(workspace?.name, Boolean(workspace?.isPersonal))
        );
      } catch {
        setWorkspaceName("this workspace");
      }
      setStatus(data.alreadyMember ? "already_member" : "joined");
      window.setTimeout(() => {
        window.location.href = "/dashboard";
      }, 2000);
    },
    onError: error => {
      setErrorMessage(error.message);
      setStatus(classifyInvitationError(error.message));
    },
  });

  useEffect(() => {
    if (!token) {
      setStatus("error_invalid");
      setErrorMessage("This invitation link is invalid.");
      return;
    }

    if (authLoading) {
      setStatus("checking_auth");
      return;
    }

    if (!user) {
      if (loginRedirectRef.current) return;
      loginRedirectRef.current = true;
      setStatus("redirecting_login");
      try {
        sessionStorage.setItem(PENDING_INVITATION_KEY, token);
      } catch {
        // sessionStorage unavailable
      }
      const returnTo = `/invitations/accept/${encodeURIComponent(token)}`;
      window.location.href = getLoginUrl({ returnTo });
      return;
    }

    if (acceptStartedRef.current) return;
    acceptStartedRef.current = true;
    try {
      sessionStorage.removeItem(PENDING_INVITATION_KEY);
    } catch {
      // ignore
    }
    setStatus("accepting");
    acceptMutation.mutate({ token });
    // acceptMutation.mutate is stable; acceptStartedRef prevents duplicate calls
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, token]);

  const displayWorkspace = workspaceName ?? "this workspace";

  const title = (() => {
    switch (status) {
      case "checking_auth":
      case "redirecting_login":
      case "accepting":
        return "Accepting invitation...";
      case "joined":
        return `Welcome to ${displayWorkspace}!`;
      case "already_member":
        return "You're already in this workspace";
      case "error_invalid":
        return "Invalid invitation";
      case "error_expired":
        return "Invitation expired";
      case "error_email_mismatch":
        return "Wrong account";
      default:
        return "Something went wrong";
    }
  })();

  const description = (() => {
    switch (status) {
      case "checking_auth":
      case "redirecting_login":
        return "Please wait while we sign you in.";
      case "accepting":
        return "Setting up your workspace access.";
      case "joined":
        return `You've joined ${displayWorkspace}! Redirecting to your dashboard...`;
      case "already_member":
        return `You're already in ${displayWorkspace}. Redirecting to your dashboard...`;
      case "error_invalid":
        return errorMessage ?? "This invitation link is invalid or has already been used.";
      case "error_expired":
        return "This invitation has expired. Please ask the workspace owner to send a new one.";
      case "error_email_mismatch":
        return "This invitation is for a different email address. Sign in with the correct account to accept.";
      default:
        return errorMessage ?? "We could not accept this invitation. Please try again later.";
    }
  })();

  const isLoading =
    status === "checking_auth" ||
    status === "redirecting_login" ||
    status === "accepting";

  const isSuccess = status === "joined" || status === "already_member";

  const Icon = isSuccess ? CheckCircle2 : isLoading ? Mail : AlertCircle;
  const iconClass = cn(
    "h-12 w-12",
    isSuccess && "text-emerald-500",
    isLoading && "text-primary",
    !isSuccess && !isLoading && "text-destructive"
  );

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-xl p-8 shadow-lg text-center">
        <div className="flex justify-center mb-4">
          {isLoading ? (
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          ) : (
            <Icon className={iconClass} aria-hidden />
          )}
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-6">{description}</p>

        {status === "error_email_mismatch" ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => logout()}
          >
            Sign out
          </Button>
        ) : null}

        {!isLoading && !isSuccess ? (
          <Button asChild className="w-full">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        ) : null}

        {isSuccess ? (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>Redirecting...</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
