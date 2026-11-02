import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AgentResult as AgentResultSchema,
  DISCLAIMER,
  RuleFile as RuleFileSchema,
} from "../contracts/schemas";
import type { EvidenceBundle, RuleFile } from "../contracts/schemas";
import { emptyEvidenceBundle, mockEvidenceBundle } from "../contracts/fixtures";
import { runLegalAgent } from "./legal_id";
import type { ReasonFn } from "./legal_id";

const here = dirname(fileURLToPath(import.meta.url));

function loadLegalRules(): RuleFile {
  const raw = readFileSync(join(here, "../../../data/rules/legal_id.json"), "utf-8");
  return RuleFileSchema.parse(JSON.parse(raw) as unknown);
}

const GAMBLING_QUOTE =
  "Sign up now at a trusted toto site, pulsa deposit with no fees, 100 percent new member bonus!";

const MEDICINE_QUOTE =
  "Minum ramuan ini sekali saja, dijamin sembuh total dari diabetes dalam 3 hari tanpa perlu obat dokter!";

const legalBundle: EvidenceBundle = {
  ...mockEvidenceBundle,
  transcript: [
    { start_sec: 5, end_sec: 12, text: GAMBLING_QUOTE },
    { start_sec: 13, end_sec: 20, text: MEDICINE_QUOTE },
  ],
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

const medicineFinding = {
  start_sec: 13,
  end_sec: 20,
  evidence_type: "audio" as const,
  evidence: MEDICINE_QUOTE,
  category: "klaim_menyesatkan_produk_investasi",
  severity: "sedang" as const,
  impact:
    "At risk under the misleading product claims and consumer protection theme because of a total-cure promise with no checkable basis.",
  fix: "Hapus janji sembuh total dan ganti dengan klaim sesuai izin produk disertai batasan yang jujur.",
};

const gamblingFinding = {
  start_sec: 5,
  end_sec: 12,
  evidence_type: "audio" as const,
  evidence: GAMBLING_QUOTE,
  category: "judi_online",
  severity: "tinggi" as const,
  impact:
    "At risk under the gambling theme in this Indonesian legal theme screening because of the sign-up invitation and online gambling bonus.",
  fix: "Potong segmen promosi judi pada 00:05-00:12 dan hapus tautan pendaftaran sebelum mengunggah.",
};

const PASAL_PATTERN = /Pasal\s+\d+/i;
const CERTAINTY_CONCLUSION_PATTERN = /melanggar\s+UU/i;

const BANNED_PHRASES: string[] = [
  ["pasti", "bebas"].join(" "),
  ["pasti", "melanggar"].join(" "),
  ["aman", "secara", "hukum"].join(" "),
];

function expectNoPasalAndNoCertainty(result: unknown): void {
  const text = JSON.stringify(result);
  expect(text).not.toMatch(PASAL_PATTERN);
  expect(text).not.toMatch(CERTAINTY_CONCLUSION_PATTERN);
  const lower = text.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    expect(lower).not.toContain(phrase);
  }
}

function expectAgentResultShapeOnly(result: unknown): void {
  expect(result).not.toHaveProperty("disclaimer");
  const keys = Object.keys(result as Record<string, unknown>).sort();
  expect(keys).toEqual(["agent", "error", "findings", "risk_level", "status"]);
  expect(JSON.stringify(result)).not.toContain(DISCLAIMER);
}

describe("runLegalAgent — klaim obat menyesatkan dan promosi judi online", () => {
  it("mengembalikan tema klaim_menyesatkan_produk_investasi dan judi_online dengan bukti, fix, dan risk_level turunan", async () => {
    const rules = loadLegalRules();
    const { reason, calls } = createFakeReason({ findings: [medicineFinding, gamblingFinding] });

    const result = await runLegalAgent(legalBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("legal_id");
    expect(parsed.status).toBe("selesai");
    expect(parsed.error).toBeNull();
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.risk_level).toBe("tinggi");

    const medicine = parsed.findings.find(
      (f) => f.category === "klaim_menyesatkan_produk_investasi",
    );
    expect(medicine).toBeDefined();
    expect(medicine?.start_sec).toBe(13);
    expect(medicine?.end_sec).toBe(20);
    expect(medicine?.evidence).toBe(MEDICINE_QUOTE);
    expect(medicine?.evidence.length).toBeGreaterThan(0);
    expect(medicine?.fix.length).toBeGreaterThan(0);
    expect(medicine?.fix.toLowerCase()).toContain("hapus janji sembuh total");
    expect(medicine?.impact.toLowerCase()).toContain("at risk under the");

    const gambling = parsed.findings.find((f) => f.category === "judi_online");
    expect(gambling).toBeDefined();
    expect(gambling?.start_sec).toBe(5);
    expect(gambling?.end_sec).toBe(12);
    expect(gambling?.evidence).toBe(GAMBLING_QUOTE);
    expect(mockEvidenceBundle.transcript[0]?.text).toBe(GAMBLING_QUOTE);
    expect(gambling?.evidence.length).toBeGreaterThan(0);
    expect(gambling?.fix.length).toBeGreaterThan(0);
    expect(gambling?.fix.toLowerCase()).toContain("potong segmen promosi judi");
    expect(gambling?.impact.toLowerCase()).toContain("at risk under the");

    expectNoPasalAndNoCertainty(parsed);
    expectAgentResultShapeOnly(result);
    expect(calls).toHaveLength(1);
  });

  it("menurunkan risk_level dari severity tertinggi, mengabaikan klaim risk_level model", async () => {
    const rules = loadLegalRules();
    const lowFinding = { ...medicineFinding, severity: "rendah" as const };
    const fakeLow = createFakeReason({ risk_level: "tinggi", findings: [lowFinding] });
    const lowResult = await runLegalAgent(legalBundle, rules, fakeLow.reason);
    expect(AgentResultSchema.parse(lowResult).risk_level).toBe("rendah");

    const fakeHigh = createFakeReason({
      findings: [lowFinding, medicineFinding, gamblingFinding],
    });
    const highResult = await runLegalAgent(legalBundle, rules, fakeHigh.reason);
    const parsedHigh = AgentResultSchema.parse(highResult);
    expect(parsedHigh.status).toBe("selesai");
    expect(parsedHigh.risk_level).toBe("tinggi");
    expect(parsedHigh.findings).toHaveLength(3);
    expectNoPasalAndNoCertainty(parsedHigh);
  });
});

describe("runLegalAgent — paket bukti kosong", () => {
  it("emptyEvidenceBundle tanpa temuan dari model selesai rendah tanpa temuan karangan", async () => {
    const rules = loadLegalRules();
    const { reason, calls } = createFakeReason({ findings: [] });

    const result = await runLegalAgent(emptyEvidenceBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("legal_id");
    expect(parsed.status).toBe("selesai");
    expect(parsed.risk_level).toBe("rendah");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeNull();
    expectAgentResultShapeOnly(result);
    expect(calls).toHaveLength(1);
  });
});

describe("runLegalAgent — keluaran tidak valid menjadi gagal", () => {
  it("severity di luar kosakata (parah) menjadi gagal tanpa temuan", async () => {
    const rules = loadLegalRules();
    const invalid: unknown = {
      findings: [{ ...medicineFinding, severity: "parah" }],
    };
    const { reason, calls } = createFakeReason(invalid);

    const result = await runLegalAgent(legalBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("legal_id");
    expect(parsed.status).toBe("gagal");
    expect(parsed.risk_level).toBe("rendah");
    expect(parsed.findings).toEqual([]);
    expect(typeof parsed.error).toBe("string");
    expect((parsed.error ?? "").length).toBeGreaterThan(0);
    expectAgentResultShapeOnly(result);
    expect(calls).toHaveLength(1);
  });

  it("finding dengan evidence kosong menjadi gagal tanpa temuan", async () => {
    const rules = loadLegalRules();
    const invalid: unknown = {
      findings: [{ ...medicineFinding, evidence: "" }],
    };
    const { reason } = createFakeReason(invalid);

    const result = await runLegalAgent(legalBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.status).toBe("gagal");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
  });

  it("finding dengan rentang waktu terbalik menjadi gagal tanpa temuan", async () => {
    const rules = loadLegalRules();
    const invalid: unknown = {
      findings: [{ ...medicineFinding, start_sec: 20, end_sec: 13 }],
    };
    const { reason } = createFakeReason(invalid);

    const result = await runLegalAgent(legalBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.status).toBe("gagal");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
  });

  it("category di luar tema hukum legal_id menjadi gagal tanpa temuan", async () => {
    const rules = loadLegalRules();
    const invalid: unknown = {
      findings: [{ ...medicineFinding, category: "misinformasi" }],
    };
    const { reason } = createFakeReason(invalid);

    const result = await runLegalAgent(legalBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("legal_id");
    expect(parsed.status).toBe("gagal");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
    expectNoPasalAndNoCertainty(parsed);
  });

  it("finding dengan nomor pasal menjadi gagal tanpa temuan dan tanpa nomor pasal pada hasil", async () => {
    const rules = loadLegalRules();
    const pasalText = ["Pasal", "28"].join(" ");
    const invalid: unknown = {
      findings: [
        {
          ...gamblingFinding,
          impact: `At risk under the gambling theme per ${pasalText} in this screening.`,
        },
      ],
    };
    const { reason } = createFakeReason(invalid);

    const result = await runLegalAgent(legalBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.status).toBe("gagal");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
    expectNoPasalAndNoCertainty(parsed);
  });

  it("finding dengan kesimpulan kepastian hukum menjadi gagal tanpa temuan", async () => {
    const rules = loadLegalRules();
    const conclusion = ["melanggar", "UU", "ITE"].join(" ");
    const invalid: unknown = {
      findings: [
        {
          ...gamblingFinding,
          impact: `Video ini ${conclusion} karena mempromosikan judi online.`,
        },
      ],
    };
    const { reason } = createFakeReason(invalid);

    const result = await runLegalAgent(legalBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.status).toBe("gagal");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
    expectNoPasalAndNoCertainty(parsed);
  });

  it.each([
    ["string polos", "bukan json temuan"],
    ["null", null],
    ["array telanjang", []],
    ["objek tanpa findings", { risk_level: "rendah" }],
    ["findings bukan array", { findings: "tidak ada" }],
  ])("keluaran non-objek temuan (%s) menjadi gagal", async (_label, output) => {
    const rules = loadLegalRules();
    const { reason } = createFakeReason(output as unknown);

    const result = await runLegalAgent(legalBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("legal_id");
    expect(parsed.status).toBe("gagal");
    expect(parsed.risk_level).toBe("rendah");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
  });

  it("reason yang melempar error menjadi gagal, dipanggil tepat satu kali", async () => {
    const rules = loadLegalRules();
    const { reason, calls } = createThrowingReason(new Error("reasoning meledak (fake)"));

    const result = await runLegalAgent(legalBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.status).toBe("gagal");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
    expect(calls).toHaveLength(1);
  });
});

describe("runLegalAgent — prompt hanya memuat tema hukum Indonesia", () => {
  it("payload reason hanya memuat aturan legal dan prompt memuat framing skrining tema tanpa kepastian", async () => {
    const rules = loadLegalRules();
    const { reason, calls } = createFakeReason({ findings: [] });

    await runLegalAgent(legalBundle, rules, reason);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("reason tidak dipanggil");
    const payloadText = JSON.stringify(call.userPayload);
    const combined = `${call.systemPrompt}\n${payloadText}`;

    for (const rule of rules.rules) {
      expect(payloadText).toContain(rule.id);
    }
    expect(rules.rules).toHaveLength(9);
    expect(call.systemPrompt).toContain("klaim_menyesatkan_produk_investasi");
    expect(call.systemPrompt).toContain("judi_online");
    expect(call.systemPrompt).toContain(
      "legal risk theme screening, not a legal ruling and not legal advice",
    );
    expect(call.systemPrompt.toLowerCase()).toContain("at risk under the");
    expect(call.systemPrompt).not.toMatch(PASAL_PATTERN);
    expect(combined.toLowerCase()).not.toContain("youtube-");
    expect(combined.toLowerCase()).not.toContain("tiktok-");
    expect(combined.toLowerCase()).not.toContain("facebook-");
    expect(call.systemPrompt).not.toContain("musik_komersial");
    const payloadObj = call.userPayload as { bundle?: unknown; rules?: unknown };
    expect(payloadObj.bundle).toEqual(legalBundle);
    expect(payloadObj.rules).toEqual(rules);
  });
});
