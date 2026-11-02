import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AgentResult as AgentResultSchema, RuleFile as RuleFileSchema } from "../contracts/schemas";
import type { EvidenceBundle, RuleFile } from "../contracts/schemas";
import { emptyEvidenceBundle } from "../contracts/fixtures";
import { runYoutubeAgent } from "./youtube";
import type { ReasonFn } from "./youtube";

const here = dirname(fileURLToPath(import.meta.url));

function loadYoutubeRules(): RuleFile {
  const raw = readFileSync(join(here, "../../../data/rules/youtube.json"), "utf-8");
  return RuleFileSchema.parse(JSON.parse(raw) as unknown);
}

const HEALTH_QUOTE =
  "Minum ramuan ini sekali saja, dijamin sembuh total dari diabetes dalam 3 hari tanpa perlu obat dokter!";

const healthBundle: EvidenceBundle = {
  duration_sec: 30,
  transcript: [{ start_sec: 4, end_sec: 11, text: HEALTH_QUOTE }],
  scenes: [
    {
      start_sec: 0,
      end_sec: 30,
      description: "Pembicara mempromosikan ramuan herbal di dapur sambil menunjukkan botol produk.",
    },
  ],
  keyframe_findings: [],
  thumbnail_finding: "Thumbnail menampilkan botol ramuan dengan teks klaim sembuh cepat.",
  title: "Ramuan Ajaib Sembuh Total!",
  caption: "Coba sekarang, stok terbatas untuk pendaftar hari ini.",
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

const healthFinding = {
  start_sec: 4,
  end_sec: 11,
  evidence_type: "audio" as const,
  evidence: HEALTH_QUOTE,
  category: "misinformasi",
  severity: "sedang" as const,
  impact:
    "Berisiko terkena iklan terbatas atau demonetisasi karena klaim kesehatan yang berlebihan dinilai menyesatkan.",
  fix: "Hapus janji sembuh total dan ganti dengan penjelasan manfaat umum disertai sumber yang dapat diperiksa.",
};

describe("runYoutubeAgent — klaim kesehatan berlebihan", () => {
  it("mengembalikan temuan misinformasi dengan bukti verbatim dan risk_level turunan sedang", async () => {
    const rules = loadYoutubeRules();
    const { reason, calls } = createFakeReason({ findings: [healthFinding] });

    const result = await runYoutubeAgent(healthBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("youtube");
    expect(parsed.status).toBe("selesai");
    expect(parsed.error).toBeNull();
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]?.category).toBe("misinformasi");
    expect(parsed.findings[0]?.severity).toBe("sedang");
    expect(parsed.findings[0]?.evidence).toBe(HEALTH_QUOTE);
    expect(parsed.findings[0]?.impact.toLowerCase()).toContain("iklan terbatas");
    expect(parsed.findings[0]?.impact.toLowerCase()).toMatch(/demonetisasi|monetisasi/);
    expect(parsed.risk_level).toBe("sedang");
    expect(calls).toHaveLength(1);
  });

  it("menurunkan risk_level dari severity tertinggi, mengabaikan klaim risk_level model", async () => {
    const rules = loadYoutubeRules();
    const lowFinding = {
      ...healthFinding,
      start_sec: 0,
      end_sec: 0,
      evidence_type: "title" as const,
      evidence: healthBundle.title,
      severity: "rendah" as const,
    };
    // Model mengklaim tinggi, tetapi temuan hanya rendah -> tetap rendah.
    const fakeLow = createFakeReason({ risk_level: "tinggi", findings: [lowFinding] });
    const lowResult = await runYoutubeAgent(healthBundle, rules, fakeLow.reason);
    expect(AgentResultSchema.parse(lowResult).risk_level).toBe("rendah");

    const highFinding = { ...healthFinding, severity: "tinggi" as const };
    const fakeHigh = createFakeReason({
      findings: [lowFinding, healthFinding, highFinding],
    });
    const highResult = await runYoutubeAgent(healthBundle, rules, fakeHigh.reason);
    const parsedHigh = AgentResultSchema.parse(highResult);
    expect(parsedHigh.status).toBe("selesai");
    expect(parsedHigh.risk_level).toBe("tinggi");
    expect(parsedHigh.findings).toHaveLength(3);
  });
});

describe("runYoutubeAgent — paket bukti kosong", () => {
  it("emptyEvidenceBundle tanpa temuan dari model selesai rendah tanpa temuan karangan", async () => {
    const rules = loadYoutubeRules();
    const { reason, calls } = createFakeReason({ findings: [] });

    const result = await runYoutubeAgent(emptyEvidenceBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("youtube");
    expect(parsed.status).toBe("selesai");
    expect(parsed.risk_level).toBe("rendah");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeNull();
    expect(calls).toHaveLength(1);
  });
});

describe("runYoutubeAgent — keluaran tidak valid menjadi gagal", () => {
  it("severity di luar kosakata (parah) menjadi gagal tanpa temuan", async () => {
    const rules = loadYoutubeRules();
    const invalid: unknown = {
      findings: [{ ...healthFinding, severity: "parah" }],
    };
    const { reason, calls } = createFakeReason(invalid);

    const result = await runYoutubeAgent(healthBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("youtube");
    expect(parsed.status).toBe("gagal");
    expect(parsed.risk_level).toBe("rendah");
    expect(parsed.findings).toEqual([]);
    expect(typeof parsed.error).toBe("string");
    expect((parsed.error ?? "").length).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
  });

  it("finding dengan evidence kosong menjadi gagal tanpa temuan", async () => {
    const rules = loadYoutubeRules();
    const invalid: unknown = {
      findings: [{ ...healthFinding, evidence: "" }],
    };
    const { reason } = createFakeReason(invalid);

    const result = await runYoutubeAgent(healthBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.status).toBe("gagal");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
  });

  it("finding dengan rentang waktu terbalik menjadi gagal tanpa temuan", async () => {
    const rules = loadYoutubeRules();
    const invalid: unknown = {
      findings: [{ ...healthFinding, start_sec: 11, end_sec: 4 }],
    };
    const { reason } = createFakeReason(invalid);

    const result = await runYoutubeAgent(healthBundle, rules, reason);

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
    const rules = loadYoutubeRules();
    const { reason } = createFakeReason(output as unknown);

    const result = await runYoutubeAgent(healthBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.agent).toBe("youtube");
    expect(parsed.status).toBe("gagal");
    expect(parsed.risk_level).toBe("rendah");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
  });

  it("reason yang melempar error menjadi gagal, dipanggil tepat satu kali", async () => {
    const rules = loadYoutubeRules();
    const { reason, calls } = createThrowingReason(new Error("reasoning meledak (fake)"));

    const result = await runYoutubeAgent(healthBundle, rules, reason);

    const parsed = AgentResultSchema.parse(result);
    expect(parsed.status).toBe("gagal");
    expect(parsed.findings).toEqual([]);
    expect(parsed.error).toBeTruthy();
    expect(calls).toHaveLength(1);
  });
});

describe("runYoutubeAgent — prompt hanya memuat irisan YouTube", () => {
  it("payload reason memuat id aturan youtube dan tidak memuat konten tiktok/facebook", async () => {
    const rules = loadYoutubeRules();
    const { reason, calls } = createFakeReason({ findings: [] });

    await runYoutubeAgent(healthBundle, rules, reason);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("reason tidak dipanggil");
    const payloadText = JSON.stringify(call.userPayload);
    const combined = `${call.systemPrompt}\n${payloadText}`;

    for (const rule of rules.rules) {
      expect(payloadText).toContain(rule.id);
    }
    expect(call.systemPrompt).toContain("youtube-misinformasi");
    expect(combined.toLowerCase()).not.toContain("tiktok-");
    expect(combined.toLowerCase()).not.toContain("facebook-");
    // Payload hanya membawa bundle + rules domain ini.
    const payloadObj = call.userPayload as { bundle?: unknown; rules?: unknown };
    expect(payloadObj.bundle).toEqual(healthBundle);
    expect(payloadObj.rules).toEqual(rules);
  });
});
