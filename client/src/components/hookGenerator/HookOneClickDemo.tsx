import { useEffect, useState } from "react";
import hookBeforePng from "@/assets/hook-generator/hook-mockup-before.png";

/**
 * Marketing demo: one tap overlays scroll-stopping on-screen hook text.
 */
export function HookOneClickDemo() {
  const [phase, setPhase] = useState<"idle" | "clicking" | "hooked">("idle");

  useEffect(() => {
    let cancelled = false;
    let clickTimer: number | undefined;
    let resetTimer: number | undefined;
    let loopTimer: number | undefined;

    const playOnce = () => {
      if (cancelled) return;
      setPhase("clicking");
      clickTimer = window.setTimeout(() => {
        if (cancelled) return;
        setPhase("hooked");
        resetTimer = window.setTimeout(() => {
          if (cancelled) return;
          setPhase("idle");
        }, 2800);
      }, 420);
    };

    playOnce();
    loopTimer = window.setInterval(playOnce, 4200);

    return () => {
      cancelled = true;
      window.clearTimeout(clickTimer);
      window.clearTimeout(resetTimer);
      window.clearInterval(loopTimer);
    };
  }, []);

  const playManual = () => {
    setPhase("clicking");
    window.setTimeout(() => setPhase("hooked"), 420);
    window.setTimeout(() => setPhase("idle"), 3200);
  };

  return (
    <div className="mx-auto mt-6 max-w-[420px]">
      <div
        className={`relative mx-auto aspect-[9/16] max-h-[520px] w-full overflow-hidden rounded-[18px] bg-black shadow-[0_24px_60px_rgba(0,0,0,0.5),0_0_40px_rgba(139,92,246,0.2)] ${
          phase === "hooked" ? "is-hooked" : ""
        } ${phase === "clicking" ? "is-clicking" : ""}`}
        aria-label="Animated demo: one click adds on-screen hooks"
      >
        <img
          src={hookBeforePng}
          alt="Raw talking-head Reel before hook text"
          className="absolute inset-0 h-full w-full object-cover"
          width={720}
          height={1280}
        />
        <div
          className="pointer-events-none absolute bottom-[18%] left-1/2 z-[3] w-[86%] -translate-x-1/2 text-center"
          aria-hidden
        >
          {(
            [
              { text: "this is how you", className: "text-[15px] font-semibold text-white [text-shadow:0_2px_10px_#000]" },
              {
                text: "GET",
                className:
                  "inline-block rounded-lg bg-yellow-400 px-3 py-1 text-[26px] font-black text-zinc-900",
              },
              {
                text: "10X",
                className:
                  "inline-block rounded-lg bg-green-500 px-3 py-1 text-2xl font-black text-white",
              },
              {
                text: "more VIEWS",
                className: "text-[28px] font-black text-white [text-shadow:0_3px_14px_#000]",
              },
            ] as const
          ).map((line, i) => (
            <div
              key={line.text}
              className={`mx-auto mb-2 transition duration-300 ease-out ${line.className} ${
                phase === "hooked"
                  ? "translate-y-0 scale-100 opacity-100 blur-0"
                  : "translate-y-4 scale-95 opacity-0 blur-sm"
              }`}
              style={{ transitionDelay: phase === "hooked" ? `${50 + i * 130}ms` : "0ms" }}
            >
              {line.text}
              {i === 3 ? " " : null}
              {i === 3 ? <span aria-hidden>🔥</span> : null}
            </div>
          ))}
        </div>
        <div
          className={`pointer-events-none absolute bottom-[11%] left-1/2 z-[5] h-[42px] w-[42px] -translate-x-1/2 rounded-full border-2 border-white bg-violet-500/35 ${
            phase === "clicking" ? "animate-[hookTap_0.7s_ease_forwards]" : "translate-y-5 scale-75 opacity-0"
          }`}
          aria-hidden
        />
        <button
          type="button"
          onClick={playManual}
          className={`absolute bottom-[9%] left-1/2 z-[4] -translate-x-1/2 whitespace-nowrap rounded-full px-3.5 py-2.5 text-xs font-extrabold shadow-[0_10px_30px_rgba(0,0,0,0.45)] ${
            phase === "hooked"
              ? "bg-emerald-400 text-emerald-950"
              : "bg-white text-zinc-900"
          }`}
        >
          {phase === "hooked" ? "✓ Done" : "✨ Generate hook"}
        </button>
      </div>
      <p className="mt-2.5 text-center text-xs text-muted-foreground">
        <strong className="text-foreground">One click</strong> · raw take → hooked captions
      </p>
      <style>{`
        @keyframes hookTap {
          0% { opacity: 0; transform: translate(-50%, 28px) scale(0.6); }
          35% { opacity: 1; transform: translate(-50%, 0) scale(1); }
          70% { box-shadow: 0 0 0 16px rgba(167,139,250,0); }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
