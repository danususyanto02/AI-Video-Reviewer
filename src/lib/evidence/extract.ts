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

async function listKeyframeFiles(outDir: string): Promise<string[]> {
  const entries = await readdir(outDir);
  return entries
    .filter((name) => /^keyframe_\d+\.jpg$/i.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => join(outDir, name));
}

export async function extractKeyframes(videoPath: string, outDir: string): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const ffmpeg = resolveFfmpegPath();
  const pattern = join(outDir, "keyframe_%04d.jpg");
  const args = ["-y", "-i", videoPath, "-vf", "fps=1/3", "-q:v", "2", pattern];

  const result = await runBinary(ffmpeg, args, EXTRACT_TIMEOUT_MS);
  const sampled = await listKeyframeFiles(outDir);
  if (result.code === 0 && sampled.length > 0) {
    return sampled;
  }

  if (sampled.length === 0) {
    // Sampling 1 frame per 3 detik menghasilkan nol frame pada video yang
    // lebih pendek dari interval itu; ambil frame pertama sebagai keyframe.
    const singlePath = join(outDir, "keyframe_0001.jpg");
    await runBinary(
      ffmpeg,
      ["-y", "-i", videoPath, "-frames:v", "1", "-q:v", "2", singlePath],
      EXTRACT_TIMEOUT_MS,
    );
    const fallback = await listKeyframeFiles(outDir);
    if (fallback.length > 0) {
      return fallback;
    }
  }

  // Spawn/binary absen sudah menjadi extract_failed lewat runBinary; sampai
  // di sini berarti tidak ada keyframe yang dapat diekstrak sama sekali.
  throw new EvidenceError("extract_failed", "Keyframe extraction failed.");
}
