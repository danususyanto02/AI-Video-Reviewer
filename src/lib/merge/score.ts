import type { Finding, PlatformStatus, Severity } from "../contracts/schemas";

const PENALTY: Record<Severity, number> = {
  tinggi: 30,
  sedang: 15,
  rendah: 5,
};

export function computePlatformScore(findings: Finding[]): number {
  let score = 100;
  for (const finding of findings) {
    score -= PENALTY[finding.severity];
  }
  return Math.max(0, score);
}

export function statusFromScore(score: number): PlatformStatus {
  if (score >= 80) return "aman";
  if (score >= 50) return "perlu_perbaikan";
  return "berisiko_tinggi";
}
