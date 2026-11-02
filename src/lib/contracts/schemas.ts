import { z } from "zod";

export const DISCLAIMER =
  "Initial screening, not a platform decision, not Content ID, and not legal advice." as const;

export const PLATFORM_CATEGORIES = [
  "kekerasan",
  "seksual",
  "ujaran_kebencian",
  "perundungan",
  "keselamatan_anak",
  "perilaku_berbahaya",
  "narkoba_alkohol_senjata",
  "judi",
  "misinformasi",
  "spam_clickbait_reupload",
  "grafis_medis",
  "privasi_data_pribadi",
] as const;

export const KEYFRAME_KINDS = [
  "logo",
  "watermark",
  "license_plate",
  "document",
  "child",
  "sensitive_object",
  "third_party_clip",
  "other",
] as const;

export const Severity = z.enum(["rendah", "sedang", "tinggi"]);
export type Severity = z.infer<typeof Severity>;

export const RiskLevel = Severity;
export type RiskLevel = z.infer<typeof RiskLevel>;

export const AgentStatus = z.enum(["selesai", "gagal", "batas_waktu"]);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const PlatformStatus = z.enum(["aman", "perlu_perbaikan", "berisiko_tinggi"]);
export type PlatformStatus = z.infer<typeof PlatformStatus>;

export const EvidenceType = z.enum([
  "visual",
  "audio",
  "text_on_screen",
  "title",
  "caption",
  "thumbnail",
]);
export type EvidenceType = z.infer<typeof EvidenceType>;

export const Platform = z.enum(["youtube", "tiktok", "facebook"]);
export type Platform = z.infer<typeof Platform>;

export const AgentName = z.enum([
  "youtube",
  "tiktok",
  "facebook",
  "copyright",
  "legal_id",
  "packaging_privacy",
]);
export type AgentName = z.infer<typeof AgentName>;

export const AgentProgressState = z.enum(["queued", "running", "done", "failed", "timeout"]);
export type AgentProgressState = z.infer<typeof AgentProgressState>;

export const PlatformCategory = z.enum([...PLATFORM_CATEGORIES]);
export type PlatformCategory = z.infer<typeof PlatformCategory>;

export const KeyframeKind = z.enum([...KEYFRAME_KINDS]);
export type KeyframeKind = z.infer<typeof KeyframeKind>;

export const KeyframeBox = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});
export type KeyframeBox = z.infer<typeof KeyframeBox>;

export const TranscriptSegment = z
  .object({
    start_sec: z.number().min(0),
    end_sec: z.number().min(0),
    text: z.string().min(1),
  })
  .refine((v) => v.end_sec >= v.start_sec, {
    message: "end_sec must be greater than or equal to start_sec",
  });
export type TranscriptSegment = z.infer<typeof TranscriptSegment>;

export const SceneSegment = z
  .object({
    start_sec: z.number().min(0),
    end_sec: z.number().min(0),
    description: z.string().min(1),
  })
  .refine((v) => v.end_sec >= v.start_sec, {
    message: "end_sec must be greater than or equal to start_sec",
  });
export type SceneSegment = z.infer<typeof SceneSegment>;

export const KeyframeFinding = z.object({
  at_sec: z.number().min(0),
  kind: KeyframeKind,
  description: z.string().min(1),
  box: KeyframeBox.optional(),
});
export type KeyframeFinding = z.infer<typeof KeyframeFinding>;

export const ReviewInput = z.object({
  video_ref: z.string().min(1),
  title: z.string(),
  caption: z.string(),
  thumbnail_ref: z.string().min(1),
  extra_context: z.string(),
  platforms: z
    .array(Platform)
    .length(3)
    .refine((v) => new Set(v).size === 3, {
      message: "platforms must contain youtube, tiktok, and facebook exactly once",
    }),
});
export type ReviewInput = z.infer<typeof ReviewInput>;

export const EvidenceBundle = z.object({
  duration_sec: z.number().min(0),
  transcript: z.array(TranscriptSegment),
  scenes: z.array(SceneSegment),
  keyframe_findings: z.array(KeyframeFinding),
  thumbnail_finding: z.string(),
  title: z.string(),
  caption: z.string(),
  extra_context: z.string(),
});
export type EvidenceBundle = z.infer<typeof EvidenceBundle>;

// Finding.category stays an open non-empty string on purpose: the frozen
// contract allows the 12 platform slugs plus copyright themes and Indonesian
// legal themes, so no single closed enum can validate it.
export const Finding = z
  .object({
    start_sec: z.number().min(0),
    end_sec: z.number().min(0),
    evidence_type: EvidenceType,
    evidence: z.string().min(1),
    category: z.string().min(1),
    severity: Severity,
    impact: z.string().min(1),
    fix: z.string().min(1),
  })
  .refine((v) => v.end_sec >= v.start_sec, {
    message: "end_sec must be greater than or equal to start_sec",
  });
export type Finding = z.infer<typeof Finding>;

export const AgentResult = z.object({
  agent: AgentName,
  status: AgentStatus,
  risk_level: RiskLevel,
  findings: z.array(Finding),
  error: z.string().nullable().default(null),
});
export type AgentResult = z.infer<typeof AgentResult>;

export const PlatformReport = z.object({
  platform: Platform,
  safety_score: z.number().min(0).max(100),
  status: PlatformStatus,
  top_risk: z.string(),
  findings: z.array(Finding),
});
export type PlatformReport = z.infer<typeof PlatformReport>;

export const AgentProgress = z.object({
  agent: AgentName,
  state: AgentProgressState,
});
export type AgentProgress = z.infer<typeof AgentProgress>;

export const FinalReport = z.object({
  overall_recommendation: z.string().min(1),
  platforms: z.array(PlatformReport).length(3),
  copyright: z.object({
    risk_level: RiskLevel,
    segments: z.array(Finding),
  }),
  legal_id: z.object({
    risk_level: RiskLevel,
    themes: z.array(Finding),
    disclaimer: z.literal(DISCLAIMER),
  }),
  fix_checklist: z.array(z.string().min(1)),
  rules_version: z.string().min(1),
  agent_statuses: z
    .array(
      z.object({
        agent: AgentName,
        status: AgentStatus,
      }),
    )
    .length(6),
});
export type FinalReport = z.infer<typeof FinalReport>;

export const RuleFile = z.object({
  version: z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d+$/, "version must use YYYY-MM-DD.N"),
  updated_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "updated_at must use YYYY-MM-DD"),
  source: z.string().min(1),
  rules: z.array(
    z.object({
      id: z.string().min(1),
      category: z.string().min(1),
      guidance: z.string().min(1),
      consequence: z.string().min(1).optional(),
      perlu_verifikasi: z.boolean().optional(),
    }),
  ),
});
export type RuleFile = z.infer<typeof RuleFile>;
