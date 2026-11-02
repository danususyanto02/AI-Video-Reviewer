import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

export type EvidenceErrorCode = "too_long" | "unreadable" | "extract_failed";

export class EvidenceError extends Error {
  readonly code: EvidenceErrorCode;

  constructor(code: EvidenceErrorCode, message: string) {
    super(message);
    this.name = "EvidenceError";
    this.code = code;
  }
}

export function validateDuration(durationSec: number): void {
  if (typeof durationSec !== "number" || !Number.isFinite(durationSec) || durationSec <= 0) {
    throw new EvidenceError("unreadable", "Video duration could not be read or is invalid.");
  }
  if (durationSec > 180) {
    throw new EvidenceError("too_long", "Video duration exceeds the 180 second maximum.");
  }
}

function packageFfprobePath(): string | null {
  try {
    const req = createRequire(import.meta.url);
    const mod: unknown = req("ffprobe-static");
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

export function resolveFfprobePath(): string {
  const fromEnv = process.env.FFPROBE_PATH;
  if (fromEnv) return fromEnv;
  const fromPackage = packageFfprobePath();
  if (fromPackage && existsSync(fromPackage)) return fromPackage;
  return "ffprobe";
}

const PROBE_TIMEOUT_MS = 30_000;

export function probeDuration(videoPath: string): Promise<number> {
  const ffprobe = resolveFfprobePath();
  const args = ["-v", "error", "-show_entries", "format=duration", "-of", "json", videoPath];

  return new Promise<number>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      reject(new EvidenceError("unreadable", message));
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(ffprobe, args, { windowsHide: true });
    } catch {
      fail("Video file could not be read (ffprobe failed to start).");
      return;
    }

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore kill errors
      }
      fail("Video file could not be read (probe exceeded the 30 second limit).");
    }, PROBE_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on("error", () => {
      clearTimeout(timer);
      fail("Video file could not be read (ffprobe not found or failed to run).");
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      if (code !== 0) {
        fail(`Video file could not be read (ffprobe exited with code ${String(code)}).`);
        return;
      }
      try {
        const parsed: unknown = JSON.parse(stdout) as unknown;
        const durationRaw =
          typeof parsed === "object" && parsed !== null && "format" in parsed
            ? (parsed as { format?: { duration?: unknown } }).format?.duration
            : undefined;
        const duration = typeof durationRaw === "string" ? Number.parseFloat(durationRaw) : Number(durationRaw);
        if (!Number.isFinite(duration) || duration <= 0) {
          fail("Video file could not be read (duration not found).");
          return;
        }
        settled = true;
        resolve(duration);
      } catch {
        void stderr;
        fail("Video file could not be read (invalid ffprobe output).");
      }
    });
  });
}
