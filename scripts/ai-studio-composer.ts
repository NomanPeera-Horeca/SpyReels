import "dotenv/config";
import express from "express";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { storagePutFromFile } from "../server/storage";

type RenderManifest = {
  jobId: string;
  title: string;
  aspectRatio: "9:16";
  scenes: Array<{
    sceneId: string;
    order: number;
    type: "presenter" | "broll" | "graphic";
    script: string;
    durationSeconds: number;
    voiceUrl?: string;
    presenterUrl?: string;
    brollQuery?: string;
    visualDirection?: string;
  }>;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function run(command: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => {
      stderr += String(chunk);
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
    });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}: ${stderr}`));
    });
  });
}

async function download(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${url}`);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function normalizePresenter(input: string, output: string): Promise<void> {
  await run("ffmpeg", [
    "-y",
    "-i",
    input,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-vf",
    "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    output,
  ]);
}

async function createPlaceholder(output: string, durationSeconds: number, type: "broll" | "graphic"): Promise<void> {
  const color = type === "graphic" ? "0x17172A" : "0x111111";
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:s=1080x1920:r=30:d=${durationSeconds}`,
    "-f",
    "lavfi",
    "-i",
    `anullsrc=r=48000:cl=stereo:d=${durationSeconds}`,
    "-shortest",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-ar",
    "48000",
    "-ac",
    "2",
    output,
  ]);
}

async function compose(manifest: RenderManifest): Promise<{ key: string; url: string }> {
  const workdir = await mkdtemp(join(tmpdir(), `spyreels-ai-${manifest.jobId}-`));
  try {
    const sceneFiles: string[] = [];
    for (const scene of [...manifest.scenes].sort((a, b) => a.order - b.order)) {
      const output = join(workdir, `scene-${String(scene.order).padStart(3, "0")}.mp4`);
      if (scene.type === "presenter" && scene.presenterUrl) {
        const source = join(workdir, `source-${String(scene.order).padStart(3, "0")}.mp4`);
        await download(scene.presenterUrl, source);
        await normalizePresenter(source, output);
      } else {
        await createPlaceholder(output, scene.durationSeconds, scene.type === "presenter" ? "graphic" : scene.type);
      }
      sceneFiles.push(output);
    }

    const concatList = sceneFiles
      .map(path => `file '${path.replaceAll("'", "'\\''")}'`)
      .join("\n");
    const concatPath = join(workdir, "concat.txt");
    await writeFile(concatPath, concatList);
    const finalPath = join(workdir, "final.mp4");

    await run("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatPath,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      finalPath,
    ]);

    return storagePutFromFile(
      `ai-studio/final/${manifest.jobId}.mp4`,
      finalPath,
      "video/mp4"
    );
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

async function postCallback(jobId: string, path: "complete" | "fail", body: unknown): Promise<void> {
  const baseUrl = requireEnv("AI_STUDIO_CALLBACK_BASE_URL").replace(/\/+$/, "");
  const secret = requireEnv("AI_STUDIO_WORKER_SECRET");
  const response = await fetch(`${baseUrl}/api/ai-studio/internal/jobs/${jobId}/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} callback failed (${response.status}): ${await response.text()}`);
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "spyreels-ai-studio-composer" });
});

app.post("/compose", async (req, res) => {
  const secret = process.env.AI_STUDIO_WORKER_SECRET?.trim();
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!secret || token !== secret) return res.status(401).json({ error: "Unauthorized" });

  const jobId = String(req.body?.jobId || "");
  const manifestUrl = String(req.body?.manifestUrl || "");
  if (!jobId || !manifestUrl) return res.status(400).json({ error: "jobId and manifestUrl are required" });

  res.status(202).json({ accepted: true, jobId });

  void (async () => {
    try {
      const response = await fetch(manifestUrl);
      if (!response.ok) throw new Error(`Manifest download failed (${response.status})`);
      const manifest = (await response.json()) as RenderManifest;
      if (manifest.jobId !== jobId) throw new Error("Manifest job ID does not match request");
      const output = await compose(manifest);
      await postCallback(jobId, "complete", { outputUrl: output.url, outputKey: output.key });
      console.log(`[aiStudioComposer] completed ${jobId}: ${output.url}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown composer error";
      console.error(`[aiStudioComposer] failed ${jobId}`, error);
      try {
        await postCallback(jobId, "fail", {
          error: message,
          step: "Final video composition failed",
        });
      } catch (callbackError) {
        console.error(`[aiStudioComposer] failure callback failed ${jobId}`, callbackError);
      }
    }
  })();
});

const port = Number(process.env.PORT || 10000);
app.listen(port, () => {
  console.log(`AI Studio composer listening on ${port}`);
});
