/**
 * Home "+ TikTok" popup: type your handle, your profile card appears,
 * "Is this you?" -> Yes, and the profile is added. No onboarding again: the
 * server copies the creator's confirmed strategy and reads the new account's
 * videos in the background.
 */
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import type { SocialPlatform } from "@shared/personalization/model";
import type { PublicProfilePreview } from "@shared/personalization/publicProfilePreview";
import { trpc } from "@/lib/trpc";
import { PrimaryButton } from "@/design-system/core";
import { IconClose } from "@/design-system/icons";
import { PlatformFullColorMark } from "@/design-system/platformMarks";
import { formatCompactCount } from "@/lib/viralPosts/format";
import { HOME_COPY as C } from "./copy";
import styles from "./home.module.css";

const cx = (...p: Array<string | false | null | undefined>) => p.filter(Boolean).join(" ");

/** Wait this long after the last key before looking the handle up. */
const LOOKUP_DEBOUNCE_MS = 700;

type LookupState =
  | { kind: "idle" }
  | { kind: "looking" }
  | { kind: "found"; profile: PublicProfilePreview }
  | { kind: "error"; message: string };

export function AddPlatformDialog({
  platform,
  label,
  onAdded,
  onClose,
}: {
  platform: SocialPlatform;
  label: string;
  onAdded: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [handle, setHandle] = useState("");
  const [state, setState] = useState<LookupState>({ kind: "idle" });
  const lookup = trpc.onboardingV2.lookupProfile.useMutation();
  const add = trpc.onboardingV2.addLinkedProfile.useMutation();
  const latest = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Look the handle up once typing pauses; the newest answer wins.
  useEffect(() => {
    const typed = handle.trim();
    if (typed.length < 2) {
      setState({ kind: "idle" });
      return;
    }
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      setState({ kind: "looking" });
      lookup
        .mutateAsync({ platform, input: typed })
        .then(res => {
          if (ticket !== latest.current) return;
          if (res.ok) setState({ kind: "found", profile: res.profile });
          else setState({ kind: "error", message: C.addPlatform.errors[res.reason] ?? C.addPlatform.errors.error });
        })
        .catch(() => {
          if (ticket === latest.current) setState({ kind: "error", message: C.addPlatform.errors.error });
        });
    }, LOOKUP_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // lookup is stable enough for this; re-run only when the text changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, platform]);

  const confirm = async (profile: PublicProfilePreview) => {
    try {
      const res = await add.mutateAsync({ platform, handle: profile.handle });
      if (!res.ok) {
        setState({ kind: "error", message: C.addPlatform.errors[res.reason] ?? C.addPlatform.errors.error });
        return;
      }
      toast.success(C.addPlatform.added(label));
      onAdded();
    } catch {
      toast.error(C.addPlatform.errors.error);
    }
  };

  const found = state.kind === "found" ? state.profile : null;
  const rawStats: Array<[number | null, string]> = found
    ? [
        [found.postCount ?? found.videoCount, platform === "youtube" ? C.addPlatform.videos : C.addPlatform.posts],
        [found.followerCount, platform === "youtube" ? C.addPlatform.subscribers : C.addPlatform.followers],
        [found.followingCount, C.addPlatform.following],
      ]
    : [];
  const stats = rawStats.filter((s): s is [number, string] => typeof s[0] === "number");

  return (
    <div className={cx("sr-scope-light", styles.overlay)} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div
        className={cx(styles.theme, styles.modal)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="home-add-platform-dialog"
      >
        <div className={styles.modalHeader}>
          <div className={styles.sectionTitles}>
            <h2 id={titleId} className={cx("sr-text-product-heading-4", styles.h2, styles.addTitle)}>
              <PlatformFullColorMark platform={platform} size={20} />
              {C.addPlatform.title(label)}
            </h2>
            <p className={cx("sr-text-product-body-small", styles.muted)}>{C.addPlatform.body}</p>
          </div>
          <button
            type="button"
            className={cx(styles.iconButton, styles.iconButtonBare)}
            onClick={onClose}
            aria-label={C.profiles.close}
          >
            <IconClose />
          </button>
        </div>

        <label className={styles.addField}>
          <span className={cx("sr-text-product-label", styles.h2)}>{C.addPlatform.handleLabel(label)}</span>
          <input
            ref={inputRef}
            className={styles.addInput}
            value={handle}
            onChange={e => setHandle(e.target.value)}
            placeholder={C.addPlatform.placeholder}
            autoComplete="off"
            spellCheck={false}
            disabled={add.isPending}
          />
        </label>

        {state.kind === "looking" ? (
          <p className={cx("sr-text-product-body-small", styles.muted)} role="status">
            {C.addPlatform.looking(label)}
          </p>
        ) : null}
        {state.kind === "error" ? (
          <p className={cx("sr-text-product-body-small", styles.addError)} role="alert">
            {state.message}
          </p>
        ) : null}

        {found ? (
          <div className={styles.addCard} data-testid="home-add-platform-card">
            <div className={styles.addCardTop}>
              {found.avatarUrl ? (
                <img className={styles.addAvatar} src={found.avatarUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className={styles.addAvatar} aria-hidden />
              )}
              <div className={styles.creatorText}>
                <span className={cx("sr-text-product-body-medium", styles.h2)}>@{found.handle}</span>
                {found.displayName ? (
                  <span className={cx("sr-text-product-body-small", styles.muted)}>{found.displayName}</span>
                ) : null}
              </div>
            </div>
            {found.bio ? <p className={cx("sr-text-product-body-small", styles.addBio)}>{found.bio}</p> : null}
            {stats.length ? (
              <div className={styles.addStats}>
                {stats.map(([n, what]) => (
                  <span key={what}>
                    <strong>{formatCompactCount(n)}</strong> {what}
                  </span>
                ))}
              </div>
            ) : null}
            <p className={cx("sr-text-product-label", styles.h2)}>{C.addPlatform.isThisYou}</p>
            <div className={styles.addActions}>
              <button
                type="button"
                className={styles.outline}
                disabled={add.isPending}
                onClick={() => {
                  setHandle("");
                  setState({ kind: "idle" });
                  inputRef.current?.focus();
                }}
              >
                {C.addPlatform.notMe}
              </button>
              <PrimaryButton type="button" disabled={add.isPending} onClick={() => void confirm(found)}>
                {add.isPending ? C.addPlatform.adding : C.addPlatform.yes}
              </PrimaryButton>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
