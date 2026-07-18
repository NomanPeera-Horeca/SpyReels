import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import type { InstagramAudioPick } from "@shared/coachScriptSections";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

function formatInstagramAudioLine(title: string, artist?: string | null): string {
  const cleanTitle = title.trim();
  const cleanArtist = artist?.trim();
  if (!cleanTitle) return "";
  return cleanArtist ? `${cleanTitle} · ${cleanArtist}` : cleanTitle;
}

type InstagramAudioPreviewListProps = {
  picks: InstagramAudioPick[];
};

export function InstagramAudioPreviewList({ picks }: InstagramAudioPreviewListProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [pendingTitle, setPendingTitle] = useState("");
  const [pendingArtist, setPendingArtist] = useState<string | undefined>(undefined);

  const previewQuery = trpc.studio.resolveAudioPreview.useQuery(
    { title: pendingTitle, artist: pendingArtist },
    {
      enabled: Boolean(pendingTitle),
      staleTime: 60 * 60 * 1000,
      retry: false,
    }
  );

  useEffect(() => {
    if (!pendingKey || !pendingTitle) return;
    if (previewQuery.isFetching) return;

    if (previewQuery.isError) {
      toast.error(previewQuery.error.message);
      setLoadingKey(null);
      setPendingKey(null);
      setPendingTitle("");
      setPendingArtist(undefined);
      return;
    }

    const url = previewQuery.data?.previewUrl;
    if (!url) return;

    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.pause();
    audio.src = url;
    void audio
      .play()
      .then(() => {
        setActiveKey(pendingKey);
        setIsPlaying(true);
      })
      .catch(() => {
        toast.error("Could not play preview. Try again.");
        setActiveKey(null);
        setIsPlaying(false);
      })
      .finally(() => {
        setLoadingKey(null);
        setPendingKey(null);
        setPendingTitle("");
        setPendingArtist(undefined);
      });
  }, [
    pendingKey,
    pendingTitle,
    previewQuery.data?.previewUrl,
    previewQuery.error?.message,
    previewQuery.isError,
    previewQuery.isFetching,
  ]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setIsPlaying(false);
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
    };
  }, [activeKey]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const togglePick = (pick: InstagramAudioPick, index: number) => {
    const key = `${pick.title}-${index}`;
    const line = formatInstagramAudioLine(pick.title, pick.artist);
    if (!line) return;

    if (activeKey === key && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        void audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {
          toast.error("Could not play preview. Try again.");
        });
      }
      return;
    }

    setLoadingKey(key);
    setPendingKey(key);
    setPendingTitle(pick.title.trim());
    setPendingArtist(pick.artist?.trim() || undefined);
  };

  return (
    <div className="space-y-1.5">
      {picks.map((pick, i) => {
        const line = formatInstagramAudioLine(pick.title, pick.artist);
        if (!line) return null;
        const key = `${pick.title}-${i}`;
        const loading = loadingKey === key;
        const playing = activeKey === key && isPlaying;

        return (
          <div
            key={key}
            className={cn(
              "flex items-start gap-2 rounded-lg border border-transparent px-1 py-0.5",
              i === 0 ? "text-gray-900 dark:text-gray-50" : "text-muted-foreground"
            )}
          >
            <button
              type="button"
              aria-label={playing ? `Pause ${line}` : `Play preview of ${line}`}
              onClick={() => togglePick(pick, i)}
              disabled={loading}
              className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-60 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/70"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : playing ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" />
              )}
            </button>
            <p className={cn("min-w-0 flex-1 text-sm leading-snug pt-1", i === 0 && "font-medium")}>
              {i === 0 ? line : `Backup: ${line}`}
            </p>
          </div>
        );
      })}
    </div>
  );
}
