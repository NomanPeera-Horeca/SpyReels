import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";

type VoiceSection = "overview" | "voice" | "audience" | "pillars" | "style";
type VoiceExample = "direct" | "conversational" | "bold";
type StylePreset = "educator" | "story" | "contrarian";

type RemakeHowSpyReelsWritesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const VOICE_EXAMPLES: Record<
  VoiceExample,
  { tag: string; quote: string; summary: string }
> = {
  direct: {
    tag: "Option A — Direct",
    quote: "Stop designing your menu before you understand your kitchen.",
    summary: "Direct and practical",
  },
  conversational: {
    tag: "Option B — Conversational",
    quote: "Before you spend money on your menu, look at your kitchen layout first.",
    summary: "Conversational and clear",
  },
  bold: {
    tag: "Option C — Bold",
    quote: "Your menu is not the reason your restaurant will fail. Your kitchen layout might be.",
    summary: "Bold and punchy",
  },
};

const STYLE_PRESETS: Record<
  StylePreset,
  { title: string; blurb: string; summary: string }
> = {
  educator: {
    title: "Direct Educator",
    blurb: "Strong opening, short explanation, practical takeaway.",
    summary: "Direct Educator · 30–45s · IG + TikTok",
  },
  story: {
    title: "Storyteller",
    blurb: "Personal experience, tension, lesson.",
    summary: "Storyteller · 30–45s · IG + TikTok",
  },
  contrarian: {
    title: "Contrarian Expert",
    blurb: "Challenges common industry advice.",
    summary: "Contrarian Expert · 30–45s · IG + TikTok",
  },
};

const DEFAULT_PILLARS = [
  { id: "1", name: "Profit levers", desc: "Pricing, waste, and margin tips" },
  { id: "2", name: "Menu design", desc: "What to cook, what to cut" },
  { id: "3", name: "Ops systems", desc: "Checklists and kitchen flow" },
  { id: "4", name: "Buildouts", desc: "Layout mistakes to avoid" },
];

export function RemakeHowSpyReelsWritesDialog({
  open,
  onOpenChange,
}: RemakeHowSpyReelsWritesDialogProps) {
  const utils = trpc.useUtils();
  const onboardingQuery = trpc.onboarding.getState.useQuery(undefined, {
    enabled: open,
  });
  const updateProfile = trpc.preferences.updateProfile.useMutation({
    onSuccess: () => {
      void utils.onboarding.getState.invalidate();
      toast.success("Personalization saved");
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message || "Could not save"),
  });

  const [section, setSection] = useState<VoiceSection>("overview");
  const [example, setExample] = useState<VoiceExample>("direct");
  const [style, setStyle] = useState<StylePreset>("educator");
  const [audWho, setAudWho] = useState("your ideal customers");
  const [audWant, setAudWant] = useState("get a clear next step from every Reel");
  const [businessNote, setBusinessNote] = useState("");
  const [problems, setProblems] = useState<string[]>([
    "Too much guesswork",
    "Inconsistent posting",
  ]);
  const [pillars, setPillars] = useState(DEFAULT_PILLARS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open || !onboardingQuery.data) return;
    setSection("overview");
    setDirty(false);
    const aud = onboardingQuery.data.targetAudience?.trim();
    const biz = onboardingQuery.data.businessDescription?.trim();
    if (aud) {
      setAudWho(aud);
      setAudWant("get practical advice they can use this week");
    }
    if (biz) setBusinessNote(biz);
  }, [open, onboardingQuery.data]);

  const overviewLead = useMemo(() => {
    const voice = VOICE_EXAMPLES[example].summary.toLowerCase();
    return `You create ${voice} videos for ${audWho}. Your content uses short sentences, strong hooks, real examples, and minimal jargon.`;
  }, [audWho, example]);

  const save = () => {
    const audience = `You create content for ${audWho} who want to ${audWant}.`;
    const voiceHint = VOICE_EXAMPLES[example].summary;
    const styleHint = STYLE_PRESETS[style].title;
    const pillarNames = pillars.map((p) => p.name).join(", ");
    const description =
      businessNote.trim() ||
      `${voiceHint}. Reel style: ${styleHint}. Content pillars: ${pillarNames}.`;
    updateProfile.mutate({
      businessDescription: description.slice(0, 1000),
      targetAudience: audience.slice(0, 1000),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(88vh,760px)] max-w-[min(980px,calc(100%-1rem))] flex-col gap-0 overflow-hidden border-[#2a2640] bg-[#1a1724] p-0 text-[#f3f0fa]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>How SpyReels writes</DialogTitle>
          <DialogDescription>Review how SpyReels understands you</DialogDescription>
        </DialogHeader>
        <style>{VOICE_CSS}</style>

        <div className="vh-head">
          <div>
            <strong>How SpyReels writes</strong>
            <div className="vh-muted" style={{ fontSize: 13, marginTop: 2 }}>
              Review how SpyReels understands you
            </div>
          </div>
          <button type="button" className="vh-x" onClick={() => onOpenChange(false)}>
            ×
          </button>
        </div>

        <div className="vh-layout">
          <nav className="vh-nav">
            {(
              [
                ["overview", "✦", "Overview", "Does this sound right?"],
                ["voice", "🎙", "Your voice", VOICE_EXAMPLES[example].summary],
                ["audience", "👥", "Your audience", audWho.slice(0, 28)],
                ["pillars", "▦", "Content pillars", `${pillars.length} themes`],
                ["style", "▶", "Reel style", STYLE_PRESETS[style].title],
              ] as const
            ).map(([id, ico, title, sub]) => (
              <button
                key={id}
                type="button"
                className={`vh-step${section === id ? " on" : ""}`}
                onClick={() => setSection(id)}
              >
                <span className="vh-ico">{ico}</span>
                <span>
                  <strong>{title}</strong>
                  <span>{sub}</span>
                </span>
                <span className="vh-done">✓</span>
              </button>
            ))}
          </nav>

          <div className="vh-main">
            {section === "overview" ? (
              <div>
                <h3>How SpyReels understands you</h3>
                <p className="vh-lead">{overviewLead}</p>
                <div className="vh-overview-actions">
                  <button
                    type="button"
                    className="vh-btn vh-btn-primary"
                    onClick={() => {
                      toast.message("Looks good");
                      setSection("voice");
                    }}
                  >
                    Sounds right
                  </button>
                  <button
                    type="button"
                    className="vh-btn vh-btn-ghost"
                    onClick={() => setSection("voice")}
                  >
                    Edit details
                  </button>
                </div>
                <div className="vh-sum-grid">
                  <button type="button" className="vh-sum-card" onClick={() => setSection("voice")}>
                    <div className="k">Your voice</div>
                    <div className="v">{VOICE_EXAMPLES[example].summary}</div>
                    <span className="link">Edit</span>
                  </button>
                  <button
                    type="button"
                    className="vh-sum-card"
                    onClick={() => setSection("audience")}
                  >
                    <div className="k">Your audience</div>
                    <div className="v">{audWho}</div>
                    <span className="link">Edit</span>
                  </button>
                  <button
                    type="button"
                    className="vh-sum-card"
                    onClick={() => setSection("pillars")}
                  >
                    <div className="k">Content pillars</div>
                    <div className="v">{pillars.map((p) => p.name).join(", ")}</div>
                    <span className="link">Edit</span>
                  </button>
                  <button type="button" className="vh-sum-card" onClick={() => setSection("style")}>
                    <div className="k">Reel style</div>
                    <div className="v">{STYLE_PRESETS[style].summary}</div>
                    <span className="link">Edit</span>
                  </button>
                </div>
              </div>
            ) : null}

            {section === "voice" ? (
              <div>
                <h3>Your voice</h3>
                <p className="vh-lead">Which sounds most like you?</p>
                <div className="vh-example-grid">
                  {(Object.keys(VOICE_EXAMPLES) as VoiceExample[]).map((key) => (
                    <div
                      key={key}
                      className={`vh-example${example === key ? " on" : ""}`}
                      onClick={() => {
                        setExample(key);
                        setDirty(true);
                      }}
                    >
                      <div className="tag">{VOICE_EXAMPLES[key].tag}</div>
                      <div className="quote">“{VOICE_EXAMPLES[key].quote}”</div>
                      <div className="react-row">
                        <button
                          type="button"
                          className={`react${example === key ? " on" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExample(key);
                            setDirty(true);
                          }}
                        >
                          Sounds like me
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="vh-field" style={{ marginTop: 14 }}>
                  <label>Business / offer note</label>
                  <textarea
                    value={businessNote}
                    onChange={(e) => {
                      setBusinessNote(e.target.value.slice(0, 1000));
                      setDirty(true);
                    }}
                    placeholder="What you do in one or two sentences"
                  />
                </div>
              </div>
            ) : null}

            {section === "audience" ? (
              <div>
                <h3>Your audience</h3>
                <p className="vh-lead">One sentence SpyReels can use for every Reel.</p>
                <p className="vh-sentence">
                  You create content for{" "}
                  <span
                    className="vh-editable"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      setAudWho(e.currentTarget.textContent?.trim() || audWho);
                      setDirty(true);
                    }}
                  >
                    {audWho}
                  </span>{" "}
                  who want to{" "}
                  <span
                    className="vh-editable"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      setAudWant(e.currentTarget.textContent?.trim() || audWant);
                      setDirty(true);
                    }}
                  >
                    {audWant}
                  </span>
                  .
                </p>
                <div className="vh-field">
                  <label>Their biggest problems</label>
                </div>
                <div className="vh-tag-list">
                  {problems.map((p) => (
                    <span key={p} className="vh-tag">
                      {p}
                      <button
                        type="button"
                        onClick={() => {
                          setProblems((prev) => prev.filter((x) => x !== p));
                          setDirty(true);
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className="vh-btn vh-btn-ghost vh-btn-sm"
                  onClick={() => {
                    const next = window.prompt("Add a problem");
                    if (next?.trim()) {
                      setProblems((prev) => [...prev, next.trim()]);
                      setDirty(true);
                    }
                  }}
                >
                  Add another problem
                </button>
              </div>
            ) : null}

            {section === "pillars" ? (
              <div>
                <h3>Content pillars</h3>
                <p className="vh-lead">The themes your Reels usually come back to.</p>
                <div className="vh-pillar-list">
                  {pillars.map((p) => (
                    <div key={p.id} className="vh-pillar-card">
                      <div>
                        <strong>{p.name}</strong>
                        <p>{p.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="vh-btn vh-btn-ghost"
                  onClick={() => {
                    const name = window.prompt("Pillar name");
                    if (!name?.trim()) return;
                    setPillars((prev) => [
                      ...prev,
                      {
                        id: String(Date.now()),
                        name: name.trim(),
                        desc: "Custom theme",
                      },
                    ]);
                    setDirty(true);
                  }}
                >
                  Add content pillar
                </button>
              </div>
            ) : null}

            {section === "style" ? (
              <div>
                <h3>Reel style</h3>
                <p className="vh-lead">Pick the style that feels most natural when you film.</p>
                <div className="vh-preset-grid">
                  {(Object.keys(STYLE_PRESETS) as StylePreset[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`vh-preset${style === key ? " on" : ""}`}
                      onClick={() => {
                        setStyle(key);
                        setDirty(true);
                      }}
                    >
                      <div className="top">
                        <strong>{STYLE_PRESETS[key].title}</strong>
                        {key === "educator" ? (
                          <span className="badge-rec">Recommended</span>
                        ) : null}
                      </div>
                      <p>{STYLE_PRESETS[key].blurb}</p>
                    </button>
                  ))}
                </div>
                <div className="vh-style-summary">
                  Typical length: 30–45 seconds
                  <br />
                  Platforms: Instagram and TikTok
                  <br />
                  CTA: Save or comment
                  <br />
                  B-roll: Added where it improves understanding
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="vh-foot">
          <span className={`vh-unsaved${dirty ? " dirty" : ""}`}>
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="vh-btn vh-btn-ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="vh-btn vh-btn-primary"
              disabled={updateProfile.isPending}
              onClick={save}
            >
              {updateProfile.isPending ? "Saving…" : "Save personalization"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const VOICE_CSS = `
.vh-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; padding:14px 16px; border-bottom:1px solid #2a2640; }
.vh-head strong { font-size:16px; }
.vh-muted { color:#a39db8; }
.vh-x { border:0; background:transparent; color:#a39db8; font-size:22px; cursor:pointer; }
.vh-layout { display:grid; grid-template-columns:240px 1fr; flex:1; min-height:0; overflow:hidden; }
@media (max-width:820px){ .vh-layout{ grid-template-columns:1fr; } .vh-nav{ display:flex; overflow:auto; border-right:0; border-bottom:1px solid #2a2640; } }
.vh-nav { border-right:1px solid #2a2640; padding:10px; overflow:auto; background:rgba(0,0,0,0.18); }
.vh-step { width:100%; text-align:left; display:flex; gap:10px; align-items:flex-start; border:0; background:transparent; color:#d8d4e6; border-radius:12px; padding:10px; cursor:pointer; margin-bottom:4px; }
.vh-step.on { background:rgba(124,58,237,0.16); }
.vh-step strong { display:block; font-size:13px; }
.vh-step span span { display:block; font-size:11px; color:#a39db8; margin-top:2px; }
.vh-ico { width:22px; flex-shrink:0; }
.vh-done { margin-left:auto; color:#34d399; font-weight:800; }
.vh-main { overflow:auto; padding:18px 20px; }
.vh-main h3 { font-size:18px; font-weight:800; margin-bottom:6px; }
.vh-lead { color:#a39db8; margin-bottom:14px; line-height:1.45; }
.vh-overview-actions { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
.vh-sum-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
@media (max-width:640px){ .vh-sum-grid{ grid-template-columns:1fr; } }
.vh-sum-card { text-align:left; border:1px solid #2a2640; background:rgba(0,0,0,0.2); border-radius:12px; padding:12px; color:#f3f0fa; cursor:pointer; }
.vh-sum-card .k { font-size:11px; color:#a39db8; font-weight:700; margin-bottom:4px; }
.vh-sum-card .v { font-size:13px; font-weight:650; margin-bottom:8px; }
.vh-sum-card .link { color:#c4b5fd; font-size:12px; font-weight:700; text-decoration:underline; }
.vh-btn { border:0; border-radius:10px; font-weight:700; padding:10px 14px; cursor:pointer; font-size:14px; }
.vh-btn-primary { background:#7c3aed; color:#fff; }
.vh-btn-ghost { background:transparent; color:#a39db8; border:1px solid #2a2640; }
.vh-btn-sm { padding:7px 11px; border-radius:999px; font-size:13px; }
.vh-example-grid { display:grid; gap:10px; }
.vh-example { border:1px solid #2a2640; border-radius:14px; padding:12px; background:rgba(0,0,0,0.2); cursor:pointer; }
.vh-example.on { border-color:#7c3aed; background:rgba(124,58,237,0.12); }
.vh-example .tag { font-size:12px; font-weight:800; color:#c4b5fd; margin-bottom:6px; }
.vh-example .quote { font-size:14px; line-height:1.45; margin-bottom:10px; }
.vh-example .react { border:1px solid #2a2640; background:transparent; color:#ddd6fe; border-radius:999px; padding:6px 10px; font-size:12px; font-weight:700; cursor:pointer; }
.vh-example .react.on { background:rgba(124,58,237,0.25); border-color:#7c3aed; }
.vh-field { margin-top:10px; }
.vh-field label { display:block; font-size:12px; color:#a39db8; margin-bottom:6px; font-weight:700; }
.vh-field textarea, .vh-field input { width:100%; border-radius:10px; border:1px solid #2a2640; background:rgba(0,0,0,0.28); color:#f3f0fa; padding:10px 12px; }
.vh-sentence { line-height:1.7; font-size:15px; margin-bottom:14px; }
.vh-editable { display:inline; border-bottom:1px dashed rgba(196,181,253,0.6); color:#ddd6fe; padding:0 2px; outline:none; }
.vh-tag-list { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px; }
.vh-tag { display:inline-flex; align-items:center; gap:6px; border-radius:999px; background:rgba(124,58,237,0.16); color:#ddd6fe; padding:6px 10px; font-size:12px; font-weight:650; }
.vh-tag button { border:0; background:transparent; color:#a39db8; cursor:pointer; }
.vh-pillar-list { display:grid; gap:10px; margin:14px 0; }
.vh-pillar-card { background:rgba(0,0,0,0.2); border-radius:14px; padding:14px; }
.vh-pillar-card strong { display:block; font-size:15px; }
.vh-pillar-card p { font-size:13px; color:#a39db8; margin-top:3px; }
.vh-preset-grid { display:grid; gap:12px; margin:14px 0; }
.vh-preset { text-align:left; width:100%; border:1px solid transparent; background:rgba(0,0,0,0.22); border-radius:14px; padding:14px; cursor:pointer; color:#f3f0fa; }
.vh-preset.on { border-color:#7c3aed; background:rgba(124,58,237,0.12); }
.vh-preset .top { display:flex; justify-content:space-between; gap:8px; align-items:center; margin-bottom:6px; }
.vh-preset p { font-size:14px; color:#a39db8; line-height:1.45; }
.badge-rec { font-size:11px; font-weight:800; color:#a7f3d0; background:rgba(52,211,153,0.15); border-radius:999px; padding:3px 8px; }
.vh-style-summary { background:rgba(0,0,0,0.18); border-radius:12px; padding:12px 14px; margin-top:8px; font-size:14px; color:#d8d4e0; line-height:1.55; }
.vh-foot { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; padding:12px 16px; border-top:1px solid #2a2640; background:rgba(0,0,0,0.22); }
.vh-unsaved { font-size:13px; color:#a39db8; font-weight:650; }
.vh-unsaved.dirty { color:#fbbf24; }
`;
