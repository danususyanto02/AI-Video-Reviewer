import { DISCLAIMER } from "./schemas";
import type { EvidenceBundle, FinalReport } from "./schemas";

export const mockEvidenceBundle: EvidenceBundle = {
  duration_sec: 45,
  transcript: [
    {
      start_sec: 5,
      end_sec: 12,
      text: "Sign up now at a trusted toto site, pulsa deposit with no fees, 100 percent new member bonus!",
    },
  ],
  scenes: [
    {
      start_sec: 0,
      end_sec: 45,
      description:
        "A commercial pop song plays loudly through the whole video with no commentary, reaction, or meaningful transformation.",
    },
  ],
  keyframe_findings: [
    {
      at_sec: 18,
      kind: "license_plate",
      description: "A vehicle license plate is clearly visible with no blur in a street scene.",
      box: { x: 0.42, y: 0.61, w: 0.18, h: 0.09 },
    },
  ],
  thumbnail_finding:
    "The thumbnail shows big get-rich-quick claim text and a shocked expression.",
  title: "Fast Money from Home, One Click Is All It Takes!",
  caption:
    "The sign-up link is in the comments. 100 percent new member bonus for registrations today.",
  extra_context: "",
};

export const emptyEvidenceBundle: EvidenceBundle = {
  duration_sec: 0,
  transcript: [],
  scenes: [],
  keyframe_findings: [],
  thumbnail_finding: "",
  title: "",
  caption: "",
  extra_context: "",
};

export const mockFinalReport: FinalReport = {
  overall_recommendation:
    "Do not publish yet: cut the gambling promo segment, replace the background music, and blur the license plate before uploading.",
  platforms: [
    {
      platform: "youtube",
      safety_score: 55,
      status: "perlu_perbaikan",
      top_risk: "Gambling promotion risks limited monetization and reduced reach for this video.",
      findings: [
        {
          start_sec: 5,
          end_sec: 12,
          evidence_type: "audio",
          evidence:
            "Sign up now at a trusted toto site, pulsa deposit with no fees, 100 percent new member bonus!",
          category: "judi",
          severity: "sedang",
          impact:
            "May trigger limited ads or monetization restrictions on this platform.",
          fix: "Cut the gambling promo segment at 00:05-00:12 before uploading.",
        },
      ],
    },
    {
      platform: "tiktok",
      safety_score: 25,
      status: "berisiko_tinggi",
      top_risk: "Gambling promotion risks making this video ineligible for recommendation.",
      findings: [
        {
          start_sec: 5,
          end_sec: 12,
          evidence_type: "audio",
          evidence:
            "Sign up now at a trusted toto site, pulsa deposit with no fees, 100 percent new member bonus!",
          category: "judi",
          severity: "tinggi",
          impact:
            "May make the video ineligible for For You recommendation and risks account restrictions.",
          fix: "Cut the gambling promo segment at 00:05-00:12 before uploading.",
        },
        {
          start_sec: 18,
          end_sec: 18,
          evidence_type: "visual",
          evidence: "A vehicle license plate is clearly visible with no blur in a street scene.",
          category: "privasi_data_pribadi",
          severity: "sedang",
          impact: "May expose the vehicle owner's personal data to viewers.",
          fix: "Blur the license plate in the keyframe around 00:18 before uploading.",
        },
      ],
    },
    {
      platform: "facebook",
      safety_score: 70,
      status: "perlu_perbaikan",
      top_risk: "Commercial music with no transformation risks limited distribution.",
      findings: [
        {
          start_sec: 0,
          end_sec: 45,
          evidence_type: "audio",
          evidence:
            "A commercial pop song plays loudly through the whole video with no commentary, reaction, or meaningful transformation.",
          category: "spam_clickbait_reupload",
          severity: "rendah",
          impact:
            "May limit distribution if the platform judges the material unoriginal.",
          fix: "Replace the background music with royalty-free audio or add meaningful commentary.",
        },
      ],
    },
  ],
  copyright: {
    risk_level: "tinggi",
    segments: [
      {
        start_sec: 0,
        end_sec: 45,
        evidence_type: "audio",
        evidence:
          "A commercial pop song plays loudly through the whole video with no commentary, reaction, or meaningful transformation.",
        category: "musik_komersial",
        severity: "tinggi",
        impact:
          "May trigger a possible claim from the rights holder of the recording heard here.",
        fix: "Replace the background music with royalty-free audio before uploading.",
      },
    ],
  },
  legal_id: {
    risk_level: "tinggi",
    themes: [
      {
        start_sec: 5,
        end_sec: 12,
        evidence_type: "audio",
        evidence:
          "Sign up now at a trusted toto site, pulsa deposit with no fees, 100 percent new member bonus!",
        category: "judi_online",
        severity: "tinggi",
        impact:
          "May relate to the online gambling promotion theme in this Indonesian legal theme screening.",
        fix: "Cut the gambling promo segment at 00:05-00:12 before uploading.",
      },
    ],
    disclaimer: DISCLAIMER,
  },
  fix_checklist: [
    "Cut the gambling promo segment at 00:05-00:12 before uploading.",
    "Replace the background music with royalty-free audio before uploading.",
    "Blur the license plate in the keyframe around 00:18 before uploading.",
  ],
  rules_version: "2026-10-30.1",
  agent_statuses: [
    { agent: "youtube", status: "selesai" },
    { agent: "tiktok", status: "selesai" },
    { agent: "facebook", status: "selesai" },
    { agent: "copyright", status: "selesai" },
    { agent: "legal_id", status: "selesai" },
    { agent: "packaging_privacy", status: "gagal" },
  ],
};
