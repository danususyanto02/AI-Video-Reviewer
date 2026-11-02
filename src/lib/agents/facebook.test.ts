import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AgentResult as AgentResultSchema, RuleFile as RuleFileSchema } from "../contracts/schemas";
import type { EvidenceBundle, RuleFile } from "../contracts/schemas";
import { emptyEvidenceBundle } from "../contracts/fixtures";
import { runFacebookAgent } from "./facebook";
import type { ReasonFn } from "./facebook";

const here = dirname(fileURLToPath(import.meta.url));

function loadFacebookRules(): RuleFile {
  const raw = readFileSync(join(here, "../../../data/rules/facebook.json"), "utf-8");
  return RuleFileSchema.parse(JSON.parse(raw) as unknown);
}

const REUPLOAD_EVIDENCE =
  "Klip pertandingan sepak bola dari siaran pihak ketiga ditayangkan utuh tanpa komentar, reaksi, atau transformasi berarti dari pengunggah.";

const reuploadBundle: EvidenceBundle = {
  duration_sec: 45,
  transcript: [],
  scenes: [
    {
      start_sec: 0,
      end_sec: 45,
      description: REUPLOAD_EVIDENCE,
    },
  ],
  keyframe_findings: [
    {
      at_sec: 15,
      kind: "third_party_clip",
      description: "Potongan siaran pihak ketiga terdeteksi sebagai keyframe tanpa overlay komentar kreator.",
    },
  ],
  thumbnail_finding: "Thumbnail memakai cuplikan adegan pihak ketiga dengan judul huruf besar.",
  title: "GOL TERBAIK FULL MATCH!!!",
  caption: "Tonton sampai habis, link full video di komentar.",
  extra_context: "",
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

const reuploadFinding = {
  start_sec: 0,
  end_sec: 45,
  evidence_type: "visual" as const,
  evidence: REUPLOAD_EVIDENCE,
  category: "spam_clickbait_reupload",
  severity: "sedang" as const,
  impact:
    "Berisiko terkena pembatasan distribusi dan demonetisasi Page karena konten dinilai tidak orisinal tanpa transformasi berarti.",
  fix: "Tambahkan komentar orisinal yang berarti sepanjang video atau ganti klip dengan rekaman sendiri sebelum mengunggah.",
};

describe("runFacebookAgent — unggahan ulang tanpa transformasi", () => {
  it("mengembalikan temuan spam_clickbait_reupload dengan bukti verbatim dan risk_level turunan sedang", async () => {
    const rules = loadFacebookRules();
    const { reason, calls } = createFakeReason({ findings: [reuploadFinding] });

    const result = await runFacebookAgent(reuploadBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("facebook");
    expect(parsed.status).toBe("selesai");
    expect(parsed.error).toBeNull();
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]?.category).toBe("spam_clickbait_reupload");
    expect(parsed.findings[0]?.severity).toBe("sedang");
    expect(parsed.findings[0]?.evidence).toBe(REUPLOAD_EVIDENCE);
    expect(reuploadBundle.scenes[0]?.description).toBe(REUPLOAD_EVIDENCE);
    expect(parsed.findings[0]?.impact.toLowerCase()).toContain("pembatasan distribusi");
    expect(parsed.findings[0]?.impact.toLowerCase()).toContain("berisiko");
    expect(parsed.risk_level).toBe("sedang");
    expect(calls).toHaveLength(1);
  });

  it("menurunkan risk_level dari severity tertinggi, mengabaikan klaim risk_level model", async () => {
    const rules = loadFacebookRules();
    const lowFinding = {
      ...reuploadFinding,
      start_sec: 0,
      end_sec: 0,
      evidence_type: "title" as const,
      evidence: reuploadBundle.title,
      severity: "rendah" as const,
    };
    const fakeLow = createFakeReason({ risk_level: "tinggi", findings: [lowFinding] });
    const lowResult = await runFacebookAgent(reuploadBundle, rules, fakeLow.reason);
    expect(AgentResultSchema.parse(lowResult).risk_level).toBe("rendah");

    const highFinding = { ...reuploadFinding, severity: "tinggi" as const };
    const fakeHigh = createFakeReason({
      findings: [lowFinding, reuploadFinding, highFinding],
    });
    const highResult = await runFacebookAgent(reuploadBundle, rules, fakeHigh.reason);
    const parsedHigh = AgentResultSchema.parse(highResult);
    expect(parsedHigh.status).toBe("selesai");
    expect(parsedHigh.risk_level).toBe("tinggi");
    expect(parsedHigh.findings).toHaveLength(3);
  });
});

describe("runFacebookAgent — paket bukti kosong", () => {
  it("emptyEvidenceBundle tanpa temuan dari model selesai rendah tanpa temuan karangan", async () => {
    const rules = loadFacebookRules();
    const { reason, calls } = createFakeReason({ findings: [] });

    const result = await runFacebookAgent(emptyEvidenceBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("facebook");
    expect(parsed.status).toBe("selesai");
    expect(parsed.risk_level).toBe("rendah");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeNull();
    expect(calls).toHaveLength(1);
  });
});

describe("runFacebookAgent — keluaran tidak valid menjadi gagal", () => {
  it("severity di luar kosakata (parah) menjadi gagal tanpa temuan", async () => {
    const rules = loadFacebookRules();
    const invalid: unknown = {
      findings: [{ ...reuploadFinding, severity: "parah" }],
    };
    const { reason, calls } = createFakeReason(invalid);

    const result = await runFacebookAgent(reuploadBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("facebook");
    expect(parsed.status).toBe("gagal");
    expect(parsed.risk_level).toBe("rendah");
    expect(parsed.findings).toEqual([]);
    expect(typeof parsed.error).toBe("string");
    expect((parsed.error ?? "").length).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
  });

  it("finding dengan evidence kosong menjadi gagal tanpa temuan", async () => {
    const rules = loadFacebookRules();
    const invalid: unknown = {
      findings: [{ ...reuploadFinding, evidence: "" }],
    };
    const { reason } = createFakeReason(invalid);

    const result = await runFacebookAgent(reuploadBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.status).toBe("gagal");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
  });

  it("finding dengan rentang waktu terbalik menjadi gagal tanpa temuan", async () => {
    const rules = loadFacebookRules();
    const invalid: unknown = {
      findings: [{ ...reuploadFinding, start_sec: 45, end_sec: 0 }],
    };
    const { reason } = createFakeReason(invalid);

    const result = await runFacebookAgent(reuploadBundle, rules, reason);

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
    const rules = loadFacebookRules();
    const { reason } = createFakeReason(output as unknown);

    const result = await runFacebookAgent(reuploadBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("facebook");
    expect(parsed.status).toBe("gagal");
    expect(parsed.risk_level).toBe("rendah");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
  });

  it("reason yang melempar error menjadi gagal, dipanggil tepat satu kali", async () => {
    const rules = loadFacebookRules();
    const { reason, calls } = createThrowingReason(new Error("reasoning meledak (fake)"));

    const result = await runFacebookAgent(reuploadBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.status).toBe("gagal");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
    expect(calls).toHaveLength(1);
  });
});

describe("runFacebookAgent — prompt hanya memuat irisan Facebook", () => {
  it("payload reason memuat id aturan facebook dan tidak memuat konten youtube/tiktok", async () => {
    const rules = loadFacebookRules();
    const { reason, calls } = createFakeReason({ findings: [] });

    await runFacebookAgent(reuploadBundle, rules, reason);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("reason tidak dipanggil");
    const payloadText = JSON.stringify(call.userPayload);
    const combined = `${call.systemPrompt}\n${payloadText}`;

    for (const rule of rules.rules) {
      expect(payloadText).toContain(rule.id);
    }
    expect(call.systemPrompt).toContain("facebook-spam-clickbait-reupload");
    expect(combined.toLowerCase()).not.toContain("youtube-");
    expect(combined.toLowerCase()).not.toContain("tiktok-");
    const payloadObj = call.userPayload as { bundle?: unknown; rules?: unknown };
    expect(payloadObj.bundle).toEqual(reuploadBundle);
    expect(payloadObj.rules).toEqual(rules);
  });
});
