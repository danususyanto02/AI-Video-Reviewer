import { describe, expect, it } from "vitest";
import { DISCLAIMER, FinalReport } from "../contracts/schemas";
import type { AgentName, AgentResult, Finding } from "../contracts/schemas";
import { computePlatformScore, statusFromScore } from "./score";
import { mergeReports } from "./merge";

const VERSION = "2026-10-30.1";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    start_sec: 5,
    end_sec: 12,
    evidence_type: "audio",
    evidence: "Bukti contoh yang dapat diperiksa.",
    category: "judi",
    severity: "tinggi",
    impact: "Berisiko dibatasi pada platform ini.",
    fix: "Potong segmen ini sebelum mengunggah.",
    ...overrides,
  };
}

function makeAgent(
  agent: AgentName,
  overrides: Partial<AgentResult> = {},
): AgentResult {
  return {
    agent,
    status: "selesai",
    risk_level: "rendah",
    findings: [],
    error: null,
    ...overrides,
  };
}

function sixAgents(overrides: Partial<Record<AgentName, Partial<AgentResult>>> = {}): AgentResult[] {
  const names: AgentName[] = [
    "youtube",
    "tiktok",
    "facebook",
    "copyright",
    "legal_id",
    "packaging_privacy",
  ];
  return names.map((name) => makeAgent(name, overrides[name] ?? {}));
}

describe("computePlatformScore", () => {
  it("mengembalikan 100 untuk daftar kosong", () => {
    expect(computePlatformScore([])).toBe(100);
  });

  it("menghitung 2 tinggi + 1 sedang menjadi 25", () => {
    const findings = [
      makeFinding({ category: "judi", severity: "tinggi" }),
      makeFinding({ category: "kekerasan", severity: "tinggi", start_sec: 20, end_sec: 25 }),
      makeFinding({ category: "misinformasi", severity: "sedang", start_sec: 30, end_sec: 35 }),
    ];
    expect(computePlatformScore(findings)).toBe(25);
  });

  it("mengurangkan rendah 5, sedang 15, tinggi 30 secara terpisah", () => {
    expect(computePlatformScore([makeFinding({ severity: "rendah" })])).toBe(95);
    expect(computePlatformScore([makeFinding({ severity: "sedang" })])).toBe(85);
    expect(computePlatformScore([makeFinding({ severity: "tinggi" })])).toBe(70);
  });

  it("tidak pernah di bawah 0 (5 tinggi menjadi 0)", () => {
    const findings = Array.from({ length: 5 }, (_, i) =>
      makeFinding({
        category: `kategori_${i}`,
        severity: "tinggi",
        start_sec: i * 10,
        end_sec: i * 10 + 5,
      }),
    );
    expect(computePlatformScore(findings)).toBe(0);
  });
});

describe("statusFromScore", () => {
  it("memetakan batas 80, 79, 50, 49 sesuai kontrak", () => {
    expect(statusFromScore(100)).toBe("aman");
    expect(statusFromScore(80)).toBe("aman");
    expect(statusFromScore(79)).toBe("perlu_perbaikan");
    expect(statusFromScore(50)).toBe("perlu_perbaikan");
    expect(statusFromScore(49)).toBe("berisiko_tinggi");
    expect(statusFromScore(0)).toBe("berisiko_tinggi");
  });

  it("menghubungkan skor 25 dari 2 tinggi + 1 sedang ke berisiko_tinggi", () => {
    const findings = [
      makeFinding({ severity: "tinggi" }),
      makeFinding({ category: "kekerasan", severity: "tinggi", start_sec: 20, end_sec: 25 }),
      makeFinding({ category: "misinformasi", severity: "sedang", start_sec: 30, end_sec: 35 }),
    ];
    expect(statusFromScore(computePlatformScore(findings))).toBe("berisiko_tinggi");
  });
});

describe("mergeReports — struktur dasar dan skor platform", () => {
  it("menghasilkan FinalReport valid dengan tepat 3 platform dan 6 status agen", () => {
    const report = mergeReports(sixAgents(), VERSION);
    expect(() => FinalReport.parse(report)).not.toThrow();
    expect(report.platforms).toHaveLength(3);
    expect(report.platforms.map((p) => p.platform)).toEqual(["youtube", "tiktok", "facebook"]);
    expect(report.agent_statuses).toHaveLength(6);
    expect(report.rules_version).toBe(VERSION);
    expect(report.legal_id.disclaimer).toBe(DISCLAIMER);
    expect(report.copyright.risk_level).toBe("rendah");
    expect(report.legal_id.risk_level).toBe("rendah");
    expect(report.fix_checklist).toEqual([]);
  });

  it("menghitung skor dan status platform dari temuan agen platform itu sendiri", () => {
    const results = sixAgents({
      youtube: {
        risk_level: "tinggi",
        findings: [
          makeFinding({ category: "judi", severity: "tinggi" }),
          makeFinding({ category: "kekerasan", severity: "tinggi", start_sec: 20, end_sec: 25 }),
          makeFinding({ category: "misinformasi", severity: "sedang", start_sec: 30, end_sec: 35 }),
        ],
      },
    });
    const report = mergeReports(results, VERSION);
    const youtube = report.platforms.find((p) => p.platform === "youtube");
    expect(youtube?.safety_score).toBe(25);
    expect(youtube?.status).toBe("berisiko_tinggi");
    expect(youtube?.findings).toHaveLength(3);
    const tiktok = report.platforms.find((p) => p.platform === "tiktok");
    expect(tiktok?.safety_score).toBe(100);
    expect(tiktok?.status).toBe("aman");
    expect(tiktok?.findings).toEqual([]);
  });

  it("menetapkan top_risk sebagai kategori temuan paling parah, seri dipecah oleh start_sec paling awal", () => {
    // sedang lebih awal tapi tinggi menang; di antara dua tinggi, start_sec terkecil menang.
    const results = sixAgents({
      tiktok: {
        risk_level: "tinggi",
        findings: [
          makeFinding({ category: "misinformasi", severity: "sedang", start_sec: 1, end_sec: 4 }),
          makeFinding({ category: "judi", severity: "tinggi", start_sec: 20, end_sec: 25 }),
          makeFinding({ category: "kekerasan", severity: "tinggi", start_sec: 8, end_sec: 10 }),
        ],
      },
    });
    const report = mergeReports(results, VERSION);
    const tiktok = report.platforms.find((p) => p.platform === "tiktok");
    expect(tiktok?.top_risk).toBe("kekerasan");
  });

  it("menetapkan top_risk string kosong bila platform tanpa temuan", () => {
    const report = mergeReports(sixAgents(), VERSION);
    for (const platform of report.platforms) {
      expect(platform.top_risk).toBe("");
    }
  });

  it("mengambil copyright dan legal hanya dari agennya masing-masing", () => {
    const copyrightFinding = makeFinding({
      category: "musik_komersial",
      severity: "tinggi",
      fix: "Ganti musik latar dengan audio bebas lisensi sebelum mengunggah.",
    });
    const legalFinding = makeFinding({
      category: "judi_online",
      severity: "sedang",
      start_sec: 40,
      end_sec: 45,
      fix: "Potong segmen promosi judi online sebelum mengunggah.",
    });
    const results = sixAgents({
      copyright: { risk_level: "tinggi", findings: [copyrightFinding] },
      legal_id: { risk_level: "sedang", findings: [legalFinding] },
      youtube: { risk_level: "rendah", findings: [makeFinding({ category: "judi", severity: "rendah" })] },
    });
    const report = mergeReports(results, VERSION);
    expect(report.copyright).toEqual({ risk_level: "tinggi", segments: [copyrightFinding] });
    expect(report.legal_id.risk_level).toBe("sedang");
    expect(report.legal_id.themes).toEqual([legalFinding]);
    expect(report.legal_id.disclaimer).toBe(DISCLAIMER);
  });
});

describe("mergeReports — deduplikasi temuan", () => {
  it("menghilangkan duplikat dalam platform dan menyimpan severity lebih tinggi", () => {
    const weaker = makeFinding({
      category: "judi",
      severity: "rendah",
      evidence: "Pendek.",
      fix: "Perbaikan versi lemah.",
    });
    const stronger = makeFinding({
      category: "judi",
      severity: "tinggi",
      evidence: "Bukti yang sama tetapi lebih lengkap dan panjang.",
      fix: "Perbaikan versi kuat.",
    });
    const results = sixAgents({
      youtube: { risk_level: "tinggi", findings: [weaker, stronger] },
    });
    const report = mergeReports(results, VERSION);
    const youtube = report.platforms.find((p) => p.platform === "youtube");
    expect(youtube?.findings).toHaveLength(1);
    expect(youtube?.findings[0]?.severity).toBe("tinggi");
    expect(youtube?.findings[0]?.evidence).toBe(stronger.evidence);
    // skor memakai temuan hasil dedup saja (satu tinggi), bukan keduanya.
    expect(youtube?.safety_score).toBe(70);
  });

  it("pada severity sama, duplikat dengan evidence lebih panjang yang disimpan", () => {
    const short = makeFinding({ severity: "sedang", evidence: "Singkat.", fix: "Perbaikan singkat." });
    const long = makeFinding({
      severity: "sedang",
      evidence: "Bukti dengan uraian yang jauh lebih panjang dan dapat diperiksa manusia.",
      fix: "Perbaikan panjang.",
    });
    // urutan dibalik: yang panjang datang pertama pun tetap disimpan.
    const results = sixAgents({
      facebook: { risk_level: "sedang", findings: [long, short] },
    });
    const report = mergeReports(results, VERSION);
    const facebook = report.platforms.find((p) => p.platform === "facebook");
    expect(facebook?.findings).toHaveLength(1);
    expect(facebook?.findings[0]?.evidence).toBe(long.evidence);
  });

  it("tidak menggabungkan temuan yang beda evidence_type walau kategori dan rentang sama", () => {
    const results = sixAgents({
      youtube: {
        risk_level: "tinggi",
        findings: [
          makeFinding({ evidence_type: "audio", severity: "tinggi" }),
          makeFinding({ evidence_type: "visual", severity: "tinggi" }),
        ],
      },
    });
    const report = mergeReports(results, VERSION);
    const youtube = report.platforms.find((p) => p.platform === "youtube");
    expect(youtube?.findings).toHaveLength(2);
  });

  it("mendeduplikasi copyright.segments dan legal_id.themes dengan kunci yang sama", () => {
    const dupA = makeFinding({ category: "musik_komersial", severity: "rendah", evidence: "Pendek." });
    const dupB = makeFinding({
      category: "musik_komersial",
      severity: "tinggi",
      evidence: "Bukti musik komersial yang lebih panjang untuk segmen ini.",
    });
    const results = sixAgents({
      copyright: { risk_level: "tinggi", findings: [dupA, dupB] },
      legal_id: { risk_level: "tinggi", findings: [dupA, dupB] },
    });
    const report = mergeReports(results, VERSION);
    expect(report.copyright.segments).toHaveLength(1);
    expect(report.copyright.segments[0]?.severity).toBe("tinggi");
    expect(report.legal_id.themes).toHaveLength(1);
    expect(report.legal_id.themes[0]?.severity).toBe("tinggi");
  });
});

describe("mergeReports — fix_checklist", () => {
  it("mendeduplikasi string fix yang sama menjadi satu entri checklist", () => {
    const sharedFix = "Potong segmen promosi judi pada 00:05-00:12 sebelum mengunggah.";
    const results = sixAgents({
      youtube: {
        risk_level: "tinggi",
        findings: [makeFinding({ severity: "tinggi", fix: sharedFix })],
      },
      tiktok: {
        risk_level: "tinggi",
        findings: [
          makeFinding({ severity: "tinggi", start_sec: 5, end_sec: 12, category: "judi", fix: sharedFix }),
        ],
      },
      copyright: {
        risk_level: "sedang",
        findings: [makeFinding({ category: "musik_komersial", severity: "sedang", start_sec: 0, end_sec: 45, fix: sharedFix })],
      },
    });
    const report = mergeReports(results, VERSION);
    expect(report.fix_checklist.filter((f) => f === sharedFix)).toHaveLength(1);
  });

  it("mengurutkan checklist tinggi dulu, lalu sedang, lalu rendah, stabil dalam severity sama", () => {
    const fixLow = "Perbaikan risiko rendah.";
    const fixHighA = "Perbaikan tinggi pertama.";
    const fixMid = "Perbaikan risiko sedang.";
    const fixHighB = "Perbaikan tinggi kedua.";
    const results = sixAgents({
      youtube: {
        risk_level: "tinggi",
        findings: [
          makeFinding({ category: "misinformasi", severity: "rendah", start_sec: 1, end_sec: 2, fix: fixLow }),
          makeFinding({ category: "judi", severity: "tinggi", start_sec: 5, end_sec: 12, fix: fixHighA }),
        ],
      },
      tiktok: {
        risk_level: "tinggi",
        findings: [
          makeFinding({ category: "kekerasan", severity: "sedang", start_sec: 13, end_sec: 15, fix: fixMid }),
          makeFinding({ category: "perilaku_berbahaya", severity: "tinggi", start_sec: 16, end_sec: 18, fix: fixHighB }),
        ],
      },
    });
    const report = mergeReports(results, VERSION);
    // tinggi dulu (urutan kemunculan dipertahankan), baru sedang, baru rendah.
    expect(report.fix_checklist).toEqual([fixHighA, fixHighB, fixMid, fixLow]);
  });

  it("mengumpulkan fix dari keenam agen, termasuk packaging_privacy", () => {
    const packagingFix = "Blur plat nomor pada keyframe sekitar 00:18 sebelum mengunggah.";
    const results = sixAgents({
      packaging_privacy: {
        risk_level: "sedang",
        findings: [
          makeFinding({
            category: "privasi_data_pribadi",
            severity: "sedang",
            evidence_type: "visual",
            start_sec: 18,
            end_sec: 18,
            fix: packagingFix,
          }),
        ],
      },
    });
    const report = mergeReports(results, VERSION);
    expect(report.fix_checklist).toContain(packagingFix);
    // temuan packaging tidak bocor ke platform/copyright/legal.
    expect(report.platforms.every((p) => p.findings.length === 0)).toBe(true);
    expect(report.copyright.segments).toEqual([]);
    expect(report.legal_id.themes).toEqual([]);
  });
});

describe("mergeReports — agen gagal dan masukan parsial", () => {
  it("satu agen gagal tetap menghasilkan FinalReport lengkap dengan 6 agent_statuses", () => {
    const results = sixAgents({
      packaging_privacy: { status: "gagal", risk_level: "rendah", findings: [], error: "waktu habis" },
      youtube: {
        risk_level: "sedang",
        findings: [makeFinding({ severity: "sedang", fix: "Perbaiki klaim pada segmen ini." })],
      },
    });
    const report = mergeReports(results, VERSION);
    expect(() => FinalReport.parse(report)).not.toThrow();
    expect(report.platforms).toHaveLength(3);
    expect(report.agent_statuses).toHaveLength(6);
    expect(report.agent_statuses).toContainEqual({ agent: "packaging_privacy", status: "gagal" });
    expect(report.agent_statuses.filter((s) => s.status === "selesai")).toHaveLength(5);
    // checklist tetap berisi perbaikan dari agen yang selesai.
    expect(report.fix_checklist).toContain("Perbaiki klaim pada segmen ini.");
  });

  it("agen platform gagal memberi findings kosong dan skor dari temuan kosong, status tercatat jujur", () => {
    const results = sixAgents({
      tiktok: { status: "batas_waktu", risk_level: "rendah", findings: [], error: "batas waktu" },
    });
    const report = mergeReports(results, VERSION);
    const tiktok = report.platforms.find((p) => p.platform === "tiktok");
    expect(tiktok?.findings).toEqual([]);
    expect(tiktok?.safety_score).toBe(100);
    expect(tiktok?.status).toBe("aman");
    expect(tiktok?.top_risk).toBe("");
    expect(report.agent_statuses).toContainEqual({ agent: "tiktok", status: "batas_waktu" });
    // rekomendasi wajib menandai pemeriksaan belum lengkap, bukan menyatakan siap.
    const lower = report.overall_recommendation.toLowerCase();
    expect(lower).toContain("did not finish");
    expect(lower).toContain("tiktok");
  });

  it("temuan milik agen gagal tidak ikut dihitung di mana pun", () => {
    const strayFinding = makeFinding({ severity: "tinggi", fix: "Perbaikan dari agen gagal." });
    const results = sixAgents({
      youtube: { status: "gagal", risk_level: "tinggi", findings: [strayFinding], error: "gagal" },
      copyright: { status: "gagal", risk_level: "tinggi", findings: [strayFinding], error: "gagal" },
    });
    const report = mergeReports(results, VERSION);
    const youtube = report.platforms.find((p) => p.platform === "youtube");
    expect(youtube?.findings).toEqual([]);
    expect(youtube?.safety_score).toBe(100);
    expect(report.copyright.segments).toEqual([]);
    expect(report.fix_checklist).not.toContain("Perbaikan dari agen gagal.");
  });

  it("agen yang hilang dari masukan diperlakukan gagal tanpa melempar", () => {
    const partial = sixAgents().filter((r) => r.agent !== "facebook" && r.agent !== "legal_id");
    let report: ReturnType<typeof mergeReports> | undefined;
    expect(() => {
      report = mergeReports(partial, VERSION);
    }).not.toThrow();
    expect(() => FinalReport.parse(report)).not.toThrow();
    expect(report!.platforms).toHaveLength(3);
    const facebook = report!.platforms.find((p) => p.platform === "facebook");
    expect(facebook?.findings).toEqual([]);
    expect(facebook?.safety_score).toBe(100);
    expect(report!.agent_statuses).toHaveLength(6);
    expect(report!.agent_statuses).toContainEqual({ agent: "facebook", status: "gagal" });
    expect(report!.agent_statuses).toContainEqual({ agent: "legal_id", status: "gagal" });
    expect(report!.legal_id.risk_level).toBe("rendah");
    expect(report!.legal_id.themes).toEqual([]);
    expect(report!.legal_id.disclaimer).toBe(DISCLAIMER);
    expect(report!.overall_recommendation.toLowerCase()).toContain("did not finish");
  });

  it("masukan kosong sama sekali tetap menghasilkan laporan lengkap tanpa melempar", () => {
    let report: ReturnType<typeof mergeReports> | undefined;
    expect(() => {
      report = mergeReports([], VERSION);
    }).not.toThrow();
    expect(() => FinalReport.parse(report)).not.toThrow();
    expect(report!.platforms).toHaveLength(3);
    expect(report!.platforms.every((p) => p.safety_score === 100 && p.findings.length === 0)).toBe(true);
    expect(report!.agent_statuses).toHaveLength(6);
    expect(report!.agent_statuses.every((s) => s.status === "gagal")).toBe(true);
    expect(report!.fix_checklist).toEqual([]);
    expect(report!.overall_recommendation.toLowerCase()).toContain("did not finish");
  });
});

describe("mergeReports — overall_recommendation", () => {
  it("platform berisiko_tinggi menyarankan jangan terbitkan dulu dan menyebut domain terburuk", () => {
    const results = sixAgents({
      tiktok: {
        risk_level: "tinggi",
        findings: [
          makeFinding({ severity: "tinggi" }),
          makeFinding({ category: "kekerasan", severity: "tinggi", start_sec: 20, end_sec: 25 }),
          makeFinding({ category: "misinformasi", severity: "sedang", start_sec: 30, end_sec: 35 }),
        ],
      },
    });
    const report = mergeReports(results, VERSION);
    const lower = report.overall_recommendation.toLowerCase();
    expect(lower).toContain("do not publish yet");
    expect(lower).toContain("tiktok");
    expect(report.overall_recommendation.endsWith(".")).toBe(true);
  });

  it("risiko copyright tinggi menyarankan jangan terbitkan dulu dan menyebut copyright", () => {
    const results = sixAgents({
      copyright: {
        risk_level: "tinggi",
        findings: [makeFinding({ category: "musik_komersial", severity: "tinggi" })],
      },
    });
    const report = mergeReports(results, VERSION);
    const lower = report.overall_recommendation.toLowerCase();
    expect(lower).toContain("do not publish yet");
    expect(lower).toContain("copyright");
  });

  it("risiko hukum tinggi menyarankan jangan terbitkan dulu dan menyebut hukum", () => {
    const results = sixAgents({
      legal_id: {
        risk_level: "tinggi",
        findings: [makeFinding({ category: "judi_online", severity: "tinggi" })],
      },
    });
    const report = mergeReports(results, VERSION);
    const lower = report.overall_recommendation.toLowerCase();
    expect(lower).toContain("do not publish yet");
    expect(lower).toMatch(/legal/);
  });

  it("temuan tanpa risiko tinggi memakai rumusan terbitkan setelah perbaikan", () => {
    const results = sixAgents({
      youtube: {
        risk_level: "sedang",
        findings: [makeFinding({ severity: "rendah", fix: "Perjelas caption sebelum mengunggah." })],
      },
    });
    const report = mergeReports(results, VERSION);
    const lower = report.overall_recommendation.toLowerCase();
    expect(lower).toContain("publish after fixes");
    expect(lower).not.toContain("do not publish yet");
  });

  it("tanpa temuan memakai rumusan tanpa janji lolos", () => {
    const report = mergeReports(sixAgents(), VERSION);
    const lower = report.overall_recommendation.toLowerCase();
    expect(lower).toContain("no prominent risk found in this screening");
    expect(lower).not.toContain("pasti");
  });

  it("menyebut agen gagal pada cabang jangan terbitkan dulu juga", () => {
    const results = sixAgents({
      tiktok: {
        risk_level: "tinggi",
        findings: [
          makeFinding({ severity: "tinggi" }),
          makeFinding({ category: "kekerasan", severity: "tinggi", start_sec: 20, end_sec: 25 }),
          makeFinding({ category: "misinformasi", severity: "tinggi", start_sec: 30, end_sec: 35 }),
        ],
      },
      copyright: { status: "gagal", risk_level: "rendah", findings: [], error: "gagal" },
    });
    const report = mergeReports(results, VERSION);
    const lower = report.overall_recommendation.toLowerCase();
    expect(lower).toContain("do not publish yet");
    expect(lower).toContain("did not finish");
    expect(lower).toContain("copyright");
  });

  it("tidak pernah memakai bahasa kepastian terlarang di semua cabang", () => {
    const scenarios: AgentResult[][] = [
      sixAgents(),
      sixAgents({
        youtube: { risk_level: "sedang", findings: [makeFinding({ severity: "sedang" })] },
      }),
      sixAgents({
        legal_id: { risk_level: "tinggi", findings: [makeFinding({ severity: "tinggi" })] },
      }),
      sixAgents({
        facebook: { status: "gagal", findings: [], error: "gagal" },
      }),
    ];
    const forbidden = [
      ["pasti", "bebas"].join(" "),
      ["pasti", "melanggar"].join(" "),
      ["aman", "secara", "hukum"].join(" "),
      ["pasti", "lolos"].join(" "),
    ];
    for (const results of scenarios) {
      const lower = mergeReports(results, VERSION).overall_recommendation.toLowerCase();
      for (const phrase of forbidden) {
        expect(lower).not.toContain(phrase);
      }
    }
  });

  it("rekomendasi selalu satu kalimat", () => {
    const scenarios: AgentResult[][] = [
      sixAgents(),
      sixAgents({
        youtube: { risk_level: "sedang", findings: [makeFinding({ severity: "sedang" })] },
      }),
      sixAgents({
        tiktok: {
          risk_level: "tinggi",
          findings: [
            makeFinding({ severity: "tinggi" }),
            makeFinding({ category: "kekerasan", severity: "tinggi", start_sec: 20, end_sec: 25 }),
            makeFinding({ category: "misinformasi", severity: "tinggi", start_sec: 30, end_sec: 35 }),
          ],
        },
        copyright: { status: "gagal", findings: [], error: "gagal" },
      }),
    ];
    for (const results of scenarios) {
      const recommendation = mergeReports(results, VERSION).overall_recommendation;
      // tepat satu titik, di akhir kalimat.
      expect(recommendation.match(/\./g)).toHaveLength(1);
      expect(recommendation.endsWith(".")).toBe(true);
    }
  });
});
