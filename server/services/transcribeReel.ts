import { DeepgramClient, DeepgramError } from "@deepgram/sdk";
import { spawn } from "node:child_process";
import { gotScraping } from "got-scraping";

export type Segment = { start: number; end: number; text: string };

export type ErrorCode =
  | "NETWORK_ERROR"
  | "VIDEO_TOO_LARGE"
  | "AUDIO_EXTRACTION_FAILED"
  | "REEL_TOO_LONG"
  | "NO_SPEECH_DETECTED"
  | "DEEPGRAM_RATE_LIMIT"
  | "DEEPGRAM_SERVICE_DOWN"
  | "TIMEOUT"
  | "UNKNOWN";

export type TranscriptionResult =
  | { success: true; transcript: string; segments: Segment[]; durationSec: number }
  | { success: false; errorCode: ErrorCode; userMessage: string };

const USER_MESSAGES: Record<ErrorCode, string> = {
  NETWORK_ERROR: "Having trouble connecting. Please try again in a moment.",
  VIDEO_TOO_LARGE: "This video is unusually large. Try a different reel.",
  AUDIO_EXTRACTION_FAILED:
    "We had trouble processing this video's audio. Try a different reel.",
  REEL_TOO_LONG:
    "This reel is too long to transcribe. We support reels up to 10 minutes.",
  NO_SPEECH_DETECTED:
    "Looks like this one's all vibes, no voice. Try a reel with narration to unlock scripts and hooks.",
  DEEPGRAM_RATE_LIMIT:
    "Transcription is busy right now. Please try again in a minute.",
  DEEPGRAM_SERVICE_DOWN:
    "Our transcription service is experiencing issues. We're on it. Please try again shortly.",
  TIMEOUT: "This took longer than expected. Please retry.",
  UNKNOWN: "Something unexpected happened. Our team has been notified.",
};

const MAX_RAW_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_REEL_SECONDS = 10 * 60;
/** Hard cap for Deepgram so hung requests cannot hold the server semaphore forever (Bug #24). */
const DEEPGRAM_TRANSCRIBE_TIMEOUT_MS = 120_000;

function fail(
  errorCode: ErrorCode,
  shortcode: string,
  reason?: string
): TranscriptionResult {
  console.error(
    `[transcribeReel] FAIL ${errorCode} for ${shortcode}${reason ? `: ${reason}` : ""}`
  );
  return {
    success: false,
    errorCode,
    userMessage: USER_MESSAGES[errorCode],
  };
}

/**
 * True when text is empty or only contains music/SFX placeholders
 * (musical symbols, [Music], (instrumental), etc.). Same intent as
 * the Whisper-side helper in routers.ts.
 */
function isNoSpeech(text: string): boolean {
  let s = text.normalize("NFKC").trim();
  if (!s) return true;

  s = s.replace(/[\u{1F3B5}\u{1F3B6}\u{266A}\u{266B}\u{266C}\u{1F39A}\u{1F39B}]/gu, "");

  s = s.replace(/\[[^\]]{0,200}?\]/g, " ");

  s = s.replace(/\([^)]{0,200}\)/gi, (block) => {
    const inner = block.slice(1, -1).toLowerCase();
    if (
      inner.length < 180 &&
      /(music|musical|applause|applaud|laugh|laughter|crowd|audience|instrumental|beat|beats|beatboxing|singing|vocals?|radio|siren|bell|phone|ringtone|static|noise|playing)/.test(
        inner
      )
    ) {
      return " ";
    }
    return block;
  });

  s = s.replace(/\s+/g, " ").trim();
  if (!s) return true;

  if (!/[\p{L}\p{N}]/u.test(s)) return true;

  return false;
}

async function downloadVideo(
  videoUrl: string,
  shortcode: string
): Promise<Buffer | TranscriptionResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(
      `[transcribeReel] download attempt ${attempt}/3 for shortcode ${shortcode}`
    );
    try {
      const response = await gotScraping({
        url: videoUrl,
        responseType: "buffer",
        timeout: { request: 30_000 },
        headerGeneratorOptions: {
          browsers: [{ name: "chrome", minVersion: 120 }],
          operatingSystems: ["windows"],
        },
      });

      if (response.statusCode === 200) {
        const buffer = Buffer.from(response.body as Buffer);
        if (buffer.length > MAX_RAW_VIDEO_BYTES) {
          return fail(
            "VIDEO_TOO_LARGE",
            shortcode,
            `${(buffer.length / 1024 / 1024).toFixed(1)}MB`
          );
        }
        const sizeMB = buffer.length / 1024 / 1024;
        console.log(
          `[transcribeReel] downloaded ${sizeMB.toFixed(1)}MB for shortcode ${shortcode}`
        );
        return buffer;
      }

      if (response.statusCode === 403 || response.statusCode === 404) {
        return fail(
          "NETWORK_ERROR",
          shortcode,
          `HTTP ${response.statusCode}`
        );
      }

      lastError = new Error(`HTTP ${response.statusCode}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < 3) {
      const backoffMs = 1000 * 2 ** (attempt - 1);
      console.log(
        `[transcribeReel] download retry in ${backoffMs}ms for shortcode ${shortcode}`
      );
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  if (lastError && /timeout/i.test(lastError.message)) {
    return fail("TIMEOUT", shortcode, lastError.message);
  }
  return fail("NETWORK_ERROR", shortcode, lastError?.message);
}

async function extractAudio(
  videoBuffer: Buffer,
  shortcode: string
): Promise<Buffer> {
  console.log(`[transcribeReel] extracting audio for shortcode ${shortcode}`);
  return new Promise<Buffer>((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const ffmpeg = spawn("ffmpeg", [
      "-i", "pipe:0",
      "-vn",
      "-acodec", "libmp3lame",
      "-ar", "16000",
      "-ac", "1",
      "-b:a", "32k",
      "-f", "mp3",
      "pipe:1",
    ]);

    ffmpeg.stdout.on("data", (c: Buffer) => stdoutChunks.push(c));
    ffmpeg.stderr.on("data", (c: Buffer) => stderrChunks.push(c));
    ffmpeg.on("error", (err) => reject(err));
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks));
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString("utf8").slice(-500);
      reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
    });
    ffmpeg.stdin.on("error", (err) => reject(err));
    ffmpeg.stdin.end(videoBuffer);
  });
}

// Error codes that represent transient infrastructure issues (network blips,
// Deepgram 5xx/429, timeouts, and unclassified system errors). Retrying these
// once with a short delay usually succeeds. Everything else (NO_SPEECH_DETECTED,
// VIDEO_TOO_LARGE, REEL_TOO_LONG, AUDIO_EXTRACTION_FAILED) is a permanent
// outcome where retrying won't change the answer.
const TRANSIENT_ERROR_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "NETWORK_ERROR",
  "TIMEOUT",
  "DEEPGRAM_RATE_LIMIT",
  "DEEPGRAM_SERVICE_DOWN",
  "UNKNOWN",
]);

async function attemptTranscription(input: {
  videoUrl: string;
  shortcode: string;
}): Promise<TranscriptionResult> {
  const { videoUrl, shortcode } = input;
  const overallStart = Date.now();
  console.log(`[transcribeReel] start shortcode=${shortcode}`);

  try {
    if (!process.env.DEEPGRAM_API_KEY) {
      throw new Error("DEEPGRAM_API_KEY is not configured");
    }

    // ── Stage A: download ─────────────────────────────────────────────
    const downloadResult = await downloadVideo(videoUrl, shortcode);
    if (!Buffer.isBuffer(downloadResult)) {
      return downloadResult;
    }
    const videoBuffer = downloadResult;

    // ── Stage B: extract audio ────────────────────────────────────────
    let audioBuffer: Buffer;
    try {
      audioBuffer = await extractAudio(videoBuffer, shortcode);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return fail("AUDIO_EXTRACTION_FAILED", shortcode, reason);
    }
    const audioMB = audioBuffer.length / 1024 / 1024;
    console.log(
      `[transcribeReel] extracted ${audioMB.toFixed(1)}MB audio for shortcode ${shortcode}`
    );

    // ── Stage C: Deepgram Nova-3 ──────────────────────────────────────
    const client = new DeepgramClient({
      apiKey: process.env.DEEPGRAM_API_KEY,
    });
    const dgStart = Date.now();
    let response;
    try {
      const dgPromise = client.listen.v1.media.transcribeFile(audioBuffer, {
        model: "nova-3",
        smart_format: true,
        punctuate: true,
        paragraphs: true,
        utterances: true,
        language: "en",
      });
      response = await Promise.race([
        dgPromise,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("DEEPGRAM_REQUEST_TIMEOUT")),
            DEEPGRAM_TRANSCRIBE_TIMEOUT_MS
          )
        ),
      ]);
    } catch (err) {
      if (err instanceof Error && err.message === "DEEPGRAM_REQUEST_TIMEOUT") {
        return fail("TIMEOUT", shortcode, "Deepgram request exceeded 2 minutes");
      }
      if (err instanceof DeepgramError) {
        const code = err.statusCode;
        if (code === 429) {
          return fail("DEEPGRAM_RATE_LIMIT", shortcode, err.message);
        }
        if (code !== undefined && code >= 500 && code < 600) {
          return fail("DEEPGRAM_SERVICE_DOWN", shortcode, err.message);
        }
        return fail(
          "UNKNOWN",
          shortcode,
          `Deepgram ${code ?? "?"}: ${err.message}`
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (/timeout/i.test(msg)) {
        return fail("TIMEOUT", shortcode, msg);
      }
      console.error(
        `[transcribeReel] deepgram error for ${shortcode}:`,
        err instanceof Error ? err.stack : err
      );
      return fail("UNKNOWN", shortcode, msg);
    }
    const dgSeconds = (Date.now() - dgStart) / 1000;
    console.log(
      `[transcribeReel] deepgram returned in ${dgSeconds.toFixed(1)} seconds for shortcode ${shortcode}`
    );

    // ── Stage D: parse + classify ─────────────────────────────────────
    if (!("results" in response) || !response.results) {
      return fail("UNKNOWN", shortcode, "Deepgram returned no results");
    }
    const transcript =
      response.results.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    const utterances = response.results.utterances ?? [];
    const durationSec = response.metadata?.duration ?? 0;

    if (durationSec > MAX_REEL_SECONDS) {
      return fail("REEL_TOO_LONG", shortcode, `${durationSec.toFixed(0)}s`);
    }

    if (isNoSpeech(transcript)) {
      return fail("NO_SPEECH_DETECTED", shortcode, "music/visuals only");
    }

    const segments: Segment[] = utterances.map((u) => ({
      start: u.start ?? 0,
      end: u.end ?? 0,
      text: (u.transcript ?? "").trim(),
    }));

    console.log(
      `[transcribeReel] success shortcode=${shortcode} totalMs=${Date.now() - overallStart}`
    );
    return {
      success: true,
      transcript: transcript.trim(),
      segments,
      durationSec,
    };
  } catch (err) {
    console.error(
      `[transcribeReel] uncaught error for ${shortcode}:`,
      err instanceof Error ? err.stack : err
    );
    return fail(
      "UNKNOWN",
      shortcode,
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Public entry point. Runs attemptTranscription once; on transient failure
 * (network/timeout/Deepgram 5xx/429/UNKNOWN), waits 2s and retries exactly
 * once. Non-transient failures (no speech, too large, too long, bad audio)
 * return immediately. Always returns a TranscriptionResult — never throws.
 */
export async function transcribeReel(input: {
  videoUrl: string;
  shortcode: string;
}): Promise<TranscriptionResult> {
  const result = await attemptTranscription(input);
  if (result.success) return result;

  if (!TRANSIENT_ERROR_CODES.has(result.errorCode)) {
    return result;
  }

  console.log(
    `[transcribe] retry_attempt reelId=${input.shortcode} originalError=${result.errorCode}`
  );
  await new Promise((r) => setTimeout(r, 2000));

  const retryResult = await attemptTranscription(input);
  if (!retryResult.success) {
    console.log(
      `[transcribe] retry_failed reelId=${input.shortcode} originalError=${result.errorCode} retryError=${retryResult.errorCode}`
    );
  }
  return retryResult;
}
