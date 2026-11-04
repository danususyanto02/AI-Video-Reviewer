import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { EvidenceError, resolveFfprobePath } from "./validate";

export { resolveFfprobePath };

function packageFfmpegPath(): string | null {
  try {
    const req = createRequire(import.meta.url);
    const mod: unknown = req("ffmpeg-static");
    if (typeof mod === "string" && mod) return mod;
    if (typeof mod === "object" && mod !== null && "path" in mod) {
      const p = (mod as { path?: unknown }).path;
      if (typeof p === "string" && p) return p;
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveFfmpegPath(): string {
  const fromEnv = process.env.FFMPEG_PATH;
  if (fromEnv) return fromEnv;
  const fromPackage = packageFfmpegPath();
  if (fromPackage && existsSync(fromPackage)) return fromPackage;
  return "ffmpeg";
}

type RunResult = { stdout: string; stderr: string; code: number | null };

function runBinary(binary: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise<RunResult>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(binary, args, { windowsHide: true });
    } catch {
      reject(new EvidenceError("extract_failed", "Media extraction failed (binary could not run)."));
      return;
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        // ignore kill errors
      }
      reject(new EvidenceError("extract_failed", "Media extraction failed (timed out)."));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (err && err.code === "ENOENT") {
        reject(new EvidenceError("extract_failed", "Media extraction failed (ffmpeg binary not found)."));
      } else {
        reject(new EvidenceError("extract_failed", "Media extraction failed to run."));
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({ stdout, stderr, code });
    });
  });
}

const EXTRACT_TIMEOUT_MS = 120_000;

export async function extractAudio(videoPath: string, outDir: string): Promise<string | null> {
  await mkdir(outDir, { recursive: true });
  const ffmpeg = resolveFfmpegPath();
  const outputPath = join(outDir, "audio.wav");
  const args = ["-y", "-i", videoPath, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", outputPath];

  const result = await runBinary(ffmpeg, args, EXTRACT_TIMEOUT_MS);
  if (existsSync(outputPath)) {
    return outputPath;
  }
  if (result.code !== 0) {
    const lower = result.stderr.toLowerCase();
    const noAudio =
      lower.includes("does not contain any stream") ||
      lower.includes("output file is empty") ||
      lower.includes("output file does not contain") ||
      lower.includes("no audio") ||
      lower.includes("could not find audio");
    if (noAudio) return null;
    // ffmpeg berjalan tetapi tidak menghasilkan audio: perlakukan sebagai tanpa audio
    // agar video senyap tetap menghasilkan bundle dengan transkrip kosong.
    // Kegagalan spawn/binary sudah ditangani sebagai extract_failed di runBinary.
    if (result.code !== null && !existsSync(outputPath)) {
      // Bila stderr menunjukkan binary hilang, runBinary sudah reject; di sini
      // kegagalan dekode tanpa stream audio dianggap senyap.
      const looksLikeNoStream = lower.includes("invalid data") || lower.includes("moov atom not found");
      if (looksLikeNoStream) {
        throw new EvidenceError("extract_failed", "Audio extraction failed (file could not be decoded).");
      }
      return null;
    }
  }
  return existsSync(outputPath) ? outputPath : null;
}

export type KeyframeImage = {
  path: string;
  atSec: number;
};

// Frames are taken every second, plus the first frame, plus extra frames
// where the picture changes (scene cuts). One frame per second keeps short
// moments (a license plate shown briefly) from slipping between checks,
// and scene frames catch cuts that fall between seconds.
const SCENE_THRESHOLD = 0.4;
const MAX_KEYFRAMES = 210;

async function listFrameFiles(dir: string, prefix: string): Promise<string[]> {
  const entries = await readdir(dir);
  const pattern = new RegExp(`^${prefix}_\\d+\\.jpg$`, "i");
  return entries
    .filter((name) => pattern.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => join(dir, name));
}

function parseShowinfoTimes(stderr: string): number[] {
  const times: number[] = [];
  const pattern = /pts_time:([0-9]+(?:\.[0-9]+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(stderr)) !== null) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) times.push(value);
  }
  return times;
}

export async function extractKeyframes(videoPath: string, outDir: string): Promise<KeyframeImage[]> {
  await mkdir(outDir, { recursive: true });
  const ffmpeg = resolveFfmpegPath();

  // The first frame always counts: a video with no scene change still has
  // exactly one picture worth checking.
  const firstPath = join(outDir, "keyframe_0001.jpg");
  await runBinary(
    ffmpeg,
    ["-y", "-i", videoPath, "-frames:v", "1", "-q:v", "2", firstPath],
    EXTRACT_TIMEOUT_MS,
  );
  if (!existsSync(firstPath)) {
    throw new EvidenceError("extract_failed", "Keyframe extraction failed.");
  }

  const candidates: KeyframeImage[] = [{ path: firstPath, atSec: 0 }];

  const sceneDir = join(outDir, "scene");
  await mkdir(sceneDir, { recursive: true });
  const scenePattern = join(sceneDir, "scene_%04d.jpg");
  const sceneResult = await runBinary(
    ffmpeg,
    [
      "-y", "-i", videoPath,
      "-vf", `select='gt(scene,${SCENE_THRESHOLD})',showinfo`,
      "-vsync", "vfr",
      "-q:v", "2", scenePattern,
    ],
    EXTRACT_TIMEOUT_MS,
  );
  if (sceneResult.code === 0) {
    const sceneFiles = await listFrameFiles(sceneDir, "scene");
    const times = parseShowinfoTimes(sceneResult.stderr);
    sceneFiles.forEach((path, index) => {
      candidates.push({ path, atSec: times[index] ?? 0 });
    });
  }

  const secondDir = join(outDir, "second");
  await mkdir(secondDir, { recursive: true });
  const secondPattern = join(secondDir, "second_%04d.jpg");
  const secondResult = await runBinary(
    ffmpeg,
    [
      "-y", "-i", videoPath,
      "-vf", "fps=1,showinfo",
      "-q:v", "2", secondPattern,
    ],
    EXTRACT_TIMEOUT_MS,
  );
  if (secondResult.code === 0) {
    const secondFiles = await listFrameFiles(secondDir, "second");
    const times = parseShowinfoTimes(secondResult.stderr);
    secondFiles.forEach((path, index) => {
      candidates.push({ path, atSec: times[index] ?? index });
    });
  }

  candidates.sort((a, b) => a.atSec - b.atSec);
  const deduped: KeyframeImage[] = [];
  for (const candidate of candidates) {
    const last = deduped[deduped.length - 1];
    if (last && candidate.atSec - last.atSec < 0.5) continue;
    deduped.push(candidate);
  }

  if (deduped.length <= MAX_KEYFRAMES) {
    return deduped;
  }
  // Very fast-cut videos can produce hundreds of scene frames. Keep an even
  // spread across the whole video so the cap never drops the ending.
  const spread: KeyframeImage[] = [];
  const step = (deduped.length - 1) / (MAX_KEYFRAMES - 1);
  for (let i = 0; i < MAX_KEYFRAMES; i += 1) {
    const item = deduped[Math.round(i * step)];
    if (item) spread.push(item);
  }
  return spread;
}
