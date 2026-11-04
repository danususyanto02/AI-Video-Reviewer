import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { mockEvidenceBundle } from "../contracts/fixtures";
import { KeyframeFinding, SceneSegment, TranscriptSegment } from "../contracts/schemas";
import type {
  KeyframeFinding as KeyframeFindingType,
  SceneSegment as SceneSegmentType,
  TranscriptSegment as TranscriptSegmentType,
} from "../contracts/schemas";
import { DEFAULT_TIMEOUTS, loadMetaConfig, MetaError } from "./config";
import type { MetaTimeouts } from "./config";

export { MetaError } from "./config";
export type { MetaErrorCode, MetaTimeouts } from "./config";

export interface MetaClient {
  transcribe(audioPath: string): Promise<TranscriptSegmentType[]>;
  understandVideo(videoPath: string): Promise<SceneSegmentType[]>;
  understandImages(
    imagePaths: string[],
    frameTimesSec?: Array<number | null>,
  ): Promise<KeyframeFindingType[]>;
  localizeKeyframe(imagePath: string, concept: string): Promise<KeyframeFindingType[]>;
  reasonJson(systemPrompt: string, userPayload: unknown): Promise<unknown>;
}

export interface CreateMetaClientOptions {
  forceMock?: boolean;
  apiKey?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: Partial<MetaTimeouts>;
  retryDelayMs?: number;
}

// Verified 2026-10-30 via dev.meta.ai docs (Context7 /websites/dev_meta_ai):
// base URL https://api.meta.ai/v1, auth "Authorization: Bearer <key>",
// Responses POST /responses {model: "muse-spark-1.3", input: [...]},
// batch transcribe POST /asr/transcribe responding {transcript, turns[]},
// SAM via /responses with model "sam-3.1".
// Images and SAM localization go through /responses with the image attached
// as a base64 data URL (input_image), never as a local file path. Still
// perlu-verifikasi: transcribe and video understanding still send local
// file paths, and their endpoints are not yet proven live.
const PATHS = {
  transcribe: "/asr/transcribe",
  video: "/video/understand",
  reason: "/responses",
} as const;

const IMAGE_BATCH_SIZE = 16;
const IMAGE_BATCH_CONCURRENCY = 3;

async function imageDataUrl(imagePath: string): Promise<string> {
  const bytes = await readFile(imagePath);
  const ext = extname(imagePath).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function parseResponsesPayload(payload: unknown): unknown {
  if (isRecord(payload) && typeof payload.output_text === "string") {
    try {
      return JSON.parse(payload.output_text) as unknown;
    } catch {
      return payload.output_text;
    }
  }
  // Observed live shape: output[] -> message -> content[] -> output_text.
  if (isRecord(payload) && Array.isArray(payload.output)) {
    for (const item of payload.output) {
      if (!isRecord(item) || item.type !== "message" || !Array.isArray(item.content)) continue;
      for (const part of item.content) {
        if (!isRecord(part) || part.type !== "output_text" || typeof part.text !== "string") continue;
        try {
          return JSON.parse(part.text) as unknown;
        } catch {
          return part.text;
        }
      }
    }
    return payload.output;
  }
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload) as unknown;
    } catch {
      return payload;
    }
  }
  return payload;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickArray(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key] as unknown[];
  }
  if (isRecord(payload.data)) return pickArray(payload.data, keys);
  return [];
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function mapTranscript(payload: unknown): TranscriptSegmentType[] {
  const out: TranscriptSegmentType[] = [];
  for (const item of pickArray(payload, ["turns", "segments", "transcript", "results", "output"])) {
    if (!isRecord(item)) continue;
    const parsed = TranscriptSegment.safeParse({
      start_sec: num(item.start_sec ?? item.start),
      end_sec: num(item.end_sec ?? item.end),
      text: str(item.text),
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function mapScenes(payload: unknown): SceneSegmentType[] {
  const out: SceneSegmentType[] = [];
  for (const item of pickArray(payload, ["scenes", "segments", "results", "output"])) {
    if (!isRecord(item)) continue;
    const parsed = SceneSegment.safeParse({
      start_sec: num(item.start_sec ?? item.start),
      end_sec: num(item.end_sec ?? item.end),
      description: str(item.description ?? item.text),
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

const VALID_KINDS = new Set([
  "logo",
  "watermark",
  "license_plate",
  "document",
  "child",
  "sensitive_object",
  "third_party_clip",
  "other",
]);

function mapKeyframes(payload: unknown): KeyframeFindingType[] {
  const out: KeyframeFindingType[] = [];
  for (const item of pickArray(payload, ["findings", "keyframes", "results", "output"])) {
    if (!isRecord(item)) continue;
    const kind = str(item.kind);
    const rawBox = isRecord(item.box) ? item.box : undefined;
    const box = rawBox
      ? { x: num(rawBox.x), y: num(rawBox.y), w: num(rawBox.w), h: num(rawBox.h) }
      : undefined;
    const parsed = KeyframeFinding.safeParse({
      at_sec: num(item.at_sec ?? item.at ?? item.start_sec),
      kind: VALID_KINDS.has(kind) ? kind : "other",
      description: str(item.description ?? item.text),
      ...(box ? { box } : {}),
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export function createMetaClient(opts: CreateMetaClientOptions = {}): MetaClient {
  const config = loadMetaConfig(opts);
  const fetchFn: typeof fetch = opts.fetchFn ?? fetch;
  const timeouts: MetaTimeouts = { ...DEFAULT_TIMEOUTS, ...(opts.timeoutMs ?? {}) };
  const retryDelayMs = opts.retryDelayMs ?? 2000;

  if (!config.mock && !config.apiKey) {
    throw new MetaError("config", "META_API_KEY is required when mock mode is off.");
  }

  async function requestJson(path: string, payload: unknown, timeoutMs: number): Promise<unknown> {
    const base = (config.baseUrl ?? "").replace(/\/+$/, "");
    const url = `${base}${path}`;
    let lastError: MetaError = new MetaError("network", "Meta request failed.");

    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await delay(retryDelayMs);
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        const response = await new Promise<Response>((resolve, reject) => {
          const onAbort = () =>
            reject(new MetaError("timeout", `Meta request timed out after ${timeoutMs}ms.`));
          if (signal.aborted) {
            onAbort();
            return;
          }
          signal.addEventListener("abort", onAbort, { once: true });
          Promise.resolve(
            fetchFn(url, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${config.apiKey ?? ""}`,
              },
              body: JSON.stringify(payload),
              signal,
            }),
          ).then(
            (res) => {
              signal.removeEventListener("abort", onAbort);
              resolve(res);
            },
            (err: unknown) => {
              signal.removeEventListener("abort", onAbort);
              reject(err);
            },
          );
        });

        if (!response.ok) {
          throw new MetaError("http", `Meta request failed with HTTP ${response.status}.`);
        }
        const text = await response.text();
        if (!text) return null;
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return text;
        }
      } catch (err) {
        if (err instanceof MetaError) {
          lastError = err;
        } else if (
          signal.aborted ||
          (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError"))
        ) {
          lastError = new MetaError("timeout", `Meta request timed out after ${timeoutMs}ms.`);
        } else {
          lastError = new MetaError(
            "network",
            err instanceof Error ? `Meta network error: ${err.message}` : "Meta network error.",
          );
        }
        if (attempt === 1) throw lastError;
      }
    }
    throw lastError;
  }

  if (config.mock) {
    return {
      async transcribe() {
        return clone(mockEvidenceBundle.transcript);
      },
      async understandVideo() {
        return clone(mockEvidenceBundle.scenes);
      },
      async understandImages() {
        return clone(mockEvidenceBundle.keyframe_findings);
      },
      async localizeKeyframe(imagePath: string, concept: string) {
        const kind = VALID_KINDS.has(concept) ? concept : "license_plate";
        const baseFinding = mockEvidenceBundle.keyframe_findings[0];
        return [
          {
            at_sec: baseFinding?.at_sec ?? 18,
            kind: kind as KeyframeFindingType["kind"],
            description: `Mock localization result for concept "${concept}" on ${imagePath}: ${baseFinding?.description ?? "Object localized on keyframe."}`,
            ...(baseFinding?.box ? { box: clone(baseFinding.box) } : {}),
          },
        ];
      },
      async reasonJson() {
        return { risk_level: "rendah", findings: [] };
      },
    };
  }

  return {
    async transcribe(audioPath: string) {
      const payload = await requestJson(PATHS.transcribe, { audio_path: audioPath }, timeouts.transcribe);
      return mapTranscript(payload);
    },
    async understandVideo(videoPath: string) {
      const payload = await requestJson(PATHS.video, { video_path: videoPath }, timeouts.video);
      return mapScenes(payload);
    },
    async understandImages(imagePaths: string[], frameTimesSec?: Array<number | null>) {
      if (imagePaths.length === 0) return [];

      type Batch = Array<{ path: string; atSec: number | null }>;
      const batches: Batch[] = [];
      for (let start = 0; start < imagePaths.length; start += IMAGE_BATCH_SIZE) {
        batches.push(
          imagePaths
            .slice(start, start + IMAGE_BATCH_SIZE)
            .map((path, offset) => ({ path, atSec: frameTimesSec?.[start + offset] ?? null })),
        );
      }

      async function runBatch(batch: Batch): Promise<KeyframeFindingType[]> {
        const content: Array<Record<string, string>> = [
          {
            type: "input_text",
            text: [
              "You are shown frames from one video. Each image is preceded by a label: either its second in the video, or Thumbnail.",
              "Return ONLY a JSON array, no other text. One item per notable frame: {\"at_sec\": number, \"kind\": string, \"description\": string}.",
              "kind may only be: logo, watermark, license_plate, document, child, sensitive_object, third_party_clip, other.",
              "description states plainly what is visible in that frame: people, products, brand logos, on-screen text, personal data.",
              "For the Thumbnail image use at_sec 0. If a frame shows nothing notable, leave it out.",
            ].join("\n"),
          },
        ];
        for (const frame of batch) {
          content.push({
            type: "input_text",
            text: frame.atSec === null ? "Thumbnail image:" : `Frame at ${frame.atSec} seconds:`,
          });
          content.push({ type: "input_image", image_url: await imageDataUrl(frame.path) });
        }
        const payload = await requestJson(
          PATHS.reason,
          {
            model: "muse-spark-1.3",
            input: [{ type: "message", role: "user", content }],
          },
          timeouts.image,
        );
        const findings = mapKeyframes(parseResponsesPayload(payload));
        const labeledTimes = batch
          .map((frame) => frame.atSec)
          .filter((value): value is number => typeof value === "number");
        // Snap reported seconds to the nearest labeled frame so a finding
        // never points at a second the model was not shown.
        return findings.map((finding) => {
          if (finding.at_sec <= 0 || labeledTimes.length === 0) return finding;
          let nearest = labeledTimes[0] as number;
          for (const time of labeledTimes) {
            if (Math.abs(time - finding.at_sec) < Math.abs(nearest - finding.at_sec)) {
              nearest = time;
            }
          }
          return { ...finding, at_sec: nearest };
        });
      }

      const results: KeyframeFindingType[][] = new Array(batches.length);
      let nextBatch = 0;
      async function worker(): Promise<void> {
        while (nextBatch < batches.length) {
          const index = nextBatch;
          nextBatch += 1;
          results[index] = await runBatch(batches[index] as Batch);
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(IMAGE_BATCH_CONCURRENCY, batches.length) }, () => worker()),
      );
      return results.flat();
    },
    async localizeKeyframe(imagePath: string, concept: string) {
      const payload = await requestJson(
        PATHS.reason,
        {
          model: "sam-3.1",
          input: [
            {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `Locate "${concept}" in this image. Return ONLY a JSON array, no other text: [{"at_sec": 0, "kind": "${concept}", "description": string, "box": {"x": number, "y": number, "w": number, "h": number}}]. Coordinates are fractions of the image width and height. If it is not present, return [].`,
                },
                { type: "input_image", image_url: await imageDataUrl(imagePath) },
              ],
            },
          ],
        },
        timeouts.sam,
      );
      return mapKeyframes(parseResponsesPayload(payload));
    },
    async reasonJson(systemPrompt: string, userPayload: unknown) {
      const payload = await requestJson(
        PATHS.reason,
        {
          model: "muse-spark-1.3",
          input: [
            {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `${systemPrompt}\n\n${JSON.stringify(userPayload)}`,
                },
              ],
            },
          ],
        },
        timeouts.reason,
      );
      return parseResponsesPayload(payload);
    },
  };
}
