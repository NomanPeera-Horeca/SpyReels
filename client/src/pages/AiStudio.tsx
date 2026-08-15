import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CirclePlay,
  Clapperboard,
  Download,
  FileVideo,
  Mic2,
  RefreshCw,
  Sparkles,
  Upload,
  UserRound,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type StudioStep = "home" | "setup" | "storyboard" | "render" | "review";
type SetupStep = 1 | 2 | 3;

type Scene = {
  id: number;
  title: string;
  script: string;
  type: "Presenter" | "B-roll" | "Graphic";
  score: number;
};

const scenes: Scene[] = [
  { id: 1, title: "Hook", script: "Your menu may be hiding your most profitable item.", type: "Presenter", score: 97 },
  { id: 2, title: "Problem", script: "Show a crowded menu with no visual hierarchy.", type: "B-roll", score: 95 },
  { id: 3, title: "Teaching", script: "Customers do not read menus from top to bottom.", type: "Presenter", score: 94 },
  { id: 4, title: "Visual example", script: "Animate the eye path across contrast and spacing.", type: "Graphic", score: 96 },
  { id: 5, title: "Explanation", script: "When every item looks the same, profitable dishes disappear.", type: "Presenter", score: 92 },
  { id: 6, title: "Solution", script: "Highlight one item with breathing room and a short description.", type: "B-roll", score: 95 },
  { id: 7, title: "Ending", script: "A menu should guide customers toward what you want them to buy.", type: "Presenter", score: 94 },
];

const presenterStyles = [
  { id: "office", label: "Office authority", note: "Clean background, medium shot" },
  { id: "podcast", label: "Podcast style", note: "Seated, close and conversational" },
  { id: "whiteboard", label: "Whiteboard", note: "Teaching with visual explanation" },
  { id: "warehouse", label: "Warehouse", note: "Practical industry authority" },
  { id: "studio", label: "Dark studio", note: "Premium and high contrast" },
  { id: "walking", label: "Walking talk", note: "Casual movement and energy" },
];

function UploadCard({ icon: Icon, title, description, accept }: { icon: typeof Upload; title: string; description: string; accept: string }) {
  return (
    <label className="group flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background/40 p-6 text-center transition hover:border-primary/60 hover:bg-primary/5">
      <Icon className="mb-3 h-8 w-8 text-primary" />
      <span className="font-semibold">{title}</span>
      <span className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</span>
      <span className="mt-4 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold">Choose file</span>
      <input className="hidden" type="file" accept={accept} onChange={() => toast.success(`${title} selected`)} />
    </label>
  );
}

export default function AiStudio() {
  const [step, setStep] = useState<StudioStep>("home");
  const [setupStep, setSetupStep] = useState<SetupStep>(1);
  const [presenterStyle, setPresenterStyle] = useState("office");
  const [renderProgress, setRenderProgress] = useState(0);
  const [sceneScores, setSceneScores] = useState<Record<number, number>>(() => Object.fromEntries(scenes.map(scene => [scene.id, scene.score])));

  const renderTasks = useMemo(() => [
    { label: "Directing voice performance", threshold: 20 },
    { label: "Generating presenter scenes", threshold: 43 },
    { label: "Adding B-roll and captions", threshold: 66 },
    { label: "Quality-checking every scene", threshold: 84 },
    { label: "Rendering final 9:16 video", threshold: 100 },
  ], []);

  const startRender = () => {
    setStep("render");
    setRenderProgress(0);
    let value = 0;
    const timer = window.setInterval(() => {
      value += 2;
      setRenderProgress(value);
      if (value >= 100) {
        window.clearInterval(timer);
        window.setTimeout(() => setStep("review"), 500);
      }
    }, 90);
  };

  const regenerateScene = (sceneId: number) => {
    setSceneScores(previous => ({ ...previous, [sceneId]: 0 }));
    toast.message("Regenerating scene…");
    window.setTimeout(() => {
      setSceneScores(previous => ({ ...previous, [sceneId]: 97 }));
      toast.success("Scene regenerated");
    }, 1400);
  };

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <Badge variant="secondary" className="mb-3 gap-1.5 border border-primary/25 bg-primary/10 text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Phase 2: Camera-free content
          </Badge>
          <h1 className="text-4xl font-black tracking-tight md:text-5xl">
            Your face. Your voice. <span className="bg-gradient-to-r from-primary via-fuchsia-500 to-orange-400 bg-clip-text text-transparent">Zero camera time.</span>
          </h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Turn an approved SpyReels script into a polished Reel using your AI clone, natural delivery, branded captions, B-roll and scene-level quality control.
          </p>
        </div>
        {step !== "home" ? (
          <Button variant="outline" onClick={() => setStep("home")}><ArrowLeft className="mr-2 h-4 w-4" />Back to AI Studio</Button>
        ) : null}
      </header>

      {step === "home" ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
          <div className="space-y-6">
            <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/10">
              <CardContent className="p-6 md:p-8">
                <div className="text-xs font-bold uppercase tracking-wider text-primary">Today&apos;s approved script</div>
                <Badge className="mt-4 bg-orange-500/10 text-orange-300 hover:bg-orange-500/10">Menu psychology · 42 sec</Badge>
                <h2 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight">The menu mistake that makes your most profitable item invisible.</h2>
                <p className="mt-3 max-w-2xl text-muted-foreground">Customers do not read a menu from top to bottom. Their eyes are pulled toward contrast, spacing and visual weight.</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button size="lg" onClick={() => setStep("storyboard")}><WandSparkles className="mr-2 h-4 w-4" />Generate video</Button>
                  <Button size="lg" variant="outline">Edit script</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Your AI clone status</CardTitle></CardHeader>
              <CardContent className="grid gap-3">
                {[
                  [UserRound, "Digital twin", "Natural upper-body presenter"],
                  [Mic2, "Voice clone", "Confident, natural delivery"],
                  [Clapperboard, "Creator style", "Captions, pacing, B-roll and CTA"],
                ].map(([Icon, title, note]) => (
                  <div key={String(title)} className="flex items-center justify-between rounded-xl border border-border bg-background/40 p-4">
                    <div className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></div><div><div className="font-semibold">{String(title)}</div><div className="text-sm text-muted-foreground">{String(note)}</div></div></div>
                    <Badge variant="outline" className="border-emerald-500/25 bg-emerald-500/10 text-emerald-300">Ready</Badge>
                  </div>
                ))}
                <Button variant="outline" onClick={() => { setSetupStep(1); setStep("setup"); }}><UserRound className="mr-2 h-4 w-4" />Update AI clone</Button>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card><CardHeader><CardTitle>Video defaults</CardTitle></CardHeader><CardContent className="grid grid-cols-3 gap-3">{[["9:16", "Format"], ["42s", "Length"], ["7", "Scenes"]].map(([value, label]) => <div key={label} className="rounded-xl border bg-background/40 p-4"><div className="text-2xl font-black">{value}</div><div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div></div>)}</CardContent></Card>
            <Card><CardHeader><CardTitle>SpyReels handles everything</CardTitle></CardHeader><CardContent className="space-y-3">{[[Sparkles,"Performance direction","Pauses, emphasis and energy"],[FileVideo,"Automatic B-roll","Inserted where the story needs it"],[Clapperboard,"Dynamic captions","Brand colors and keyword highlights"]].map(([Icon,title,note])=><div key={String(title)} className="flex gap-3 rounded-xl border p-4"><Icon className="mt-0.5 h-5 w-5 text-primary"/><div><div className="font-semibold">{String(title)}</div><div className="text-sm text-muted-foreground">{String(note)}</div></div></div>)}</CardContent></Card>
          </div>
        </div>
      ) : null}

      {step === "setup" ? (
        <Card>
          <CardHeader><div className="flex items-center justify-between"><div><CardTitle>Create your AI presenter</CardTitle><p className="mt-1 text-sm text-muted-foreground">One-time setup. Future videos take one click.</p></div><Badge variant="outline">Step {setupStep} of 3</Badge></div></CardHeader>
          <CardContent>
            <div className="mb-6 grid grid-cols-3 gap-2">{[1,2,3].map(index => <div key={index} className={cn("h-1.5 rounded-full bg-muted", index <= setupStep && "bg-primary")} />)}</div>
            {setupStep === 1 ? <div><div className="grid gap-4 md:grid-cols-2"><UploadCard icon={FileVideo} title="Training video" description="Upload 3–5 minutes of natural talking with upper body and hand movement visible." accept="video/*"/><UploadCard icon={Mic2} title="Voice samples" description="Upload clean speech with different emotions, energy and storytelling." accept="audio/*,video/*"/></div><div className="mt-6 flex justify-end"><Button onClick={() => setSetupStep(2)}>Continue<ChevronRight className="ml-2 h-4 w-4"/></Button></div></div> : null}
            {setupStep === 2 ? <div><div className="grid gap-4 md:grid-cols-2">{[["Speaking style",["Confident and natural","High energy","Calm teacher","Storytelling"]],["Average pace",["Medium-fast","Medium","Fast","Slow and deliberate"]],["Hook energy",["High","Very high","Balanced"]],["CTA style",["Soft and confident","Direct","No CTA"]]].map(([label,options])=><div key={String(label)}><label className="mb-2 block text-sm font-medium">{String(label)}</label><Select defaultValue={(options as string[])[0]}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{(options as string[]).map(option=><SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></div>)}</div><div className="mt-6 flex justify-between"><Button variant="ghost" onClick={()=>setSetupStep(1)}>Back</Button><Button onClick={()=>setSetupStep(3)}>Continue<ChevronRight className="ml-2 h-4 w-4"/></Button></div></div> : null}
            {setupStep === 3 ? <div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{presenterStyles.map(style=><button key={style.id} onClick={()=>setPresenterStyle(style.id)} className={cn("rounded-2xl border p-4 text-left transition", presenterStyle===style.id ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:border-primary/40")}><div className="font-semibold">{style.label}</div><div className="mt-1 text-sm text-muted-foreground">{style.note}</div></button>)}</div><div className="mt-6 flex justify-between"><Button variant="ghost" onClick={()=>setSetupStep(2)}>Back</Button><Button onClick={()=>{toast.success("AI clone saved");setStep("storyboard")}}>Save AI clone<Sparkles className="ml-2 h-4 w-4"/></Button></div></div> : null}
          </CardContent>
        </Card>
      ) : null}

      {step === "storyboard" ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
          <Card><CardHeader><div className="flex items-center justify-between"><div><CardTitle>SpyReels built your video</CardTitle><p className="mt-1 text-sm text-muted-foreground">Review the direction before rendering.</p></div><Badge variant="outline">7 scenes · 42 sec</Badge></div></CardHeader><CardContent className="space-y-3">{scenes.map(scene=><div key={scene.id} className="grid grid-cols-[48px_1fr_auto] items-center gap-3 rounded-xl border bg-background/40 p-3"><div className="grid h-12 w-12 place-items-center rounded-xl bg-muted font-bold">{scene.id}</div><div><div className="font-semibold">{scene.title}</div><div className="text-sm text-muted-foreground">{scene.script}</div></div><Badge variant="secondary" className={scene.type==="B-roll"?"text-orange-300":"text-primary"}>{scene.type}</Badge></div>)}<Button size="lg" className="mt-3 w-full" onClick={startRender}><WandSparkles className="mr-2 h-4 w-4"/>Generate final video</Button></CardContent></Card>
          <div className="space-y-6"><Card><CardHeader><CardTitle>Presenter settings</CardTitle></CardHeader><CardContent className="space-y-3">{[["Visual setup",presenterStyles.find(item=>item.id===presenterStyle)?.label ?? "Office authority"],["Voice performance","Confident · medium-fast"],["Captions","Bold keywords · yellow highlight"]].map(([label,value])=><div key={label} className="flex justify-between rounded-xl border p-4"><div><div className="font-semibold">{label}</div><div className="text-sm text-muted-foreground">{value}</div></div><Button size="sm" variant="ghost">Change</Button></div>)}</CardContent></Card><Card><CardHeader><CardTitle>Humanization layer</CardTitle></CardHeader><CardContent className="space-y-3">{["Natural pauses before key claims","Close, medium and B-roll camera cuts","Hook 9/10 · teaching 6/10 energy"].map(item=><div key={item} className="flex items-center gap-3 rounded-xl border p-4"><Check className="h-4 w-4 text-emerald-400"/><span className="text-sm">{item}</span></div>)}</CardContent></Card></div>
        </div>
      ) : null}

      {step === "render" ? <Card><CardContent className="mx-auto max-w-2xl p-8 text-center"><div className="mx-auto mb-5 grid h-24 w-24 place-items-center rounded-full border-8 border-muted border-t-primary text-lg font-black">{renderProgress}%</div><h2 className="text-2xl font-bold">Creating your Reel…</h2><p className="mt-2 text-muted-foreground">You can leave this page. SpyReels will notify you when the video is ready.</p><Progress className="mt-6" value={renderProgress}/><div className="mt-6 space-y-2 text-left">{renderTasks.map(task=><div key={task.label} className="flex items-center justify-between rounded-xl border p-3"><span className="text-sm">{task.label}</span><span className={cn("text-xs text-muted-foreground",renderProgress>=task.threshold&&"text-emerald-400")}>{renderProgress>=task.threshold?"Done ✓":"Waiting"}</span></div>)}</div></CardContent></Card> : null}

      {step === "review" ? <div className="grid gap-6 xl:grid-cols-[360px_1fr]"><Card><CardContent className="p-6"><div className="mx-auto aspect-[9/16] max-w-[280px] overflow-hidden rounded-[2rem] border-[10px] border-muted bg-gradient-to-b from-zinc-700 to-zinc-950 p-5"><div className="flex h-full flex-col items-center justify-end"><div className="mb-20 rounded-xl bg-black/45 px-3 py-2 text-center text-lg font-black">Your menu may be hiding your <span className="bg-yellow-400 px-1 text-black">most profitable item.</span></div><Button size="icon" className="h-12 w-12 rounded-full"><CirclePlay className="h-6 w-6"/></Button></div></div><div className="mt-5 flex gap-2"><Button className="flex-1" onClick={()=>toast.success("Export queued")}><Download className="mr-2 h-4 w-4"/>Export Reel</Button><Button variant="outline">Hook variation</Button></div></CardContent></Card><div className="space-y-6"><Card><CardHeader><div className="flex justify-between"><div><CardTitle>Your video is ready</CardTitle><p className="mt-1 text-sm text-muted-foreground">Regenerate only scenes that need work.</p></div><Badge className="bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/10">Quality 94</Badge></div></CardHeader><CardContent className="space-y-3">{scenes.map(scene=><div key={scene.id} className="grid gap-3 rounded-xl border bg-background/40 p-3 sm:grid-cols-[64px_1fr_auto]"><div className="grid h-14 place-items-center rounded-lg bg-muted font-bold">{scene.id}</div><div><div className="font-semibold">{scene.title}</div><div className="text-sm text-muted-foreground">{scene.script}</div><Button className="mt-2" size="sm" variant="outline" onClick={()=>regenerateScene(scene.id)}><RefreshCw className="mr-2 h-3.5 w-3.5"/>Regenerate scene</Button></div><Badge variant="outline" className={cn("h-fit",sceneScores[scene.id]===0?"text-amber-300":"text-emerald-300")}>{sceneScores[scene.id]===0?"Rendering…":`${sceneScores[scene.id]}/100`}</Badge></div>)}</CardContent></Card><Card><CardHeader><CardTitle>Final checks</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3">{[["96","Voice naturalness"],["93","Lip sync"],["94","Brand consistency"]].map(([value,label])=><div key={label} className="rounded-xl border p-4"><div className="text-2xl font-black">{value}</div><div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div></div>)}</CardContent></Card></div></div> : null}
    </div>
  );
}
