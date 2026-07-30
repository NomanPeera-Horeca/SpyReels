import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getLoginUrl } from "@/const";
import { signupAttributionBody } from "@/utils/utm-capture";

type AuthMode = "login" | "signup" | "forgot";

const DEFAULT_TITLE = "Welcome to SpyReels";
const DEFAULT_SUBTITLE = "Spy on viral Reels. Steal the script. Own the feed.";
const CONTEXT_SUBTITLE = "Free plan available. No credit card required.";

export function AuthDialog({
  open,
  onOpenChange,
  defaultMode = "login",
  headline,
  contextMessage,
  returnTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMode?: Exclude<AuthMode, "forgot">;
  /** Opus-style provocation line. Replaces the default Welcome title when set. */
  headline?: string;
  /** Optional secondary banner under the subtitle (legacy). Prefer `headline`. */
  contextMessage?: string;
  returnTo?: string;
}) {
  const [authMode, setAuthMode] = useState<AuthMode>(defaultMode);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [showAuthPassword, setShowAuthPassword] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAuthMode(defaultMode);
    setAuthError("");
  }, [defaultMode, open]);

  const handleGoogleLogin = () => {
    window.location.href = getLoginUrl({ returnTo: returnTo || undefined });
  };

  const handleEmailAuth = async () => {
    setAuthError("");
    setAuthLoading(true);
    try {
      const endpoint =
        authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        authMode === "signup"
          ? {
              email: authEmail,
              password: authPassword,
              name: authName,
              ...signupAttributionBody(),
            }
          : { email: authEmail, password: authPassword };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || "Something went wrong");
      } else {
        window.location.href = returnTo || "/";
      }
    } catch {
      setAuthError("Network error. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setAuthError("");
    setAuthLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail }),
      });
      if (res.ok) {
        setAuthError("Reset link sent! Check your email.");
      } else {
        setAuthError("Email not found.");
      }
    } catch {
      setAuthError("Network error. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  const title = headline?.trim() || DEFAULT_TITLE;
  const subtitle = headline?.trim() ? CONTEXT_SUBTITLE : DEFAULT_SUBTITLE;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-bold leading-snug">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="flex w-full flex-col items-center gap-4 py-2">
          <p className="text-center text-sm text-muted-foreground">{subtitle}</p>
          {!headline && contextMessage ? (
            <p className="w-full rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-center text-xs font-medium text-primary">
              {contextMessage}
            </p>
          ) : null}
          <button
            onClick={handleGoogleLogin}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-border px-6 py-3 font-medium transition-colors hover:bg-accent"
          >
            <img
              src="https://www.google.com/favicon.ico"
              alt="Google"
              className="h-5 w-5"
            />
            Continue with Google
          </button>
          <div className="flex w-full items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="mb-1 flex w-full gap-2">
            <button
              onClick={() => setAuthMode("login")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                authMode === "login"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => setAuthMode("signup")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                authMode === "signup"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign Up
            </button>
          </div>
          {authMode === "signup" && (
            <input
              type="text"
              placeholder="Your name"
              value={authName}
              onChange={(e) => setAuthName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}
          {authMode !== "forgot" && (
            <>
              <input
                type="email"
                placeholder="Email address"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="relative w-full">
                <input
                  type={showAuthPassword ? "text" : "password"}
                  placeholder="Password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowAuthPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                  aria-label={
                    showAuthPassword ? "Hide password" : "Show password"
                  }
                >
                  {showAuthPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {authError && <p className="w-full text-xs text-red-500">{authError}</p>}
              <button
                onClick={handleEmailAuth}
                disabled={authLoading}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {authLoading
                  ? "Please wait..."
                  : authMode === "login"
                    ? "Log In"
                    : "Create Account"}
              </button>
              {authMode === "login" && (
                <button
                  onClick={() => setAuthMode("forgot")}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Forgot password?
                </button>
              )}
            </>
          )}
          {authMode === "forgot" && (
            <div className="flex w-full flex-col gap-3">
              <input
                type="email"
                placeholder="Enter your email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {authError && <p className="w-full text-xs text-red-500">{authError}</p>}
              <button
                onClick={handleForgotPassword}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Send Reset Link
              </button>
              <button
                onClick={() => setAuthMode("login")}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Back to Login
              </button>
            </div>
          )}
          {!headline?.trim() ? (
            <p className="text-center text-xs text-muted-foreground">
              Free to start. No credit card required.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
