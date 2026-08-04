import { useEffect, useRef, useState } from "react";
import { Clapperboard } from "lucide-react";
import {
  BrollScriptPicker,
  type BrollScriptPick,
} from "@/components/BrollScriptPicker";
import { BrollResultsPanel } from "@/components/BrollResultsPanel";
import { Button } from "@/components/ui/button";
import { consumeBrollPendingScript } from "@/lib/brollPendingScript";

export default function BrollLibrary() {
  const [selected, setSelected] = useState<BrollScriptPick | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [panelContent, setPanelContent] = useState("");
  const [panelScriptId, setPanelScriptId] = useState<number | undefined>();
  const [panelTitle, setPanelTitle] = useState<string | undefined>();
  const [autoGenerate, setAutoGenerate] = useState(false);
  const stashConsumedRef = useRef(false);

  // After public funnel auth: consume stashed script and auto-run generation.
  useEffect(() => {
    if (stashConsumedRef.current) return;
    const pending = consumeBrollPendingScript();
    if (!pending.content) return;
    stashConsumedRef.current = true;
    setPanelContent(pending.content);
    setPanelScriptId(undefined);
    setPanelTitle("Pasted script");
    setAutoGenerate(pending.autostart);
    setResultsOpen(true);
  }, []);

  const openForScript = (script: BrollScriptPick) => {
    setSelected(script);
    setPanelContent(script.content);
    setPanelScriptId(script.id);
    setPanelTitle(script.title);
    setAutoGenerate(true);
    setResultsOpen(true);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Clapperboard className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">B-Roll Library</h1>
          <p className="text-sm text-muted-foreground">
            Pick a script, get beat-matched stock video from Pexels
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Choose a script</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Single select. We split it into beats and search Pexels once per generation.
            </p>
          </div>
          {selected ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => openForScript(selected)}
              className="shrink-0"
            >
              Find B-roll
            </Button>
          ) : null}
        </div>

        <BrollScriptPicker
          selectedId={selected?.id ?? null}
          onSelect={openForScript}
          maxListHeightClassName="max-h-[28rem]"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Videos provided by Pexels. Credit the photographer when you publish.
        Limits count generation runs, not clip downloads.
      </p>

      <BrollResultsPanel
        open={resultsOpen}
        onOpenChange={(open) => {
          setResultsOpen(open);
          if (!open) setAutoGenerate(false);
        }}
        content={panelContent}
        scriptId={panelScriptId}
        title={panelTitle}
        autoGenerate={autoGenerate}
      />
    </div>
  );
}
