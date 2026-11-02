import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AgentResult as AgentResultSchema, RuleFile as RuleFileSchema } from "../contracts/schemas";
import type { EvidenceBundle, RuleFile } from "../contracts/schemas";
import { emptyEvidenceBundle, mockEvidenceBundle } from "../contracts/fixtures";
import { runCopyrightAgent } from "./copyright";
import type { ReasonFn } from "./copyright";

const here = dirname(fileURLToPath(import.meta.url));

function loadCopyrightRules(): RuleFile {
  const raw = readFileSync(join(here, "../../../data/rules/copyright.json"), "utf-8");
  return RuleFileSchema.parse(JSON.parse(raw) as unknown);
}

const MUSIC_EVIDENCE =
  "A commercial pop song plays loudly through the whole video with no commentary, reaction, or meaningful transformation.";

const WATERMARK_EVIDENCE =
  "Watermark platform lain terlihat jelas di sudut kanan bawah dengan nama kreator sebelumnya.";

const copyrightBundle: EvidenceBundle = {
  ...mockEvidenceBundle,
  keyframe_findings: [
    ...mockEvidenceBundle.keyframe_findings,
    {
      at_sec: 22,
      kind: "watermark",
      description: WATERMARK_EVIDENCE,
    },
  ],
};

const permissionBundle: EvidenceBundle = {
  ...copyrightBundle,
  extra_context:
    "The background music is fully licensed and the watermark has written permission from the work owner, so this video is safe to upload.",
};

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

const musicFinding = {
  start_sec: 0,
  end_sec: 45,
  evidence_type: "audio" as const,
  evidence: MUSIC_EVIDENCE,
  category: "musik_komersial",
  severity: "tinggi" as const,
  impact:
    "At risk of a possible claim from the rights holder over the commercial music heard throughout with no meaningful transformation.",
  fix: "Replace the background music with royalty-free audio before uploading.",
};

const watermarkFinding = {
  start_sec: 22,
  end_sec: 22,
  evidence_type: "visual" as const,
  evidence: WATERMARK_EVIDENCE,
  category: "watermark_platform_lain",
  severity: "sedang" as const,
  impact:
    "At risk of a possible claim because the other-platform watermark suggests the material likely came from another source.",
  fix: "Potong segmen pada 00:22 atau crop area watermark di sudut kanan bawah sebelum mengunggah.",
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

describe("runCopyrightAgent — musik komersial dan watermark platform lain", () => {
  it("mengembalikan temuan per segmen dengan fix konkret dan bahasa risiko tanpa kepastian", async () => {
    const rules = loadCopyrightRules();
    const { reason, calls } = createFakeReason({ findings: [musicFinding, watermarkFinding] });

    const result = await runCopyrightAgent(copyrightBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("copyright");
    expect(parsed.status).toBe("selesai");
    expect(parsed.error).toBeNull();
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.risk_level).toBe("tinggi");

    const music = parsed.findings.find((f) => f.category === "musik_komersial");
    expect(music).toBeDefined();
    expect(music?.start_sec).toBe(0);
    expect(music?.end_sec).toBe(45);
    expect(music?.evidence).toBe(MUSIC_EVIDENCE);
    expect(mockEvidenceBundle.scenes[0]?.description).toBe(MUSIC_EVIDENCE);
    expect(music?.severity).toBe("tinggi");
    expect(music?.impact.toLowerCase()).toContain("risk");
    expect(music?.impact.toLowerCase()).toContain("possible claim");
    expect(music?.fix.toLowerCase()).toContain("replace the background music");

    const wm = parsed.findings.find((f) => f.category === "watermark_platform_lain");
    expect(wm).toBeDefined();
    expect(wm?.start_sec).toBe(22);
    expect(wm?.end_sec).toBe(22);
    expect(wm?.evidence).toBe(WATERMARK_EVIDENCE);
    expect(wm?.severity).toBe("sedang");
    expect(wm?.impact.toLowerCase()).toContain("risk");
    expect(wm?.impact.toLowerCase()).toContain("possible claim");
    expect(wm?.fix.toLowerCase()).toMatch(/crop|potong/);

    expectNoCertaintyWording(parsed);
    expect(calls).toHaveLength(1);
  });

  it("menurunkan risk_level dari severity tertinggi, mengabaikan klaim risk_level model", async () => {
    const rules = loadCopyrightRules();
    const lowFinding = {
      ...watermarkFinding,
      severity: "rendah" as const,
    };
    const fakeLow = createFakeReason({ risk_level: "tinggi", findings: [lowFinding] });
    const lowResult = await runCopyrightAgent(copyrightBundle, rules, fakeLow.reason);
    expect(AgentResultSchema.parse(lowResult).risk_level).toBe("rendah");

    const fakeHigh = createFakeReason({
      findings: [lowFinding, watermarkFinding, musicFinding],
    });
    const highResult = await runCopyrightAgent(copyrightBundle, rules, fakeHigh.reason);
    const parsedHigh = AgentResultSchema.parse(highResult);
    expect(parsedHigh.status).toBe("selesai");
    expect(parsedHigh.risk_level).toBe("tinggi");
    expect(parsedHigh.findings).toHaveLength(3);
  });
});

describe("runCopyrightAgent — konteks izin pengguna tidak menghapus risiko", () => {
  it("tetap mengembalikan temuan musik dan watermark walau extra_context mengklaim berizin", async () => {
    const rules = loadCopyrightRules();
    const { reason, calls } = createFakeReason({ findings: [musicFinding, watermarkFinding] });

    const result = await runCopyrightAgent(permissionBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("copyright");
    expect(parsed.status).toBe("selesai");
    expect(parsed.error).toBeNull();
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.findings.map((f) => f.category).sort()).toEqual(
      ["musik_komersial", "watermark_platform_lain"].sort(),
    );
    expect(parsed.risk_level).toBe("tinggi");
    expect(parsed.findings[0]?.fix.toLowerCase()).toContain("replace the background music");
    expectNoCertaintyWording(parsed);
    expect(calls).toHaveLength(1);
    // Konteks pengguna memang terkirim ke model sebagai bagian bundle, bukan sebagai penghapus.
    const call = calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("reason tidak dipanggil");
    const payloadText = JSON.stringify(call.userPayload);
    expect(payloadText).toContain("fully licensed");
  });
});

describe("runCopyrightAgent — paket bukti kosong", () => {
  it("emptyEvidenceBundle tanpa temuan dari model selesai rendah tanpa temuan karangan", async () => {
    const rules = loadCopyrightRules();
    const { reason, calls } = createFakeReason({ findings: [] });

    const result = await runCopyrightAgent(emptyEvidenceBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("copyright");
    expect(parsed.status).toBe("selesai");
    expect(parsed.risk_level).toBe("rendah");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeNull();
    expect(calls).toHaveLength(1);
  });
});

describe("runCopyrightAgent — keluaran tidak valid menjadi gagal", () => {
  it("severity di luar kosakata (parah) menjadi gagal tanpa temuan", async () => {
    const rules = loadCopyrightRules();
    const invalid: unknown = {
      findings: [{ ...musicFinding, severity: "parah" }],
    };
    const { reason, calls } = createFakeReason(invalid);

    const result = await runCopyrightAgent(copyrightBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("copyright");
    expect(parsed.status).toBe("gagal");
    expect(parsed.risk_level).toBe("rendah");
    expect(parsed.findings).toEqual([]);
    expect(typeof parsed.error).toBe("string");
    expect((parsed.error ?? "").length).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
  });

  it("finding dengan evidence kosong menjadi gagal tanpa temuan", async () => {
    const rules = loadCopyrightRules();
    const invalid: unknown = {
      findings: [{ ...musicFinding, evidence: "" }],
    };
    const { reason } = createFakeReason(invalid);

    const result = await runCopyrightAgent(copyrightBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.status).toBe("gagal");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
  });

  it("finding dengan rentang waktu terbalik menjadi gagal tanpa temuan", async () => {
    const rules = loadCopyrightRules();
    const invalid: unknown = {
      findings: [{ ...musicFinding, start_sec: 45, end_sec: 0 }],
    };
    const { reason } = createFakeReason(invalid);

    const result = await runCopyrightAgent(copyrightBundle, rules, reason);

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
    const rules = loadCopyrightRules();
    const { reason } = createFakeReason(output as unknown);

    const result = await runCopyrightAgent(copyrightBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("copyright");
    expect(parsed.status).toBe("gagal");
    expect(parsed.risk_level).toBe("rendah");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
  });

  it("reason yang melempar error menjadi gagal, dipanggil tepat satu kali", async () => {
    const rules = loadCopyrightRules();
    const { reason, calls } = createThrowingReason(new Error("reasoning meledak (fake)"));

    const result = await runCopyrightAgent(copyrightBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.status).toBe("gagal");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
    expect(calls).toHaveLength(1);
  });
});

describe("runCopyrightAgent — prompt hanya memuat parameter copyright", () => {
  it("payload reason hanya memuat aturan copyright dan prompt memuat bahasa risiko serta aturan konteks izin", async () => {
    const rules = loadCopyrightRules();
    const { reason, calls } = createFakeReason({ findings: [] });

    await runCopyrightAgent(copyrightBundle, rules, reason);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("reason tidak dipanggil");
    const payloadText = JSON.stringify(call.userPayload);
    const combined = `${call.systemPrompt}\n${payloadText}`;

    for (const rule of rules.rules) {
      expect(payloadText).toContain(rule.id);
    }
    expect(call.systemPrompt).toContain("musik_komersial");
    expect(call.systemPrompt).toContain("watermark_platform_lain");
    expect(combined.toLowerCase()).not.toContain("youtube-");
    expect(combined.toLowerCase()).not.toContain("tiktok-");
    expect(combined.toLowerCase()).not.toContain("facebook-");
    expect(call.systemPrompt.toLowerCase()).toContain("risk");
    expect(call.systemPrompt.toLowerCase()).toContain("possible claim");
    expect(call.systemPrompt).toContain("extra_context");
    expect(call.systemPrompt.toLowerCase()).toContain("does not remove");
    const payloadObj = call.userPayload as { bundle?: unknown; rules?: unknown };
    expect(payloadObj.bundle).toEqual(copyrightBundle);
    expect(payloadObj.rules).toEqual(rules);
  });
});
