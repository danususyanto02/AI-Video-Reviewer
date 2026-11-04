import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mockEvidenceBundle } from "../contracts/fixtures";
import {
  EvidenceBundle as EvidenceBundleSchema,
  KeyframeFinding as KeyframeFindingSchema,
  SceneSegment as SceneSegmentSchema,
  TranscriptSegment as TranscriptSegmentSchema,
} from "../contracts/schemas";
import type {
  EvidenceBundle,
  KeyframeFinding,
  SceneSegment,
  TranscriptSegment,
} from "../contracts/schemas";
import type { MetaClient } from "../meta/client";
import { extractAudio, extractKeyframes } from "./extract";
import type { KeyframeImage } from "./extract";
import { EvidenceError, probeDuration, validateDuration } from "./validate";

export { EvidenceError, probeDuration, validateDuration };
export type { EvidenceErrorCode } from "./validate";

export interface EvidenceInput {
  videoPath: string;
  thumbnailPath: string | null;
  title: string;
  caption: string;
  extraContext: string;
}

const LOCALIZABLE_KINDS: ReadonlySet<string> = new Set([
  "logo",
  "watermark",
  "license_plate",
  "document",
  "child",
  "sensitive_object",
  "third_party_clip",
]);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getDemoEvidenceBundle(): EvidenceBundle {
  return EvidenceBundleSchema.parse(clone(mockEvidenceBundle));
}

function validTranscripts(items: TranscriptSegment[]): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  for (const item of items) {
    const parsed = TranscriptSegmentSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function validScenes(items: SceneSegment[]): SceneSegment[] {
  const out: SceneSegment[] = [];
  for (const item of items) {
    const parsed = SceneSegmentSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function validKeyframes(items: KeyframeFinding[]): KeyframeFinding[] {
  const out: KeyframeFinding[] = [];
  for (const item of items) {
    const parsed = KeyframeFindingSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function pickKeyframeImage(atSec: number, keyframes: KeyframeImage[], input: EvidenceInput): string {
  if (keyframes.length === 0) {
    return input.thumbnailPath ?? input.videoPath;
  }
  // Frames sit at scene changes, not on a fixed interval, so pick the frame
  // closest in time to the finding.
  let nearest = keyframes[0] as KeyframeImage;
  for (const frame of keyframes) {
    if (Math.abs(frame.atSec - atSec) < Math.abs(nearest.atSec - atSec)) {
      nearest = frame;
    }
  }
  return nearest.path;
}

async function localizeKeyframes(
  findings: KeyframeFinding[],
  keyframes: KeyframeImage[],
  input: EvidenceInput,
  meta: MetaClient,
): Promise<KeyframeFinding[]> {
  const settled = await Promise.all(
    findings.map(async (finding): Promise<KeyframeFinding[]> => {
      if (!LOCALIZABLE_KINDS.has(finding.kind)) {
        return [finding];
      }
      const imagePath = pickKeyframeImage(finding.at_sec, keyframes, input);
      try {
        const localized = await meta.localizeKeyframe(imagePath, finding.kind);
        const valid = validKeyframes(Array.isArray(localized) ? localized : []);
        return valid.length > 0 ? valid : [finding];
      } catch {
        return [finding];
      }
    }),
  );
  return settled.flat();
}

export async function buildEvidenceBundle(input: EvidenceInput, meta: MetaClient): Promise<EvidenceBundle> {
  const durationSec = await probeDuration(input.videoPath);
  validateDuration(durationSec);

  const tempDir = await mkdtemp(join(tmpdir(), "cekdulu-evidence-"));
  try {
    const [audioPath, keyframes] = await Promise.all([
      extractAudio(input.videoPath, tempDir),
      extractKeyframes(input.videoPath, tempDir),
    ]);

    const imagePaths: string[] = [
      ...keyframes.map((frame) => frame.path),
      ...(input.thumbnailPath ? [input.thumbnailPath] : []),
    ];
    const frameTimesSec: Array<number | null> = [
      ...keyframes.map((frame) => frame.atSec),
      ...(input.thumbnailPath ? [null] : []),
    ];

    const transcriptPromise: Promise<TranscriptSegment[]> =
      audioPath === null ? Promise.resolve([]) : meta.transcribe(audioPath);
    const scenesPromise: Promise<SceneSegment[]> = meta.understandVideo(input.videoPath);
    const imagesPromise: Promise<KeyframeFinding[]> = meta.understandImages(imagePaths, frameTimesSec);

    const [transcriptResult, scenesResult, imagesResult] = await Promise.allSettled([
      transcriptPromise,
      scenesPromise,
      imagesPromise,
    ]);

    const transcript: TranscriptSegment[] =
      transcriptResult.status === "fulfilled" ? validTranscripts(transcriptResult.value) : [];
    const scenes: SceneSegment[] =
      scenesResult.status === "fulfilled" ? validScenes(scenesResult.value) : [];
    const rawKeyframes: KeyframeFinding[] =
      imagesResult.status === "fulfilled" ? validKeyframes(imagesResult.value) : [];

    const thumbnailFinding =
      !input.thumbnailPath || imagesResult.status !== "fulfilled" || rawKeyframes.length === 0
        ? ""
        : (rawKeyframes[rawKeyframes.length - 1]?.description ?? "");

    const keyframeFindings = await localizeKeyframes(rawKeyframes, keyframes, input, meta);

    return EvidenceBundleSchema.parse({
      duration_sec: durationSec,
      transcript,
      scenes,
      keyframe_findings: keyframeFindings,
      thumbnail_finding: thumbnailFinding,
      title: input.title,
      caption: input.caption,
      extra_context: input.extraContext,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
