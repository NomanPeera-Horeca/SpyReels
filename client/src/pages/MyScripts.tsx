import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  type CSSProperties,
} from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  FileText,
  Search,
  Plus,
  Tag,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  MoreVertical,
  Trash2,
  Edit3,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  X,
  LayoutGrid,
  Columns3,
  GripVertical,
  Lock,
  Send,
} from "lucide-react";
import { openSendToWorkspaceModal } from "@/components/SendToWorkspaceModal";
import { SentFromBadge } from "@/components/SentFromBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ShareScript } from "@/components/ShareScript";
import { useFeatureLock } from "@/components/UpgradeSidesheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type ViewMode = "grid" | "kanban" | "calendar";

// Default stage tag names that serve as Kanban columns
const KANBAN_STAGES = ["Scripting", "Rehearsing", "Filming", "Editing", "Posting"];

/** Append 2-digit hex alpha to a 6-digit #RRGGBB color (drops existing alpha if present). */
function hexWithAlpha(hex: string, aa: string): string {
  const raw = hex.trim().replace(/^#/, "");
  const rgb = raw.length === 8 ? raw.slice(0, 6) : raw.length === 6 ? raw : "";
  if (rgb.length !== 6 || !/^[0-9a-fA-F]+$/.test(rgb)) return hex;
  return `#${rgb}${aa}`;
}

/**
 * Prefer a pipeline stage tag (Kanban order), then fall back to the first tag.
 * Keeps grid color aligned with workflow stage when possible.
 */
function accentColorFromScriptTags(
  tags: { id: number; color: string }[] | undefined,
  stageTagIdsOrdered: number[]
): string | null {
  if (!tags?.length) return null;
  for (const id of stageTagIdsOrdered) {
    const t = tags.find((x) => x.id === id);
    if (t) return t.color;
  }
  return tags[0].color;
}

function scriptTagAccentStyles(color: string, compact?: boolean): CSSProperties {
  const soft = hexWithAlpha(color, compact ? "12" : "16");
  const edge = hexWithAlpha(color, compact ? "2a" : "33");
  return {
    borderLeftWidth: compact ? 3 : 4,
    borderLeftStyle: "solid",
    borderLeftColor: color,
    backgroundImage: `linear-gradient(165deg, ${soft}, transparent min(52%, 9rem))`,
    boxShadow: `inset 0 1px 0 0 ${edge}`,
  };
}

export default function MyScripts() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "approved">("all");
  const [showNewTagDialog, setShowNewTagDialog] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#7c3aed");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const kanbanLock = useFeatureLock("kanban");
  const calendarLock = useFeatureLock("calendar");

  const handleSwitchView = useCallback(
    (mode: ViewMode) => {
      if (mode === "kanban" && kanbanLock.locked) {
        kanbanLock.requireUpgrade();
        return;
      }
      if (mode === "calendar" && calendarLock.locked) {
        calendarLock.requireUpgrade();
        return;
      }
      setViewMode(mode);
    },
    [kanbanLock, calendarLock]
  );

  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const tagsQuery = trpc.tags.list.useQuery();
  const scriptsQuery = trpc.scripts.list.useQuery(
    selectedTagId ? { tagId: selectedTagId } : undefined
  );
  const utils = trpc.useUtils();

  const createTagMutation = trpc.tags.create.useMutation({
    onSuccess: () => {
      utils.tags.list.invalidate();
      setShowNewTagDialog(false);
      setNewTagName("");
      toast.success("Tag created");
    },
  });

  const deleteTagMutation = trpc.tags.delete.useMutation({
    onSuccess: () => {
      utils.tags.list.invalidate();
      if (selectedTagId) setSelectedTagId(null);
      toast.success("Tag deleted");
    },
  });

  const deleteScriptMutation = trpc.scripts.delete.useMutation({
    onSuccess: () => {
      utils.scripts.list.invalidate();
      toast.success("Script deleted");
    },
  });

  const updateScriptMutation = trpc.scripts.update.useMutation({
    onSuccess: () => {
      utils.scripts.list.invalidate();
    },
  });

  const assignTagMutation = trpc.scripts.assignTag.useMutation({
    onSuccess: () => {
      utils.scripts.list.invalidate();
    },
  });

  const removeTagMutation = trpc.scripts.removeTag.useMutation({
    onSuccess: () => {
      utils.scripts.list.invalidate();
    },
  });

  const filteredScripts = useMemo(() => {
    let scripts = scriptsQuery.data || [];
    if (statusFilter !== "all") {
      scripts = scripts.filter((s) => s.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      scripts = scripts.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.content.toLowerCase().includes(q) ||
          (s.sourceHandle && s.sourceHandle.toLowerCase().includes(q))
      );
    }
    return scripts;
  }, [scriptsQuery.data, statusFilter, searchQuery]);

  const tagColors = [
    "#7c3aed", "#2563eb", "#d97706", "#059669", "#dc2626",
    "#ec4899", "#8b5cf6", "#06b6d4", "#84cc16", "#f97316",
  ];

  const formatDate = (date: Date | string | null) => {
    if (!date) return "No date";
    const d = new Date(date);
    // Use local timezone parts to avoid UTC shift
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  };

  // Get stage tags for Kanban
  const stageTags = useMemo(() => {
    if (!tagsQuery.data) return [];
    return KANBAN_STAGES.map((name) => {
      const tag = tagsQuery.data.find((t) => t.name === name && t.isDefault === 1);
      return tag || null;
    }).filter(Boolean) as NonNullable<typeof tagsQuery.data>[number][];
  }, [tagsQuery.data]);

  // Group scripts by stage tag for Kanban
  const kanbanColumns = useMemo(() => {
    const columns: Record<number, typeof filteredScripts> = {};
    const unassigned: typeof filteredScripts = [];

    for (const tag of stageTags) {
      columns[tag.id] = [];
    }

    for (const script of filteredScripts) {
      const stageTag = script.tags?.find((t) =>
        stageTags.some((st) => st.id === t.id)
      );
      if (stageTag) {
        columns[stageTag.id]?.push(script);
      } else {
        unassigned.push(script);
      }
    }

    return { columns, unassigned };
  }, [filteredScripts, stageTags]);

  // Calendar data
  const calendarData = useMemo(() => {
    const { year, month } = calendarMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    // Build a map of date -> scripts
    const dateMap: Record<string, typeof filteredScripts> = {};
    for (const script of filteredScripts) {
      if (script.postDate) {
        const d = new Date(script.postDate);
        // Use local date parts for calendar mapping to avoid UTC shift
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (!dateMap[key]) dateMap[key] = [];
        dateMap[key].push(script);
      }
    }

    // Scripts without a post date
    const unscheduled = filteredScripts.filter((s) => !s.postDate);

    return { firstDay, lastDay, startDayOfWeek, daysInMonth, dateMap, unscheduled, year, month };
  }, [filteredScripts, calendarMonth]);

  // Drag and drop for Kanban
  const [draggedScript, setDraggedScript] = useState<number | null>(null);

  const handleDragStart = (scriptId: number) => {
    setDraggedScript(scriptId);
  };

  const handleDrop = (targetTagId: number) => {
    if (draggedScript === null) return;

    const script = filteredScripts.find((s) => s.id === draggedScript);
    if (!script) return;

    // Remove existing stage tags
    const existingStageTag = script.tags?.find((t) =>
      stageTags.some((st) => st.id === t.id)
    );
    if (existingStageTag) {
      if (existingStageTag.id === targetTagId) {
        setDraggedScript(null);
        return; // Already in this column
      }
      removeTagMutation.mutate(
        { scriptId: script.id, tagId: existingStageTag.id },
        {
          onSuccess: () => {
            assignTagMutation.mutate({ scriptId: script.id, tagId: targetTagId });
          },
        }
      );
    } else {
      assignTagMutation.mutate({ scriptId: script.id, tagId: targetTagId });
    }

    setDraggedScript(null);
    toast.success("Script moved!");
  };

  return (
    <div className="p-3 sm:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            My Scripts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filteredScripts.length} script{filteredScripts.length !== 1 ? "s" : ""}
            {selectedTagId && tagsQuery.data
              ? ` tagged "${tagsQuery.data.find((t) => t.id === selectedTagId)?.name}"`
              : ""}
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-border/50 p-0.5">
          <button
            onClick={() => handleSwitchView("grid")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
              viewMode === "grid"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Grid</span>
          </button>
          <button
            onClick={() => handleSwitchView("kanban")}
            title={kanbanLock.locked ? "Kanban board is a Solo Creator feature" : undefined}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
              viewMode === "kanban"
                ? "bg-primary/10 text-primary"
                : kanbanLock.locked
                  ? "text-muted-foreground/70 hover:bg-muted/30"
                  : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <Columns3 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Kanban</span>
            {kanbanLock.locked ? (
              <Lock className="h-3 w-3 text-primary/80" />
            ) : null}
          </button>
          <button
            onClick={() => handleSwitchView("calendar")}
            title={calendarLock.locked ? "Calendar view is a Solo Creator feature" : undefined}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
              viewMode === "calendar"
                ? "bg-primary/10 text-primary"
                : calendarLock.locked
                  ? "text-muted-foreground/70 hover:bg-muted/30"
                  : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Calendar</span>
            {calendarLock.locked ? (
              <Lock className="h-3 w-3 text-primary/80" />
            ) : null}
          </button>
        </div>
      </div>

      {/* Tags Bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Tag className="w-4 h-4 text-muted-foreground" />
        <button
          onClick={() => setSelectedTagId(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            selectedTagId === null
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          All
        </button>
        {tagsQuery.data?.map((tag) => (
          <div key={tag.id} className="group relative">
            <button
              onClick={() => setSelectedTagId(tag.id === selectedTagId ? null : tag.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                tag.id === selectedTagId
                  ? "text-white"
                  : "text-muted-foreground hover:opacity-80"
              }`}
              style={{
                backgroundColor: tag.id === selectedTagId ? tag.color : `${tag.color}20`,
                color: tag.id === selectedTagId ? "white" : tag.color,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              {tag.name}
            </button>
            {!tag.isDefault && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteTagMutation.mutate({ id: tag.id });
                }}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => setShowNewTagDialog(true)}
          className="px-3 py-1 rounded-full text-xs font-medium border border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          New Tag
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search scripts by title, content, or handle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="w-3.5 h-3.5" />
              {statusFilter === "all" ? "All Status" : statusFilter === "draft" ? "Drafts" : "Approved"}
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setStatusFilter("all")}>All Status</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter("draft")}>
              <Clock className="w-3.5 h-3.5 mr-2" /> Drafts
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter("approved")}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Approved
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Content Views */}
      {scriptsQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card rounded-lg border p-4 animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-3" />
              <div className="h-3 bg-muted rounded w-full mb-2" />
              <div className="h-3 bg-muted rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : filteredScripts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No scripts yet</p>
          <p className="text-sm mt-1">
            Scripts you save from Re-Create will appear here
          </p>
        </div>
      ) : viewMode === "grid" ? (
        /* ── Grid View ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredScripts.map((script) => (
            <ScriptCard
              key={script.id}
              script={script}
              stageTagIdsOrdered={stageTags.map((t) => t.id)}
              navigate={navigate}
              updateScriptMutation={updateScriptMutation}
              deleteScriptMutation={deleteScriptMutation}
              formatDate={formatDate}
            />
          ))}
        </div>
      ) : viewMode === "kanban" ? (
        /* ── Kanban View ── */
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
          {stageTags.map((tag) => (
            <div
              key={tag.id}
              className="flex-shrink-0 w-[260px] rounded-lg border border-border/50 bg-muted/10"
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add("ring-2", "ring-primary/30");
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove("ring-2", "ring-primary/30");
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("ring-2", "ring-primary/30");
                handleDrop(tag.id);
              }}
            >
              {/* Column Header */}
              <div className="px-3 py-2.5 border-b border-border/30 flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="text-xs font-semibold">{tag.name}</span>
                <Badge variant="secondary" className="text-[10px] h-4 ml-auto">
                  {kanbanColumns.columns[tag.id]?.length || 0}
                </Badge>
              </div>

              {/* Column Cards */}
              <div className="p-2 space-y-2 min-h-[100px]">
                {kanbanColumns.columns[tag.id]?.map((script) => {
                  const miniAccent = scriptTagAccentStyles(tag.color, true);
                  return (
                  <div
                    key={script.id}
                    draggable
                    onDragStart={() => handleDragStart(script.id)}
                    className="bg-card rounded-md border border-border/30 p-3 cursor-grab active:cursor-grabbing hover:border-primary/30 transition-colors group overflow-hidden"
                    style={{ ...miniAccent, backgroundColor: "hsl(var(--card))" }}
                    onClick={() => navigate(`/scripts/${script.id}`)}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <h4 className="text-xs font-medium truncate flex-1">{script.title}</h4>
                      <GripVertical className="h-3 w-3 text-muted-foreground/30 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1">
                      {script.content.slice(0, 80)}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-muted-foreground">
                        {script.wordCount} words
                      </span>
                      {script.postDate && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <CalendarIcon className="h-2.5 w-2.5" />
                          {new Date(script.postDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}
                        </span>
                      )}
                    </div>
                    {/* Non-stage tags */}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {script.tags
                        ?.filter((t) => !stageTags.some((st) => st.id === t.id))
                        .map((t) => (
                          <span
                            key={t.id}
                            className="px-1.5 py-0 rounded text-[9px] font-medium"
                            style={{ backgroundColor: `${t.color}20`, color: t.color }}
                          >
                            {t.name}
                          </span>
                        ))}
                    </div>
                  </div>
                  );
                })}
                {(kanbanColumns.columns[tag.id]?.length || 0) === 0 && (
                  <div className="text-center py-6 text-[10px] text-muted-foreground/50">
                    Drop scripts here
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Unassigned column */}
          {kanbanColumns.unassigned.length > 0 && (
            <div className="flex-shrink-0 w-[260px] rounded-lg border border-dashed border-border/50 bg-muted/5">
              <div className="px-3 py-2.5 border-b border-border/30 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
                <span className="text-xs font-semibold text-muted-foreground">No Stage</span>
                <Badge variant="secondary" className="text-[10px] h-4 ml-auto">
                  {kanbanColumns.unassigned.length}
                </Badge>
              </div>
              <div className="p-2 space-y-2">
                {kanbanColumns.unassigned.map((script) => {
                  const ua = accentColorFromScriptTags(script.tags, stageTags.map((t) => t.id));
                  const uaStyle = ua ? { ...scriptTagAccentStyles(ua, true), backgroundColor: "hsl(var(--card))" } : undefined;
                  return (
                  <div
                    key={script.id}
                    draggable
                    onDragStart={() => handleDragStart(script.id)}
                    className="bg-card rounded-md border border-border/30 p-3 cursor-grab active:cursor-grabbing hover:border-primary/30 transition-colors overflow-hidden"
                    style={uaStyle}
                    onClick={() => navigate(`/scripts/${script.id}`)}
                  >
                    <h4 className="text-xs font-medium truncate">{script.title}</h4>
                    <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1">
                      {script.content.slice(0, 80)}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-muted-foreground">
                        {script.wordCount} words
                      </span>
                      {script.status === "approved" && (
                        <Badge variant="default" className="text-[9px] h-4 bg-green-600">
                          Approved
                        </Badge>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Calendar View ── */
        <CalendarView
          calendarData={calendarData}
          calendarMonth={calendarMonth}
          setCalendarMonth={setCalendarMonth}
          navigate={navigate}
          updateScriptMutation={updateScriptMutation}
          filteredScripts={filteredScripts}
          stageTagIdsOrdered={stageTags.map((t) => t.id)}
        />
      )}

      {/* New Tag Dialog */}
      <Dialog open={showNewTagDialog} onOpenChange={setShowNewTagDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New Tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Tag Name</label>
              <Input
                placeholder="e.g., Priority, Review..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Color</label>
              <div className="flex gap-2 flex-wrap">
                {tagColors.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewTagColor(color)}
                    className={`w-8 h-8 rounded-full transition-transform ${
                      newTagColor === color ? "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110" : ""
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              disabled={!newTagName.trim() || createTagMutation.isPending}
              onClick={() => createTagMutation.mutate({ name: newTagName.trim(), color: newTagColor })}
            >
              {createTagMutation.isPending ? "Creating..." : "Create Tag"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Script Card (Grid View) ──

function ScriptCard({
  script,
  stageTagIdsOrdered,
  navigate,
  updateScriptMutation,
  deleteScriptMutation,
  formatDate,
}: {
  script: any;
  stageTagIdsOrdered: number[];
  navigate: (path: string) => void;
  updateScriptMutation: any;
  deleteScriptMutation: any;
  formatDate: (date: Date | string | null) => string;
}) {
  const accent = accentColorFromScriptTags(script.tags, stageTagIdsOrdered);
  const accentStyles = accent ? scriptTagAccentStyles(accent, false) : undefined;

  return (
    <div
      className="rounded-lg border border-border/70 hover:border-primary/45 transition-colors cursor-pointer group overflow-hidden"
      style={{
        ...(accentStyles ?? {}),
        backgroundColor: "hsl(var(--card))",
      }}
      onClick={() => navigate(`/scripts/${script.id}`)}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">{script.title}</h3>
            {script.sourceHandle && (
              <p className="text-xs text-muted-foreground mt-0.5">
                from @{script.sourceHandle}
              </p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/scripts/${script.id}`);
                }}
              >
                <Edit3 className="w-3.5 h-3.5 mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  updateScriptMutation.mutate({
                    id: script.id,
                    status: script.status === "approved" ? "draft" : "approved",
                  });
                }}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                {script.status === "approved" ? "Mark as Draft" : "Approve"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  openSendToWorkspaceModal({
                    scriptId: script.id,
                    scriptTitle: script.title,
                  });
                }}
              >
                <Send className="w-3.5 h-3.5 mr-2" />
                Send to workspace...
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Delete this script?")) {
                    deleteScriptMutation.mutate({ id: script.id });
                  }
                }}
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div onClick={(e) => e.stopPropagation()}>
            <ShareScript title={script.title} content={script.content} variant="icon" />
          </div>
        </div>

        {/* Preview */}
        <p className="text-xs text-muted-foreground line-clamp-3 mb-3 leading-relaxed">
          {script.content.slice(0, 200)}
        </p>

        {script.sourceWorkspaceId &&
        script.sentFromWorkspaceName &&
        script.sentByUserName ? (
          <div className="mb-2">
            <SentFromBadge
              workspaceName={script.sentFromWorkspaceName}
              senderName={script.sentByUserName}
              sentAt={script.sentAt}
            />
          </div>
        ) : null}

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-3">
          {script.tags?.map((tag: any) => (
            <span
              key={tag.id}
              className="px-2 py-0.5 rounded-full text-[10px] font-medium"
              style={{
                backgroundColor: `${tag.color}20`,
                color: tag.color,
              }}
            >
              {tag.name}
            </span>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {script.wordCount} words
            </span>
            {script.gradeLevel && (
              <span>Grade {script.gradeLevel}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {script.status === "approved" ? (
              <Badge variant="default" className="text-[10px] h-5 bg-green-600">
                Approved
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] h-5">
                Draft
              </Badge>
            )}
          </div>
        </div>

        {/* Post Date */}
        {script.postDate && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-2 pt-2 border-t">
            <CalendarIcon className="w-3 h-3" />
            Post: {formatDate(script.postDate)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Calendar View Component ──

function CalendarView({
  calendarData,
  calendarMonth,
  setCalendarMonth,
  navigate,
  updateScriptMutation,
  filteredScripts,
  stageTagIdsOrdered,
}: {
  calendarData: any;
  calendarMonth: { year: number; month: number };
  setCalendarMonth: (m: { year: number; month: number }) => void;
  navigate: (path: string) => void;
  updateScriptMutation: any;
  filteredScripts: any[];
  stageTagIdsOrdered: number[];
}) {
  const { startDayOfWeek, daysInMonth, dateMap, unscheduled, year, month } = calendarData;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const today = new Date();
  const isToday = (day: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

  const prevMonth = () => {
    if (month === 0) {
      setCalendarMonth({ year: year - 1, month: 11 });
    } else {
      setCalendarMonth({ year, month: month - 1 });
    }
  };

  const nextMonth = () => {
    if (month === 11) {
      setCalendarMonth({ year: year + 1, month: 0 });
    } else {
      setCalendarMonth({ year, month: month + 1 });
    }
  };

  const goToToday = () => {
    setCalendarMonth({ year: today.getFullYear(), month: today.getMonth() });
  };

  // Handle drag-and-drop to reschedule
  const handleCalendarDrop = (day: number, e: React.DragEvent) => {
    e.preventDefault();
    const scriptId = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (isNaN(scriptId)) return;

    const newDate = new Date(year, month, day);
    updateScriptMutation.mutate({
      id: scriptId,
      postDate: newDate.toISOString(),
    });
    toast.success(`Rescheduled to ${monthNames[month]} ${day}`);
  };

  // Build calendar grid
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="space-y-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold min-w-[180px] text-center">
            {monthNames[month]} {year}
          </h2>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={goToToday}>
            Today
          </Button>
        </div>
        {unscheduled.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {unscheduled.length} unscheduled script{unscheduled.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Calendar Grid */}
      <div className="rounded-lg border border-border/50 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border/30 bg-muted/20">
          {dayNames.map((d) => (
            <div key={d} className="text-center py-2 text-[11px] font-medium text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            const key = day ? `${year}-${month}-${day}` : `empty-${idx}`;
            const scripts = day ? dateMap[key] || [] : [];

            return (
              <div
                key={key}
                className={`min-h-[100px] border-b border-r border-border/20 p-1 transition-colors ${
                  day ? "hover:bg-muted/10" : "bg-muted/5"
                } ${isToday(day || 0) ? "bg-primary/5" : ""}`}
                onDragOver={(e) => {
                  if (day) {
                    e.preventDefault();
                    e.currentTarget.classList.add("bg-primary/10");
                  }
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove("bg-primary/10");
                }}
                onDrop={(e) => {
                  e.currentTarget.classList.remove("bg-primary/10");
                  if (day) handleCalendarDrop(day, e);
                }}
              >
                {day && (
                  <>
                    <div
                      className={`text-[11px] font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                        isToday(day)
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {scripts.slice(0, 3).map((script: any) => {
                        const stripe = accentColorFromScriptTags(script.tags, stageTagIdsOrdered);
                        return (
                          <div
                            key={script.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", script.id.toString());
                            }}
                            onClick={() => navigate(`/scripts/${script.id}`)}
                            className={`text-[10px] px-1.5 py-0.5 rounded truncate cursor-pointer transition-colors ${
                              stripe
                                ? "text-foreground"
                                : "bg-primary/10 text-primary hover:bg-primary/20"
                            }`}
                            style={
                              stripe
                                ? {
                                    borderLeft: `3px solid ${stripe}`,
                                    backgroundColor: hexWithAlpha(stripe, "24"),
                                  }
                                : undefined
                            }
                            title={script.title}
                          >
                            {script.title}
                          </div>
                        );
                      })}
                      {scripts.length > 3 && (
                        <div className="text-[9px] text-muted-foreground pl-1.5">
                          +{scripts.length - 3} more
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Unscheduled Scripts */}
      {unscheduled.length > 0 && (
        <div className="rounded-lg border border-dashed border-border/50 p-4">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Unscheduled Scripts
            <span className="text-xs text-muted-foreground font-normal">
              (drag to a date to schedule)
            </span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((script: any) => {
              const stripe = accentColorFromScriptTags(script.tags, stageTagIdsOrdered);
              return (
                <div
                  key={script.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", script.id.toString());
                  }}
                  onClick={() => navigate(`/scripts/${script.id}`)}
                  className="px-3 py-1.5 rounded-md bg-card border border-border/30 text-xs cursor-grab active:cursor-grabbing hover:border-primary/30 transition-colors overflow-hidden"
                  style={
                    stripe
                      ? {
                          ...scriptTagAccentStyles(stripe, true),
                          backgroundColor: "hsl(var(--card))",
                        }
                      : undefined
                  }
                >
                  {script.title}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
