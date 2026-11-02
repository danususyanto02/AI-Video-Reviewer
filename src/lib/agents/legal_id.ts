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

const ARTICLE_PATTERN = /(Pasal|Article)\s+\d+/i;
const CERTAINTY_CONCLUSION_PATTERNS: RegExp[] = [
  /melanggar\s+(UU|undang-undang|hukum)\b/i,
  /\bviolates\s+(the\s+)?(law|regulation|statute)\b/i,
  /\bis\s+(clearly\s+|definitely\s+|certainly\s+)?illegal\b/i,
  /\bdefinitely\s+violates\b/i,
  /\bcertainly\s+violates\b/i,
];
const BANNED_CERTAINTY_PHRASES: string[] = [
  ["pasti", "bebas"].join(" "),
  ["pasti", "melanggar"].join(" "),
  ["aman", "secara", "hukum"].join(" "),
  // Built with join so this guard file never literally contains the phrases.
  ["legally", "safe"].join(" "),
  ["guaranteed", "legal"].join(" "),
  ["definitely", "violates"].join(" "),
  ["certainly", "violates"].join(" "),
];

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
    agent: "legal_id",
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

function findContractViolation(findings: FindingData[], rules: RuleFile): string | null {
  const allowedCategories = new Set(rules.rules.map((rule) => rule.id));
  for (const finding of findings) {
    if (!allowedCategories.has(finding.category)) {
      return `category outside legal themes: ${finding.category}`;
    }
    const text = `${finding.category} ${finding.evidence} ${finding.impact} ${finding.fix}`;
    if (ARTICLE_PATTERN.test(text)) {
      return "finding contains an article number";
    }
    for (const pattern of CERTAINTY_CONCLUSION_PATTERNS) {
      if (pattern.test(text)) {
        return "finding contains a legal certainty conclusion";
      }
    }
    const lower = text.toLowerCase();
    for (const phrase of BANNED_CERTAINTY_PHRASES) {
      if (lower.includes(phrase)) {
        return "finding contains banned legal certainty wording";
      }
    }
  }
  return null;
}

export async function runLegalAgent(
  bundle: EvidenceBundle,
  rules: RuleFile,
  reason: ReasonFn,
): Promise<AgentResult> {
  const systemPrompt = [
    "You are the Indonesian legal risk theme screening agent for pre-upload video screening.",
    "This task is legal risk theme screening, not a legal ruling and not legal advice. Do not issue legal rulings and do not give legal advice.",
    "Assess the EvidenceBundle in the payload only against the following Indonesian legal themes. Do not use rules outside this list and do not assess other domains.",
    `Rules in force (version ${rules.version}, updated ${rules.updated_at}, source: ${rules.source}):`,
    JSON.stringify(rules, null, 2),
    'Return ONLY valid JSON shaped {"findings":[...]} with no other text and no markdown.',
    "Every finding must be an object with fields: start_sec (number), end_sec (number), evidence_type, evidence, category, severity, impact, fix.",
    "evidence_type may only be: visual, audio, text_on_screen, title, caption, thumbnail.",
    "category may only be one of these legal theme ids, exactly as written: hoaks, ujaran_kebencian_sara, pencemaran_nama_baik, kesusilaan_pornografi, judi_online, provokasi_kekerasan_terorisme, klaim_menyesatkan_produk_investasi, privasi_data_pribadi, endorsement_tanpa_pengungkapan.",
    "severity may only be: rendah, sedang, tinggi.",
    "evidence must quote bundle evidence verbatim: copy transcript text exactly for audio evidence, copy scene or keyframe descriptions exactly for visual evidence, and copy the title, caption, or thumbnail finding exactly for packaging evidence. Never invent evidence that is not in the bundle.",
    "start_sec and end_sec are the evidence range in seconds. Both are 0 only for findings from the title, caption, or thumbnail. For keyframe findings, use the at_sec second as the range.",
    "impact must use risk language with the phrase at risk under the theme, for example at risk under the misleading claims and consumer protection theme or at risk under the gambling theme in this Indonesian legal theme screening. State every finding as risk under a theme, never as a legal conclusion.",
    "Never write article numbers in any form and never quote or invent statutory wording. Name themes only with the theme ids above and plain language.",
    "Never use legal certainty in any form: do not state as fact that content violates a provision, and do not promise certainty about screening outcomes. Always use the at-risk-under-the-theme framing.",
    "fix states one concrete repair action for that finding.",
    "Do not add fields beyond findings and do not add a disclaimer to the result. The report disclaimer is handled by the merger and the interface, not by this module.",
    "Do not create findings without evidence. If no theme risk is proven from the bundle, return {\"findings\":[]}.",
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

  const violation = findContractViolation(parsed.data.findings, rules);
  if (violation) {
    return gagal(`Invalid model output: ${violation}`);
  }

  const findings = parsed.data.findings;
  return {
    agent: "legal_id",
    status: "selesai",
    risk_level: deriveRiskLevel(findings),
    findings,
    error: null,
  };
}
