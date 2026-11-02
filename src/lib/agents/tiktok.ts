import { z } from "zod";
import { Finding } from "../contracts/schemas";
import type { AgentResult, EvidenceBundle, RuleFile, Severity } from "../contracts/schemas";

export type ReasonFn = (systemPrompt: string, userPayload: unknown) => Promise<unknown>;

type FindingData = z.infer<typeof Finding>;

const AgentOutput = z.object({
  findings: z.array(Finding),
});

const SEVERITY_ORDER: Record<Severity, number> = {
  rendah: 0,
  sedang: 1,
  tinggi: 2,
};

function deriveRiskLevel(findings: FindingData[]): Severity {
  let highest: Severity = "rendah";
  for (const finding of findings) {
    if (SEVERITY_ORDER[finding.severity] > SEVERITY_ORDER[highest]) {
      highest = finding.severity;
    }
  }
  return highest;
}

function gagal(error: string): AgentResult {
  return {
    agent: "tiktok",
    status: "gagal",
    risk_level: "rendah",
    findings: [],
    error,
  };
}

function describeIssues(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return "output schema mismatch";
  const path = first.path.length > 0 ? `${first.path.join(".")}: ` : "";
  return `${path}${first.message}`;
}

export async function runTiktokAgent(
  bundle: EvidenceBundle,
  rules: RuleFile,
  reason: ReasonFn,
): Promise<AgentResult> {
  const systemPrompt = [
    "You are the TikTok assessment agent for pre-upload video screening.",
    "Assess the EvidenceBundle in the payload only against the following TikTok rules. Do not use rules outside this list and do not assess other domains.",
    `Rules in force (version ${rules.version}, updated ${rules.updated_at}, source: ${rules.source}):`,
    JSON.stringify(rules, null, 2),
    'Return ONLY valid JSON shaped {"findings":[...]} with no other text and no markdown.',
    "Every finding must be an object with fields: start_sec (number), end_sec (number), evidence_type, evidence, category, severity, impact, fix.",
    "evidence_type may only be: visual, audio, text_on_screen, title, caption, thumbnail.",
    "category may only be one of these slugs: kekerasan, seksual, ujaran_kebencian, perundungan, keselamatan_anak, perilaku_berbahaya, narkoba_alkohol_senjata, judi, misinformasi, spam_clickbait_reupload, grafis_medis, privasi_data_pribadi.",
    "severity may only be: rendah, sedang, tinggi.",
    "evidence must quote bundle evidence verbatim: copy transcript text exactly for audio evidence, copy scene or keyframe descriptions exactly for visual evidence, and copy the title, caption, or thumbnail finding exactly for packaging evidence. Never invent evidence that is not in the bundle.",
    "start_sec and end_sec are the evidence range in seconds. Both are 0 only for findings from the title, caption, or thumbnail.",
    "impact explains the effect in plain language with risk language only, including For You recommendation eligibility consequences where relevant under the rules above, for example risk that the video becomes ineligible for For You recommendation or risk of removal. Avoid absolute certainty.",
    "fix states one concrete repair action for that finding.",
    "Do not create findings without evidence. If no violation is proven from the bundle, return {\"findings\":[]}.",
    "Do not compute any final score.",
  ].join("\n");

  let raw: unknown;
  try {
    raw = await reason(systemPrompt, { bundle, rules });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return gagal(`Reasoning call failed: ${message}`);
  }

  const parsed = AgentOutput.safeParse(raw);
  if (!parsed.success) {
    return gagal(`Invalid model output: ${describeIssues(parsed.error)}`);
  }

  const findings = parsed.data.findings;
  return {
    agent: "tiktok",
    status: "selesai",
    risk_level: deriveRiskLevel(findings),
    findings,
    error: null,
  };
}
