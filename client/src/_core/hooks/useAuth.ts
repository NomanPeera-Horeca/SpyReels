import { getLoginUrl } from "@/const";
import { identifyClarityUser } from "@/lib/clarity";
import { identifyLogRocketUser } from "@/lib/logrocket";
import { redirectSignedOutToMarketing } from "@/lib/marketingOrigin";
import { maybeCaptureSignupCompleted } from "@/lib/trackSignupCompleted";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import posthog from "posthog-js";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: (failureCount, error) => {
      const httpStatus = (error as { data?: { httpStatus?: number } })?.data
        ?.httpStatus;
      if (httpStatus === 401 || httpStatus === 403) return false;
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 2000),
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    if (import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN) {
      posthog.capture("user_signed_out");
      posthog.reset();
    }
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
      // App host must not fall back to the retired Vite marketing page.
      redirectSignedOutToMarketing();
    }
  }, [logoutMutation, utils]);

  useEffect(() => {
    const user = meQuery.data;
    if (!user) return;
    if (import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN) {
      posthog.identify(String(user.id), {
        email: user.email ?? undefined,
        name: user.name ?? undefined,
      });
      maybeCaptureSignupCompleted(user);
    }
    if (import.meta.env.VITE_PUBLIC_CLARITY_PROJECT_ID) {
      identifyClarityUser(String(user.id), user.name ?? user.email ?? null);
    }
    if (import.meta.env.VITE_PUBLIC_LOGROCKET_APP_ID) {
      identifyLogRocketUser(String(user.id), {
        name: user.name,
        email: user.email,
      });
    }
  }, [
    meQuery.data?.id,
    meQuery.data?.email,
    meQuery.data?.name,
    meQuery.data?.loginMethod,
    meQuery.data?.createdAt,
  ]);

  const state = useMemo(() => {
    localStorage.setItem(
      "manus-runtime-user-info",
      JSON.stringify(meQuery.data)
    );
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
