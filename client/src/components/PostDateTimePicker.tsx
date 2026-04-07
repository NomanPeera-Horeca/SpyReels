import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIME_OPTIONS } from "@/components/InlineWorkflow";

interface PostDateTimePickerProps {
  date: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
  time: string;
  onTimeChange: (time: string) => void;
  timezone?: string;
  /** Compact layout for sidebars */
  compact?: boolean;
  className?: string;
}

export function PostDateTimePicker({
  date,
  onDateChange,
  time,
  onTimeChange,
  timezone,
  compact = false,
  className = "",
}: PostDateTimePickerProps) {
  const tzLabel = timezone?.split("/").pop()?.replace("_", " ") || "Local";

  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <label className={`text-muted-foreground mb-1 block ${compact ? "text-xs" : "text-sm font-medium flex items-center gap-1.5"}`}>
          {!compact && <CalendarIcon className="h-3.5 w-3.5" />}
          Post Date
        </label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={`w-full justify-start text-left font-normal bg-card ${compact ? "h-8 text-xs" : "h-9"}`}
            >
              <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
              {date ? (
                date.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              ) : (
                <span className="text-muted-foreground">Pick a date</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={date} onSelect={onDateChange} />
          </PopoverContent>
        </Popover>
      </div>
      <div>
        <label className={`text-muted-foreground mb-1 block ${compact ? "text-xs" : "text-sm font-medium"}`}>
          Preferred Time
          <span className="text-muted-foreground/60 ml-1">({tzLabel})</span>
        </label>
        <Select value={time} onValueChange={onTimeChange}>
          <SelectTrigger className={`bg-card ${compact ? "h-8 text-xs" : "h-9"}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[200px]">
            {TIME_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
