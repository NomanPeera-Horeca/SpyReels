import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ClipboardPaste, Save, Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { PostDateTimePicker } from "@/components/PostDateTimePicker";

export default function PasteScript() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [postDate, setPostDate] = useState<Date | undefined>(new Date());
  const [postTime, setPostTime] = useState("09:00");
  const [status, setStatus] = useState<"draft" | "approved">("draft");
  const [saving, setSaving] = useState(false);
  const [, navigate] = useLocation();

  const prefsQuery = trpc.preferences.get.useQuery();
  const userTimezone = prefsQuery.data?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const saveScript = trpc.scripts.save.useMutation();

  const handleSave = async (overrideStatus?: "draft" | "approved") => {
    if (!content.trim()) {
      toast.error("Please paste your script content first");
      return;
    }
    const finalStatus = overrideStatus || status;
    setSaving(true);
    try {
      const result = await saveScript.mutateAsync({
        title: title.trim() || "Pasted Script",
        content: content.trim(),
        sourceHandle: undefined,
        reelId: undefined,
        recreatedScriptId: undefined,
        gradeLevel: "auto",
        status: finalStatus,
        postDate: postDate ? postDate.toISOString() : undefined,
        postTime: postTime || undefined,
      });
      toast.success(
        finalStatus === "approved"
          ? "Script approved & saved! Opening in editor..."
          : "Script saved as draft! Opening in editor..."
      );
      navigate(`/scripts/${result.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to save script");
    } finally {
      setSaving(false);
    }
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const estimatedDuration = Math.round(wordCount / 2.5);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <ClipboardPaste className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Paste Your Script</h1>
          <p className="text-sm text-muted-foreground">
            Already have a script from ChatGPT or elsewhere? Paste it here to edit, plan, and schedule.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-1.5 block">Script Title</label>
          <Input
            placeholder="e.g. My Morning Routine Reel"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-card"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium">Script Content</label>
            {wordCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {wordCount} words &middot; ~{estimatedDuration}s
              </span>
            )}
          </div>
          <Textarea
            placeholder="Paste your script here...&#10;&#10;You can paste any script from ChatGPT, Google Docs, Notes, or anywhere else. Once saved, you'll be able to edit it with AI tools, set a post date, add tags, and use the teleprompter."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="bg-card min-h-[300px] text-sm leading-relaxed"
          />
        </div>

        {/* Post Date + Time Picker */}
        <div className="w-48">
          <PostDateTimePicker
            date={postDate}
            onDateChange={setPostDate}
            time={postTime}
            onTimeChange={setPostTime}
            timezone={userTimezone}
          />
          <p className="text-xs text-muted-foreground mt-1">When do you plan to post this reel?</p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2 flex-wrap">
          <Button
            onClick={() => handleSave("draft")}
            disabled={saving || !content.trim()}
            variant="outline"
            className="gap-2"
          >
            {saving && status === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save as Draft
          </Button>
          <Button
            onClick={() => handleSave("approved")}
            disabled={saving || !content.trim()}
            className="gap-2"
          >
            {saving && status === "approved" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Approve & Save
          </Button>
          <p className="text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 inline mr-1" />
            After saving, use AI tools to rewrite, adjust grade level, add delivery cues, and more.
          </p>
        </div>
      </div>
    </div>
  );
}
