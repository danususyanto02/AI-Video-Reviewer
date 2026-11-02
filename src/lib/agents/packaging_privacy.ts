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
    agent: "packaging_privacy",
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

export async function runPackagingPrivacyAgent(
  bundle: EvidenceBundle,
  rules: RuleFile,
  reason: ReasonFn,
): Promise<AgentResult> {
  const systemPrompt = [
    "You are the packaging and privacy assessment agent for pre-upload video screening.",
    "Assess the EvidenceBundle in the payload only against the following packaging and privacy rule slice. Do not use rules outside this list and do not assess other domains.",
    "Focus only on packaging and privacy: the title, the caption, the thumbnail finding (thumbnail_finding), and the keyframe findings (keyframe_findings). Ignore the transcript and scenes unless needed to check whether the title or thumbnail matches the content.",
    "Keyframe findings are already localized by the evidence pipeline. This module never calls localization itself and never re-derives positions. Judge keyframes only from the description and at_sec second available in the bundle.",
    `Rules in force (version ${rules.version}, updated ${rules.updated_at}, source: ${rules.source}):`,
    JSON.stringify(rules, null, 2),
    'Return ONLY valid JSON shaped {"findings":[...]} with no other text and no markdown.',
    "Every finding must be an object with fields: start_sec (number), end_sec (number), evidence_type, evidence, category, severity, impact, fix.",
    "evidence_type may only be: visual, audio, text_on_screen, title, caption, thumbnail.",
    "category may only be one of these slugs: privasi_data_pribadi, spam_clickbait_reupload.",
    "severity may only be: rendah, sedang, tinggi.",
    "evidence must quote bundle evidence verbatim: copy the title exactly for title evidence, copy the caption exactly for caption evidence, copy the thumbnail finding exactly for thumbnail evidence, and copy the keyframe description exactly for visual evidence. Never invent evidence that is not in the bundle.",
    "start_sec and end_sec are the evidence range in seconds. Both are 0 only for findings from the title, caption, or thumbnail. For keyframe findings, use that keyframe at_sec second as both start_sec and end_sec.",
    "impact explains the effect in plain language with risk language only, for example risk of being judged misleading or risk of exposing personal data. Avoid absolute certainty.",
    "fix states one concrete repair action. For privacy findings on license plates, documents, or other personal data, the instruction must tell the creator to blur or cover that data before uploading. For clickbait findings, the instruction tells the creator to match the title, thumbnail, or caption to the video content.",
    "Do not create findings without evidence. If no packaging or privacy risk is proven from the title, caption, thumbnail, and keyframes in the bundle, return {\"findings\":[]}.",
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
    agent: "packaging_privacy",
    status: "selesai",
    risk_level: deriveRiskLevel(findings),
    findings,
    error: null,
  };
}
