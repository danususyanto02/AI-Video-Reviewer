import { DISCLAIMER, FinalReport } from "../contracts/schemas";
import type {
  AgentName,
  AgentResult,
  AgentStatus,
  Finding,
  Platform,
  PlatformReport,
  RiskLevel,
  Severity,
} from "../contracts/schemas";
import { computePlatformScore, statusFromScore } from "./score";

export { computePlatformScore, statusFromScore } from "./score";

const PLATFORM_ORDER: Platform[] = ["youtube", "tiktok", "facebook"];

const ALL_AGENTS: AgentName[] = [
  "youtube",
  "tiktok",
  "facebook",
  "copyright",
  "legal_id",
  "packaging_privacy",
];

const AGENT_LABELS: Record<AgentName, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  facebook: "Facebook",
  copyright: "copyright",
  legal_id: "Indonesian legal",
  packaging_privacy: "Packaging and privacy",
};

const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  facebook: "Facebook",
};

const SEVERITY_RANK: Record<Severity, number> = {
  rendah: 0,
  sedang: 1,
  tinggi: 2,
};

function dedupKey(finding: Finding): string {
  return `${finding.category}\u0000${finding.start_sec}\u0000${finding.end_sec}\u0000${finding.evidence_type}`;
}

function formatAgent(agent: AgentName): string {
  const label = AGENT_LABELS[agent];
  return label.toLowerCase() === agent ? label : `${label} (${agent})`;
}

function formatPlatform(platform: Platform): string {
  const label = PLATFORM_LABELS[platform];
  return label.toLowerCase() === platform ? label : `${label} (${platform})`;
}

function isStronger(candidate: Finding, existing: Finding): boolean {
  const candidateRank = SEVERITY_RANK[candidate.severity];
  const existingRank = SEVERITY_RANK[existing.severity];
  if (candidateRank !== existingRank) return candidateRank > existingRank;
  return candidate.evidence.length > existing.evidence.length;
}

function deduplicateFindings(findings: Finding[]): Finding[] {
  const result: Finding[] = [];
  const positionByKey = new Map<string, number>();
  for (const finding of findings) {
    const key = dedupKey(finding);
    const position = positionByKey.get(key);
    if (position === undefined) {
      positionByKey.set(key, result.length);
      result.push(finding);
    } else {
      const existing = result[position];
      if (existing && isStronger(finding, existing)) {
        result[position] = finding;
      }
    }
  }
  return result;
}

function pickTopRiskCategory(findings: Finding[]): string {
  let best: Finding | undefined;
  for (const finding of findings) {
    if (!best) {
      best = finding;
      continue;
    }
    const rank = SEVERITY_RANK[finding.severity];
    const bestRank = SEVERITY_RANK[best.severity];
    if (rank > bestRank) {
      best = finding;
    } else if (rank === bestRank && finding.start_sec < best.start_sec) {
      best = finding;
    }
  }
  return best ? best.category : "";
}

function buildFixChecklist(findingsInOrder: Finding[]): string[] {
  type Entry = { fix: string; rank: number; order: number };
  const byFix = new Map<string, Entry>();
  findingsInOrder.forEach((finding, order) => {
    const rank = SEVERITY_RANK[finding.severity];
    const existing = byFix.get(finding.fix);
    if (!existing) {
      byFix.set(finding.fix, { fix: finding.fix, rank, order });
    } else if (rank > existing.rank) {
      existing.rank = rank;
      existing.order = order;
    }
  });
  return [...byFix.values()]
    .sort((a, b) => b.rank - a.rank || a.order - b.order)
    .map((entry) => entry.fix);
}

function buildRecommendation(params: {
  platforms: PlatformReport[];
  copyrightRisk: RiskLevel;
  legalRisk: RiskLevel;
  hasAnyFindings: boolean;
  failedAgents: AgentName[];
}): string {
  const { platforms, copyrightRisk, legalRisk, hasAnyFindings, failedAgents } = params;
  const failedClause =
    failedAgents.length > 0
      ? `the ${failedAgents.map((agent) => formatAgent(agent)).join(", ")} check did not finish, so this screening is incomplete`
      : null;

  const highPlatforms = platforms
    .filter((platform) => platform.status === "berisiko_tinggi")
    .sort((a, b) => a.safety_score - b.safety_score);
  const hasHighRisk =
    highPlatforms.length > 0 || copyrightRisk === "tinggi" || legalRisk === "tinggi";

  if (hasHighRisk) {
    const domains: string[] = highPlatforms.map((platform) => formatPlatform(platform.platform));
    if (copyrightRisk === "tinggi") domains.push("copyright");
    if (legalRisk === "tinggi") domains.push("Indonesian legal (legal_id)");
    const base = `Do not publish yet: high risk on ${domains.join(", ")} needs handling before upload`;
    return failedClause ? `${base}, and ${failedClause}.` : `${base}.`;
  }

  if (hasAnyFindings) {
    if (failedClause) {
      return `Publish after fixes: finish the checklist fixes first, and ${failedClause} before upload.`;
    }
    return "Publish after fixes: finish the checklist fixes first before upload.";
  }

  if (failedClause) {
    return `No prominent risk found in this screening, but ${failedClause} and needs a recheck before upload.`;
  }
  return "No prominent risk found in this screening, so the video may be considered for publishing after a final check before upload.";
}

export function mergeReports(results: AgentResult[], rulesVersion: string): FinalReport {
  const byAgent = new Map<AgentName, AgentResult>();
  for (const result of results) {
    if (result && !byAgent.has(result.agent)) {
      byAgent.set(result.agent, result);
    }
  }

  const statusFor = (agent: AgentName): AgentStatus => {
    const found = byAgent.get(agent);
    return found ? found.status : "gagal";
  };

  const riskFor = (agent: AgentName): RiskLevel => {
    const found = byAgent.get(agent);
    return found ? found.risk_level : "rendah";
  };

  const findingsFor = (agent: AgentName): Finding[] => {
    const found = byAgent.get(agent);
    if (!found || found.status !== "selesai") return [];
    return deduplicateFindings(found.findings ?? []);
  };

  const platforms: PlatformReport[] = PLATFORM_ORDER.map((platform) => {
    const findings = findingsFor(platform);
    const safety_score = computePlatformScore(findings);
    return {
      platform,
      safety_score,
      status: statusFromScore(safety_score),
      top_risk: pickTopRiskCategory(findings),
      findings,
    };
  });

  const copyrightSegments = findingsFor("copyright");
  const legalThemes = findingsFor("legal_id");
  const packagingFindings = findingsFor("packaging_privacy");

  const orderedFindings: Finding[] = [
    ...platforms.flatMap((platform) => platform.findings),
    ...copyrightSegments,
    ...legalThemes,
    ...packagingFindings,
  ];

  const fix_checklist = buildFixChecklist(orderedFindings);

  const agent_statuses = ALL_AGENTS.map((agent) => ({ agent, status: statusFor(agent) }));
  const failedAgents = agent_statuses
    .filter((entry) => entry.status !== "selesai")
    .map((entry) => entry.agent);

  const copyrightRisk = riskFor("copyright");
  const legalRisk = riskFor("legal_id");

  const overall_recommendation = buildRecommendation({
    platforms,
    copyrightRisk,
    legalRisk,
    hasAnyFindings: orderedFindings.length > 0,
    failedAgents,
  });

  const candidate = {
    overall_recommendation,
    platforms,
    copyright: { risk_level: copyrightRisk, segments: copyrightSegments },
    legal_id: { risk_level: legalRisk, themes: legalThemes, disclaimer: DISCLAIMER },
    fix_checklist,
    rules_version: rulesVersion && rulesVersion.trim().length > 0 ? rulesVersion : "unknown",
    agent_statuses,
  };

  return FinalReport.parse(candidate);
}
