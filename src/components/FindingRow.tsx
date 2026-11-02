import { createElement as h } from "react";
import type { Finding } from "../lib/contracts/schemas";

const SEVERITY_LABELS: Record<string, string> = {
  rendah: "Low",
  sedang: "Medium",
  tinggi: "High",
};

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
    { key, className: "rounded-xl border border-slate-200 bg-white p-4" },
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
      h("span", { className: "text-sm font-semibold text-slate-900" }, finding.category),
      h(
        "span",
        {
          "data-testid": "finding-range",
          className: "ml-auto rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600",
        },
        rangeLabel(finding),
      ),
    ),
    h("p", { className: "mt-2 text-sm leading-6 text-slate-700" }, finding.impact),
    h(
      "p",
      { className: "mt-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600" },
      h("span", { className: "font-medium text-slate-500" }, "Evidence: "),
      finding.evidence,
    ),
    h(
      "p",
      { className: "mt-2.5 text-sm leading-6 text-slate-700" },
      h("span", { className: "font-semibold text-slate-900" }, "Fix: "),
      finding.fix,
    ),
  );
}

export default FindingRow;
