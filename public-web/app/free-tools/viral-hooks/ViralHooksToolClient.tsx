"use client";

import { useEffect, useRef, useState, startTransition } from "react";
import {
  HOOK_FORMAT_OPTIONS,
  HOOK_STYLE_OPTIONS,
  HOOK_TONE_CHIPS,
  formatHookPatternLabel,
  type HookGeneratorTeaser,
  type HookToScriptPending,
  type ViralHook,
} from "../../../../shared/hookGenerator";
import { FieldInput } from "../../../components/FieldInput";
import { FieldSelect } from "../../../components/FieldSelect";
import { FieldTextarea } from "../../../components/FieldTextarea";
import { MarketingBadge } from "../../../components/MarketingBadge";
import { MarketingCard } from "../../../components/MarketingCard";
import { MarketingSection } from "../../../components/MarketingSection";
import { MarketingSectionHeader } from "../../../components/MarketingSectionHeader";
import { MarketingTabRow } from "../../../components/MarketingTabRow";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { SecondaryButton } from "../../../components/SecondaryButton";
import { wrapHyphenatedCompounds } from "../../../components/marketingNoBreak";
import { resolvePublicAppOrigin } from "../../../lib/appOrigin";
import {
  HOOK_TO_SCRIPT_HANDOFF_QUERY,
  clearHookToScriptPending,
  decodeHookToScriptHandoff,
  hookToScriptReturnPath,
  stashHookToScriptPending,
} from "../../../lib/hookToScriptHandoff";
import { openHomepageAuth } from "../../../lib/openHomepageAuth";
import { trpcMutate, trpcQuery } from "../../../lib/trpcBrowser";
import { ViralHooksHookCard } from "./ViralHooksHookCard";
import styles from "./ViralHooksTool.module.css";

type Stage = "input" | "preview" | "unlocked";

type GenerateResult = {
  free: ViralHook[];
  lockedCount: number;
  teasers: HookGeneratorTeaser[];
  sessionToken: string;
};

type UnlockResult = {
  hooks: ViralHook[];
  content: string;
};

type ExpandResult = {
  id: number;
};

const TONE_TABS = HOOK_TONE_CHIPS.map((tone) => ({
  id: tone,
  label: tone,
}));

function stripHtsFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(HOOK_TO_SCRIPT_HANDOFF_QUERY)) return;
  url.searchParams.delete(HOOK_TO_SCRIPT_HANDOFF_QUERY);
  window.history.replaceState(window.history.state, "", url.toString());
}

export function ViralHooksToolClient() {
  const resultsRef = useRef<HTMLDivElement>(null);
  const handoffStarted = useRef(false);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [stage, setStage] = useState<Stage>("input");
  const [content, setContent] = useState("");
  const [hookStyle, setHookStyle] = useState<string>(HOOK_STYLE_OPTIONS[0].value);
  const [videoFormat, setVideoFormat] = useState<string>(
    HOOK_FORMAT_OPTIONS[0].value
  );
  const [tone, setTone] = useState<string>(HOOK_TONE_CHIPS[0]);
  const [email, setEmail] = useState("");
  const [freeHooks, setFreeHooks] = useState<ViralHook[]>([]);
  const [allHooks, setAllHooks] = useState<ViralHook[]>([]);
  const [teasers, setTeasers] = useState<HookGeneratorTeaser[]>([]);
  const [sessionToken, setSessionToken] = useState("");
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [expandingIndex, setExpandingIndex] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadAuth() {
      try {
        const me = await trpcQuery<{ id: number } | null>("auth.me");
        if (!cancelled) setIsAuthenticated(Boolean(me?.id));
      } catch {
        if (!cancelled) setIsAuthenticated(false);
      }
    }
    void loadAuth();
    function onFocus() {
      void loadAuth();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (stage === "preview" || stage === "unlocked") {
      requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [stage]);

  useEffect(() => {
    if (handoffStarted.current) return;
    const params = new URLSearchParams(window.location.search);
    const pending = decodeHookToScriptHandoff(
      params.get(HOOK_TO_SCRIPT_HANDOFF_QUERY)
    );
    if (!pending) return;
    handoffStarted.current = true;
    stripHtsFromUrl();
    void resumeHandoff(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only handoff
  }, []);

  async function resumeHandoff(pending: HookToScriptPending) {
    setContent(pending.reelContent);
    stashHookToScriptPending(pending);
    const returnPath = hookToScriptReturnPath(pending);
    try {
      const me = await trpcQuery<{ id: number } | null>("auth.me");
      if (!me?.id) {
        openHomepageAuth({ mode: "signup", returnTo: returnPath });
        return;
      }
      setIsAuthenticated(true);
      // Host split: product host serves SPA HookGenerator + OnboardingAhaView.
      // Same-origin pilot: expand here, then open the script in the app shell.
      const origin = resolvePublicAppOrigin({
        hostname: window.location.hostname,
      });
      const here = window.location.origin.replace(/\/$/, "");
      if (origin.replace(/\/$/, "") !== here) {
        window.location.href = `${origin}${returnPath}`;
        return;
      }
      setStatusMessage(
        "Expanding your hook into a full Reel script. This usually takes 15 to 30 seconds."
      );
      setExpandingIndex(pending.hookIndex);
      const script = await trpcMutate<ExpandResult>(
        "hookGenerator.expandToScript",
        {
          reelContent: pending.reelContent,
          hook: pending.hook,
          onScreenText: pending.onScreenText || "HOOK",
        }
      );
      clearHookToScriptPending();
      window.location.href = `${origin}/scripts/${script.id}`;
    } catch (err) {
      setStatusMessage(null);
      setExpandingIndex(null);
      setError(
        err instanceof Error
          ? err.message
          : "Could not expand this hook. Please try again."
      );
    }
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (content.trim().length < 10) return;
    setError("");
    setGenerating(true);
    setStatusMessage(
      "Generating your hooks with AI. This usually takes a few seconds."
    );
    try {
      const data = await trpcMutate<GenerateResult>("hookGenerator.generate", {
        content: content.trim(),
        hookStyle,
        videoFormat,
        tone,
      });
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setFreeHooks(data.free);
      setTeasers(data.teasers ?? []);
      setSessionToken(data.sessionToken);
      startTransition(() => setStage("preview"));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Hook generation failed. Please try again."
      );
    } finally {
      setGenerating(false);
      setStatusMessage(null);
    }
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError("");
    setUnlocking(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const data = await trpcMutate<UnlockResult>("hookGenerator.unlock", {
        email: email.trim(),
        sessionToken,
        utmSource: params.get("utm_source") || undefined,
        utmMedium: params.get("utm_medium") || undefined,
        utmCampaign: params.get("utm_campaign") || undefined,
      });
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setAllHooks(data.hooks);
      setContent(data.content);
      startTransition(() => setStage("unlocked"));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not unlock hooks. Please try again."
      );
    } finally {
      setUnlocking(false);
    }
  }

  function handleTurnIntoScript(hook: ViralHook, index: number) {
    const pending: HookToScriptPending = {
      hook: hook.hook,
      onScreenText: hook.onScreenText || "",
      reelContent: content.trim(),
      hookIndex: index,
    };
    stashHookToScriptPending(pending);
    const returnPath = hookToScriptReturnPath(pending);

    if (!isAuthenticated) {
      openHomepageAuth({ mode: "signup", returnTo: returnPath });
      return;
    }

    // Send authenticated users to the app SPA so they get OnboardingAhaView.
    const origin = resolvePublicAppOrigin({
      hostname: window.location.hostname,
    });
    const here = window.location.origin.replace(/\/$/, "");
    if (origin.replace(/\/$/, "") !== here) {
      window.location.href = `${origin}${returnPath}`;
      return;
    }

    // Same-origin (no host split): expand, then open script editor in app shell.
    setExpandingIndex(index);
    setStatusMessage(
      "Expanding your hook into a full Reel script. This usually takes 15 to 30 seconds."
    );
    void (async () => {
      try {
        const script = await trpcMutate<ExpandResult>(
          "hookGenerator.expandToScript",
          {
            reelContent: pending.reelContent,
            hook: pending.hook,
            onScreenText: pending.onScreenText || "HOOK",
          }
        );
        clearHookToScriptPending();
        window.location.href = `${origin}/scripts/${script.id}`;
      } catch (err) {
        setExpandingIndex(null);
        setStatusMessage(null);
        setError(
          err instanceof Error
            ? err.message
            : "Could not expand this hook. Please try again."
        );
      }
    })();
  }

  function resetToInput() {
    setStage("input");
    setFreeHooks([]);
    setAllHooks([]);
    setTeasers([]);
    setSessionToken("");
    setError("");
  }

  const displayHooks = stage === "unlocked" ? allHooks : freeHooks;

  return (
    <MarketingSection
      id="tool"
      pair="start"
      className="shell"
      aria-label="Viral Hook Generator tool"
    >
      <div className={styles.resultsStack} ref={resultsRef}>
        <MarketingSectionHeader
          title="Viral Hook Generator"
          headingLevel="h2"
          size="large"
          align="start"
        />

        {statusMessage ? (
          <div className={styles.statusRow} role="status" aria-live="polite">
            <p className="sr-text-marketing-body-small">{statusMessage}</p>
          </div>
        ) : null}

        {stage === "input" ? (
          <MarketingCard className={styles.toolCard}>
            <p className={`sr-text-product-label ${styles.toolTitle}`}>
              {wrapHyphenatedCompounds("Viral Hook Generator")}
            </p>
            <form
              onSubmit={handleGenerate}
              className={styles.form}
              aria-busy={generating}
            >
              <FieldTextarea
                id="viral-hooks-topic"
                label="What is your video about?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="e.g. productivity tips for founders who keep quitting morning routines"
                rows={4}
                disabled={generating}
                maxLength={500}
              />

              <div className={styles.selectGrid}>
                <FieldSelect
                  id="viral-hooks-format"
                  label="Video format"
                  options={[...HOOK_FORMAT_OPTIONS]}
                  value={videoFormat}
                  onChange={(e) => setVideoFormat(e.target.value)}
                  disabled={generating}
                />
                <FieldSelect
                  id="viral-hooks-style"
                  label="Hook style"
                  options={[...HOOK_STYLE_OPTIONS]}
                  value={hookStyle}
                  onChange={(e) => setHookStyle(e.target.value)}
                  disabled={generating}
                />
              </div>

              <div className={styles.toneBlock}>
                <p className={`sr-text-product-label ${styles.toneLabel}`}>
                  Tone
                </p>
                <MarketingTabRow
                  tabs={TONE_TABS}
                  active={tone}
                  onChange={setTone}
                  aria-label="Hook tone"
                />
              </div>

              {error ? (
                <p className={`sr-text-marketing-body-small ${styles.error}`}>
                  {error}
                </p>
              ) : null}

              <PrimaryButton
                type="submit"
                size="large"
                disabled={generating || content.trim().length < 10}
              >
                {generating ? "Generating 10 hooks..." : "Generate 10 hooks"}
              </PrimaryButton>
            </form>
          </MarketingCard>
        ) : null}

        {stage === "preview" || stage === "unlocked" ? (
          <div className={styles.resultsStack}>
            <div className={styles.resultsHeader}>
              <h3 className={`sr-text-marketing-heading-3 ${styles.resultsTitle}`}>
                {wrapHyphenatedCompounds("Your hooks")}
              </h3>
              {stage === "preview" ? (
                <MarketingBadge tone="brand">
                  {`2 ready · ${teasers.length} waiting`}
                </MarketingBadge>
              ) : (
                <MarketingBadge tone="success">All 10 unlocked</MarketingBadge>
              )}
            </div>

            {stage === "unlocked" ? (
              <div className={styles.successBanner}>
                <p className={`sr-text-product-label ${styles.successTitle}`}>
                  All 10 hooks unlocked
                </p>
                <p className={`sr-text-marketing-body-small ${styles.successBody}`}>
                  We also sent a copy to your inbox.
                </p>
              </div>
            ) : null}

            {displayHooks.map((hook, i) => (
              <ViralHooksHookCard
                key={`${stage}-${i}`}
                hook={hook}
                index={i}
                onTurnIntoScript={
                  stage === "unlocked"
                    ? () => handleTurnIntoScript(hook, i)
                    : undefined
                }
                turnIntoScriptPending={expandingIndex === i}
              />
            ))}

            {stage === "preview" && teasers.length > 0 ? (
              <MarketingCard className={styles.unlockCard}>
                <h3 className={`sr-text-marketing-heading-3 ${styles.unlockTitle}`}>
                  {wrapHyphenatedCompounds("Get all 10 hooks")}
                </h3>
                <p className={`sr-text-marketing-body-small ${styles.unlockBody}`}>
                  See pattern previews below. Enter your email for the full set
                  plus on-screen text.
                </p>
                <div className={styles.teaserList}>
                  {teasers.map((t, i) => (
                    <div key={i} className={styles.teaserRow}>
                      <p
                        className={`sr-text-product-label ${styles.teaserIndex}`}
                      >
                        {i + 3}
                      </p>
                      <p
                        className={`sr-text-marketing-body-small ${styles.teaserText}`}
                      >
                        <span className={styles.teaserPattern}>
                          {wrapHyphenatedCompounds(formatHookPatternLabel(t.pattern))}
                        </span>
                        {" · "}
                        {wrapHyphenatedCompounds(t.partial)}
                      </p>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleUnlock} className={styles.unlockForm}>
                  <FieldInput
                    id="viral-hooks-email"
                    label="Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    disabled={unlocking}
                    required
                    maxLength={255}
                    hideLabel
                  />
                  {error ? (
                    <p className={`sr-text-marketing-body-small ${styles.error}`}>
                      {error}
                    </p>
                  ) : null}
                  <PrimaryButton
                    type="submit"
                    size="large"
                    disabled={unlocking || !email.trim()}
                  >
                    {unlocking ? "Getting hooks..." : "Continue"}
                  </PrimaryButton>
                  <p
                    className={`sr-text-marketing-body-small ${styles.unlockNote}`}
                  >
                    We will email you a copy of your hooks.
                  </p>
                </form>
              </MarketingCard>
            ) : null}

            {stage === "unlocked" ? (
              <MarketingCard className={styles.expandCta}>
                <h3 className={`sr-text-marketing-heading-3 ${styles.expandTitle}`}>
                  {wrapHyphenatedCompounds(
                    "Love this hook? Write the full Reel in 30 seconds."
                  )}
                </h3>
                <p className={`sr-text-marketing-body-small ${styles.expandBody}`}>
                  SpyReels expands your hook into a ready-to-film script with
                  delivery notes and teleprompter. Free to start.
                </p>
                <div className={styles.actionsRow}>
                  <PrimaryButton
                    type="button"
                    size="large"
                    onClick={() =>
                      allHooks[0] && handleTurnIntoScript(allHooks[0], 0)
                    }
                    disabled={expandingIndex != null || !allHooks[0]}
                  >
                    Turn hook #1 into full script
                  </PrimaryButton>
                  <SecondaryButton type="button" size="large" onClick={resetToInput}>
                    Generate again
                  </SecondaryButton>
                </div>
                {error ? (
                  <p className={`sr-text-marketing-body-small ${styles.error}`}>
                    {error}
                  </p>
                ) : null}
              </MarketingCard>
            ) : null}

            {stage === "preview" ? (
              <div className={styles.actionsRow}>
                <SecondaryButton type="button" size="medium" onClick={resetToInput}>
                  Generate again
                </SecondaryButton>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </MarketingSection>
  );
}
