import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EvidenceBundle as EvidenceBundleSchema } from "../contracts/schemas";
import type { KeyframeFinding, SceneSegment, TranscriptSegment } from "../contracts/schemas";
import type { MetaClient } from "../meta/client";
import { buildEvidenceBundle, getDemoEvidenceBundle } from "./bundle";
import { extractAudio, extractKeyframes, resolveFfmpegPath, resolveFfprobePath } from "./extract";
import { EvidenceError, probeDuration, validateDuration } from "./validate";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// FAKE MetaClient (plain object implementing the interface, with call log)
// ---------------------------------------------------------------------------

type FakeOverrides = {
  transcript?: TranscriptSegment[];
  scenes?: SceneSegment[];
  keyframes?: KeyframeFinding[];
  rejectBranch?: "transcribe" | "understandVideo" | "understandImages";
  localizeResult?: KeyframeFinding[];
  rejectLocalize?: boolean;
};

function createFakeMeta(overrides: FakeOverrides = {}) {
  const callLog: string[] = [];
  const localizeCalls: Array<{ imagePath: string; concept: string }> = [];
  const understandImagesArgs: string[][] = [];

  const defaultTranscript: TranscriptSegment[] = [
    { start_sec: 0, end_sec: 2, text: "Halo, ini contoh transkrip uji." },
  ];
  const defaultScenes: SceneSegment[] = [
    { start_sec: 0, end_sec: 2, description: "Adegan pembuka di dalam ruangan." },
  ];
  const defaultKeyframes: KeyframeFinding[] = [
    {
      at_sec: 1,
      kind: "license_plate",
      description: "Plat nomor terlihat pada keyframe.",
      box: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 },
    },
  ];

  const fake: MetaClient = {
    async transcribe(_audioPath: string) {
      callLog.push("transcribe");
      if (overrides.rejectBranch === "transcribe") throw new Error("transcribe gagal (fake)");
      return overrides.transcript ?? defaultTranscript;
    },
    async understandVideo(_videoPath: string) {
      callLog.push("understandVideo");
      if (overrides.rejectBranch === "understandVideo") throw new Error("video gagal (fake)");
      return overrides.scenes ?? defaultScenes;
    },
    async understandImages(imagePaths: string[]) {
      callLog.push("understandImages");
      understandImagesArgs.push([...imagePaths]);
      if (overrides.rejectBranch === "understandImages") throw new Error("images gagal (fake)");
      return overrides.keyframes ?? defaultKeyframes;
    },
    async localizeKeyframe(imagePath: string, concept: string) {
      callLog.push("localizeKeyframe");
      localizeCalls.push({ imagePath, concept });
      if (overrides.rejectLocalize) throw new Error("sam gagal (fake)");
      if (overrides.localizeResult) return overrides.localizeResult;
      return [
        {
          at_sec: 1,
          kind: (concept as KeyframeFinding["kind"]) ?? "license_plate",
          description: `Lokalisasi SAM untuk ${concept}`,
          box: { x: 0.11, y: 0.21, w: 0.31, h: 0.11 },
        } as KeyframeFinding,
      ];
    },
    async reasonJson() {
      callLog.push("reasonJson");
      return { risk_level: "rendah", findings: [] };
    },
  };

  return { fake, callLog, localizeCalls, understandImagesArgs };
}

// ---------------------------------------------------------------------------
// Real test-video fixture (generated with the resolved ffmpeg binary)
// ---------------------------------------------------------------------------

let testDir = "";
let testVideoPath = "";
let testVideoReady = false;
let testVideoSkipReason = "";

async function tryGenerateTestVideo(): Promise<void> {
  testDir = join(tmpdir(), `cekdulu-evidence-test-${process.pid}-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
  testVideoPath = join(testDir, "video.mp4");

  const ffmpeg = resolveFfmpegPath();
  const attempts: string[][] = [
    [
      "-y",
      "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=10",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
      "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
      testVideoPath,
    ],
    [
      "-y",
      "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=10",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
      "-shortest", "-c:v", "mpeg4", "-pix_fmt", "yuv420p", "-c:a", "aac",
      testVideoPath,
    ],
  ];

  let lastError = "";
  for (const args of attempts) {
    try {
      await execFileAsync(ffmpeg, args, { timeout: 60_000, windowsHide: true });
      if (existsSync(testVideoPath)) {
        testVideoReady = true;
        return;
      }
      lastError = "output video tidak terbentuk";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  testVideoSkipReason = `ffmpeg tidak dapat membuat video uji (binary="${ffmpeg}"): ${lastError}`;
}

beforeAll(async () => {
  try {
    await tryGenerateTestVideo();
  } catch (err) {
    testVideoSkipReason = `gagal menyiapkan video uji: ${err instanceof Error ? err.message : String(err)}`;
    testVideoReady = false;
  }
  if (!testVideoReady) {
    // Alasan eksplisit, tidak pernah lolos diam-diam.
    console.warn(`[evidence-test] SKIP real-media: ${testVideoSkipReason}`);
  }
}, 120_000);

afterAll(async () => {
  if (testDir) {
    await rm(testDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

// ---------------------------------------------------------------------------
// validateDuration + EvidenceError
// ---------------------------------------------------------------------------

describe("validateDuration", () => {
  it("validateDuration(181) throws too_long", () => {
    try {
      validateDuration(181);
      expect.unreachable("seharusnya melempar");
    } catch (err) {
      expect(err).toBeInstanceOf(EvidenceError);
      expect((err as EvidenceError).code).toBe("too_long");
    }
  });

  it("validateDuration(180) passes", () => {
    expect(() => validateDuration(180)).not.toThrow();
  });

  it("validateDuration(0) throws unreadable", () => {
    try {
      validateDuration(0);
      expect.unreachable("seharusnya melempar");
    } catch (err) {
      expect(err).toBeInstanceOf(EvidenceError);
      expect((err as EvidenceError).code).toBe("unreadable");
    }
  });

  it("validateDuration dengan nilai negatif atau NaN throws unreadable", () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      try {
        validateDuration(bad);
        expect.unreachable(`seharusnya melempar untuk ${bad}`);
      } catch (err) {
        expect(err).toBeInstanceOf(EvidenceError);
        expect((err as EvidenceError).code).toBe("unreadable");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Demo bundle
// ---------------------------------------------------------------------------

describe("getDemoEvidenceBundle", () => {
  it("demo bundle parses dan setiap segmen punya timestamp", () => {
    const demo = getDemoEvidenceBundle();
    const parsed = EvidenceBundleSchema.parse(demo);
    expect(parsed.duration_sec).toBeGreaterThan(0);
    for (const seg of parsed.transcript) {
      expect(typeof seg.start_sec).toBe("number");
      expect(typeof seg.end_sec).toBe("number");
      expect(seg.end_sec).toBeGreaterThanOrEqual(seg.start_sec);
      expect(seg.text.length).toBeGreaterThan(0);
    }
    for (const seg of parsed.scenes) {
      expect(typeof seg.start_sec).toBe("number");
      expect(typeof seg.end_sec).toBe("number");
      expect(seg.end_sec).toBeGreaterThanOrEqual(seg.start_sec);
    }
    for (const kf of parsed.keyframe_findings) {
      expect(typeof kf.at_sec).toBe("number");
      expect(kf.at_sec).toBeGreaterThanOrEqual(0);
    }
    // Demo harus canned: dua panggilan memberi isi setara tanpa Meta/ffmpeg.
    const again = getDemoEvidenceBundle();
    expect(again).toEqual(parsed);
  });
});

// ---------------------------------------------------------------------------
// buildEvidenceBundle dengan FAKE MetaClient
// ---------------------------------------------------------------------------

describe("buildEvidenceBundle (fake MetaClient)", () => {
  it("silent-video fake (transkrip kosong) tetap mengembalikan bundle", async (ctx) => {
    if (!testVideoReady) ctx.skip(`video uji tidak tersedia: ${testVideoSkipReason}`);
    const { fake } = createFakeMeta({ transcript: [] });
    const bundle = await buildEvidenceBundle(
      { videoPath: testVideoPath, thumbnailPath: null, title: "Judul uji", caption: "Caption uji", extraContext: "" },
      fake,
    );
    const parsed = EvidenceBundleSchema.parse(bundle);
    expect(parsed.transcript).toEqual([]);
    expect(parsed.title).toBe("Judul uji");
    expect(parsed.caption).toBe("Caption uji");
    expect(parsed.duration_sec).toBeGreaterThan(0);
  });

  it("satu cabang Tahap 1 yang menolak tetap mengembalikan bundle dengan cabang itu kosong", async (ctx) => {
    if (!testVideoReady) ctx.skip(`video uji tidak tersedia: ${testVideoSkipReason}`);

    // understandVideo menolak -> scenes kosong, cabang lain utuh
    const videoFail = createFakeMeta({ rejectBranch: "understandVideo" });
    const b1 = await buildEvidenceBundle(
      { videoPath: testVideoPath, thumbnailPath: null, title: "T", caption: "C", extraContext: "" },
      videoFail.fake,
    );
    expect(EvidenceBundleSchema.parse(b1).scenes).toEqual([]);
    expect(b1.transcript.length).toBeGreaterThan(0);

    // transcribe menolak -> transcript kosong
    const txFail = createFakeMeta({ rejectBranch: "transcribe" });
    const b2 = await buildEvidenceBundle(
      { videoPath: testVideoPath, thumbnailPath: null, title: "T", caption: "C", extraContext: "" },
      txFail.fake,
    );
    expect(EvidenceBundleSchema.parse(b2).transcript).toEqual([]);
    expect(b2.scenes.length).toBeGreaterThan(0);

    // understandImages menolak -> keyframe_findings kosong dan thumbnail_finding kosong
    const imgFail = createFakeMeta({ rejectBranch: "understandImages" });
    const b3 = await buildEvidenceBundle(
      { videoPath: testVideoPath, thumbnailPath: join(testDir, "thumb.jpg"), title: "T", caption: "C", extraContext: "" },
      imgFail.fake,
    );
    const p3 = EvidenceBundleSchema.parse(b3);
    expect(p3.keyframe_findings).toEqual([]);
    expect(p3.thumbnail_finding).toBe("");
  });

  it("SAM hanya dipanggil untuk kind yang dapat dilokalisasi", async (ctx) => {
    if (!testVideoReady) ctx.skip(`video uji tidak tersedia: ${testVideoSkipReason}`);
    const keyframes: KeyframeFinding[] = [
      { at_sec: 0, kind: "logo", description: "Logo merek terlihat." },
      { at_sec: 1, kind: "other", description: "Objek lain tidak dilokalisasi." },
      { at_sec: 1, kind: "license_plate", description: "Plat nomor terlihat." },
      { at_sec: 2, kind: "watermark", description: "Watermark platform lain." },
    ];
    const { fake, localizeCalls } = createFakeMeta({ keyframes });
    const bundle = await buildEvidenceBundle(
      { videoPath: testVideoPath, thumbnailPath: null, title: "T", caption: "C", extraContext: "" },
      fake,
    );
    EvidenceBundleSchema.parse(bundle);
    const concepts = localizeCalls.map((c) => c.concept).sort();
    expect(concepts).toEqual(["license_plate", "logo", "watermark"]);
    expect(localizeCalls.some((c) => c.concept === "other")).toBe(false);
    // Kind non-localizable tetap dipertahankan apa adanya.
    expect(bundle.keyframe_findings.some((f) => f.kind === "other")).toBe(true);
  });

  it("SAM yang menolak tidak menggagalkan bundle (temuan asli dipertahankan)", async (ctx) => {
    if (!testVideoReady) ctx.skip(`video uji tidak tersedia: ${testVideoSkipReason}`);
    const { fake } = createFakeMeta({ rejectLocalize: true });
    const bundle = await buildEvidenceBundle(
      { videoPath: testVideoPath, thumbnailPath: null, title: "T", caption: "C", extraContext: "" },
      fake,
    );
    const parsed = EvidenceBundleSchema.parse(bundle);
    expect(parsed.keyframe_findings.length).toBeGreaterThan(0);
    expect(parsed.keyframe_findings[0]?.description).toContain("Plat nomor");
  });

  it("file tidak terbaca ditolak sebelum panggilan Meta apa pun", async () => {
    const { fake, callLog } = createFakeMeta();
    const missing = join(testDir || tmpdir(), "tidak-ada-video-xyz.mp4");
    await expect(
      buildEvidenceBundle(
        { videoPath: missing, thumbnailPath: null, title: "T", caption: "C", extraContext: "" },
        fake,
      ),
    ).rejects.toMatchObject({ code: "unreadable" });
    expect(callLog).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Binary resolution + error mapping
// ---------------------------------------------------------------------------

describe("binary resolution dan pemetaan error", () => {
  it("resolve mengembalikan string non-kosong untuk ffmpeg dan ffprobe", () => {
    expect(typeof resolveFfmpegPath()).toBe("string");
    expect(resolveFfmpegPath().length).toBeGreaterThan(0);
    expect(typeof resolveFfprobePath()).toBe("string");
    expect(resolveFfprobePath().length).toBeGreaterThan(0);
  });

  it("binary ffmpeg yang absen memetakan ke EvidenceError extract_failed, bukan crash", async () => {
    const saved = process.env.FFMPEG_PATH;
    process.env.FFMPEG_PATH = join(tmpdir(), "ffmpeg-tidak-ada-xyz.exe");
    try {
      await expect(extractAudio(testVideoPath || "video.mp4", testDir || tmpdir())).rejects.toMatchObject({
        code: "extract_failed",
      });
      await expect(extractKeyframes(testVideoPath || "video.mp4", testDir || tmpdir())).rejects.toMatchObject({
        code: "extract_failed",
      });
    } finally {
      if (saved === undefined) delete process.env.FFMPEG_PATH;
      else process.env.FFMPEG_PATH = saved;
    }
  });

  it("probe ffprobe yang absen memetakan ke EvidenceError unreadable", async () => {
    const saved = process.env.FFPROBE_PATH;
    process.env.FFPROBE_PATH = join(tmpdir(), "ffprobe-tidak-ada-xyz.exe");
    try {
      await expect(probeDuration(testVideoPath || "video.mp4")).rejects.toMatchObject({ code: "unreadable" });
    } finally {
      if (saved === undefined) delete process.env.FFPROBE_PATH;
      else process.env.FFPROBE_PATH = saved;
    }
  });
});

// ---------------------------------------------------------------------------
// Real-media proof (hanya bila binary ffmpeg ter-resolve)
// ---------------------------------------------------------------------------

describe("real-media proof", () => {
  it("probe + ekstraksi pada video uji 2 detik menghasilkan output teramati", async (ctx) => {
    if (!testVideoReady) {
      ctx.skip(`SKIP real-media: tidak ada binary ffmpeg yang ter-resolve / video uji gagal dibuat. Alasan: ${testVideoSkipReason}`);
    }
    const duration = await probeDuration(testVideoPath);
    console.info(`[evidence-test] real-media probe duration_sec=${duration} video=${testVideoPath}`);
    expect(duration).toBeGreaterThan(1.5);
    expect(duration).toBeLessThan(2.5);
    expect(() => validateDuration(duration)).not.toThrow();

    const audioPath = await extractAudio(testVideoPath, testDir);
    console.info(`[evidence-test] real-media audio=${String(audioPath)}`);
    if (audioPath !== null) {
      expect(existsSync(audioPath)).toBe(true);
    }

    const frames = await extractKeyframes(testVideoPath, testDir);
    console.info(`[evidence-test] real-media keyframes=${frames.join(",")}`);
    expect(frames.length).toBeGreaterThanOrEqual(1);
    for (const f of frames) expect(existsSync(f)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FIX-1 regression: video lebih pendek dari interval sampling keyframe (3 detik)
// ---------------------------------------------------------------------------

describe("FIX-1 regression: video 1 detik", () => {
  let shortDir = "";
  let shortVideoPath = "";
  let shortVideoReady = false;
  let shortSkipReason = "";

  beforeAll(async () => {
    shortDir = join(tmpdir(), `cekdulu-evidence-fix1-${process.pid}-${Date.now()}`);
    await mkdir(shortDir, { recursive: true });
    shortVideoPath = join(shortDir, "video-1s.mp4");

    const ffmpeg = resolveFfmpegPath();
    const attempts: string[][] = [
      [
        "-y",
        "-f", "lavfi", "-i", "testsrc=duration=1:size=320x240:rate=10",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
        "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
        shortVideoPath,
      ],
      [
        "-y",
        "-f", "lavfi", "-i", "testsrc=duration=1:size=320x240:rate=10",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
        "-shortest", "-c:v", "mpeg4", "-pix_fmt", "yuv420p", "-c:a", "aac",
        shortVideoPath,
      ],
    ];

    let lastError = "";
    for (const args of attempts) {
      try {
        await execFileAsync(ffmpeg, args, { timeout: 60_000, windowsHide: true });
        if (existsSync(shortVideoPath)) {
          shortVideoReady = true;
          return;
        }
        lastError = "output video tidak terbentuk";
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    shortSkipReason = `ffmpeg tidak dapat membuat video uji 1 detik (binary="${ffmpeg}"): ${lastError}`;
    console.warn(`[evidence-test] SKIP FIX-1: ${shortSkipReason}`);
  }, 120_000);

  afterAll(async () => {
    if (shortDir) {
      await rm(shortDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it("extractKeyframes pada video 1 detik menghasilkan minimal 1 keyframe", async (ctx) => {
    if (!shortVideoReady) ctx.skip(`video uji 1 detik tidak tersedia: ${shortSkipReason}`);
    const frames = await extractKeyframes(shortVideoPath, join(shortDir, "kf-out"));
    console.info(`[evidence-test] FIX-1 keyframes 1 detik=${frames.join(",")}`);
    expect(frames.length).toBeGreaterThanOrEqual(1);
    for (const f of frames) expect(existsSync(f)).toBe(true);
  }, 60_000);

  it("buildEvidenceBundle pada video 1 detik lengkap dan understandImages menerima keyframe", async (ctx) => {
    if (!shortVideoReady) ctx.skip(`video uji 1 detik tidak tersedia: ${shortSkipReason}`);
    const { fake, understandImagesArgs } = createFakeMeta();
    const bundle = await buildEvidenceBundle(
      { videoPath: shortVideoPath, thumbnailPath: null, title: "T", caption: "C", extraContext: "" },
      fake,
    );
    const parsed = EvidenceBundleSchema.parse(bundle);
    expect(parsed.duration_sec).toBeGreaterThan(0.5);
    expect(parsed.duration_sec).toBeLessThan(1.6);
    expect(understandImagesArgs[0]?.length ?? 0).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
