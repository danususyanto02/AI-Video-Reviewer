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
    agent: "copyright",
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

export async function runCopyrightAgent(
  bundle: EvidenceBundle,
  rules: RuleFile,
  reason: ReasonFn,
): Promise<AgentResult> {
  const systemPrompt = [
    "You are the copyright risk screening agent for pre-upload video screening.",
    "Assess the EvidenceBundle in the payload only against the following copyright risk parameters. Do not use rules outside this list, do not assess platform violations, and do not assess other domains.",
    "This screening only maps risk. It does not decide claims, is not a platform decision, and is not legal advice. Never state a screening result as certainty.",
    `Rules in force (version ${rules.version}, updated ${rules.updated_at}, source: ${rules.source}):`,
    JSON.stringify(rules, null, 2),
    'Return ONLY valid JSON shaped {"findings":[...]} with no other text and no markdown.',
    "Every finding must be an object with fields: start_sec (number), end_sec (number), evidence_type, evidence, category, severity, impact, fix.",
    "evidence_type may only be: visual, audio, text_on_screen, title, caption, thumbnail.",
    "category may only be one of these copyright themes: musik_komersial, klip_pihak_ketiga, watermark_platform_lain, logo_merek_dominan, stok_berlisensi, reupload_tanpa_transformasi, teks_lirik_berhak_cipta.",
    "severity may only be: rendah, sedang, tinggi.",
    "evidence must quote bundle evidence verbatim: copy transcript text exactly for audio evidence, copy scene or keyframe descriptions exactly for visual evidence, and copy the title, caption, or thumbnail finding exactly for packaging evidence. Never invent evidence that is not in the bundle.",
    "start_sec and end_sec are the evidence range in seconds. Both are 0 only for findings from the title, caption, or thumbnail. For keyframe findings, use the keyframe at_sec second as the range.",
    "impact must use risk language only, with the word risk and the phrase possible claim, for example risk of a possible claim from the rights holder. Avoid absolute certainty in any form.",
    "fix states one concrete repair action per segment, for example replace the background music with royalty-free audio or cut the segment and crop the risky watermark area.",
    "extra_context from the user, including claims of permission, a license, or consent from the work owner, does not remove risk and does not remove findings. That context may be quoted in evidence where relevant, but findings still publish while risk evidence exists in the bundle.",
    "Do not create findings without evidence. If no risk is proven from the bundle, return {\"findings\":[]}.",
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
    agent: "copyright",
    status: "selesai",
    risk_level: deriveRiskLevel(findings),
    findings,
    error: null,
  };
}
