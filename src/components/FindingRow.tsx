import { createElement as h } from "react";
import type { Finding } from "../lib/contracts/schemas";

const SEVERITY_LABELS: Record<string, string> = {
  rendah: "Low",
  sedang: "Medium",
  tinggi: "High",
};

// Category values in the data are stable machine codes (frozen contract).
// The UI shows a human label; the code stays visible in small print so a
// finding can always be traced back to the rule data it came from.
const CATEGORY_LABELS: Record<string, string> = {
  endorsement_tanpa_pengungkapan: "Undisclosed endorsement",
  grafis_medis: "Medical graphic content",
  hoaks: "Hoax",
  judi: "Gambling",
  judi_online: "Online gambling",
  kekerasan: "Violence",
  keselamatan_anak: "Child safety",
  kesusilaan_pornografi: "Decency and pornography",
  klaim_menyesatkan_produk_investasi: "Misleading product or investment claims",
  klip_pihak_ketiga: "Third-party clip",
  logo_merek_dominan: "Dominant brand logo",
  misinformasi: "Misinformation",
  musik_komersial: "Commercial music",
  narkoba_alkohol_senjata: "Drugs, alcohol, and weapons",
  pencemaran_nama_baik: "Defamation",
  perilaku_berbahaya: "Dangerous behavior",
  perundungan: "Bullying",
  privasi_data_pribadi: "Privacy and personal data",
  provokasi_kekerasan_terorisme: "Incitement to violence and terrorism",
  reupload_tanpa_transformasi: "Reupload without transformation",
  seksual: "Sexual content",
  spam_clickbait_reupload: "Spam, clickbait, and reupload",
  stok_berlisensi: "Licensed stock material",
  teks_lirik_berhak_cipta: "Copyrighted lyrics or text",
  ujaran_kebencian: "Hate speech",
  ujaran_kebencian_sara: "Hate speech (SARA)",
  watermark_platform_lain: "Another platform's watermark",
};

function categoryLabel(category: string): string {
  const known = CATEGORY_LABELS[category];
  if (known) return known;
  const spaced = category.replace(/_/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : category;
}

const SEVERITY_CLASSES: Record<string, string> = {
  rendah: "bg-slate-100 text-slate-600",
  sedang: "bg-amber-100 text-amber-800",
  tinggi: "bg-red-100 text-red-700",
};

function formatClock(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function rangeLabel(finding: Finding): string {
  if (finding.start_sec === 0 && finding.end_sec === 0) {
    return finding.evidence_type;
  }
  return `${formatClock(finding.start_sec)}-${formatClock(finding.end_sec)}`;
}

export function FindingRow({ finding, index }: { finding: Finding; index: number }) {
  const key = `${finding.category}-${finding.start_sec}-${finding.end_sec}-${index}`;
  return h(
    "li",
    { key, className: "rounded-xl border border-slate-200 bg-white p-3" },
    h(
      "div",
      { className: "flex flex-wrap items-center gap-x-2.5 gap-y-1.5" },
      h(
        "span",
        {
          className: `rounded-md px-2 py-0.5 text-xs font-semibold ${SEVERITY_CLASSES[finding.severity] ?? SEVERITY_CLASSES.rendah}`,
        },
        SEVERITY_LABELS[finding.severity] ?? finding.severity,
      ),
      h(
        "span",
        { className: "min-w-0" },
        h("span", { className: "block truncate text-sm font-semibold text-slate-900" }, categoryLabel(finding.category)),
        h("span", { className: "block font-mono text-[11px] text-slate-400" }, finding.category),
      ),
      h(
        "span",
        {
          "data-testid": "finding-range",
          className: "ml-auto rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600",
        },
        rangeLabel(finding),
      ),
    ),
    h("p", { className: "mt-2 text-[13px] leading-5 text-slate-700" }, finding.impact),
    h(
      "p",
      { className: "mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[13px] leading-5 text-slate-600" },
      h("span", { className: "font-medium text-slate-500" }, "Evidence: "),
      finding.evidence,
    ),
    h(
      "p",
      { className: "mt-2 text-[13px] leading-5 text-slate-700" },
      h("span", { className: "font-semibold text-slate-900" }, "Fix: "),
      finding.fix,
    ),
  );
}

export default FindingRow;
