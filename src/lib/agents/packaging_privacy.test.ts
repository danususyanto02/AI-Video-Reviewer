import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AgentResult as AgentResultSchema, RuleFile as RuleFileSchema } from "../contracts/schemas";
import type { RuleFile } from "../contracts/schemas";
import { emptyEvidenceBundle, mockEvidenceBundle } from "../contracts/fixtures";
import { runPackagingPrivacyAgent } from "./packaging_privacy";
import type { ReasonFn } from "./packaging_privacy";

const here = dirname(fileURLToPath(import.meta.url));

function loadPackagingRules(): RuleFile {
  const platformFiles = ["youtube.json", "tiktok.json", "facebook.json"].map((name) => {
    const raw = readFileSync(join(here, "../../../data/rules", name), "utf-8");
    return RuleFileSchema.parse(JSON.parse(raw) as unknown);
  });
  const slice = platformFiles.flatMap((file) =>
    file.rules.filter(
      (rule) => rule.category === "privasi_data_pribadi" || rule.category === "spam_clickbait_reupload",
    ),
  );
  return RuleFileSchema.parse({
    version: "2026-10-30.1",
    updated_at: "2026-10-30",
    source: "Irisan panduan privasi_data_pribadi dan spam_clickbait_reupload dari pedoman YouTube, TikTok, dan Meta Community Standards (olahan orkestrasi)",
    rules: slice,
  });
}

const THUMBNAIL_EVIDENCE = mockEvidenceBundle.thumbnail_finding;
const PLATE_EVIDENCE = "A vehicle license plate is clearly visible with no blur in a street scene.";
const PLATE_AT_SEC = 18;

type ReasonCall = { systemPrompt: string; userPayload: unknown };

function createFakeReason(output: unknown): { reason: ReasonFn; calls: ReasonCall[] } {
  const calls: ReasonCall[] = [];
  const reason: ReasonFn = async (systemPrompt: string, userPayload: unknown) => {
    calls.push({ systemPrompt, userPayload });
    return output;
  };
  return { reason, calls };
}

function createThrowingReason(err: unknown): { reason: ReasonFn; calls: ReasonCall[] } {
  const calls: ReasonCall[] = [];
  const reason: ReasonFn = async (systemPrompt: string, userPayload: unknown) => {
    calls.push({ systemPrompt, userPayload });
    throw err;
  };
  return { reason, calls };
}

const clickbaitFinding = {
  start_sec: 0,
  end_sec: 0,
  evidence_type: "thumbnail" as const,
  evidence: THUMBNAIL_EVIDENCE,
  category: "spam_clickbait_reupload",
  severity: "sedang" as const,
  impact:
    "At risk of being judged a misleading clickbait thumbnail because it promises fast results not proven in the video.",
  fix: "Ganti thumbnail dengan gambar yang sesuai isi video dan hapus teks klaim cepat kaya yang menyesatkan.",
};

const privacyFinding = {
  start_sec: PLATE_AT_SEC,
  end_sec: PLATE_AT_SEC,
  evidence_type: "visual" as const,
  evidence: PLATE_EVIDENCE,
  category: "privasi_data_pribadi",
  severity: "sedang" as const,
  impact:
    "At risk of exposing the vehicle owner personal data to viewers because the plate reads clearly with no cover.",
  fix: "Blur the license plate in the keyframe around 00:18 before uploading.",
};

const BANNED_PHRASES: string[] = [
  ["pasti", "bebas"].join(" "),
  ["pasti", "melanggar"].join(" "),
  ["aman", "secara", "hukum"].join(" "),
];

function expectNoCertaintyWording(result: unknown): void {
  const text = JSON.stringify(result).toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    expect(text).not.toContain(phrase);
  }
}

describe("runPackagingPrivacyAgent — thumbnail clickbait dan plat nomor", () => {
  it("mengembalikan temuan thumbnail 0-0 dan temuan privasi plat dengan fix blur pada at_sec", async () => {
    const rules = loadPackagingRules();
    const { reason, calls } = createFakeReason({ findings: [clickbaitFinding, privacyFinding] });

    const result = await runPackagingPrivacyAgent(mockEvidenceBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("packaging_privacy");
    expect(parsed.status).toBe("selesai");
    expect(parsed.error).toBeNull();
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.risk_level).toBe("sedang");

    const thumb = parsed.findings.find((f) => f.evidence_type === "thumbnail");
    expect(thumb).toBeDefined();
    expect(thumb?.start_sec).toBe(0);
    expect(thumb?.end_sec).toBe(0);
    expect(thumb?.category).toBe("spam_clickbait_reupload");
    expect(thumb?.evidence).toBe(THUMBNAIL_EVIDENCE);
    expect(thumb?.evidence).toBe(mockEvidenceBundle.thumbnail_finding);
    expect(thumb?.severity).toBe("sedang");
    expect(thumb?.impact.toLowerCase()).toContain("at risk");
    expect(thumb?.fix.length).toBeGreaterThan(0);

    const plate = parsed.findings.find((f) => f.category === "privasi_data_pribadi");
    expect(plate).toBeDefined();
    expect(plate?.start_sec).toBe(PLATE_AT_SEC);
    expect(plate?.end_sec).toBe(PLATE_AT_SEC);
    expect(mockEvidenceBundle.keyframe_findings[0]?.at_sec).toBe(PLATE_AT_SEC);
    expect(mockEvidenceBundle.keyframe_findings[0]?.kind).toBe("license_plate");
    expect(plate?.evidence).toBe(PLATE_EVIDENCE);
    expect(plate?.evidence).toBe(mockEvidenceBundle.keyframe_findings[0]?.description);
    expect(plate?.evidence_type).toBe("visual");
    expect(plate?.fix.toLowerCase()).toContain("blur");
    expect(plate?.impact.toLowerCase()).toContain("at risk");

    expectNoCertaintyWording(parsed);
    expect(calls).toHaveLength(1);
  });

  it("menurunkan risk_level dari severity tertinggi, mengabaikan klaim risk_level model", async () => {
    const rules = loadPackagingRules();
    const lowFinding = {
      ...clickbaitFinding,
      evidence: mockEvidenceBundle.title,
      evidence_type: "title" as const,
      severity: "rendah" as const,
    };
    const fakeLow = createFakeReason({ risk_level: "tinggi", findings: [lowFinding] });
    const lowResult = await runPackagingPrivacyAgent(mockEvidenceBundle, rules, fakeLow.reason);
    expect(AgentResultSchema.parse(lowResult).risk_level).toBe("rendah");

    const highFinding = { ...privacyFinding, severity: "tinggi" as const };
    const fakeHigh = createFakeReason({
      findings: [lowFinding, clickbaitFinding, highFinding],
    });
    const highResult = await runPackagingPrivacyAgent(mockEvidenceBundle, rules, fakeHigh.reason);
    const parsedHigh = AgentResultSchema.parse(highResult);
    expect(parsedHigh.status).toBe("selesai");
    expect(parsedHigh.risk_level).toBe("tinggi");
    expect(parsedHigh.findings).toHaveLength(3);
  });
});

describe("runPackagingPrivacyAgent — paket bukti kosong", () => {
  it("emptyEvidenceBundle tanpa temuan dari model selesai rendah tanpa temuan karangan", async () => {
    const rules = loadPackagingRules();
    const { reason, calls } = createFakeReason({ findings: [] });

    const result = await runPackagingPrivacyAgent(emptyEvidenceBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("packaging_privacy");
    expect(parsed.status).toBe("selesai");
    expect(parsed.risk_level).toBe("rendah");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeNull();
    expect(calls).toHaveLength(1);
  });
});

describe("runPackagingPrivacyAgent — keluaran tidak valid menjadi gagal", () => {
  it("severity di luar kosakata (parah) menjadi gagal tanpa temuan", async () => {
    const rules = loadPackagingRules();
    const invalid: unknown = {
      findings: [{ ...clickbaitFinding, severity: "parah" }],
    };
    const { reason, calls } = createFakeReason(invalid);

    const result = await runPackagingPrivacyAgent(mockEvidenceBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("packaging_privacy");
    expect(parsed.status).toBe("gagal");
    expect(parsed.risk_level).toBe("rendah");
    expect(parsed.findings).toEqual([]);
    expect(typeof parsed.error).toBe("string");
    expect((parsed.error ?? "").length).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
  });

  it("finding dengan evidence kosong menjadi gagal tanpa temuan", async () => {
    const rules = loadPackagingRules();
    const invalid: unknown = {
      findings: [{ ...privacyFinding, evidence: "" }],
    };
    const { reason } = createFakeReason(invalid);

    const result = await runPackagingPrivacyAgent(mockEvidenceBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.status).toBe("gagal");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
  });

  it("finding dengan rentang waktu terbalik menjadi gagal tanpa temuan", async () => {
    const rules = loadPackagingRules();
    const invalid: unknown = {
      findings: [{ ...privacyFinding, start_sec: 20, end_sec: 18 }],
    };
    const { reason } = createFakeReason(invalid);

    const result = await runPackagingPrivacyAgent(mockEvidenceBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.status).toBe("gagal");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
  });

  it("finding dengan evidence_type di luar kosakata menjadi gagal tanpa temuan", async () => {
    const rules = loadPackagingRules();
    const invalid: unknown = {
      findings: [{ ...clickbaitFinding, evidence_type: "poster" }],
    };
    const { reason } = createFakeReason(invalid);

    const result = await runPackagingPrivacyAgent(mockEvidenceBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.status).toBe("gagal");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
  });

  it.each([
    ["string polos", "bukan json temuan"],
    ["null", null],
    ["array telanjang", []],
    ["objek tanpa findings", { risk_level: "rendah" }],
    ["findings bukan array", { findings: "tidak ada" }],
  ])("keluaran non-objek temuan (%s) menjadi gagal", async (_label, output) => {
    const rules = loadPackagingRules();
    const { reason } = createFakeReason(output as unknown);

    const result = await runPackagingPrivacyAgent(mockEvidenceBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("packaging_privacy");
    expect(parsed.status).toBe("gagal");
    expect(parsed.risk_level).toBe("rendah");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
  });

  it("reason yang melempar error menjadi gagal, dipanggil tepat satu kali", async () => {
    const rules = loadPackagingRules();
    const { reason, calls } = createThrowingReason(new Error("reasoning meledak (fake)"));

    const result = await runPackagingPrivacyAgent(mockEvidenceBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.status).toBe("gagal");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
    expect(calls).toHaveLength(1);
  });
});

describe("runPackagingPrivacyAgent — prompt hanya memuat irisan kemasan dan privasi", () => {
  it("payload reason hanya memuat irisan aturan yang diteruskan dan prompt berfokus pada kemasan", async () => {
    const rules = loadPackagingRules();
    expect(rules.rules.length).toBe(6);
    expect(rules.rules.every((r) => r.category === "privasi_data_pribadi" || r.category === "spam_clickbait_reupload")).toBe(true);
    const { reason, calls } = createFakeReason({ findings: [] });

    await runPackagingPrivacyAgent(mockEvidenceBundle, rules, reason);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("reason tidak dipanggil");
    const payloadText = JSON.stringify(call.userPayload);
    const combined = `${call.systemPrompt}\n${payloadText}`;

    for (const rule of rules.rules) {
      expect(payloadText).toContain(rule.id);
    }
    expect(call.systemPrompt).toContain("privasi_data_pribadi");
    expect(call.systemPrompt).toContain("spam_clickbait_reupload");
    expect(combined).not.toContain("youtube-judi");
    expect(combined).not.toContain("tiktok-judi");
    expect(combined).not.toContain("facebook-judi");
    expect(combined).not.toContain("youtube-kekerasan");
    expect(combined).not.toContain("tiktok-kekerasan");
    expect(combined).not.toContain("musik_komersial");
    const payloadObj = call.userPayload as { bundle?: unknown; rules?: unknown };
    expect(payloadObj.bundle).toEqual(mockEvidenceBundle);
    expect(payloadObj.rules).toEqual(rules);
  });

  it("prompt membatasi penilaian pada judul, caption, thumbnail, dan keyframe serta menegaskan lokalisasi tetap di pipeline", async () => {
    const rules = loadPackagingRules();
    const { reason, calls } = createFakeReason({ findings: [] });

    await runPackagingPrivacyAgent(mockEvidenceBundle, rules, reason);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("reason tidak dipanggil");
    const promptLower = call.systemPrompt.toLowerCase();
    expect(promptLower).toContain("title");
    expect(promptLower).toContain("caption");
    expect(promptLower).toContain("thumbnail");
    expect(promptLower).toContain("keyframe");
    expect(promptLower).toContain("evidence pipeline");
    expect(promptLower).toContain("localization");
  });
});
