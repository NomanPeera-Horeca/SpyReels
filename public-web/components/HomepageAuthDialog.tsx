"use client";

import { useEffect, useState } from "react";
import {
  signupHeadlineForCreator,
  type ResearchIntentPlatform,
} from "../../shared/researchIntent";
import { resolvePublicAppOrigin } from "../lib/appOrigin";
import styles from "./HomepageAuthDialog.module.css";

type AuthMode = "login" | "signup" | "forgot";

const TESTIMONIALS = [
  {
    quote:
      "I used to spend 3 hours a day scrolling trying to find what was trending. Now I open SpyReels, pick a viral outlier, and ship by lunch.",
    name: "Maya Chen",
    meta: "@mayamakes",
    color: "#7c3aed",
    avatarSrc: "/marketing/17d74cf5b9b4.webp",
  },
  {
    quote:
      "Honestly skeptical at first. Two weeks in I remade a Reel that booked a brand deal. Paid for itself many times over.",
    name: "Priya Sharma",
    meta: "@priyacooks",
    color: "#0d9488",
    avatarSrc: "/marketing/f4f2be43966c.webp",
  },
  {
    quote:
      "Pitched a client using spy + remake insights. Closed a retainer the next week. The data tells a story execs actually care about.",
    name: "Rafael Mendes",
    meta: "Senior Strategist, Pivot Co.",
    color: "#2563eb",
    avatarSrc: "/marketing/ceff676b111f.webp",
  },
  {
    quote:
      "Our team finally stopped pitching vague trend decks. We walk in with examples, transcripts, and proof of traction.",
    name: "Jordan Reyes",
    meta: "Head of Social, Northline",
    color: "#db2777",
    avatarSrc: "/marketing/3e709ab99b48.webp",
  },
  {
    quote:
      "The hook breakdowns alone changed how I script. I stopped rambling in the first five seconds.",
    name: "Nina Flores",
    meta: "@ninacuts",
    color: "#ea580c",
    avatarSrc: "/marketing/e1740faf9a91.webp",
  },
  {
    quote:
      "I used to save random videos and forget why they worked. Now every example comes with a reason I can apply on camera.",
    name: "Sofia Lane",
    meta: "@sofiamoves",
    color: "#4f46e5",
    avatarSrc: "/marketing/10be69f1cbcb.webp",
  },
] as const;

const TESTIMONIALS_LOOP = [...TESTIMONIALS, ...TESTIMONIALS];

function googleAuthUrl(returnTo?: string): string {
  const payload = {
    v: 1 as const,
    utm: {},
    returnTo: returnTo && returnTo.startsWith("/") ? returnTo : null,
    firstReferrer: typeof document !== "undefined" ? document.referrer || null : null,
  };
  const state = btoa(JSON.stringify(payload));
  const path = `/api/auth/google?state=${encodeURIComponent(state)}`;
  const origin = resolvePublicAppOrigin({
    hostname: typeof window !== "undefined" ? window.location.hostname : null,
  });
  if (
    typeof window !== "undefined" &&
    origin &&
    origin !== window.location.origin
  ) {
    return `${origin}${path}`;
  }
  return path;
}

function signupAttributionBody() {
  return {
    attribution: {
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
      firstReferrer: typeof document !== "undefined" ? document.referrer || null : null,
    },
  };
}

export type AuthDialogCloseMeta = {
  reason: "x" | "backdrop" | "esc";
};

export function HomepageAuthDialog({
  open,
  onOpenChange,
  defaultMode = "signup",
  returnTo = "/research",
  creatorHandle = null,
  creatorPlatform = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean, meta?: AuthDialogCloseMeta) => void;
  defaultMode?: Exclude<AuthMode, "forgot">;
  returnTo?: string;
  creatorHandle?: string | null;
  creatorPlatform?: ResearchIntentPlatform | null;
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

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false, { reason: "esc" });
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onOpenChange, open]);

  if (!open) return null;

  const isForgot = authMode === "forgot";
  const isSignup = authMode === "signup";
  const isLogin = authMode === "login";

  const title = isForgot
    ? "Reset your password"
    : isSignup
      ? signupHeadlineForCreator(creatorHandle, creatorPlatform)
      : "Welcome back";
  const subtitle = isForgot
    ? "Enter your email and we will send a reset link."
    : isSignup
      ? creatorHandle
        ? "Continue with Google for the fastest path, or use email. You will land on that creator right after."
        : "Spy trending creators, preview viral videos, and remake scripts in your voice - all in one place."
      : "Log in to keep spying viral videos and remaking scripts in your voice.";
  const eyebrow = isForgot ? "Password reset" : isSignup ? "Create your free account" : "Welcome back";
  const submitLabel = authLoading
    ? "Please wait..."
    : isForgot
      ? "Send reset link"
      : isLogin
        ? "Log in"
        : "Create account";

  async function handleEmailAuth() {
    setAuthError("");
    setAuthLoading(true);
    try {
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const resolvedName = authName.trim() || authEmail.split("@")[0]?.trim() || "Creator";
      const body =
        authMode === "signup"
          ? {
              email: authEmail,
              password: authPassword,
              name: resolvedName,
              ...signupAttributionBody(),
            }
          : { email: authEmail, password: authPassword };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setAuthError(data.error || "Something went wrong");
      } else {
        const path =
          returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
            ? returnTo
            : "/research";
        const productOrigin = resolvePublicAppOrigin({
          hostname: window.location.hostname,
        });
        window.location.href = `${productOrigin}${path}`;
      }
    } catch {
      setAuthError("Network error. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleForgotPassword() {
    setAuthError("");
    setAuthLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail }),
      });
      setAuthError(res.ok ? "Reset link sent! Check your email." : "Email not found.");
    } catch {
      setAuthError("Network error. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  }

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false, { reason: "backdrop" });
        }
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="homepage-auth-title"
      >
        <button
          type="button"
          className={styles.close}
          aria-label="Close"
          onClick={() => onOpenChange(false, { reason: "x" })}
        >
          ×
        </button>

        <div className={styles.formPane}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h2 id="homepage-auth-title" className={styles.title}>
            {title}
          </h2>
          <p className={styles.subtitle}>{subtitle}</p>

          {!isForgot ? (
            <>
              <button
                type="button"
                className={`${styles.google} ${styles.googlePrimary}`}
                onClick={() => {
                  window.location.href = googleAuthUrl(returnTo);
                }}
              >
                <img src="https://www.google.com/favicon.ico" alt="" />
                Continue with Google
              </button>
              <div className={styles.divider} aria-hidden="true">
                <span>OR EMAIL</span>
              </div>
            </>
          ) : null}

          {isSignup ? (
            <label className={styles.label}>
              <span>Name (optional)</span>
              <input
                className={styles.input}
                type="text"
                placeholder="Your name"
                value={authName}
                onChange={(event) => setAuthName(event.target.value)}
                autoComplete="name"
              />
            </label>
          ) : null}

          <label className={styles.label}>
            <span>Email</span>
            <input
              className={styles.input}
              type="email"
              placeholder="you@example.com"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              autoComplete="email"
            />
          </label>

          {!isForgot ? (
            <label className={styles.label}>
              <span>Password</span>
              <div className={styles.passwordWrap}>
                <input
                  type={showAuthPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                />
                <button
                  type="button"
                  className={styles.togglePassword}
                  aria-label={showAuthPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowAuthPassword((value) => !value)}
                >
                  {showAuthPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>
          ) : null}

          {isLogin ? (
            <div className={styles.forgotRow}>
              <button
                type="button"
                onClick={() => {
                  setAuthError("");
                  setAuthMode("forgot");
                }}
              >
                Forgot password?
              </button>
            </div>
          ) : null}

          {authError ? (
            <p
              className={
                authError.toLowerCase().includes("reset link sent")
                  ? styles.success
                  : styles.error
              }
            >
              {authError}
            </p>
          ) : null}

          <button
            type="button"
            className={styles.submit}
            disabled={authLoading}
            onClick={() => {
              void (isForgot ? handleForgotPassword() : handleEmailAuth());
            }}
          >
            {submitLabel}
          </button>

          <p className={styles.switch}>
            {isForgot ? (
              <button
                type="button"
                onClick={() => {
                  setAuthError("");
                  setAuthMode("login");
                }}
              >
                Back to log in
              </button>
            ) : isSignup ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAuthError("");
                    setAuthMode("login");
                  }}
                >
                  Log in
                </button>
              </>
            ) : (
              <>
                New here?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAuthError("");
                    setAuthMode("signup");
                  }}
                >
                  Create account
                </button>
              </>
            )}
          </p>
        </div>

        <aside className={styles.proof} aria-label="Creator testimonials">
          <h3 className={styles.proofTitle}>
            Loved by our users <span aria-hidden="true">💜</span>
          </h3>
          <div className={styles.proofScroll}>
            <div className={styles.proofGrid}>
              {TESTIMONIALS_LOOP.map((item, index) => (
                <article className={styles.card} key={`${item.name}-${item.meta}-${index}`}>
                  <div className={styles.stars} aria-label="5 stars">
                    ★★★★★
                  </div>
                  <p className={styles.quote}>{item.quote}</p>
                  <div className={styles.person}>
                    <img
                      className={styles.avatarImg}
                      src={item.avatarSrc}
                      alt=""
                      width={32}
                      height={32}
                      loading="lazy"
                      decoding="async"
                      style={{ background: item.color }}
                    />
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.meta}</small>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
