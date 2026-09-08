import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Film,
  History,
  ImagePlus,
  Mic2,
  Play,
  Search,
  Sparkles,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";

const STARTING_SCRIPT = `Opening a restaurant with no experience. Bad idea. Right?

Okay. Fine. Let's do it.

You have no culinary school. No investor backing. No clue what a POS system even is.

And you're still sitting here googling "how to open a restaurant" at midnight.

Same. We did the same thing.

Here's what nobody tells you. Most successful restaurant owners started exactly where you are. Clueless. Passionate. A little bit broke.

The ones who make it learn fast. They hire people smarter than them. And they stop waiting until they feel ready.

Because ready never comes.

You figure out the permits while you're scared. You learn food cost math while you're losing money. You build the menu while people are already asking when you open.

The chaos doesn't go away. You just get better at moving through it.

Open the thing.`;

const STARTING_CAPTION = `You do not need to know everything before you start.

You need to learn faster than the problems arrive.

Save this if you're opening your first restaurant.`;

type WorkspaceTab = "script" | "visuals" | "preview";

const QUICK_ACTIONS = [
  { label: "Stronger hook", icon: WandSparkles },
  { label: "Easier to say", icon: Mic2 },
  { label: "Shorter", icon: Film },
  { label: "More casual", icon: Sparkles },
];

const VISUALS = [
  {
    beat: "Opening hook",
    script: "Opening a restaurant with no experience. Bad idea. Right?",
    visual: "Restaurant owner unlocking the front door before sunrise",
    bg: "linear-gradient(160deg,#7137d8 0%,#2a1f58 42%,#12131f 100%)",
  },
  {
    beat: "Reality check",
    script: "No culinary school. No investor backing. No clue what a POS system even is.",
    visual: "Close-up of kitchen tickets, POS screen and busy prep counter",
    bg: "linear-gradient(160deg,#5840b7 0%,#223158 46%,#111827 100%)",
  },
  {
    beat: "Momentum",
    script: "The chaos doesn't go away. You just get better at moving through it.",
    visual: "Fast dinner service with cooks moving through the line",
    bg: "linear-gradient(160deg,#7c3aed 0%,#3c245c 45%,#16131d 100%)",
  },
];

export function RemakeWorkspaceUiPreviewV2({ onClose }: { onClose?: () => void }) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("script");
  const [script, setScript] = useState(STARTING_SCRIPT);
  const [caption, setCaption] = useState(STARTING_CAPTION);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const hook = useMemo(
    () => script.split(/\n+/).map((line) => line.trim()).find(Boolean) ?? "Your hook will appear here",
    [script]
  );

  const runQuickAction = (label: string) => {
    setAiNote(`${label} suggestion is ready. In the live product this would show a preview before you apply it.`);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-3 text-[#f6f3fb]">
      <div className="flex h-[min(90vh,840px)] w-[min(1180px,100%)] flex-col overflow-hidden rounded-2xl border border-[#2c2840] bg-[#1c1926] shadow-2xl shadow-black/50">
        <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-[#2b273a] px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-[15px] font-semibold text-white">Remake</div>
              <span className="rounded-full border border-[#3d3657] bg-[#262137] px-2 py-0.5 text-[10px] font-medium text-[#b8b0ca]">
                Based on a viral Reel
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-[#8f88a3]">How to start a restaurant with zero experience</p>
          </div>

          <nav className="flex rounded-xl border border-[#332e45] bg-[#17141f] p-1">
            {([
              ["script", "Script"],
              ["visuals", "Visuals"],
              ["preview", "Preview"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  activeTab === id
                    ? "bg-[#302a43] text-white shadow-sm"
                    : "text-[#9f97b3] hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-[#342f46] bg-[#211d2d] px-3 py-2 text-xs font-medium text-[#b5adc7] hover:text-white"
            >
              <History className="h-3.5 w-3.5" />
              Versions
              <span className="rounded bg-[#302a43] px-1.5 py-0.5 text-[10px]">2</span>
            </button>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-lg text-[#91899f] hover:bg-white/5 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[340px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r border-[#2b273a] bg-[#191620]">
            <div className="min-h-0 flex-1 overflow-auto px-4 py-5">
              <div className="flex items-start gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#6f39d9] text-white">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">AI Assist</h3>
                  <p className="mt-1 text-xs leading-5 text-[#928aa5]">Improve the Reel without leaving your workspace.</p>
                </div>
              </div>

              <div className="mt-6">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#736b85]">Improve</div>
                <div className="grid grid-cols-2 gap-2">
                  {QUICK_ACTIONS.map(({ label, icon: Icon }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => runQuickAction(label)}
                      className="group flex min-h-[72px] flex-col items-start justify-between rounded-xl border border-[#312c43] bg-[#211d2b] p-3 text-left transition hover:border-[#5a3d91] hover:bg-[#251f34]"
                    >
                      <Icon className="h-4 w-4 text-[#9f7aea]" />
                      <span className="text-xs font-semibold text-[#d8d2e4] group-hover:text-white">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {aiNote ? (
                <div className="mt-4 rounded-xl border border-[#4a3568] bg-[#241b32] p-3 text-xs leading-5 text-[#cfc5e2]">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold text-white">
                    <Sparkles className="h-3.5 w-3.5 text-[#a67cff]" /> Suggestion ready
                  </div>
                  {aiNote}
                  <div className="mt-3 flex gap-2">
                    <button className="rounded-lg bg-[#7437e8] px-3 py-1.5 font-semibold text-white">Apply</button>
                    <button onClick={() => setAiNote(null)} className="px-2 py-1.5 font-medium text-[#aaa1bc]">Dismiss</button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border-t border-[#2b273a] bg-[#17141e] p-4">
              <div className="mb-2 text-[11px] font-semibold text-[#a59db8]">Ask SpyReels</div>
              <div className="rounded-xl border border-[#353047] bg-[#131019] p-2 focus-within:border-[#6848a0]">
                <textarea
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="Make the hook less generic..."
                  className="h-16 w-full resize-none bg-transparent px-1 text-sm text-white outline-none placeholder:text-[#676174]"
                />
                <div className="flex items-center justify-between pt-1">
                  <button className="text-[11px] font-medium text-[#8e86a0]">Your voice</button>
                  <button
                    type="button"
                    disabled={!aiInput.trim()}
                    onClick={() => {
                      if (!aiInput.trim()) return;
                      setAiNote(`Custom request: ${aiInput.trim()}`);
                      setAiInput("");
                    }}
                    className="grid h-8 w-8 place-items-center rounded-lg bg-[#7437e8] text-white disabled:opacity-35"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </aside>

          <main className="min-h-0 overflow-auto bg-[#211e2b]">
            {activeTab === "script" ? (
              <div className="mx-auto max-w-[780px] px-8 py-7">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-semibold text-white">Video script</h2>
                      <span className="rounded-full bg-[#1d3c32] px-2 py-1 text-[10px] font-semibold text-[#62e1ad]">Ready</span>
                    </div>
                    <p className="mt-1 text-sm text-[#938ca4]">What you will say on camera</p>
                  </div>
                  <button className="inline-flex items-center gap-2 rounded-lg border border-[#342f46] bg-[#1a1723] px-3 py-2 text-xs font-medium text-[#bbb4c8] hover:text-white">
                    <Play className="h-3.5 w-3.5" /> Open teleprompter
                  </button>
                </div>

                <textarea
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  className="min-h-[430px] w-full resize-none rounded-2xl border border-[#302b41] bg-[#18151f] p-5 text-[15px] leading-7 text-[#f0edf4] outline-none transition focus:border-[#5a4382]"
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  {['Improve script', 'Fix grammar', 'Make shorter'].map((label) => (
                    <button
                      key={label}
                      onClick={() => runQuickAction(label)}
                      className="rounded-full border border-[#342f46] bg-[#231f2f] px-3 py-1.5 text-xs font-medium text-[#b7afc5] hover:border-[#523f72] hover:text-white"
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="mt-6 overflow-hidden rounded-2xl border border-[#302b41] bg-[#1a1722]">
                  <button
                    type="button"
                    onClick={() => setCaptionOpen((v) => !v)}
                    className="flex w-full items-center justify-between px-4 py-3.5 text-left"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">Caption</div>
                      <div className="mt-0.5 text-xs text-[#858093]">Secondary publishing text</div>
                    </div>
                    {captionOpen ? <ChevronUp className="h-4 w-4 text-[#8c8599]" /> : <ChevronDown className="h-4 w-4 text-[#8c8599]" />}
                  </button>
                  {captionOpen ? (
                    <div className="border-t border-[#2b2738] p-4">
                      <textarea
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        className="min-h-36 w-full resize-none rounded-xl border border-[#302b41] bg-[#131019] p-4 text-sm leading-6 text-[#ece8f1] outline-none focus:border-[#5a4382]"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {activeTab === "visuals" ? (
              <div className="mx-auto max-w-[820px] px-8 py-7">
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Recommended B-roll</h2>
                    <p className="mt-1 text-sm text-[#938ca4]">Visuals matched to the moments that need them.</p>
                  </div>
                  <button className="inline-flex items-center gap-2 rounded-lg bg-[#7437e8] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-950/20">
                    <WandSparkles className="h-4 w-4" /> Auto-match visuals
                  </button>
                </div>

                <div className="mt-6 space-y-3">
                  {VISUALS.map((item, index) => (
                    <div key={item.beat} className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border border-[#302b41] bg-[#19161f] p-3">
                      <div className="aspect-[9/12] overflow-hidden rounded-xl" style={{ background: item.bg }}>
                        <div className="flex h-full items-end p-2 text-[10px] font-semibold text-white/80">0:0{index + 3}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#81798f]">{item.beat}</div>
                        <p className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-[#e4dfea]">{item.script}</p>
                        <p className="mt-2 line-clamp-1 text-xs text-[#91899f]">{item.visual}</p>
                      </div>
                      <button className="rounded-lg border border-[#383247] px-3 py-2 text-xs font-medium text-[#aaa2b8] hover:border-[#594276] hover:text-white">Replace</button>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex gap-2">
                  <button className="inline-flex items-center gap-2 rounded-lg border border-[#342f46] bg-[#1b1822] px-3 py-2 text-xs font-medium text-[#aaa2b8] hover:text-white"><Search className="h-3.5 w-3.5" /> Search clips</button>
                  <button className="inline-flex items-center gap-2 rounded-lg border border-[#342f46] bg-[#1b1822] px-3 py-2 text-xs font-medium text-[#aaa2b8] hover:text-white"><ImagePlus className="h-3.5 w-3.5" /> Generate</button>
                  <button className="inline-flex items-center gap-2 rounded-lg border border-[#342f46] bg-[#1b1822] px-3 py-2 text-xs font-medium text-[#aaa2b8] hover:text-white"><Upload className="h-3.5 w-3.5" /> Upload</button>
                </div>
              </div>
            ) : null}

            {activeTab === "preview" ? (
              <div className="flex min-h-full items-center justify-center px-8 py-8">
                <div className="flex flex-col items-center">
                  <div className="mb-4 text-center">
                    <h2 className="text-lg font-semibold text-white">Reel preview</h2>
                    <p className="mt-1 text-xs text-[#8f879c]">Check the opening frame before you film.</p>
                  </div>
                  <div className="relative aspect-[9/16] w-[280px] overflow-hidden rounded-[28px] border-2 border-[#433b58] bg-[#111018] shadow-2xl shadow-black/40">
                    <div className="absolute inset-0" style={{ background: VISUALS[0].bg }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20" />
                    <div className="absolute left-4 top-4 text-xs font-semibold text-white">@you</div>
                    <div className="absolute inset-x-4 bottom-16">
                      <div className="text-lg font-bold leading-6 text-white drop-shadow-lg">{hook}</div>
                    </div>
                    <div className="absolute bottom-4 left-4 right-4 h-1 overflow-hidden rounded-full bg-white/15">
                      <div className="h-full w-[22%] rounded-full bg-white/80" />
                    </div>
                  </div>
                  <div className="mt-4 w-[340px] max-w-full rounded-xl border border-[#302b41] bg-[#18151f] px-4 py-3 text-xs leading-5 text-[#aaa3b7]">
                    {caption || "Caption preview will show here"}
                  </div>
                </div>
              </div>
            ) : null}
          </main>
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-[#2b273a] bg-[#17141e] px-5 py-3">
          <div className="flex items-center gap-2 text-xs font-medium text-[#62dda9]">
            <Check className="h-4 w-4" /> Saved automatically
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-[#9c94ab] hover:bg-white/5 hover:text-white"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => setReady(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#7437e8] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-950/25 hover:bg-[#8248ed]"
            >
              {ready ? <Check className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
              {ready ? "Ready to film" : "Ready to film"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
