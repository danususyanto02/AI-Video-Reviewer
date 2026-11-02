import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runCopyrightAgent } from "../../src/lib/agents/copyright";
import { runFacebookAgent } from "../../src/lib/agents/facebook";
import { runLegalAgent } from "../../src/lib/agents/legal_id";
import { runPackagingPrivacyAgent } from "../../src/lib/agents/packaging_privacy";
import { runTiktokAgent } from "../../src/lib/agents/tiktok";
import { runYoutubeAgent } from "../../src/lib/agents/youtube";
import type { ReasonFn } from "../../src/lib/agents/youtube";
import {
  AgentName as AgentNameSchema,
  AgentResult as AgentResultSchema,
  DISCLAIMER,
  EvidenceBundle as EvidenceBundleSchema,
  PlatformStatus as PlatformStatusSchema,
  RuleFile as RuleFileSchema,
} from "../../src/lib/contracts/schemas";
import type {
  AgentName,
  AgentResult,
  EvidenceBundle,
  Finding,
  FinalReport,
  RuleFile,
} from "../../src/lib/contracts/schemas";
import { mergeReports } from "../../src/lib/merge/merge";

// Harness khusus uji (test harness, bukan deteksi model): `reason` palsu yang
// deterministik ini hanya mencocokkan kata kunci/isyarat di atas EvidenceBundle
// lalu mengembalikan temuan berbentuk Finding. Ia tinggal HANYA di berkas uji
// ini. Uji ini menjalankan enam modul agen nyata dan mergeReports nyata, tetapi
// TIDAK membuktikan deteksi model Meta apa pun: model sungguhan bisa memberi
// temuan yang berbeda dari pencocok kata kunci sederhana ini.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../..");
const rulesDir = join(repoRoot, "data/rules");

function loadRules(fileName: string): RuleFile {
  return RuleFileSchema.parse(JSON.parse(readFileSync(join(rulesDir, fileName), "utf-8")) as unknown);
}

const youtubeRules = loadRules("youtube.json");
const tiktokRules = loadRules("tiktok.json");
const facebookRules = loadRules("facebook.json");
const copyrightRules = loadRules("copyright.json");
const legalRules = loadRules("legal_id.json");
const packagingRules: RuleFile = RuleFileSchema.parse({
  version: youtubeRules.version,
  updated_at: youtubeRules.updated_at,
  source: youtubeRules.source,
  rules: [...youtubeRules.rules, ...tiktokRules.rules, ...facebookRules.rules].filter((rule) =>
    ["privasi_data_pribadi", "spam_clickbait_reupload"].includes(rule.category),
  ),
});

const ExpectedFile = z.object({
  case: z.string().min(1),
  must_include: z.array(z.object({ agent: AgentNameSchema, category: z.string().min(1) })),
  must_exclude_categories: z.array(z.string().min(1)),
  expected_status_hint: PlatformStatusSchema,
});
type ExpectedFile = z.infer<typeof ExpectedFile>;

interface ExampleCase {
  id: string;
  video: string;
  bundleFile: string;
  expectedFile: string;
}

const CASES: ExampleCase[] = [
  { id: "safe", video: "safe.mp4", bundleFile: "safe.bundle.json", expectedFile: "safe.expected.json" },
  {
    id: "platform-copyright-risk",
    video: "platform-copyright-risk.mp4",
    bundleFile: "platform-copyright-risk.bundle.json",
    expectedFile: "platform-copyright-risk.expected.json",
  },
  {
    id: "legal-risk",
    video: "legal-risk.mp4",
    bundleFile: "legal-risk.bundle.json",
    expectedFile: "legal-risk.expected.json",
  },
];

function readJson(fileName: string): unknown {
  return JSON.parse(readFileSync(join(here, fileName), "utf-8")) as unknown;
}

// --- Pencocok isyarat harness uji (test harness, bukan deteksi model) ---

const GAMBLING_RE = /trusted toto site|pulsa deposit|new member bonus/i;
const HEALTH_CLAIM_RE = /guaranteed a total cure|total cure|no doctor medicine needed/i;
const COMMERCIAL_MUSIC_RE = /commercial pop music/i;
const REUPLOAD_RE = /without commentary|played again in full|reupload/i;

type Source = { start_sec: number; end_sec: number; evidence: string; evidence_type: Finding["evidence_type"] };

function transcriptSource(bundle: EvidenceBundle, re: RegExp): Source | null {
  const seg = bundle.transcript.find((s) => re.test(s.text));
  return seg ? { start_sec: seg.start_sec, end_sec: seg.end_sec, evidence: seg.text, evidence_type: "audio" } : null;
}

function sceneSource(bundle: EvidenceBundle, re: RegExp, type: Finding["evidence_type"]): Source | null {
  const seg = bundle.scenes.find((s) => re.test(s.description));
  return seg ? { start_sec: seg.start_sec, end_sec: seg.end_sec, evidence: seg.description, evidence_type: type } : null;
}

function keyframeSource(bundle: EvidenceBundle, kind: string): Source | null {
  const kf = bundle.keyframe_findings.find((k) => k.kind === kind);
  return kf ? { start_sec: kf.at_sec, end_sec: kf.at_sec, evidence: kf.description, evidence_type: "visual" } : null;
}

function makeFinding(source: Source, category: string, severity: Finding["severity"], impact: string, fix: string): Finding {
  return { ...source, category, severity, impact, fix };
}

function platformFindings(bundle: EvidenceBundle): Finding[] {
  const findings: Finding[] = [];
  const gambling = transcriptSource(bundle, GAMBLING_RE);
  if (gambling) {
    findings.push(
      makeFinding(gambling, "judi", "tinggi",
        "At risk of being judged gambling promotion and at risk of monetization limits or removal on this platform.",
        "Cut the gambling promo segment at that evidence range before uploading."),
    );
  }
  const health = transcriptSource(bundle, HEALTH_CLAIM_RE);
  if (health) {
    findings.push(
      makeFinding(health, "misinformasi", "sedang",
        "At risk of being judged a misleading health claim and at risk of limited ads on this platform.",
        "Remove the result promise in that segment and replace it with a general explanation with checkable sources."),
    );
  }
  const reupload = sceneSource(bundle, REUPLOAD_RE, "visual");
  if (reupload) {
    findings.push(
      makeFinding(reupload, "spam_clickbait_reupload", "sedang",
        "At risk of being judged reused content with no new value and at risk of distribution or monetization limits on this platform.",
        "Add meaningful commentary or transformation, or replace it with your own recorded material."),
    );
  }
  const watermark = keyframeSource(bundle, "watermark");
  if (watermark) {
    findings.push(
      makeFinding(watermark, "spam_clickbait_reupload", "sedang",
        "At risk of being judged unoriginal because another source watermark is still visible on this platform.",
        "Use your own recorded material or crop the watermark area when the material is licensed."),
    );
  }
  const plate = keyframeSource(bundle, "license_plate");
  if (plate) {
    findings.push(
      makeFinding(plate, "privasi_data_pribadi", "sedang",
        "At risk of exposing the vehicle owner personal data to viewers on this platform.",
        "Blur the license plate in that evidence keyframe before uploading."),
    );
  }
  return findings;
}

function copyrightFindings(bundle: EvidenceBundle): Finding[] {
  const findings: Finding[] = [];
  const music = sceneSource(bundle, COMMERCIAL_MUSIC_RE, "audio");
  if (music) {
    findings.push(
      makeFinding(music, "musik_komersial", "tinggi",
        "At risk of a possible claim from the rights holder over the music recording heard in that segment.",
        "Replace the background music with royalty-free audio before uploading."),
    );
  }
  const reupload = sceneSource(bundle, REUPLOAD_RE, "visual");
  if (reupload) {
    findings.push(
      makeFinding(reupload, "reupload_tanpa_transformasi", "tinggi",
        "At risk of a possible claim because someone else material is reuploaded with no meaningful transformation.",
        "Add meaningful commentary or transformation, or use your own recorded material."),
    );
  }
  const watermark = keyframeSource(bundle, "watermark");
  if (watermark) {
    findings.push(
      makeFinding(watermark, "watermark_platform_lain", "sedang",
        "At risk of a possible claim because another source watermark suggests the material likely came from another party.",
        "Use your own recorded material or crop the watermark area when the material is licensed."),
    );
  }
  return findings;
}

function legalFindings(bundle: EvidenceBundle): Finding[] {
  const findings: Finding[] = [];
  const health = transcriptSource(bundle, HEALTH_CLAIM_RE);
  if (health) {
    findings.push(
      makeFinding(health, "klaim_menyesatkan_produk_investasi", "tinggi",
        "At risk under the misleading claims and consumer protection theme in this Indonesian legal theme screening.",
        "Remove the result promise in that segment and use claims that match checkable product evidence."),
    );
  }
  const gambling = transcriptSource(bundle, GAMBLING_RE);
  if (gambling) {
    findings.push(
      makeFinding(gambling, "judi_online", "tinggi",
        "At risk under the gambling theme in this Indonesian legal theme screening.",
        "Cut the gambling promo segment at that evidence range before uploading."),
    );
  }
  const plate = keyframeSource(bundle, "license_plate");
  if (plate) {
    findings.push(
      makeFinding(plate, "privasi_data_pribadi", "sedang",
        "At risk under the privacy and personal data theme in this Indonesian legal theme screening.",
        "Blur the license plate in that evidence keyframe before uploading."),
    );
  }
  return findings;
}

function packagingFindings(bundle: EvidenceBundle): Finding[] {
  const findings: Finding[] = [];
  const watermark = keyframeSource(bundle, "watermark");
  if (watermark) {
    findings.push(
      makeFinding(watermark, "spam_clickbait_reupload", "sedang",
        "At risk of being judged unoriginal because another source watermark is still visible on the video packaging.",
        "Use your own recorded material or crop the watermark area when the material is licensed."),
    );
  }
  const plate = keyframeSource(bundle, "license_plate");
  if (plate) {
    findings.push(
      makeFinding(plate, "privasi_data_pribadi", "sedang",
        "At risk of exposing the vehicle owner personal data to viewers.",
        "Blur the license plate in that evidence keyframe before uploading."),
    );
  }
  return findings;
}

// `reason` harness uji: memilih domain dari prompt sistem agen nyata, lalu
// menjalankan pencocok isyarat di atas. Test harness, bukan deteksi model.
const harnessReason: ReasonFn = async (systemPrompt, userPayload) => {
  const payload = userPayload as { bundle: EvidenceBundle };
  const bundle = EvidenceBundleSchema.parse(payload.bundle);
  let findings: Finding[];
  if (systemPrompt.includes("YouTube assessment agent")) findings = platformFindings(bundle);
  else if (systemPrompt.includes("TikTok assessment agent")) findings = platformFindings(bundle);
  else if (systemPrompt.includes("Facebook assessment agent")) findings = platformFindings(bundle);
  else if (systemPrompt.includes("copyright risk screening agent")) findings = copyrightFindings(bundle);
  else if (systemPrompt.includes("Indonesian legal risk theme screening agent")) findings = legalFindings(bundle);
  else if (systemPrompt.includes("packaging and privacy assessment agent")) findings = packagingFindings(bundle);
  else throw new Error("Prompt agen tidak dikenali harness uji.");
  return { findings };
};

async function runCase(example: ExampleCase): Promise<{ bundle: EvidenceBundle; expected: ExpectedFile; results: AgentResult[]; report: FinalReport }> {
  const bundle = EvidenceBundleSchema.parse(readJson(example.bundleFile));
  const expected = ExpectedFile.parse(readJson(example.expectedFile));
  const results = await Promise.all([
    runYoutubeAgent(bundle, youtubeRules, harnessReason),
    runTiktokAgent(bundle, tiktokRules, harnessReason),
    runFacebookAgent(bundle, facebookRules, harnessReason),
    runCopyrightAgent(bundle, copyrightRules, harnessReason),
    runLegalAgent(bundle, legalRules, harnessReason),
    runPackagingPrivacyAgent(bundle, packagingRules, harnessReason),
  ]);
  for (const result of results) {
    expect(AgentResultSchema.parse(result).status).toBe("selesai");
  }
  const report = mergeReports(results, youtubeRules.version);
  return { bundle, expected, results, report };
}

function agentCategories(results: AgentResult[], agent: AgentName): string[] {
  return results.find((r) => r.agent === agent)?.findings.map((f) => f.category) ?? [];
}

function finalCategories(report: FinalReport, agent: AgentName): string[] | null {
  if (agent === "youtube" || agent === "tiktok" || agent === "facebook") {
    return report.platforms.find((p) => p.platform === agent)?.findings.map((f) => f.category) ?? [];
  }
  if (agent === "copyright") return report.copyright.segments.map((f) => f.category);
  if (agent === "legal_id") return report.legal_id.themes.map((f) => f.category);
  return null; // packaging_privacy tidak punya bagian sendiri di FinalReport.
}

function allFinalCategories(report: FinalReport): string[] {
  return [
    ...report.platforms.flatMap((p) => p.findings.map((f) => f.category)),
    ...report.copyright.segments.map((f) => f.category),
    ...report.legal_id.themes.map((f) => f.category),
  ];
}

function ffprobePath(): string {
  const exe = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
  return join(repoRoot, "node_modules", "ffprobe-static", "bin", process.platform, process.arch, exe);
}

function probeDurationSec(videoPath: string): number {
  const out = execFileSync(
    ffprobePath(),
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", videoPath],
    { encoding: "utf-8" },
  );
  return Number.parseFloat(out.trim());
}

describe("video contoh (T-401) — test harness, bukan deteksi model", () => {
  for (const example of CASES) {
    describe(`kasus ${example.id}`, () => {
      it("bundle lolos skema EvidenceBundle dan harapan terbaca", async () => {
        const { bundle, expected } = await runCase(example);
        expect(bundle.duration_sec).toBeGreaterThan(0);
        expect(expected.case).toBe(example.id);
      });

      it("FinalReport dari agen nyata + merge nyata memuat temuan yang diharapkan manusia", async () => {
        const { expected, results, report } = await runCase(example);
        for (const want of expected.must_include) {
          expect(agentCategories(results, want.agent), `${want.agent} (AgentResult)`).toContain(want.category);
          const inFinal = finalCategories(report, want.agent);
          if (inFinal === null) {
            // packaging_privacy hanya menyumbang fix ke checklist di FinalReport.
            const finding = results
              .find((r) => r.agent === want.agent)
              ?.findings.find((f) => f.category === want.category);
            expect(finding, "temuan packaging_privacy").toBeDefined();
            expect(report.fix_checklist).toContain(finding?.fix);
          } else {
            expect(inFinal, `${want.agent} (FinalReport)`).toContain(want.category);
          }
        }
        const excluded = new Set([...allFinalCategories(report), ...results.flatMap((r) => r.findings.map((f) => f.category))]);
        for (const category of expected.must_exclude_categories) {
          expect(excluded.has(category), `kategori terlarang ${category}`).toBe(false);
        }
      });

      it("petunjuk status harapan cocok dengan status platform hasil merge", async () => {
        const { expected, report } = await runCase(example);
        const statuses = report.platforms.map((p) => p.status);
        if (expected.expected_status_hint === "aman") {
          expect(statuses).toEqual(["aman", "aman", "aman"]);
        } else if (expected.expected_status_hint === "perlu_perbaikan") {
          expect(statuses).toContain("perlu_perbaikan");
          expect(statuses).not.toContain("berisiko_tinggi");
        } else {
          expect(statuses).toContain("berisiko_tinggi");
        }
      });

      it("video ada dan ffprobe membaca durasi 1..180 detik", () => {
        const videoPath = join(here, example.video);
        expect(existsSync(videoPath), example.video).toBe(true);
        const duration = probeDurationSec(videoPath);
        expect(duration).toBeGreaterThanOrEqual(1);
        expect(duration).toBeLessThanOrEqual(180);
      });
    });
  }

  it("kasus safe: tanpa temuan tinggi dan status platform hanya aman/perlu_perbaikan", async () => {
    const { report } = await runCase(CASES[0] as ExampleCase);
    const severities = [
      ...report.platforms.flatMap((p) => p.findings.map((f) => f.severity)),
      ...report.copyright.segments.map((f) => f.severity),
      ...report.legal_id.themes.map((f) => f.severity),
    ];
    expect(severities).not.toContain("tinggi");
    for (const platform of report.platforms) {
      expect(["aman", "perlu_perbaikan"]).toContain(platform.status);
    }
  });

  it("kasus legal-risk: tema hukum hadir bersama DISCLAIMER wajib", async () => {
    const { report } = await runCase(CASES[2] as ExampleCase);
    expect(report.legal_id.themes.length).toBeGreaterThan(0);
    expect(report.legal_id.risk_level).toBe("tinggi");
    expect(report.legal_id.disclaimer).toBe(DISCLAIMER);
  });

  it("kasus platform-copyright-risk: risiko copyright tinggi dari musik komersial", async () => {
    const { report } = await runCase(CASES[1] as ExampleCase);
    expect(report.copyright.segments.map((f) => f.category)).toContain("musik_komersial");
    expect(report.copyright.risk_level).toBe("tinggi");
  });
});
