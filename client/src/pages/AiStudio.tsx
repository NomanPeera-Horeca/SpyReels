import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  ArrowLeft,
  Check,
  CirclePlay,
  Clapperboard,
  Download,
  FileVideo,
  Mic2,
  Sparkles,
  UserRound,
  WandSparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  createAiStudioProfile,
  createAiStudioVideo,
  getAiStudioProfile,
  provisionAiStudioProfile,
  uploadAiStudioTrainingFile,
  waitForAiStudioJob,
  waitForAiStudioProfile,
  type AiStudioJob,
  type AiStudioProfile,
  type AiStudioSceneInput,
} from "@/lib/aiStudioApi";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type StudioStep = "home" | "setup" | "training" | "storyboard" | "render" | "review";
type PresenterStyle = "office" | "podcast" | "whiteboard" | "warehouse" | "studio" | "walking";

type CloneItem = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  description: string;
};

const VIDEO_TITLE = "The menu mistake that makes your most profitable item invisible.";

const SCENE_COPY = [
  ["Hook", "Your menu may be hiding your most profitable item.", "presenter", 5],
  ["Problem", "Show a crowded menu with no visual hierarchy.", "broll", 5],
  ["Teaching", "Customers do not read menus from top to bottom.", "presenter", 7],
  ["Visual example", "Animate the eye path across contrast and spacing.", "graphic", 5],
  ["Explanation", "When every item looks the same, profitable dishes disappear.", "presenter", 7],
  ["Solution", "Highlight one item with breathing room and a short description.", "broll", 6],
  ["Ending", "A menu should guide customers toward what you want them to buy.", "presenter", 7],
] as const;

const SCENES: AiStudioSceneInput[] = SCENE_COPY.map((scene, order) => ({
  id: `scene-${order + 1}`,
  order,
  type: scene[2],
  script: scene[1],
  durationSeconds: scene[3],
  emotion: order === 0 ? "excited" : order === SCENE_COPY.length - 1 ? "confident" : "serious",
  pace: order === 0 ? "fast" : "medium_fast",
  energy: order === 0 ? 0.9 : 0.64,
  pauseBeforeMs: order === 0 ? 0 : 120,
  pauseAfterMs: order === 0 ? 350 : 180,
  emphasizedWords: order === 0 ? ["most profitable item"] : [],
  visualDirection: scene[1],
  brollQuery: scene[2] === "broll" ? "restaurant menu close up" : undefined,
}));

const PRESENTER_STYLES: Array<{ id: PresenterStyle; label: string; note: string }> = [
  { id: "office", label: "Office authority", note: "Clean background, medium shot" },
  { id: "podcast", label: "Podcast style", note: "Seated and conversational" },
  { id: "whiteboard", label: "Whiteboard", note: "Teaching with visuals" },
  { id: "warehouse", label: "Warehouse", note: "Practical industry authority" },
  { id: "studio", label: "Dark studio", note: "Premium and dramatic" },
  { id: "walking", label: "Walking talk", note: "Casual movement and energy" },
];

const CLONE_ITEMS: CloneItem[] = [
  { icon: UserRound, label: "Digital twin", description: "Your approved presenter" },
  { icon: Mic2, label: "Voice clone", description: "Your natural delivery" },
  { icon: Clapperboard, label: "Creator style", description: "Your captions and pacing" },
];

function FilePicker(props: {
  title: string;
  note: string;
  accept: string;
  file: File | null;
  onChange: (file: File) => void;
  icon: ComponentType<{ className?: string }>;
}) {
  const Icon = props.icon;
  return (
    <label className="flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background/40 p-6 text-center transition hover:border-primary/60 hover:bg-primary/5">
      <Icon className="mb-3 h-8 w-8 text-primary" />
      <strong>{props.title}</strong>
      <span className="mt-1 max-w-xs text-sm text-muted-foreground">{props.note}</span>
      <span className="mt-4 max-w-full truncate rounded-lg border px-3 py-2 text-xs font-semibold">
        {props.file?.name || "Choose file"}
      </span>
      <input
        className="hidden"
        type="file"
        accept={props.accept}
        onChange={event => {
          const selected = event.target.files?.[0];
          if (selected) props.onChange(selected);
        }}
      />
    </label>
  );
}

function profileBadge(profile: AiStudioProfile | null) {
  if (!profile) return { label: "Setup", className: "text-amber-300" };
  if (profile.status === "ready") return { label: "Ready", className: "text-emerald-300" };
  if (profile.status === "failed") return { label: "Needs attention", className: "text-red-300" };
  return { label: "Training", className: "text-violet-300" };
}

export default function AiStudio() {
  const [step, setStep] = useState<StudioStep>("home");
  const [style, setStyle] = useState<PresenterStyle>("office");
  const [trainingVideo, setTrainingVideo] = useState<File | null>(null);
  const [voiceSample, setVoiceSample] = useState<File | null>(null);
  const [profileId, setProfileId] = useState<string | null>(() =>
    localStorage.getItem("spyreels-ai-studio-profile-id")
  );
  const [profile, setProfile] = useState<AiStudioProfile | null>(null);
  const [job, setJob] = useState<AiStudioJob | null>(null);
  const [busy, setBusy] = useState(false);

  const progressRows = useMemo(
    () => [
      ["Directing voice performance", 10],
      ["Generating presenter scenes", 42],
      ["Adding B-roll and captions", 70],
      ["Quality-checking every scene", 92],
      ["Rendering final 9:16 video", 100],
    ] as const,
    []
  );

  useEffect(() => {
    if (!profileId) return;
    void getAiStudioProfile(profileId)
      .then(setProfile)
      .catch(() => {
        localStorage.removeItem("spyreels-ai-studio-profile-id");
        setProfileId(null);
        setProfile(null);
      });
  }, [profileId]);

  useEffect(() => {
    if (!job || ["completed", "failed", "cancelled"].includes(job.status)) return;
    const controller = new AbortController();
    void waitForAiStudioJob(job.id, setJob, { signal: controller.signal })
      .then(result => {
        if (result.status === "completed") setStep("review");
        if (result.status === "failed") toast.error(result.error || "Video generation failed");
      })
      .catch(error => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          toast.error(error instanceof Error ? error.message : "Could not track render progress");
        }
      });
    return () => controller.abort();
  }, [job?.id]);

  async function saveAndTrainClone() {
    if (!trainingVideo || !voiceSample) {
      toast.error("Upload both a training video and voice sample");
      return;
    }

    setBusy(true);
    try {
      const created = await createAiStudioProfile({
        name: "My AI Clone",
        presenterStyle: style,
      });
      await Promise.all([
        uploadAiStudioTrainingFile({
          profileId: created.id,
          kind: "training-video",
          file: trainingVideo,
        }),
        uploadAiStudioTrainingFile({
          profileId: created.id,
          kind: "voice-sample",
          file: voiceSample,
        }),
      ]);

      localStorage.setItem("spyreels-ai-studio-profile-id", created.id);
      setProfileId(created.id);
      setProfile({ ...created, status: "training" });
      setStep("training");
      await provisionAiStudioProfile(created.id);

      const ready = await waitForAiStudioProfile(created.id, setProfile);
      setProfile(ready);
      setStep("storyboard");
      toast.success("Your AI clone is ready");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not train AI clone");
    } finally {
      setBusy(false);
    }
  }

  async function startRender() {
    if (!profileId) {
      setStep("setup");
      return;
    }

    setBusy(true);
    try {
      const created = await createAiStudioVideo({
        creatorProfileId: profileId,
        title: VIDEO_TITLE,
        scenes: SCENES,
      });
      setJob(created);
      setStep("render");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start video generation");
    } finally {
      setBusy(false);
    }
  }

  const badge = profileBadge(profile);

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 md:px-8">
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <Badge variant="secondary" className="mb-3 gap-1 border border-primary/25 bg-primary/10 text-primary">
            <Sparkles className="h-3.5 w-3.5" />Camera-free content
          </Badge>
          <h1 className="text-4xl font-black tracking-tight md:text-5xl">
            Your face. Your voice. <span className="bg-gradient-to-r from-primary via-fuchsia-500 to-orange-400 bg-clip-text text-transparent">Zero camera time.</span>
          </h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Turn an approved SpyReels script into a polished Reel using your AI clone, natural delivery, captions and B-roll.
          </p>
        </div>
        {step !== "home" ? (
          <Button variant="outline" onClick={() => setStep("home")}>
            <ArrowLeft className="mr-2 h-4 w-4" />AI Studio home
          </Button>
        ) : null}
      </header>

      {step === "home" ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
          <Card className="border-primary/20 bg-gradient-to-br from-card via-card to-primary/10">
            <CardContent className="p-8">
              <div className="text-xs font-bold uppercase tracking-wider text-primary">Today&apos;s approved script</div>
              <Badge className="mt-4 bg-orange-500/10 text-orange-300">Menu psychology · 42 sec</Badge>
              <h2 className="mt-4 text-3xl font-bold">{VIDEO_TITLE}</h2>
              <p className="mt-3 text-muted-foreground">
                Customers do not read a menu from top to bottom. Their eyes follow contrast, spacing and visual weight.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  size="lg"
                  onClick={() =>
                    setStep(profile?.status === "ready" ? "storyboard" : profile ? "training" : "setup")
                  }
                >
                  <WandSparkles className="mr-2 h-4 w-4" />Generate video
                </Button>
                <Button size="lg" variant="outline">Edit script</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Your AI clone</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {CLONE_ITEMS.map(item => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center justify-between rounded-xl border p-4">
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-primary" />
                      <div><div className="font-semibold">{item.label}</div><div className="text-sm text-muted-foreground">{item.description}</div></div>
                    </div>
                    <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                  </div>
                );
              })}
              <Button variant="outline" className="w-full" onClick={() => setStep("setup")}>Update AI clone</Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {step === "setup" ? (
        <Card>
          <CardHeader><CardTitle>Create your AI presenter</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <FilePicker title="Training video" note="Upload 3–5 minutes of natural talking with hands visible." accept="video/*" file={trainingVideo} onChange={setTrainingVideo} icon={FileVideo} />
              <FilePicker title="Voice sample" note="Upload clear speech with different emotions and energy." accept="audio/*,video/*" file={voiceSample} onChange={setVoiceSample} icon={Mic2} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PRESENTER_STYLES.map(item => (
                <button key={item.id} onClick={() => setStyle(item.id)} className={cn("rounded-2xl border p-4 text-left transition", style === item.id ? "border-primary bg-primary/10" : "bg-background/40 hover:border-primary/40")}>
                  <strong>{item.label}</strong>
                  <div className="mt-1 text-sm text-muted-foreground">{item.note}</div>
                </button>
              ))}
            </div>
            <Button className="w-full" size="lg" disabled={busy} onClick={saveAndTrainClone}>
              {busy ? "Uploading and training…" : "Create my AI clone"}<Sparkles className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {step === "training" ? (
        <Card>
          <CardContent className="mx-auto max-w-2xl p-8 text-center">
            <div className="mx-auto mb-5 grid h-24 w-24 place-items-center rounded-full border-8 border-muted border-t-primary">
              <UserRound className="h-9 w-9 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">Training your AI clone…</h2>
            <p className="mt-2 text-muted-foreground">
              SpyReels is creating your voice and presenter profile. This can take several minutes.
            </p>
            <Progress className="mt-6" value={profile?.status === "ready" ? 100 : 55} />
            <div className="mt-5 text-sm text-muted-foreground">
              Current status: <span className="font-semibold text-foreground">{profile?.status || "training"}</span>
            </div>
            {profile?.status === "ready" ? (
              <Button className="mt-6" onClick={() => setStep("storyboard")}>Continue to storyboard</Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {step === "storyboard" ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
          <Card>
            <CardHeader><CardTitle>Review your storyboard</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {SCENE_COPY.map((scene, index) => (
                <div key={scene[0]} className="grid grid-cols-[48px_1fr_auto] items-center gap-3 rounded-xl border p-3">
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-muted font-bold">{index + 1}</div>
                  <div><strong>{scene[0]}</strong><div className="text-sm text-muted-foreground">{scene[1]}</div></div>
                  <Badge variant="secondary">{scene[2]}</Badge>
                </div>
              ))}
              <Button className="w-full" size="lg" disabled={busy} onClick={startRender}>
                <WandSparkles className="mr-2 h-4 w-4" />{busy ? "Starting…" : "Generate final video"}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Humanization layer</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {["Natural pauses before key claims", "Close, medium and B-roll cuts", "Hook 9/10 · teaching 6/10 energy"].map(item => (
                <div key={item} className="flex items-center gap-3 rounded-xl border p-4">
                  <Check className="h-4 w-4 text-emerald-400" /><span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {step === "render" ? (
        <Card>
          <CardContent className="mx-auto max-w-2xl p-8 text-center">
            <div className="mx-auto mb-5 grid h-24 w-24 place-items-center rounded-full border-8 border-muted border-t-primary text-lg font-black">{job?.progress ?? 0}%</div>
            <h2 className="text-2xl font-bold">Creating your Reel…</h2>
            <p className="mt-2 text-muted-foreground">{job?.currentStep || "Starting"}</p>
            <Progress className="mt-6" value={job?.progress ?? 0} />
            <div className="mt-6 space-y-2 text-left">
              {progressRows.map(([label, threshold]) => (
                <div key={label} className="flex justify-between rounded-xl border p-3">
                  <span>{label}</span>
                  <span className={(job?.progress ?? 0) >= threshold ? "text-emerald-400" : "text-muted-foreground"}>
                    {(job?.progress ?? 0) >= threshold ? "Done ✓" : "Waiting"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "review" ? (
        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <Card>
            <CardContent className="p-6">
              <div className="mx-auto aspect-[9/16] max-w-[280px] rounded-[2rem] border-[10px] border-muted bg-gradient-to-b from-zinc-700 to-zinc-950 p-5">
                <div className="flex h-full flex-col items-center justify-end">
                  <div className="mb-20 rounded-xl bg-black/45 px-3 py-2 text-center text-lg font-black">
                    Your menu may be hiding your <span className="bg-yellow-400 px-1 text-black">most profitable item.</span>
                  </div>
                  <CirclePlay className="h-12 w-12" />
                </div>
              </div>
              {job?.outputUrl ? (
                <Button asChild className="mt-5 w-full">
                  <a href={job.outputUrl} target="_blank" rel="noreferrer"><Download className="mr-2 h-4 w-4" />Open final output</a>
                </Button>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Your video is ready</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {SCENE_COPY.map((scene, index) => (
                <div key={scene[0]} className="flex items-center justify-between rounded-xl border p-4">
                  <div><strong>Scene {index + 1}: {scene[0]}</strong><div className="text-sm text-muted-foreground">{scene[1]}</div></div>
                  <Badge variant="outline" className="text-emerald-300">Ready</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
