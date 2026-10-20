import { useEffect, useRef, useState } from "react";
import { PlatformFullColorMark } from "@/design-system/platformMarks";
import cardStyles from "@/design-system/ResultCard.module.css";
import { youtubeAmbientEmbedSrc } from "@/lib/youtubeVideoId";
import type { OnboardingStackAttempt, OnboardingStackPlatform } from "@shared/onboardingViralStack";
import styles from "./previews.module.css";

const STACK_PLATFORM_LABEL: Record<OnboardingStackPlatform, string> = {
  instagram: "Reels",
  tiktok: "TikTok",
  youtube: "Shorts",
};

const YOUTUBE_PLAYING = 1;
const AUTOPLAY_WAIT_MS = 8000;

function Thumbnail({ primary, fallback }: { primary: string | null; fallback: string }) {
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const showPrimary = Boolean(primary) && primary !== fallback && !primaryFailed;
  return (
    <>
      <img
        className={styles.stackMedia}
        src={fallback}
        alt=""
        decoding="async"
        fetchPriority="low"
      />
      {showPrimary ? (
        <img
          className={styles.stackMedia}
          src={primary ?? undefined}
          alt=""
          decoding="async"
          fetchPriority="low"
          onError={() => setPrimaryFailed(true)}
        />
      ) : null}
    </>
  );
}

function AmbientFile({
  url,
  active,
  onPlaying,
  onUnavailable,
}: {
  url: string;
  active: boolean;
  onPlaying: () => void;
  onUnavailable: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [shown, setShown] = useState(false);
  const onPlayingRef = useRef(onPlaying);
  const onUnavailableRef = useRef(onUnavailable);
  onPlayingRef.current = onPlaying;
  onUnavailableRef.current = onUnavailable;

  useEffect(() => {
    setShown(false);
  }, [url]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.muted = true;
    if (!active) {
      video.pause();
      return;
    }
    if (!video.getAttribute("src")) video.src = url;
    const pending = video.play();
    void pending?.catch(() => {
      if (document.hidden) return;
      onUnavailableRef.current();
    });
  }, [active, url]);

  useEffect(() => {
    const video = ref.current;
    return () => {
      if (!video) return;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [url]);

  return (
    <video
      ref={ref}
      className={[styles.stackMedia, shown ? "" : styles.stackMediaPending].filter(Boolean).join(" ")}
      muted
      loop
      playsInline
      preload="none"
      disablePictureInPicture
      onPlaying={() => {
        setShown(true);
        onPlayingRef.current();
      }}
      onError={() => onUnavailableRef.current()}
    />
  );
}

function AmbientYouTube({
  videoId,
  active,
  onPlaying,
  onUnavailable,
}: {
  videoId: string;
  active: boolean;
  onPlaying: () => void;
  onUnavailable: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [mountEmbed, setMountEmbed] = useState(false);
  const [shown, setShown] = useState(false);
  const playingRef = useRef(false);
  const onPlayingRef = useRef(onPlaying);
  const onUnavailableRef = useRef(onUnavailable);
  onPlayingRef.current = onPlaying;
  onUnavailableRef.current = onUnavailable;
  const activeRef = useRef(active);
  activeRef.current = active;
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const src = youtubeAmbientEmbedSrc(videoId, origin);

  const command = (func: "playVideo" | "pauseVideo") => {
    const frame = iframeRef.current?.contentWindow;
    if (!frame) return;
    frame.postMessage(
      JSON.stringify({ event: "command", func, args: [] }),
      "https://www.youtube.com"
    );
  };

  useEffect(() => {
    if (!active) return;
    const frame = window.requestAnimationFrame(() => setMountEmbed(true));
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  useEffect(() => {
    playingRef.current = false;
    setShown(false);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.origin !== "https://www.youtube.com") return;
      let data: { event?: string; info?: number | { playerState?: number } } | null = null;
      if (typeof event.data === "string") {
        try {
          data = JSON.parse(event.data) as {
            event?: string;
            info?: number | { playerState?: number };
          };
        } catch {
          return;
        }
      } else if (event.data && typeof event.data === "object") {
        data = event.data as { event?: string; info?: number | { playerState?: number } };
      }
      if (!data) return;
      const playerState =
        data.event === "infoDelivery" && data.info && typeof data.info === "object"
          ? data.info.playerState
          : undefined;
      if (
        (data.event === "onStateChange" && data.info === YOUTUBE_PLAYING) ||
        playerState === YOUTUBE_PLAYING
      ) {
        if (!activeRef.current) {
          iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
            "https://www.youtube.com"
          );
          return;
        }
        playingRef.current = true;
        setShown(true);
        onPlayingRef.current();
      }
      if (data.event === "onError") onUnavailableRef.current();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [videoId]);

  useEffect(() => {
    if (!active) {
      command("pauseVideo");
      return;
    }
    command("playVideo");
    const timer = window.setTimeout(() => {
      if (!playingRef.current) onUnavailableRef.current();
    }, AUTOPLAY_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [active, videoId]);

  if (!mountEmbed) return null;

  return (
    <iframe
      ref={iframeRef}
      className={[styles.stackMedia, shown ? "" : styles.stackMediaPending].filter(Boolean).join(" ")}
      title="YouTube Short preview"
      src={src}
      allow="autoplay; encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
      onLoad={() => {
        const frame = iframeRef.current?.contentWindow;
        if (!frame) return;
        frame.postMessage(
          JSON.stringify({ event: "listening", channel: "widget" }),
          "https://www.youtube.com"
        );
        frame.postMessage(
          JSON.stringify({
            event: "command",
            func: "addEventListener",
            args: ["onStateChange"],
          }),
          "https://www.youtube.com"
        );
        frame.postMessage(
          JSON.stringify({
            event: "command",
            func: "addEventListener",
            args: ["onError"],
          }),
          "https://www.youtube.com"
        );
        if (activeRef.current) {
          frame.postMessage(
            JSON.stringify({ event: "command", func: "playVideo", args: [] }),
            "https://www.youtube.com"
          );
        } else {
          frame.postMessage(
            JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
            "https://www.youtube.com"
          );
        }
      }}
    />
  );
}

export function AmbientStackCard({
  platform,
  attempts,
  fallbackThumbnail,
  active,
}: {
  platform: OnboardingStackPlatform;
  attempts: OnboardingStackAttempt[];
  fallbackThumbnail: string;
  active: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const advanced = useRef(false);
  const attempt = attempts[index] ?? attempts[attempts.length - 1];
  const exhausted = index >= attempts.length;
  const fileUrl = !exhausted && attempt?.videoUrl ? attempt.videoUrl : null;
  const youtubeId =
    !exhausted && platform === "youtube" ? attempt?.youtubeVideoId ?? null : null;

  const attemptKey = attempts.map((item) => item.id).join("|");
  useEffect(() => {
    advanced.current = false;
    setIndex(0);
    setPlaying(false);
  }, [attemptKey]);
  useEffect(() => {
    advanced.current = false;
  }, [index]);

  const giveUp = () => {
    if (advanced.current) return;
    advanced.current = true;
    setPlaying(false);
    setIndex((current) => current + 1);
  };

  return (
    <div
      className={styles.stackFrame}
      data-platform={platform}
      data-playback={playing ? "playing" : "thumbnail"}
    >
      <Thumbnail primary={attempt?.thumbnailUrl ?? null} fallback={fallbackThumbnail} />
      {fileUrl ? (
        <AmbientFile
          key={fileUrl}
          url={fileUrl}
          active={active}
          onPlaying={() => setPlaying(true)}
          onUnavailable={giveUp}
        />
      ) : null}
      {youtubeId ? (
        <AmbientYouTube
          key={youtubeId}
          videoId={youtubeId}
          active={active}
          onPlaying={() => setPlaying(true)}
          onUnavailable={giveUp}
        />
      ) : null}
      <span className={[cardStyles.platformBadge, styles.platformBadge].join(" ")}>
        <PlatformFullColorMark platform={platform} size={16} />
        {STACK_PLATFORM_LABEL[platform]}
      </span>
    </div>
  );
}
