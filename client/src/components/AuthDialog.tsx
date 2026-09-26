import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { getLoginUrl } from "@/const";
import { signupAttributionBody } from "@/utils/utm-capture";
import { cn } from "@/lib/utils";

type AuthMode = "login" | "signup" | "forgot";

/** Placeholder social proof (swap for real quotes later). Matches signup mockup + homepage faces. */
const AUTH_TESTIMONIALS = [
  {
    quote:
      "I used to spend 3 hours a day scrolling trying to find what was trending. Now I open SpyReels, pick a viral outlier, and ship by lunch.",
    highlight: "3 hours a day scrolling",
    name: "Maya Chen",
    meta: "@mayamakes",
    color: "#7c3aed",
    avatarSrc: "/marketing/17d74cf5b9b4.webp",
  },
  {
    quote:
      "Honestly skeptical at first. Two weeks in I remade a Reel that booked a brand deal. Paid for itself many times over.",
    highlight: "Paid for itself",
    name: "Priya Sharma",
    meta: "@priyacooks",
    color: "#0d9488",
    avatarSrc: "/marketing/f4f2be43966c.webp",
  },
  {
    quote:
      "Pitched a client using spy + remake insights. Closed a retainer the next week. The data tells a story execs actually care about.",
    highlight: "",
    name: "Rafael Mendes",
    meta: "Senior Strategist, Pivot Co.",
    color: "#2563eb",
    avatarSrc: "/marketing/ceff676b111f.webp",
  },
  {
    quote:
      "Our team finally stopped pitching vague trend decks. We walk in with examples, transcripts, and proof of traction.",
    highlight: "",
    name: "Jordan Reyes",
    meta: "Head of Social, Northline",
    color: "#db2777",
    avatarSrc: "/marketing/3e709ab99b48.webp",
  },
  {
    quote:
      "The hook breakdowns alone changed how I script. I stopped rambling in the first five seconds.",
    highlight: "",
    name: "Nina Flores",
    meta: "@ninacuts",
    color: "#ea580c",
    avatarSrc: "/marketing/e1740faf9a91.webp",
  },
  {
    quote:
      "I used to save random videos and forget why they worked. Now every example comes with a reason I can apply on camera.",
    highlight: "",
    name: "Sofia Lane",
    meta: "@sofiamoves",
    color: "#4f46e5",
    avatarSrc: "/marketing/10be69f1cbcb.webp",
  },
  {
    quote:
      "I stopped copying trends blindly and started adapting them on purpose. Calmer posting because I know the angle before I film.",
    highlight: "",
    name: "Kiara Moon",
    meta: "@kiarablends",
    color: "#0891b2",
    avatarSrc: "/marketing/cf5eb132b440.jpg",
  },
  {
    quote:
      "SpyReels replaced my old swipe folders and half-finished brainstorm docs. Everything I need to remake lives in one place.",
    highlight: "",
    name: "Cam Brooks",
    meta: "Strategy Lead, Current",
    color: "#7c3aed",
    avatarSrc: "/marketing/44677859a117.jpg",
  },
  {
    quote:
      "Every time a student says they have no ideas, I open SpyReels. Ten minutes later they have formats and a script direction.",
    highlight: "",
    name: "Dev Patel",
    meta: "@devteaches",
    color: "#16a34a",
    avatarSrc: "/marketing/2d6477ed3f11.jpg",
  },
  {
    quote:
      "We use it to sanity-check creative angles before spending on production. Saves us from expensive bad bets.",
    highlight: "",
    name: "Omar Haddad",
    meta: "Performance Lead, Lantern",
    color: "#9333ea",
    avatarSrc: "/marketing/cc92da159730.jpg",
  },
] as const;

/** Duplicate for seamless infinite vertical loop (translateY -50%). */
const AUTH_TESTIMONIALS_LOOP = [...AUTH_TESTIMONIALS, ...AUTH_TESTIMONIALS];

function renderQuote(quote: string, highlight: string) {
  if (!highlight || !quote.includes(highlight)) return quote;
  const i = quote.indexOf(highlight);
  return (
    <>
      {quote.slice(0, i)}
      <mark className="bg-transparent font-semibold text-teal-600">{highlight}</mark>
      {quote.slice(i + highlight.length)}
    </>
  );
}

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
  /** Optional custom H1 (e.g. from CTA context). */
  headline?: string;
  /** Optional secondary banner under the subtitle (legacy). */
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
      const resolvedName =
        authName.trim() ||
        authEmail.split("@")[0]?.trim() ||
        "Creator";
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
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || "Something went wrong");
      } else {
        window.location.href = returnTo || "/research";
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

  const isForgot = authMode === "forgot";
  const isSignup = authMode === "signup";
  const isLogin = authMode === "login";

  const title = isForgot
    ? "Reset your password"
    : headline?.trim()
      ? headline.trim()
      : isSignup
        ? "Join SpyReels"
        : "Welcome back";

  const subtitle = isForgot
    ? "Enter your email and we will send a reset link."
    : headline?.trim()
      ? "Start free. Spy viral videos and remake scripts in your voice."
      : isSignup
        ? "Spy trending creators, preview viral videos, and remake scripts in your voice - all in one place."
        : "Log in to keep spying viral videos and remaking scripts in your voice.";

  const eyebrow = isForgot
    ? "Password reset"
    : isSignup
      ? "Create your account"
      : "Welcome back";

  const submitLabel = authLoading
    ? "Please wait..."
    : isForgot
      ? "Send reset link"
      : isLogin
        ? "Log in"
        : "Create account";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "gap-0 overflow-hidden border-0 bg-white p-0 text-zinc-900 shadow-2xl",
          "max-h-[min(920px,calc(100vh-1.5rem))] w-[calc(100%-1.25rem)]",
          "sm:max-w-5xl rounded-2xl sm:rounded-3xl"
        )}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>

        <div className="grid min-h-0 md:h-[min(720px,calc(100vh-1.5rem))] md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          {/* Form */}
          <div className="flex min-h-0 flex-col justify-center overflow-y-auto bg-white px-5 py-7 sm:px-10 sm:py-9">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-violet-600">
              {eyebrow}
            </p>
            <h2 className="text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-[1.85rem] sm:leading-tight">
              {title}
            </h2>
            <p className="mt-2 max-w-[38ch] text-sm leading-relaxed text-zinc-500">
              {subtitle}
            </p>

            {contextMessage && !headline?.trim() ? (
              <p className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-700">
                {contextMessage}
              </p>
            ) : null}

            {!isForgot ? (
              <>
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="mt-6 flex h-12 w-full items-center justify-center gap-2.5 rounded-full border border-zinc-200 bg-white text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-50"
                >
                  <img
                    src="https://www.google.com/favicon.ico"
                    alt=""
                    className="h-[18px] w-[18px]"
                  />
                  Continue with Google
                </button>

                <div className="my-4 flex w-full items-center gap-3">
                  <div className="h-px flex-1 bg-zinc-200" />
                  <span className="text-[11px] font-semibold tracking-[0.08em] text-zinc-400">
                    OR
                  </span>
                  <div className="h-px flex-1 bg-zinc-200" />
                </div>
              </>
            ) : null}

            {isSignup ? (
              <label className="mb-3 block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500">
                  Name
                </span>
                <input
                  type="text"
                  placeholder="Your name"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  className="h-12 w-full rounded-xl border-[1.5px] border-zinc-200 bg-white px-3.5 text-sm text-zinc-900 outline-none transition focus:border-violet-500 focus:ring-[3px] focus:ring-violet-500/20"
                  autoComplete="name"
                />
              </label>
            ) : null}

            <label className="mb-3 block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500">
                Email
              </span>
              <input
                type="email"
                placeholder="you@example.com"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="h-12 w-full rounded-xl border-[1.5px] border-zinc-200 bg-white px-3.5 text-sm text-zinc-900 outline-none transition focus:border-violet-500 focus:ring-[3px] focus:ring-violet-500/20"
                autoComplete="email"
              />
            </label>

            {!isForgot ? (
              <label className="mb-3 block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500">
                  Password
                </span>
                <div className="relative">
                  <input
                    type={showAuthPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="h-12 w-full rounded-xl border-[1.5px] border-zinc-200 bg-white px-3.5 pr-10 text-sm text-zinc-900 outline-none transition focus:border-violet-500 focus:ring-[3px] focus:ring-violet-500/20"
                    autoComplete={
                      isSignup ? "new-password" : "current-password"
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowAuthPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-zinc-400 hover:text-zinc-700"
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
              </label>
            ) : null}

            {isLogin ? (
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setAuthError("");
                    setAuthMode("forgot");
                  }}
                  className="text-xs font-semibold text-zinc-500 hover:text-zinc-800"
                >
                  Forgot password?
                </button>
              </div>
            ) : null}

            {authError ? (
              <p
                className={cn(
                  "mb-3 rounded-lg border px-3 py-2 text-xs",
                  authError.toLowerCase().includes("reset link sent")
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                )}
              >
                {authError}
              </p>
            ) : null}

            <button
              type="button"
              disabled={authLoading}
              onClick={isForgot ? handleForgotPassword : handleEmailAuth}
              className="mt-1 h-12 w-full rounded-full bg-violet-600 text-[13px] font-extrabold uppercase tracking-[0.06em] text-white shadow-[0_10px_24px_rgba(124,58,237,0.28)] transition hover:brightness-105 disabled:opacity-50"
            >
              {submitLabel}
            </button>

            <p className="mt-4 text-center text-[13px] text-zinc-500">
              {isForgot ? (
                <button
                  type="button"
                  onClick={() => {
                    setAuthError("");
                    setAuthMode("login");
                  }}
                  className="font-semibold text-blue-600 hover:underline"
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
                    className="font-semibold text-blue-600 hover:underline"
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
                    className="font-semibold text-blue-600 hover:underline"
                  >
                    Create account
                  </button>
                </>
              )}
            </p>
          </div>

          {/* Social proof: infinite vertical drift (same as signup mockup) */}
          <aside className="relative hidden min-h-0 flex-col overflow-hidden border-l border-zinc-200 bg-gradient-to-b from-violet-50 via-zinc-100 to-slate-100 p-5 md:flex md:p-6">
            <h3 className="mb-3 flex shrink-0 items-center gap-2 text-lg font-extrabold tracking-tight text-zinc-900">
              Loved by our users <span aria-hidden="true">💜</span>
            </h3>
            <div
              className="relative min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(180deg,transparent,black_6%,black_92%,transparent)] [-webkit-mask-image:linear-gradient(180deg,transparent,black_6%,black_92%,transparent)]"
            >
              <div className="auth-testimonial-masonry grid grid-cols-2 content-start gap-3">
                {AUTH_TESTIMONIALS_LOOP.map((t, index) => (
                  <article
                    key={`${t.name}-${t.meta}-${index}`}
                    className="rounded-2xl border border-zinc-200/90 bg-white p-3.5 shadow-sm"
                  >
                    <div
                      className="mb-2 text-[13px] tracking-wide text-amber-400"
                      aria-label="5 stars"
                    >
                      ★★★★★
                    </div>
                    <p className="mb-3 text-[13px] leading-snug text-zinc-700">
                      {renderQuote(t.quote, t.highlight)}
                    </p>
                    <div className="flex items-center gap-2.5">
                      <img
                        src={t.avatarSrc}
                        alt=""
                        width={32}
                        height={32}
                        className="h-8 w-8 shrink-0 rounded-full object-cover"
                        style={{ background: t.color }}
                        loading="lazy"
                        decoding="async"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-zinc-900">
                          {t.name}
                        </p>
                        <p className="truncate text-xs text-zinc-500">{t.meta}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
