import { Sparkles } from "lucide-react";
import { InterestsEditorSection } from "@/components/InterestsEditorSection";

export default function Interests() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <Sparkles className="h-6 w-6 text-primary shrink-0 mt-0.5" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Your Interests
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            These power your sidebar recommendations and the /research featured
            feed. Pick up to 5 niches and up to 5 creators.
          </p>
        </div>
      </div>
      <InterestsEditorSection variant="page" />
    </div>
  );
}
