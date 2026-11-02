import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AgentResult as AgentResultSchema, RuleFile as RuleFileSchema } from "../contracts/schemas";
import type { RuleFile } from "../contracts/schemas";
import { emptyEvidenceBundle, mockEvidenceBundle } from "../contracts/fixtures";
import { runTiktokAgent } from "./tiktok";
import type { ReasonFn } from "./tiktok";

const here = dirname(fileURLToPath(import.meta.url));

function loadTiktokRules(): RuleFile {
  const raw = readFileSync(join(here, "../../../data/rules/tiktok.json"), "utf-8");
  return RuleFileSchema.parse(JSON.parse(raw) as unknown);
}

const GAMBLING_QUOTE =
  "Sign up now at a trusted toto site, pulsa deposit with no fees, 100 percent new member bonus!";

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

const gamblingFinding = {
  start_sec: 5,
  end_sec: 12,
  evidence_type: "audio" as const,
  evidence: GAMBLING_QUOTE,
  category: "judi",
  severity: "tinggi" as const,
  impact:
    "At risk of making the video ineligible for For You recommendation and at risk of removal, sharply narrowing reach to new viewers.",
  fix: "Potong segmen promosi judi pada 00:05-00:12 dan hapus ajakan pendaftaran serta bonus dari audio dan teks layar.",
};

describe("runTiktokAgent — promosi judi tersamar", () => {
  it("mengembalikan temuan judi dari mockEvidenceBundle dengan bukti verbatim dan risk_level turunan tinggi", async () => {
    const rules = loadTiktokRules();
    const { reason, calls } = createFakeReason({ findings: [gamblingFinding] });

    const result = await runTiktokAgent(mockEvidenceBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("tiktok");
    expect(parsed.status).toBe("selesai");
    expect(parsed.error).toBeNull();
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]?.category).toBe("judi");
    expect(parsed.findings[0]?.severity).toBe("tinggi");
    expect(parsed.findings[0]?.evidence).toBe(GAMBLING_QUOTE);
    expect(mockEvidenceBundle.transcript[0]?.text).toBe(GAMBLING_QUOTE);
    expect(parsed.findings[0]?.impact.toLowerCase()).toContain("ineligible for for you");
    expect(parsed.findings[0]?.impact.toLowerCase()).toContain("for you");
    expect(parsed.findings[0]?.impact.toLowerCase()).toContain("risk");
    expect(parsed.risk_level).toBe("tinggi");
    expect(calls).toHaveLength(1);
  });

  it("menurunkan risk_level dari severity tertinggi, mengabaikan klaim risk_level model", async () => {
    const rules = loadTiktokRules();
    const lowFinding = {
      ...gamblingFinding,
      start_sec: 0,
      end_sec: 0,
      evidence_type: "caption" as const,
      evidence: mockEvidenceBundle.caption,
      severity: "rendah" as const,
    };
    const fakeLow = createFakeReason({ risk_level: "tinggi", findings: [lowFinding] });
    const lowResult = await runTiktokAgent(mockEvidenceBundle, rules, fakeLow.reason);
    expect(AgentResultSchema.parse(lowResult).risk_level).toBe("rendah");

    const mediumFinding = { ...gamblingFinding, severity: "sedang" as const };
    const fakeHigh = createFakeReason({
      findings: [lowFinding, mediumFinding, gamblingFinding],
    });
    const highResult = await runTiktokAgent(mockEvidenceBundle, rules, fakeHigh.reason);
    const parsedHigh = AgentResultSchema.parse(highResult);
    expect(parsedHigh.status).toBe("selesai");
    expect(parsedHigh.risk_level).toBe("tinggi");
    expect(parsedHigh.findings).toHaveLength(3);
  });
});

describe("runTiktokAgent — paket bukti kosong", () => {
  it("emptyEvidenceBundle tanpa temuan dari model selesai rendah tanpa temuan karangan", async () => {
    const rules = loadTiktokRules();
    const { reason, calls } = createFakeReason({ findings: [] });

    const result = await runTiktokAgent(emptyEvidenceBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("tiktok");
    expect(parsed.status).toBe("selesai");
    expect(parsed.risk_level).toBe("rendah");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeNull();
    expect(calls).toHaveLength(1);
  });
});

describe("runTiktokAgent — keluaran tidak valid menjadi gagal", () => {
  it("severity di luar kosakata (parah) menjadi gagal tanpa temuan", async () => {
    const rules = loadTiktokRules();
    const invalid: unknown = {
      findings: [{ ...gamblingFinding, severity: "parah" }],
    };
    const { reason, calls } = createFakeReason(invalid);

    const result = await runTiktokAgent(mockEvidenceBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("tiktok");
    expect(parsed.status).toBe("gagal");
    expect(parsed.risk_level).toBe("rendah");
    expect(parsed.findings).toEqual([]);
    expect(typeof parsed.error).toBe("string");
    expect((parsed.error ?? "").length).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
  });

  it("finding dengan evidence kosong menjadi gagal tanpa temuan", async () => {
    const rules = loadTiktokRules();
    const invalid: unknown = {
      findings: [{ ...gamblingFinding, evidence: "" }],
    };
    const { reason } = createFakeReason(invalid);

    const result = await runTiktokAgent(mockEvidenceBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.status).toBe("gagal");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
  });

  it("finding dengan rentang waktu terbalik menjadi gagal tanpa temuan", async () => {
    const rules = loadTiktokRules();
    const invalid: unknown = {
      findings: [{ ...gamblingFinding, start_sec: 12, end_sec: 5 }],
    };
    const { reason } = createFakeReason(invalid);

    const result = await runTiktokAgent(mockEvidenceBundle, rules, reason);

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
    const rules = loadTiktokRules();
    const { reason } = createFakeReason(output as unknown);

    const result = await runTiktokAgent(mockEvidenceBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("tiktok");
    expect(parsed.status).toBe("gagal");
    expect(parsed.risk_level).toBe("rendah");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
  });

  it("reason yang melempar error menjadi gagal, dipanggil tepat satu kali", async () => {
    const rules = loadTiktokRules();
    const { reason, calls } = createThrowingReason(new Error("reasoning meledak (fake)"));

    const result = await runTiktokAgent(mockEvidenceBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("tiktok");
    expect(parsed.status).toBe("gagal");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
    expect(calls).toHaveLength(1);
  });
});

describe("runTiktokAgent — prompt hanya memuat irisan TikTok", () => {
  it("payload reason memuat id aturan tiktok dan tidak memuat konten youtube/facebook", async () => {
    const rules = loadTiktokRules();
    const { reason, calls } = createFakeReason({ findings: [] });

    await runTiktokAgent(mockEvidenceBundle, rules, reason);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("reason tidak dipanggil");
    const payloadText = JSON.stringify(call.userPayload);
    const combined = `${call.systemPrompt}\n${payloadText}`;

    for (const rule of rules.rules) {
      expect(payloadText).toContain(rule.id);
    }
    expect(call.systemPrompt).toContain("tiktok-judi");
    expect(combined.toLowerCase()).not.toContain("youtube-");
    expect(combined.toLowerCase()).not.toContain("facebook-");
    const payloadObj = call.userPayload as { bundle?: unknown; rules?: unknown };
    expect(payloadObj.bundle).toEqual(mockEvidenceBundle);
    expect(payloadObj.rules).toEqual(rules);
  });
});
