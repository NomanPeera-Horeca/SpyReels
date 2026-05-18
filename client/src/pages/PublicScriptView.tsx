import { Button } from "@/components/ui/button";
import { SpyReelsWordmark } from "@/components/SpyReelsWordmark";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";

type PublicScript = {
  title: string;
  content: string;
  sourceHandle: string | null;
};

type LoadState = "loading" | "ready" | "not_found" | "error";

export default function PublicScriptView() {
  const [, params] = useRoute("/s/:token");
  const token = params?.token?.trim() ?? "";
  const [state, setState] = useState<LoadState>("loading");
  const [script, setScript] = useState<PublicScript | null>(null);

  useEffect(() => {
    let robotsMeta = document.querySelector('meta[name="robots"]');
    const created = !robotsMeta;
    if (!robotsMeta) {
      robotsMeta = document.createElement("meta");
      robotsMeta.setAttribute("name", "robots");
      document.head.appendChild(robotsMeta);
    }
    const previous = robotsMeta.getAttribute("content");
    robotsMeta.setAttribute("content", "noindex,nofollow");

    return () => {
      if (created && robotsMeta?.parentNode) {
        robotsMeta.parentNode.removeChild(robotsMeta);
      } else if (robotsMeta) {
        if (previous) {
          robotsMeta.setAttribute("content", previous);
        } else {
          robotsMeta.removeAttribute("content");
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setState("not_found");
      setScript(null);
      return;
    }

    let cancelled = false;
    setState("loading");

    const load = async () => {
      try {
        const res = await fetch(`/s/${encodeURIComponent(token)}?format=json`, {
          headers: { Accept: "application/json" },
        });
        if (cancelled) return;

        if (res.status === 404) {
          setState("not_found");
          setScript(null);
          return;
        }

        if (!res.ok) {
          setState("error");
          setScript(null);
          return;
        }

        const data = (await res.json()) as { script?: PublicScript };
        if (!data.script) {
          setState("not_found");
          setScript(null);
          return;
        }

        setScript(data.script);
        setState("ready");
        document.title = `${data.script.title} · SpyReels`;
      } catch {
        if (!cancelled) {
          setState("error");
          setScript(null);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/50 px-4 py-4 sm:px-6">
        <Link href="/">
          <SpyReelsWordmark />
        </Link>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-8 sm:px-6 sm:py-10">
        {state === "loading" ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {state === "not_found" ? (
          <div className="text-center py-16 space-y-4">
            <h1 className="text-2xl font-semibold">Link unavailable</h1>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              This link is invalid or has been revoked.
            </p>
            <Button asChild variant="outline">
              <Link href="/">Go to SpyReels</Link>
            </Button>
          </div>
        ) : null}

        {state === "error" ? (
          <div className="text-center py-16 space-y-4">
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              We could not load this script. Please try again later.
            </p>
            <Button asChild variant="outline">
              <Link href="/">Go to SpyReels</Link>
            </Button>
          </div>
        ) : null}

        {state === "ready" && script ? (
          <article className="space-y-6">
            <header className="space-y-2">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
                {script.title}
              </h1>
              {script.sourceHandle ? (
                <p className="text-sm text-muted-foreground">
                  from @{script.sourceHandle.replace(/^@/, "")}
                </p>
              ) : null}
            </header>
            <div className="rounded-lg border border-border/50 bg-card p-5 sm:p-6">
              <pre className="whitespace-pre-wrap font-sans text-sm sm:text-base leading-relaxed text-foreground">
                {script.content}
              </pre>
            </div>
          </article>
        ) : null}
      </main>

      <footer className="border-t border-border/50 px-4 py-8 sm:px-6 mt-auto">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <p className="text-sm text-muted-foreground">Made with SpyReels</p>
          <Button asChild>
            <Link href="/">Try SpyReels free</Link>
          </Button>
        </div>
      </footer>
    </div>
  );
}
