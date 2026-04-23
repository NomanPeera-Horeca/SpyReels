import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Pause,
  RotateCcw,
  X,
  Minus,
  Plus,
  Gauge,
  Repeat,
  Mic,
  MicOff,
} from "lucide-react";

// ── Types ──

interface TakeRecord {
  sectionIndex: number;
  timestamp: number;
}

interface WordInfo {
  word: string;
  normalized: string;
  sectionIndex: number;
  wordIndexInSection: number;
}

// ── Constants ──

const MIN_SPEED = 10;
const MAX_SPEED = 200;
const DEFAULT_SPEED = 60; // pixels per second
const MIN_FONT_SIZE = 24;
const MAX_FONT_SIZE = 72;
const DEFAULT_FONT_SIZE = 40;
const TAKE_THRESHOLD = 5; // after this many takes on a section, auto-jump

// ── Helpers ──

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9']/g, "");
}

// Fuzzy match: allow 1-char difference for words > 3 chars
function fuzzyMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length <= 3 || b.length <= 3) return a === b;
  if (Math.abs(a.length - b.length) > 1) return false;
  // Simple edit distance check (allow 1 edit)
  let diffs = 0;
  const maxLen = Math.max(a.length, b.length);
  let ai = 0, bi = 0;
  while (ai < a.length && bi < b.length) {
    if (a[ai] !== b[bi]) {
      diffs++;
      if (diffs > 1) return false;
      if (a.length > b.length) ai++;
      else if (b.length > a.length) bi++;
      else { ai++; bi++; }
    } else {
      ai++;
      bi++;
    }
  }
  return true;
}

// ── SpeechRecognition type declarations ──

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

// ── Component ──

export function TeleprompterMode({
  script,
  onClose,
}: {
  script: string;
  onClose: () => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [currentSection, setCurrentSection] = useState(0);
  const [takeHistory, setTakeHistory] = useState<TakeRecord[]>([]);

  // Voice mode state
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceModeRef = useRef(false);
  const currentWordIndexRef = useRef(0);
  const lastProcessedTranscriptRef = useRef("");

  // Use refs for values accessed inside animation loop to avoid stale closures
  const speedRef = useRef(speed);
  const isPlayingRef = useRef(isPlaying);
  const currentSectionRef = useRef(currentSection);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    currentSectionRef.current = currentSection;
  }, [currentSection]);
  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);
  useEffect(() => {
    currentWordIndexRef.current = currentWordIndex;
  }, [currentWordIndex]);

  // Split script into sections (paragraphs)
  const sections = useMemo(() => {
    return script
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [script]);

  // Build flat word list with section info
  const wordList = useMemo((): WordInfo[] => {
    const words: WordInfo[] = [];
    sections.forEach((section, sIdx) => {
      const sectionWords = section.split(/\s+/).filter(Boolean);
      sectionWords.forEach((w, wIdx) => {
        words.push({
          word: w,
          normalized: normalizeWord(w),
          sectionIndex: sIdx,
          wordIndexInSection: wIdx,
        });
      });
    });
    return words;
  }, [sections]);

  // Words per section (for rendering)
  const sectionWords = useMemo(() => {
    return sections.map((section) => section.split(/\s+/).filter(Boolean));
  }, [sections]);

  // Map from flat word index to section index
  const sectionBoundaries = useMemo(() => {
    const boundaries: number[] = [];
    let offset = 0;
    sections.forEach((section) => {
      boundaries.push(offset);
      offset += section.split(/\s+/).filter(Boolean).length;
    });
    return boundaries;
  }, [sections]);

  // Count takes per section
  const takesPerSection = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const take of takeHistory) {
      counts[take.sectionIndex] = (counts[take.sectionIndex] || 0) + 1;
    }
    return counts;
  }, [takeHistory]);

  // Find the section with the most takes (hot section)
  const hotSection = useMemo(() => {
    let maxTakes = 0;
    let hotIdx = -1;
    for (const [idx, count] of Object.entries(takesPerSection)) {
      if (count >= TAKE_THRESHOLD && count > maxTakes) {
        maxTakes = count;
        hotIdx = parseInt(idx);
      }
    }
    return hotIdx;
  }, [takesPerSection]);

  // Check if Web Speech API is available
  const speechAvailable = useMemo(() => {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }, []);

  // ── Voice Recognition ──

  const startRecognition = useCallback(() => {
    if (!speechAvailable) {
      setVoiceError("Speech recognition not supported in this browser");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setVoiceListening(true);
      setVoiceError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Process results from the latest result index
      let fullTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        fullTranscript += event.results[i][0].transcript;
      }

      // Only process new words
      const spokenWords = fullTranscript
        .split(/\s+/)
        .map((w) => normalizeWord(w))
        .filter(Boolean);

      if (spokenWords.length === 0) return;

      // Try to match spoken words against expected script words
      const curIdx = currentWordIndexRef.current;
      let matchedUpTo = curIdx;

      // Look ahead up to 5 words for matches (allows skipping filler words)
      for (const spoken of spokenWords) {
        if (!spoken) continue;
        // Search in a window of next 5 expected words
        for (let look = 0; look < 5 && matchedUpTo + look < wordList.length; look++) {
          const expected = wordList[matchedUpTo + look];
          if (expected && fuzzyMatch(spoken, expected.normalized)) {
            matchedUpTo = matchedUpTo + look + 1;
            break;
          }
        }
      }

      if (matchedUpTo > curIdx) {
        currentWordIndexRef.current = matchedUpTo;
        setCurrentWordIndex(matchedUpTo);

        // Update current section based on word position
        if (matchedUpTo < wordList.length) {
          const newSection = wordList[matchedUpTo].sectionIndex;
          if (newSection !== currentSectionRef.current) {
            currentSectionRef.current = newSection;
            setCurrentSection(newSection);
          }
        }

        // Scroll to keep current word visible
        scrollToWord(matchedUpTo);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech") {
        // Ignore no-speech errors, they're normal during pauses
        return;
      }
      if (event.error === "not-allowed") {
        setVoiceError("Microphone access denied. Please allow microphone access.");
        setVoiceMode(false);
        return;
      }
      if (event.error === "aborted") {
        return; // Normal when stopping
      }
      setVoiceError(`Speech error: ${event.error}`);
    };

    recognition.onend = () => {
      setVoiceListening(false);
      // Auto-restart if still in voice mode
      if (voiceModeRef.current) {
        try {
          setTimeout(() => {
            if (voiceModeRef.current && recognitionRef.current) {
              recognitionRef.current.start();
            }
          }, 100);
        } catch {
          // Ignore restart errors
        }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setVoiceError("Failed to start speech recognition");
    }
  }, [speechAvailable, wordList]);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }
    setVoiceListening(false);
  }, []);

  // Scroll to keep a specific word visible at the reading line
  const scrollToWord = useCallback((wordIdx: number) => {
    const wordEl = wordRefs.current[wordIdx];
    if (!wordEl || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const containerRect = container.getBoundingClientRect();
    const wordRect = wordEl.getBoundingClientRect();
    const readingLineY = containerRect.top + containerRect.height * 0.4;

    // If word is not near the reading line, scroll to it
    if (Math.abs(wordRect.top - readingLineY) > 60) {
      const offset = wordRect.top - containerRect.top + container.scrollTop;
      const readingLineOffset = container.clientHeight * 0.4;
      container.scrollTop = Math.max(0, offset - readingLineOffset);
    }
  }, []);

  // Toggle voice mode
  const toggleVoiceMode = useCallback(() => {
    if (voiceMode) {
      // Turn off voice mode
      setVoiceMode(false);
      stopRecognition();
    } else {
      // Turn on voice mode - stop auto-scroll
      setIsPlaying(false);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      setVoiceMode(true);
      startRecognition();
    }
  }, [voiceMode, stopRecognition, startRecognition]);

  // Cleanup recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
      }
    };
  }, []);

  // ── Auto-scroll animation (only when NOT in voice mode) ──

  const animate = useCallback((timestamp: number) => {
    if (!scrollContainerRef.current) return;

    if (lastTimeRef.current === 0) {
      lastTimeRef.current = timestamp;
    }

    const delta = (timestamp - lastTimeRef.current) / 1000;
    lastTimeRef.current = timestamp;

    const container = scrollContainerRef.current;
    const scrollAmount = speedRef.current * delta;
    container.scrollTop += scrollAmount;

    // Check if we've reached the bottom
    if (
      container.scrollTop + container.clientHeight >=
      container.scrollHeight - 10
    ) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      return;
    }

    // Update current section based on scroll position
    const containerRect = container.getBoundingClientRect();
    const midY = containerRect.top + containerRect.height * 0.4;

    for (let i = sectionRefs.current.length - 1; i >= 0; i--) {
      const ref = sectionRefs.current[i];
      if (ref) {
        const rect = ref.getBoundingClientRect();
        if (rect.top <= midY) {
          if (i !== currentSectionRef.current) {
            currentSectionRef.current = i;
            setCurrentSection(i);
          }
          break;
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (isPlaying && !voiceMode) {
      lastTimeRef.current = 0;
      animFrameRef.current = requestAnimationFrame(animate);
    } else {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    }

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, voiceMode, animate]);

  // Jump to a specific section
  const jumpToSection = useCallback(
    (sectionIndex: number) => {
      const wasPlaying = isPlayingRef.current;
      if (wasPlaying) {
        setIsPlaying(false);
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }
      }

      const ref = sectionRefs.current[sectionIndex];
      if (ref && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const containerTop = container.getBoundingClientRect().top;
        const refTop = ref.getBoundingClientRect().top;
        const offset = refTop - containerTop + container.scrollTop;
        const readingLineOffset = container.clientHeight * 0.4;
        const targetScroll = Math.max(0, offset - readingLineOffset);
        container.scrollTop = targetScroll;
        setCurrentSection(sectionIndex);
        currentSectionRef.current = sectionIndex;
      }

      // In voice mode, also update the word index to the start of this section
      if (voiceModeRef.current && sectionBoundaries[sectionIndex] !== undefined) {
        const newWordIdx = sectionBoundaries[sectionIndex];
        currentWordIndexRef.current = newWordIdx;
        setCurrentWordIndex(newWordIdx);
      }

      if (wasPlaying && !voiceModeRef.current) {
        setTimeout(() => {
          setIsPlaying(true);
        }, 150);
      }
    },
    [sectionBoundaries]
  );

  // Record a take
  const recordTake = useCallback((sectionIndex: number) => {
    setTakeHistory((prev) => [
      ...prev,
      { sectionIndex, timestamp: Date.now() },
    ]);
  }, []);

  // Restart
  const handleRestart = useCallback(() => {
    setIsPlaying(false);
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    const curSection = currentSectionRef.current;
    recordTake(curSection);

    const updatedCounts: Record<number, number> = {};
    for (const take of takeHistory) {
      updatedCounts[take.sectionIndex] = (updatedCounts[take.sectionIndex] || 0) + 1;
    }
    updatedCounts[curSection] = (updatedCounts[curSection] || 0) + 1;

    let jumpTarget = 0;
    let maxTakes = 0;

    for (const [idx, count] of Object.entries(updatedCounts)) {
      if (count >= TAKE_THRESHOLD && count > maxTakes) {
        maxTakes = count;
        jumpTarget = parseInt(idx);
      }
    }

    // Reset word index for voice mode
    if (voiceModeRef.current) {
      const newWordIdx = sectionBoundaries[jumpTarget] || 0;
      currentWordIndexRef.current = newWordIdx;
      setCurrentWordIndex(newWordIdx);
    }

    setTimeout(() => {
      jumpToSection(jumpTarget);
    }, 50);
  }, [takeHistory, recordTake, jumpToSection, sectionBoundaries]);

  // Full reset
  const handleFullReset = useCallback(() => {
    setIsPlaying(false);
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setTakeHistory([]);
    setCurrentSection(0);
    currentSectionRef.current = 0;
    setCurrentWordIndex(0);
    currentWordIndexRef.current = 0;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case " ":
          e.preventDefault();
          if (voiceMode) {
            toggleVoiceMode(); // Space toggles voice on/off
          } else {
            setIsPlaying((p) => !p);
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          setSpeed((s) => Math.min(MAX_SPEED, s + 10));
          break;
        case "ArrowDown":
          e.preventDefault();
          setSpeed((s) => Math.max(MIN_SPEED, s - 10));
          break;
        case "r":
        case "R":
          e.preventDefault();
          handleRestart();
          break;
        case "v":
        case "V":
          e.preventDefault();
          if (speechAvailable) toggleVoiceMode();
          break;
        case "Escape":
          e.preventDefault();
          if (voiceMode) {
            stopRecognition();
            setVoiceMode(false);
          }
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleRestart, onClose, voiceMode, toggleVoiceMode, speechAvailable, stopRecognition]);

  const totalTakes = takeHistory.length;

  // Calculate flat word ref index from section + word-in-section
  const getFlatWordIndex = (sectionIdx: number, wordIdx: number): number => {
    return (sectionBoundaries[sectionIdx] || 0) + wordIdx;
  };

  // Track word ref index counter for rendering
  let wordRefCounter = 0;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top Control Bar */}
      <div className="shrink-0 bg-black/90 border-b border-white/10 px-4 py-2 flex items-center justify-between backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-white/70 hover:text-white hover:bg-white/10 h-8"
            onClick={() => {
              if (voiceMode) stopRecognition();
              onClose();
            }}
          >
            <X className="h-4 w-4 mr-1" />
            Exit
          </Button>

          <div className="h-5 w-px bg-white/20" />

          {/* Voice Mode Toggle */}
          {speechAvailable && (
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 px-3 ${
                voiceMode
                  ? voiceListening
                    ? "text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    : "text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
                  : "text-white/50 hover:text-white hover:bg-white/10"
              }`}
              onClick={toggleVoiceMode}
              title="Voice mode (V)"
            >
              {voiceMode ? (
                voiceListening ? (
                  <>
                    <Mic className="h-4 w-4 mr-1 animate-pulse" />
                    Listening
                  </>
                ) : (
                  <>
                    <MicOff className="h-4 w-4 mr-1" />
                    Starting...
                  </>
                )
              ) : (
                <>
                  <Mic className="h-4 w-4 mr-1" />
                  Voice
                </>
              )}
            </Button>
          )}

          {!voiceMode && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className={`h-8 px-3 ${isPlaying ? "text-red-400 hover:text-red-300 hover:bg-red-500/10" : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"}`}
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? (
                  <>
                    <Pause className="h-4 w-4 mr-1" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-1" />
                    Play
                  </>
                )}
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="text-white/70 hover:text-white hover:bg-white/10 h-8"
            onClick={handleRestart}
            title="Restart (R)"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Retake
          </Button>

          {totalTakes > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] h-5 border-white/20 text-white/60"
            >
              <Repeat className="mr-1 h-2.5 w-2.5" />
              {totalTakes} take{totalTakes !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {/* Speed & Font Controls */}
        <div className="flex items-center gap-4">
          {/* Voice mode word progress */}
          {voiceMode && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Progress</span>
              <span className="text-xs text-white/60">
                {currentWordIndex}/{wordList.length} words
              </span>
            </div>
          )}

          {voiceMode && <div className="h-5 w-px bg-white/20" />}

          {/* Font Size */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/40 uppercase tracking-wider">Size</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-white/50 hover:text-white hover:bg-white/10"
              onClick={() => setFontSize((s) => Math.max(MIN_FONT_SIZE, s - 4))}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="text-xs text-white/60 w-6 text-center">{fontSize}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-white/50 hover:text-white hover:bg-white/10"
              onClick={() => setFontSize((s) => Math.min(MAX_FONT_SIZE, s + 4))}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          {!voiceMode && (
            <>
              <div className="h-5 w-px bg-white/20" />

              {/* Speed Control */}
              <div className="flex items-center gap-2">
                <Gauge className="h-3.5 w-3.5 text-white/40" />
                <span className="text-[10px] text-white/40 uppercase tracking-wider">Speed</span>
                <Slider
                  value={[speed]}
                  onValueChange={([v]) => setSpeed(v)}
                  min={MIN_SPEED}
                  max={MAX_SPEED}
                  step={5}
                  className="w-24"
                />
                <span className="text-xs text-white/60 w-10 text-right">{speed}px/s</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Voice error banner */}
      {voiceError && (
        <div className="shrink-0 bg-red-500/10 border-b border-red-500/20 px-4 py-1.5 flex items-center justify-between">
          <p className="text-[11px] text-red-400">{voiceError}</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
            onClick={() => setVoiceError(null)}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Hot Section Indicator */}
      {hotSection >= 0 && (
        <div className="shrink-0 bg-orange-500/10 border-b border-orange-500/20 px-4 py-1.5 flex items-center justify-between">
          <p className="text-[11px] text-orange-400">
            Section {hotSection + 1} has {takesPerSection[hotSection]} takes. Auto-jumping there on retake.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
            onClick={handleFullReset}
          >
            Clear Takes
          </Button>
        </div>
      )}

      {/* Section Navigation (left sidebar) */}
      <div className="flex-1 min-h-0 flex">
        <div className="w-12 shrink-0 bg-black/50 border-r border-white/5 flex flex-col items-center py-3 gap-1 overflow-y-auto">
          {sections.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                jumpToSection(i);
                recordTake(i);
              }}
              className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-mono transition-colors relative ${
                i === currentSection
                  ? "bg-primary/20 text-primary border border-primary/40"
                  : "text-white/30 hover:text-white/60 hover:bg-white/5"
              }`}
              title={`Jump to section ${i + 1}${takesPerSection[i] ? ` (${takesPerSection[i]} takes)` : ""}`}
            >
              {i + 1}
              {(takesPerSection[i] || 0) >= TAKE_THRESHOLD && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-orange-500" />
              )}
            </button>
          ))}
        </div>

        {/* Main Script Display */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto"
        >
          {/* Top padding for reading position */}
          <div className="h-[40vh]" />

          {sections.map((section, i) => {
            const words = sectionWords[i] || [];
            const sectionStart = sectionBoundaries[i] || 0;

            return (
              <div
                key={i}
                ref={(el) => {
                  sectionRefs.current[i] = el;
                }}
                className={`px-8 md:px-16 lg:px-24 py-4 transition-opacity duration-300 ${
                  voiceMode
                    ? "opacity-100" // In voice mode, show all sections fully
                    : i === currentSection
                      ? "opacity-100"
                      : "opacity-30"
                } ${!voiceMode ? "cursor-pointer" : ""}`}
                onClick={!voiceMode ? () => {
                  jumpToSection(i);
                  recordTake(i);
                } : undefined}
              >
                {voiceMode ? (
                  // Voice mode: render individual words with highlighting
                  <p
                    className="text-white leading-relaxed font-light max-w-4xl mx-auto"
                    style={{ fontSize: `${fontSize}px`, lineHeight: 1.6 }}
                  >
                    {words.map((word, wIdx) => {
                      const flatIdx = sectionStart + wIdx;
                      const isSpoken = flatIdx < currentWordIndex;
                      const isCurrent = flatIdx === currentWordIndex;
                      const isUpcoming = flatIdx > currentWordIndex;

                      return (
                        <span
                          key={wIdx}
                          ref={(el) => {
                            wordRefs.current[flatIdx] = el;
                          }}
                          className={`inline transition-colors duration-150 cursor-pointer ${
                            isCurrent
                              ? "text-primary font-medium underline underline-offset-4 decoration-primary/60"
                              : isSpoken
                                ? "text-white/30"
                                : "text-white"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Click to jump voice position to this word
                            currentWordIndexRef.current = flatIdx;
                            setCurrentWordIndex(flatIdx);
                            const newSection = wordList[flatIdx]?.sectionIndex ?? i;
                            if (newSection !== currentSectionRef.current) {
                              currentSectionRef.current = newSection;
                              setCurrentSection(newSection);
                            }
                          }}
                        >
                          {word}{" "}
                        </span>
                      );
                    })}
                  </p>
                ) : (
                  // Auto-scroll mode: render section as a single block
                  <p
                    className="text-white leading-relaxed font-light max-w-4xl mx-auto"
                    style={{ fontSize: `${fontSize}px`, lineHeight: 1.6 }}
                  >
                    {section}
                  </p>
                )}
                {(takesPerSection[i] || 0) > 0 && (
                  <div className="flex items-center gap-1 mt-2 max-w-4xl mx-auto">
                    <Repeat className="h-3 w-3 text-white/20" />
                    <span className="text-[10px] text-white/20">
                      {takesPerSection[i]} take{(takesPerSection[i] || 0) !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Bottom padding */}
          <div className="h-[60vh]" />
        </div>
      </div>

      {/* Reading line indicator */}
      <div className="absolute left-12 right-0 top-[40%] pointer-events-none">
        <div className="h-px bg-gradient-to-r from-primary/0 via-primary/40 to-primary/0" />
      </div>

      {/* Bottom hints */}
      <div className="shrink-0 bg-black/90 border-t border-white/10 px-4 py-1.5 flex items-center justify-center gap-6 text-[10px] text-white/30">
        {voiceMode ? (
          <>
            <span className="text-primary/60">Voice Mode Active</span>
            <span>V: Toggle Voice</span>
            <span>R: Retake</span>
            <span>Esc: Exit</span>
            <span>Click word: Jump there</span>
          </>
        ) : (
          <>
            <span>Space: Play/Pause</span>
            <span>↑↓: Speed</span>
            <span>R: Retake</span>
            {speechAvailable && <span>V: Voice Mode</span>}
            <span>Esc: Exit</span>
            <span>Click section: Jump there</span>
          </>
        )}
      </div>
    </div>
  );
}
