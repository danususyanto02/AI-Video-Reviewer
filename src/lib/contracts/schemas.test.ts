import { describe, expect, it } from "vitest";
import { EvidenceBundle, FinalReport, Finding, PlatformReport } from "./schemas";
import { emptyEvidenceBundle, mockEvidenceBundle, mockFinalReport } from "./fixtures";

const validFinding: Finding = {
  start_sec: 5,
  end_sec: 12,
  evidence_type: "audio",
  evidence: "Daftar sekarang di situs toto terpercaya, bonus new member 100 persen!",
  category: "judi",
  severity: "tinggi",
  impact: "Berisiko tidak layak rekomendasi dan berisiko dibatasi distribusinya.",
  fix: "Potong segmen promosi judi pada rentang waktu ini.",
};

describe("contract fixtures", () => {
  it("mockEvidenceBundle parses against EvidenceBundle", () => {
    expect(() => EvidenceBundle.parse(mockEvidenceBundle)).not.toThrow();
    const parsed = EvidenceBundle.parse(mockEvidenceBundle);
    expect(parsed.transcript).toHaveLength(1);
    expect(parsed.scenes).toHaveLength(1);
    expect(parsed.keyframe_findings).toHaveLength(1);
    expect(parsed.keyframe_findings[0]?.kind).toBe("license_plate");
  });

  it("emptyEvidenceBundle parses against EvidenceBundle", () => {
    expect(() => EvidenceBundle.parse(emptyEvidenceBundle)).not.toThrow();
    const parsed = EvidenceBundle.parse(emptyEvidenceBundle);
    expect(parsed.transcript).toEqual([]);
    expect(parsed.scenes).toEqual([]);
    expect(parsed.keyframe_findings).toEqual([]);
  });

  it("mockFinalReport parses against FinalReport", () => {
    expect(() => FinalReport.parse(mockFinalReport)).not.toThrow();
    const parsed = FinalReport.parse(mockFinalReport);
    expect(parsed.platforms).toHaveLength(3);
    expect(parsed.agent_statuses).toHaveLength(6);
    expect(parsed.agent_statuses.filter((s) => s.status === "gagal")).toHaveLength(1);
  });
});

describe("contract vocabulary guards", () => {
  it("rejects a finding with empty evidence", () => {
    expect(() => Finding.parse({ ...validFinding, evidence: "" })).toThrow();
  });

  it("rejects out-of-vocabulary severity", () => {
    const invalid: unknown = { ...validFinding, severity: "parah" };
    expect(() => Finding.parse(invalid)).toThrow();
  });

  it("rejects a PlatformReport score above 100", () => {
    const invalid: unknown = {
      platform: "youtube",
      safety_score: 101,
      status: "aman",
      top_risk: "Tidak ada risiko dominan.",
      findings: [],
    };
    expect(() => PlatformReport.parse(invalid)).toThrow();
  });
});
