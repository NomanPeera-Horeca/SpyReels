import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { usePostHog } from "@posthog/react";
import { useRoute, useLocation } from "wouter";
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  Clock,
  SpellCheck,
  Sparkles,
  History,
  Tag,
  Calendar,
  Copy,
  Monitor,
  RotateCcw,
  Loader2,
  X,
  Plus,
  ChevronDown,
  Shuffle,
  Zap,
  Mic,
  Timer,
  Scissors,
  Palette,
  Lightbulb,
  Type,
  Wand2,
  Hash,
  MessageSquare,
  RefreshCw,
  Maximize2,
  Pencil,
  Check,
  Send,
} from "lucide-react";
import { openSendToWorkspaceModal } from "@/components/SendToWorkspaceModal";
import { SentFromBadge } from "@/components/SentFromBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { TeleprompterMode } from "./TeleprompterMode";
import { ScriptExport } from "@/components/ScriptExport";
import { ShareScript } from "@/components/ShareScript";
import { PostDateTimePicker } from "@/components/PostDateTimePicker";

/** Parse a date string/Date to a Date object for the calendar picker */
function parseDateValue(
  val: string | Date | null | undefined
): Date | undefined {
  if (!val) return undefined;
  const d = typeof val === "string" ? new Date(val) : val;
  return isNaN(d.getTime()) ? undefined : d;
}

type ActiveTool = null | "rewrite" | "angle" | "selection";

export default function ScriptEditor() {
  const [, params] = useRoute("/scripts/:id");
  const [, navigate] = useLocation();
  const scriptId = params?.id ? parseInt(params.id) : null;

  const [editedContent, setEditedContent] = useState("");
  const [editedTitle, setEditedTitle] = useState("");
  const [editedNotes, setEditedNotes] = useState("");
  const [postDate, setPostDate] = useState<Date | undefined>(undefined);
  const [postTime, setPostTime] = useState("09:00");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showTeleprompter, setShowTeleprompter] = useState(false);
  const [activeTab, setActiveTab] = useState<"edit" | "versions">("edit");

  // AI tool states
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const [toolInput, setToolInput] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [selectionInstruction, setSelectionInstruction] = useState("");
  const [showSelectionPopup, setShowSelectionPopup] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Caption generator states
  const [captionStyle, setCaptionStyle] = useState<string>("educational");
  const [captionLength, setCaptionLength] = useState<string>("auto");
  const [captionNiche, setCaptionNiche] = useState("");
  const [captionBrandTag, setCaptionBrandTag] = useState("");
  const [generatedCaption, setGeneratedCaption] = useState<string | null>(null);
  const [generatedHashtags, setGeneratedHashtags] = useState<string[]>([]);
  const [captionMeta, setCaptionMeta] = useState<{
    primaryKeyword?: string;
    hookType?: string;
  }>({});
  const [captionDialogOpen, setCaptionDialogOpen] = useState(false);
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [editableCaption, setEditableCaption] = useState("");
  const [editableHashtags, setEditableHashtags] = useState("");

  const scriptQuery = trpc.scripts.get.useQuery(
    { id: scriptId! },
    { enabled: !!scriptId }
  );
  const tagsQuery = trpc.tags.list.useQuery();
  const utils = trpc.useUtils();

  const script = scriptQuery.data;

  useEffect(() => {
    if (script && !hasUnsavedChanges) {
      setEditedContent(script.content);
      setEditedTitle(script.title);
      setEditedNotes(script.notes || "");
      setPostDate(parseDateValue(script.postDate));
      setPostTime((script as any).postTime || "09:00");
      // Load saved caption data
      if ((script as any).generatedCaption)
        setGeneratedCaption((script as any).generatedCaption);
      if ((script as any).generatedHashtags) {
        try {
          setGeneratedHashtags(JSON.parse((script as any).generatedHashtags));
        } catch {}
      }
      if ((script as any).captionStyle)
        setCaptionStyle((script as any).captionStyle);
    }
  }, [script, hasUnsavedChanges]);

  const posthog = usePostHog();

  // --- Mutations ---
  const updateMutation = trpc.scripts.update.useMutation({
    onSuccess: () => {
      posthog?.capture("script_saved", { script_id: scriptId });
      utils.scripts.get.invalidate({ id: scriptId! });
      utils.scripts.list.invalidate();
      setHasUnsavedChanges(false);
      toast.success("Script saved");
    },
  });

  const grammarMutation = trpc.scripts.grammarCheck.useMutation({
    onSuccess: data => {
      setEditedContent(data.content);
      setHasUnsavedChanges(false);
      utils.scripts.get.invalidate({ id: scriptId! });
      toast.success("Grammar corrected");
    },
    onError: () => toast.error("Grammar check failed"),
  });

  const rewriteMutation = trpc.scripts.aiRewrite.useMutation({
    onSuccess: data => {
      setEditedContent(data.content);
      setHasUnsavedChanges(false);
      setActiveTool(null);
      setToolInput("");
      utils.scripts.get.invalidate({ id: scriptId! });
      toast.success("Script rewritten");
    },
    onError: () => toast.error("Rewrite failed"),
  });

  const phraseSwapMutation = trpc.scripts.phraseSwap.useMutation({
    onSuccess: data => {
      setEditedContent(data.content);
      setHasUnsavedChanges(false);
      utils.scripts.get.invalidate({ id: scriptId! });
      toast.success("Phrases swapped with fresh alternatives");
    },
    onError: () => toast.error("Phrase swap failed"),
  });

  const simplifyMutation = trpc.scripts.simplify.useMutation({
    onSuccess: data => {
      setEditedContent(data.content);
      setHasUnsavedChanges(false);
      utils.scripts.get.invalidate({ id: scriptId! });
      toast.success("Script simplified");
    },
    onError: () => toast.error("Simplify failed"),
  });

  const adjustToneMutation = trpc.scripts.adjustTone.useMutation({
    onSuccess: data => {
      setEditedContent(data.content);
      setHasUnsavedChanges(false);
      utils.scripts.get.invalidate({ id: scriptId! });
      toast.success("Tone adjusted");
    },
    onError: () => toast.error("Tone adjustment failed"),
  });

  const makeShorterMutation = trpc.scripts.makeShorter.useMutation({
    onSuccess: data => {
      setEditedContent(data.content);
      setHasUnsavedChanges(false);
      utils.scripts.get.invalidate({ id: scriptId! });
      toast.success("Script shortened");
    },
    onError: () => toast.error("Shortening failed"),
  });

  const rewriteSelectionMutation = trpc.scripts.rewriteSelection.useMutation({
    onSuccess: data => {
      setEditedContent(data.content);
      setHasUnsavedChanges(false);
      setShowSelectionPopup(false);
      setSelectedText("");
      setSelectionInstruction("");
      utils.scripts.get.invalidate({ id: scriptId! });
      toast.success("Selection rewritten");
    },
    onError: () => toast.error("Selection rewrite failed"),
  });

  const rewriteWithAngleMutation = trpc.scripts.rewriteWithAngle.useMutation({
    onSuccess: data => {
      setEditedContent(data.content);
      setHasUnsavedChanges(false);
      setActiveTool(null);
      setToolInput("");
      utils.scripts.get.invalidate({ id: scriptId! });
      toast.success("Script rewritten with new angle");
    },
    onError: () => toast.error("Angle rewrite failed"),
  });

  const captionMutation = trpc.scripts.generateCaption.useMutation({
    onSuccess: data => {
      setGeneratedCaption(data.caption);
      setGeneratedHashtags(data.hashtags);
      setCaptionMeta({
        primaryKeyword: data.primaryKeyword,
        hookType: data.hookType,
      });
      utils.scripts.get.invalidate({ id: scriptId! });
      toast.success("Caption generated!");
    },
    onError: () => toast.error("Caption generation failed"),
  });

  const restoreVersionMutation = trpc.scripts.restoreVersion.useMutation({
    onSuccess: data => {
      setEditedContent(data.content);
      setHasUnsavedChanges(false);
      utils.scripts.get.invalidate({ id: scriptId! });
      toast.success("Version restored");
    },
  });

  const assignTagMutation = trpc.scripts.assignTag.useMutation({
    onSuccess: () => utils.scripts.get.invalidate({ id: scriptId! }),
  });

  const removeTagMutation = trpc.scripts.removeTag.useMutation({
    onSuccess: () => utils.scripts.get.invalidate({ id: scriptId! }),
  });

  // --- Handlers ---
  const handleSave = useCallback(() => {
    if (!scriptId) return;
    updateMutation.mutate({
      id: scriptId,
      title: editedTitle,
      content: editedContent,
      notes: editedNotes || null,
      postDate: postDate ? postDate.toISOString() : null,
      postTime: postTime || null,
      changeType: "manual_edit",
      changeDescription: "Manual edit",
    });
  }, [scriptId, editedTitle, editedContent, editedNotes, postDate, postTime]);

  const handleApprove = () => {
    if (!scriptId) return;
    updateMutation.mutate({
      id: scriptId,
      status: script?.status === "approved" ? "draft" : "approved",
    });
  };

  const handleTextSelect = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start !== end) {
      const selected = editedContent.substring(start, end);
      if (selected.trim().length > 5) {
        setSelectedText(selected);
        setShowSelectionPopup(true);
      }
    }
  };

  const isAnyMutationPending =
    grammarMutation.isPending ||
    rewriteMutation.isPending ||
    phraseSwapMutation.isPending ||
    simplifyMutation.isPending ||
    adjustToneMutation.isPending ||
    makeShorterMutation.isPending ||
    rewriteSelectionMutation.isPending ||
    rewriteWithAngleMutation.isPending;

  const wordCount = editedContent.trim().split(/\s+/).filter(Boolean).length;
  const estimatedDuration = Math.round(wordCount / 3);

  const assignedTagIds = new Set(script?.tags?.map(t => t.id) || []);
  const availableTags =
    tagsQuery.data?.filter(t => !assignedTagIds.has(t.id)) || [];

  if (!scriptId) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Script not found
      </div>
    );
  }

  if (scriptQuery.isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!script) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Script not found
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-full flex flex-col">
        {/* Top Bar */}
        <div className="border-b px-2 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/scripts")}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <input
              value={editedTitle}
              onChange={e => {
                setEditedTitle(e.target.value);
                setHasUnsavedChanges(true);
              }}
              className="text-lg font-semibold bg-transparent border-none outline-none flex-1 min-w-0"
              placeholder="Script title..."
            />
            {script.status === "approved" ? (
              <Badge className="bg-green-600 text-white shrink-0">
                Approved
              </Badge>
            ) : (
              <Badge variant="secondary" className="shrink-0">
                Draft
              </Badge>
            )}
            {script.sourceWorkspaceId &&
            script.sentFromWorkspaceName &&
            script.sentByUserName ? (
              <SentFromBadge
                workspaceName={script.sentFromWorkspaceName}
                senderName={script.sentByUserName}
                sentAt={script.sentAt}
              />
            ) : null}
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {hasUnsavedChanges && (
              <span className="text-xs text-amber-500 font-medium hidden sm:inline">
                Unsaved
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={updateMutation.isPending || !hasUnsavedChanges}
            >
              <Save className="w-3.5 h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Save</span>
            </Button>
            <Button
              variant={script.status === "approved" ? "secondary" : "default"}
              size="sm"
              onClick={handleApprove}
            >
              <CheckCircle2 className="w-3.5 h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">
                {script.status === "approved" ? "Unapprove" : "Approve"}
              </span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                openSendToWorkspaceModal({
                  scriptId: script.id,
                  scriptTitle: editedTitle || script.title,
                })
              }
            >
              <Send className="w-3.5 h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Send to workspace...</span>
            </Button>
            <ShareScript
              title={editedTitle}
              content={editedContent}
              variant="button"
              size="sm"
            />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Editor Panel */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* AI Editing Toolbar */}
            <div className="px-2 sm:px-4 py-2 border-b shrink-0">
              <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                {/* Grammar Check */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!scriptId) return;
                        grammarMutation.mutate({
                          scriptId,
                          content: editedContent,
                        });
                      }}
                      disabled={isAnyMutationPending}
                      className="gap-1.5 h-8"
                    >
                      {grammarMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <SpellCheck className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">Grammar</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Fix spelling & grammar errors</TooltipContent>
                </Tooltip>

                {/* Phrase Swapper */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!scriptId) return;
                        phraseSwapMutation.mutate({
                          scriptId,
                          content: editedContent,
                        });
                      }}
                      disabled={isAnyMutationPending}
                      className="gap-1.5 h-8"
                    >
                      {phraseSwapMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Shuffle className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">Swap Phrases</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Swap key phrases with fresh, punchy alternatives
                  </TooltipContent>
                </Tooltip>

                {/* Simplifier */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!scriptId) return;
                        simplifyMutation.mutate({
                          scriptId,
                          content: editedContent,
                        });
                      }}
                      disabled={isAnyMutationPending}
                      className="gap-1.5 h-8"
                    >
                      {simplifyMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Zap className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">Simplify</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Simplify language: make it conversational
                  </TooltipContent>
                </Tooltip>

                {/* Tone / Grade Level */}
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isAnyMutationPending}
                          className="gap-1.5 h-8"
                        >
                          {adjustToneMutation.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Palette className="w-3.5 h-3.5" />
                          )}
                          <span className="hidden sm:inline">Tone</span>
                          <ChevronDown className="w-3 h-3" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      Change the tone & style of your script
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel className="text-xs">
                      Adjust Tone
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() =>
                        scriptId &&
                        adjustToneMutation.mutate({
                          scriptId,
                          content: editedContent,
                          tone: "casual",
                        })
                      }
                    >
                      <span className="mr-2">😎</span> Casual & Friendly
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        scriptId &&
                        adjustToneMutation.mutate({
                          scriptId,
                          content: editedContent,
                          tone: "professional",
                        })
                      }
                    >
                      <span className="mr-2">💼</span> Professional
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        scriptId &&
                        adjustToneMutation.mutate({
                          scriptId,
                          content: editedContent,
                          tone: "academic",
                        })
                      }
                    >
                      <span className="mr-2">🎓</span> Educational / TED Talk
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        scriptId &&
                        adjustToneMutation.mutate({
                          scriptId,
                          content: editedContent,
                          tone: "gen_z",
                        })
                      }
                    >
                      <span className="mr-2">🔥</span> Gen Z / TikTok Vibes
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        scriptId &&
                        adjustToneMutation.mutate({
                          scriptId,
                          content: editedContent,
                          tone: "storyteller",
                        })
                      }
                    >
                      <span className="mr-2">📖</span> Storyteller
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Make Shorter */}
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isAnyMutationPending}
                          className="gap-1.5 h-8"
                        >
                          {makeShorterMutation.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Scissors className="w-3.5 h-3.5" />
                          )}
                          <span className="hidden sm:inline">Shorten</span>
                          <ChevronDown className="w-3 h-3" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      Condense script to fit a target duration
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel className="text-xs">
                      Target Duration
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() =>
                        scriptId &&
                        makeShorterMutation.mutate({
                          scriptId,
                          content: editedContent,
                          targetSeconds: 30,
                        })
                      }
                    >
                      <Timer className="w-3.5 h-3.5 mr-2" /> 30 seconds (~90
                      words)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        scriptId &&
                        makeShorterMutation.mutate({
                          scriptId,
                          content: editedContent,
                          targetSeconds: 45,
                        })
                      }
                    >
                      <Timer className="w-3.5 h-3.5 mr-2" /> 45 seconds (~135
                      words)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        scriptId &&
                        makeShorterMutation.mutate({
                          scriptId,
                          content: editedContent,
                          targetSeconds: 60,
                        })
                      }
                    >
                      <Timer className="w-3.5 h-3.5 mr-2" /> 60 seconds (~180
                      words)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        scriptId &&
                        makeShorterMutation.mutate({
                          scriptId,
                          content: editedContent,
                          targetSeconds: 90,
                        })
                      }
                    >
                      <Timer className="w-3.5 h-3.5 mr-2" /> 90 seconds (~270
                      words)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="w-px h-5 bg-border mx-0.5 hidden sm:block" />

                {/* Rewrite with AI (custom instruction) */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={activeTool === "rewrite" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setActiveTool(
                          activeTool === "rewrite" ? null : "rewrite"
                        );
                        setToolInput("");
                      }}
                      disabled={
                        isAnyMutationPending && activeTool !== "rewrite"
                      }
                      className="gap-1.5 h-8"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Rewrite</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Rewrite with custom instructions
                  </TooltipContent>
                </Tooltip>

                {/* Rewrite with Angle */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={activeTool === "angle" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setActiveTool(activeTool === "angle" ? null : "angle");
                        setToolInput("");
                      }}
                      disabled={isAnyMutationPending && activeTool !== "angle"}
                      className="gap-1.5 h-8"
                    >
                      <Lightbulb className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">New Angle</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Rewrite from a completely new angle or perspective
                  </TooltipContent>
                </Tooltip>

                <div className="flex-1" />

                {/* Utility buttons */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowTeleprompter(true)}
                      className="gap-1.5 h-8"
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Teleprompter</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Practice reading with teleprompter
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(editedContent);
                        toast.success("Copied to clipboard");
                      }}
                      className="gap-1.5 h-8"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Copy</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy script to clipboard</TooltipContent>
                </Tooltip>

                <ScriptExport
                  title={editedTitle}
                  content={editedContent}
                  sourceHandle={script.sourceHandle}
                  gradeLevel={script.gradeLevel}
                  postDate={script.postDate}
                  wordCount={wordCount}
                  notes={editedNotes}
                />

                <Button
                  variant={activeTab === "versions" ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setActiveTab(activeTab === "versions" ? "edit" : "versions")
                  }
                  className="gap-1.5 h-8"
                >
                  <History className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Versions</span>
                  <span className="text-[10px]">
                    ({script.versions?.length || 0})
                  </span>
                </Button>
              </div>

              {/* Expandable input for Rewrite / Angle tools */}
              {activeTool === "rewrite" && (
                <div className="flex items-center gap-2 mt-2 animate-in slide-in-from-top-1 duration-200">
                  <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                  <Input
                    placeholder="How should I rewrite? (e.g., 'more casual', 'add humor', 'make it controversial')..."
                    value={toolInput}
                    onChange={e => setToolInput(e.target.value)}
                    className="h-8 text-sm flex-1"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === "Enter" && scriptId) {
                        rewriteMutation.mutate({
                          scriptId,
                          content: editedContent,
                          instruction: toolInput || undefined,
                        });
                      }
                      if (e.key === "Escape") {
                        setActiveTool(null);
                        setToolInput("");
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!scriptId) return;
                      rewriteMutation.mutate({
                        scriptId,
                        content: editedContent,
                        instruction: toolInput || undefined,
                      });
                    }}
                    disabled={rewriteMutation.isPending}
                    className="h-8"
                  >
                    {rewriteMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Rewrite
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={() => {
                      setActiveTool(null);
                      setToolInput("");
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}

              {activeTool === "angle" && (
                <div className="flex items-center gap-2 mt-2 animate-in slide-in-from-top-1 duration-200">
                  <Lightbulb className="w-4 h-4 text-yellow-400 shrink-0" />
                  <Input
                    placeholder="What angle? (e.g., 'from a beginner's perspective', 'as a controversial take', 'personal story')..."
                    value={toolInput}
                    onChange={e => setToolInput(e.target.value)}
                    className="h-8 text-sm flex-1"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === "Enter" && scriptId && toolInput.trim()) {
                        rewriteWithAngleMutation.mutate({
                          scriptId,
                          content: editedContent,
                          angle: toolInput,
                        });
                      }
                      if (e.key === "Escape") {
                        setActiveTool(null);
                        setToolInput("");
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!scriptId || !toolInput.trim()) return;
                      rewriteWithAngleMutation.mutate({
                        scriptId,
                        content: editedContent,
                        angle: toolInput,
                      });
                    }}
                    disabled={
                      rewriteWithAngleMutation.isPending || !toolInput.trim()
                    }
                    className="h-8"
                  >
                    {rewriteWithAngleMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Lightbulb className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Apply Angle
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={() => {
                      setActiveTool(null);
                      setToolInput("");
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {/* Processing indicator */}
            {isAnyMutationPending && (
              <div className="px-4 py-1.5 bg-purple-500/10 border-b border-purple-500/20 flex items-center gap-2 text-xs text-purple-400 shrink-0">
                <Loader2 className="w-3 h-3 animate-spin" />
                AI is working on your script... This usually takes a few
                seconds.
              </div>
            )}

            {activeTab === "edit" ? (
              /* Editor */
              <div className="flex-1 overflow-y-auto p-4">
                <Textarea
                  ref={textareaRef}
                  value={editedContent}
                  onChange={e => {
                    setEditedContent(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  onMouseUp={handleTextSelect}
                  onKeyUp={e => {
                    if (e.shiftKey) handleTextSelect();
                  }}
                  className="min-h-[500px] text-base leading-relaxed resize-none border-none focus-visible:ring-0 p-0 bg-transparent"
                  placeholder="Start writing your script..."
                />
                {/* Selection hint */}
                {!showSelectionPopup && !isAnyMutationPending && (
                  <p className="text-[11px] text-muted-foreground/50 mt-2">
                    Tip: Select text in the editor to rewrite just that part
                  </p>
                )}
              </div>
            ) : (
              /* Version History */
              <div className="flex-1 overflow-y-auto p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Version History
                </h3>
                <div className="space-y-3">
                  {script.versions?.map(version => (
                    <div
                      key={version.id}
                      className="border rounded-lg p-3 hover:border-primary/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">
                            v{version.versionNumber}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {version.changeType === "initial"
                              ? "Initial"
                              : version.changeType === "manual_edit"
                                ? "Manual Edit"
                                : version.changeType === "ai_rewrite"
                                  ? "AI Rewrite"
                                  : "Grammar Fix"}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(version.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() =>
                            restoreVersionMutation.mutate({
                              scriptId: scriptId!,
                              versionId: version.id,
                            })
                          }
                          disabled={restoreVersionMutation.isPending}
                        >
                          <RotateCcw className="w-3 h-3" />
                          Restore
                        </Button>
                      </div>
                      {version.changeDescription && (
                        <p className="text-xs text-muted-foreground mb-2">
                          {version.changeDescription}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                        {version.content.slice(0, 300)}
                        {version.content.length > 300 ? "..." : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer Stats */}
            <div className="border-t px-4 py-2 flex items-center gap-4 text-xs text-muted-foreground shrink-0 flex-wrap">
              <span className="font-medium">{wordCount} words</span>
              <span>~{estimatedDuration}s at avg speed</span>
              {script.gradeLevel && <span>Grade {script.gradeLevel}</span>}
              {script.sourceHandle && <span>from @{script.sourceHandle}</span>}
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="w-64 border-l shrink-0 overflow-y-auto p-4 space-y-5 hidden lg:block">
            {/* Tags */}
            <div>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                <Tag className="w-3 h-3" />
                Tags
              </h4>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {script.tags?.map(tag => (
                  <span
                    key={tag.id}
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1 group/tag"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                    <button
                      onClick={() =>
                        removeTagMutation.mutate({
                          scriptId: scriptId!,
                          tagId: tag.id,
                        })
                      }
                      className="opacity-0 group-hover/tag:opacity-100 transition-opacity"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
              {availableTags.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs gap-1 h-7"
                    >
                      <Plus className="w-3 h-3" />
                      Add Tag
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {availableTags.map(tag => (
                      <DropdownMenuItem
                        key={tag.id}
                        onClick={() =>
                          assignTagMutation.mutate({
                            scriptId: scriptId!,
                            tagId: tag.id,
                          })
                        }
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full mr-2"
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Post Date + Time */}
            <div>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                <Calendar className="w-3 h-3" />
                Post Date
              </h4>
              <PostDateTimePicker
                date={postDate}
                onDateChange={d => {
                  setPostDate(d);
                  setHasUnsavedChanges(true);
                }}
                time={postTime}
                onTimeChange={t => {
                  setPostTime(t);
                  setHasUnsavedChanges(true);
                }}
                timezone={Intl.DateTimeFormat().resolvedOptions().timeZone}
                compact
              />
            </div>

            {/* Notes */}
            <div>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Notes
              </h4>
              <Textarea
                value={editedNotes}
                onChange={e => {
                  setEditedNotes(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                placeholder="Add notes about this script..."
                className="text-xs min-h-[80px] resize-none"
              />
            </div>

            {/* Caption & Hashtags Generator */}
            <div>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" />
                Caption & Hashtags
              </h4>

              {/* Style selector */}
              <select
                value={captionStyle}
                onChange={e => setCaptionStyle(e.target.value)}
                className="w-full text-xs rounded-md border bg-background px-2 py-1.5 mb-2"
              >
                <option value="educational">Educational / Value</option>
                <option value="storytelling">Storytelling</option>
                <option value="question">Question-Based</option>
                <option value="cta">CTA-Focused</option>
                <option value="curiosity">Curiosity Gap</option>
                <option value="bold">Bold / Controversial</option>
                <option value="relatable">Relatable / Funny</option>
              </select>

              {/* Length selector */}
              <select
                value={captionLength}
                onChange={e => setCaptionLength(e.target.value)}
                className="w-full text-xs rounded-md border bg-background px-2 py-1.5 mb-2"
              >
                <option value="auto">Auto (adapts to script length)</option>
                <option value="short">Short (5-7 lines)</option>
                <option value="medium">Medium (8-12 lines)</option>
                <option value="long">Long (13+ lines)</option>
              </select>

              {/* Niche input */}
              <Input
                value={captionNiche}
                onChange={e => setCaptionNiche(e.target.value)}
                placeholder="Your niche (e.g., fitness, marketing)"
                className="text-xs h-7 mb-2"
              />

              {/* Brand hashtag */}
              <Input
                value={captionBrandTag}
                onChange={e => setCaptionBrandTag(e.target.value)}
                placeholder="Brand hashtag (optional)"
                className="text-xs h-7 mb-2"
              />

              {/* Generate button - purple */}
              <Button
                size="sm"
                className="w-full text-xs gap-1.5 h-8 mb-3 bg-purple-600 hover:bg-purple-700 text-white"
                onClick={() => {
                  if (!scriptId) return;
                  captionMutation.mutate({
                    scriptId,
                    content: editedContent,
                    style: captionStyle as any,
                    captionLength: captionLength as any,
                    niche: captionNiche || undefined,
                    brandHashtag: captionBrandTag || undefined,
                  });
                }}
                disabled={captionMutation.isPending || !editedContent.trim()}
              >
                {captionMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : generatedCaption ? (
                  <RefreshCw className="w-3.5 h-3.5" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {captionMutation.isPending
                  ? "Generating..."
                  : generatedCaption
                    ? "Regenerate Caption"
                    : "Generate Caption & Hashtags"}
              </Button>

              {/* Generated caption display */}
              {generatedCaption && (
                <div className="space-y-2">
                  {/* Caption header with actions */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                      Caption
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                        title="Edit caption"
                        onClick={() => {
                          setIsEditingCaption(true);
                          setEditableCaption(generatedCaption);
                          setEditableHashtags(
                            generatedHashtags.map(t => `#${t}`).join(" ")
                          );
                        }}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                        title="Expand"
                        onClick={() => {
                          setEditableCaption(generatedCaption);
                          setEditableHashtags(
                            generatedHashtags.map(t => `#${t}`).join(" ")
                          );
                          setCaptionDialogOpen(true);
                        }}
                      >
                        <Maximize2 className="w-3 h-3" />
                      </button>
                      <button
                        className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-0.5 transition-colors"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              generatedCaption
                            );
                            toast.success("Caption copied!");
                          } catch {
                            const ta = document.createElement("textarea");
                            ta.value = generatedCaption;
                            ta.style.position = "fixed";
                            ta.style.left = "-9999px";
                            document.body.appendChild(ta);
                            ta.select();
                            document.execCommand("copy");
                            document.body.removeChild(ta);
                            toast.success("Caption copied!");
                          }
                        }}
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Caption text - inline editable */}
                  {isEditingCaption ? (
                    <div className="space-y-2">
                      <textarea
                        value={editableCaption}
                        onChange={e => setEditableCaption(e.target.value)}
                        className="w-full text-xs bg-muted/50 rounded-lg p-2.5 min-h-[120px] leading-relaxed border border-purple-500/30 focus:outline-none focus:border-purple-500 resize-y"
                      />
                      <div>
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground mb-1 block">
                          Hashtags
                        </span>
                        <input
                          value={editableHashtags}
                          onChange={e => setEditableHashtags(e.target.value)}
                          className="w-full text-xs bg-muted/50 rounded-md p-2 border border-purple-500/30 focus:outline-none focus:border-purple-500"
                          placeholder="#tag1 #tag2 #tag3"
                        />
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          className="flex-1 text-xs h-7 gap-1 bg-purple-600 hover:bg-purple-700 text-white"
                          onClick={() => {
                            setGeneratedCaption(editableCaption);
                            const tags = editableHashtags
                              .split(/\s+/)
                              .map(t => t.replace(/^#/, ""))
                              .filter(Boolean);
                            setGeneratedHashtags(tags);
                            setIsEditingCaption(false);
                            // Save to DB
                            if (scriptId) {
                              updateMutation.mutate({
                                id: scriptId,
                                content: editedContent,
                                generatedCaption: editableCaption,
                                generatedHashtags: JSON.stringify(tags),
                              });
                            }
                            toast.success("Caption & hashtags saved!");
                          }}
                        >
                          <Check className="w-3 h-3" /> Save
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => setIsEditingCaption(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs bg-muted/50 rounded-lg p-2.5 max-h-40 overflow-y-auto leading-relaxed border whitespace-pre-line">
                      {generatedCaption}
                    </div>
                  )}

                  {/* Hashtags (non-edit mode) */}
                  {!isEditingCaption && generatedHashtags.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                          Hashtags ({generatedHashtags.length})
                        </span>
                        <button
                          className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-0.5 transition-colors"
                          onClick={async () => {
                            const hashtagStr = generatedHashtags
                              .map(t => `#${t}`)
                              .join(" ");
                            try {
                              await navigator.clipboard.writeText(hashtagStr);
                              toast.success("Hashtags copied!");
                            } catch {
                              const ta = document.createElement("textarea");
                              ta.value = hashtagStr;
                              ta.style.position = "fixed";
                              ta.style.left = "-9999px";
                              document.body.appendChild(ta);
                              ta.select();
                              document.execCommand("copy");
                              document.body.removeChild(ta);
                              toast.success("Hashtags copied!");
                            }
                          }}
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {generatedHashtags.map((tag, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-400"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Copy all button */}
                  {!isEditingCaption && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs gap-1.5 h-7"
                      onClick={async () => {
                        const hashtagStr = generatedHashtags
                          .map(t => `#${t}`)
                          .join(" ");
                        const full = `${generatedCaption}\n\n${hashtagStr}`;
                        try {
                          await navigator.clipboard.writeText(full);
                          toast.success("Caption + hashtags copied!");
                        } catch {
                          const ta = document.createElement("textarea");
                          ta.value = full;
                          ta.style.position = "fixed";
                          ta.style.left = "-9999px";
                          document.body.appendChild(ta);
                          ta.select();
                          document.execCommand("copy");
                          document.body.removeChild(ta);
                          toast.success("Caption + hashtags copied!");
                        }
                      }}
                    >
                      <Copy className="w-3 h-3" />
                      Copy Caption + Hashtags
                    </Button>
                  )}

                  {/* Meta info */}
                  {!isEditingCaption &&
                    (captionMeta.primaryKeyword || captionMeta.hookType) && (
                      <div className="text-[10px] text-muted-foreground space-y-0.5 pt-1 border-t">
                        {captionMeta.hookType && (
                          <div>Hook: {captionMeta.hookType}</div>
                        )}
                        {captionMeta.primaryKeyword && (
                          <div>SEO keyword: {captionMeta.primaryKeyword}</div>
                        )}
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* Original Script */}
            {script.originalContent &&
              script.originalContent !== script.content && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                    Original AI Script
                  </h4>
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 max-h-32 overflow-y-auto leading-relaxed">
                    {script.originalContent.slice(0, 500)}
                    {script.originalContent.length > 500 ? "..." : ""}
                  </div>
                </div>
              )}

            {/* Timing */}
            <div>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Estimated Duration
              </h4>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Slow (2.5 w/s)</span>
                  <span>{Math.round(wordCount / 2.5)}s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Average (3 w/s)</span>
                  <span>{Math.round(wordCount / 3)}s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fast (3.5 w/s)</span>
                  <span>{Math.round(wordCount / 3.5)}s</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Selection Rewrite Dialog */}
        <Dialog open={showSelectionPopup} onOpenChange={setShowSelectionPopup}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Type className="w-5 h-5 text-purple-400" />
                Rewrite Selected Text
              </DialogTitle>
              <DialogDescription>
                Rewrite just the highlighted portion of your script
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Selected text:
                </label>
                <div className="text-sm bg-muted/50 rounded-lg p-3 max-h-32 overflow-y-auto leading-relaxed border">
                  "{selectedText}"
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  How should I rewrite it?
                </label>
                <Input
                  placeholder="e.g., 'make it punchier', 'add a question', 'more emotional'..."
                  value={selectionInstruction}
                  onChange={e => setSelectionInstruction(e.target.value)}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === "Enter" && scriptId) {
                      rewriteSelectionMutation.mutate({
                        scriptId,
                        fullContent: editedContent,
                        selectedText,
                        instruction: selectionInstruction || undefined,
                      });
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowSelectionPopup(false);
                  setSelectedText("");
                  setSelectionInstruction("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!scriptId) return;
                  rewriteSelectionMutation.mutate({
                    scriptId,
                    fullContent: editedContent,
                    selectedText,
                    instruction: selectionInstruction || undefined,
                  });
                }}
                disabled={rewriteSelectionMutation.isPending}
              >
                {rewriteSelectionMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                )}
                Rewrite Selection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Caption Pop-out Dialog */}
        <Dialog open={captionDialogOpen} onOpenChange={setCaptionDialogOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-400" />
                Caption & Hashtags
              </DialogTitle>
              <DialogDescription>
                Edit your caption and hashtags, then save or copy.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Editable caption */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Caption
                </label>
                <textarea
                  value={editableCaption}
                  onChange={e => setEditableCaption(e.target.value)}
                  className="w-full text-sm bg-muted/50 rounded-lg p-3 min-h-[200px] leading-relaxed border focus:outline-none focus:border-purple-500 resize-y"
                />
              </div>

              {/* Editable hashtags */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Hashtags
                </label>
                <input
                  value={editableHashtags}
                  onChange={e => setEditableHashtags(e.target.value)}
                  className="w-full text-sm bg-muted/50 rounded-lg p-3 border focus:outline-none focus:border-purple-500"
                  placeholder="#tag1 #tag2 #tag3 #tag4 #tag5"
                />
              </div>

              {/* Meta info */}
              {(captionMeta.primaryKeyword || captionMeta.hookType) && (
                <div className="text-xs text-muted-foreground space-y-0.5 pt-2 border-t">
                  {captionMeta.hookType && (
                    <div>Hook type: {captionMeta.hookType}</div>
                  )}
                  {captionMeta.primaryKeyword && (
                    <div>SEO keyword: {captionMeta.primaryKeyword}</div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  const hashtagStr = editableHashtags.trim();
                  const full = `${editableCaption}\n\n${hashtagStr}`;
                  try {
                    await navigator.clipboard.writeText(full);
                    toast.success("Caption + hashtags copied!");
                  } catch {
                    const ta = document.createElement("textarea");
                    ta.value = full;
                    ta.style.position = "fixed";
                    ta.style.left = "-9999px";
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand("copy");
                    document.body.removeChild(ta);
                    toast.success("Caption + hashtags copied!");
                  }
                }}
              >
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Copy All
              </Button>
              <Button
                className="bg-purple-600 hover:bg-purple-700 text-white"
                onClick={() => {
                  setGeneratedCaption(editableCaption);
                  const tags = editableHashtags
                    .split(/\s+/)
                    .map(t => t.replace(/^#/, ""))
                    .filter(Boolean);
                  setGeneratedHashtags(tags);
                  // Save to DB
                  if (scriptId) {
                    updateMutation.mutate({
                      id: scriptId,
                      content: editedContent,
                      generatedCaption: editableCaption,
                      generatedHashtags: JSON.stringify(tags),
                    });
                  }
                  setCaptionDialogOpen(false);
                  toast.success("Caption & hashtags saved!");
                }}
              >
                <Check className="w-3.5 h-3.5 mr-1.5" />
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Teleprompter */}
        {showTeleprompter && (
          <TeleprompterMode
            script={editedContent}
            onClose={() => setShowTeleprompter(false)}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
