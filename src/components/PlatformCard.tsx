import { createElement as h } from "react";
import type { PlatformReport } from "../lib/contracts/schemas";
import { FindingRow } from "./FindingRow";

export type PlatformCardProps = Partial<PlatformReport> & {
  report?: PlatformReport;
  platformReport?: PlatformReport;
  platformData?: PlatformReport;
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  facebook: "Facebook",
};

const PLATFORM_SUBTITLES: Record<string, string> = {
  youtube: "Community Guidelines and advertiser-friendly checks",
  tiktok: "Community Guidelines and branded content checks",
  facebook: "Community Standards and misleading content checks",
};

const STATUS_LABELS: Record<string, string> = {
  aman: "Safe",
  perlu_perbaikan: "Needs fixes",
  berisiko_tinggi: "High risk",
};

const STATUS_CLASSES: Record<string, string> = {
  aman: "bg-emerald-50 text-emerald-700",
  perlu_perbaikan: "bg-amber-100 text-amber-800",
  berisiko_tinggi: "bg-red-50 text-red-700",
};

function resolveReport(props: PlatformCardProps): PlatformReport | null {
  if (props.report) return props.report;
  if (props.platformReport) return props.platformReport;
  if (props.platformData) return props.platformData;
  if (props.platform && typeof props.platform === "object") {
    return props.platform as unknown as PlatformReport;
  }
  if (
    typeof props.platform === "string" &&
    typeof props.safety_score === "number" &&
    typeof props.status === "string" &&
    typeof props.top_risk === "string" &&
    Array.isArray(props.findings)
  ) {
    return {
      platform: props.platform,
      safety_score: props.safety_score,
      status: props.status,
      top_risk: props.top_risk,
      findings: props.findings,
    } as PlatformReport;
  }
  return null;
}

export function PlatformCard(props: PlatformCardProps) {
  const report = resolveReport(props);
  if (!report) return null;
  const label = PLATFORM_LABELS[report.platform] ?? report.platform;
  const findingsCount = report.findings.length;

  const findingsNode =
    report.findings.length === 0
      ? h(
          "div",
          { className: "mt-4 rounded-xl bg-slate-50 px-4 py-7 text-center" },
          h(
            "span",
            {
              className:
                "mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-base font-bold text-emerald-700",
              "aria-hidden": true,
            },
            "✓",
          ),
          h("p", { className: "mt-2.5 text-sm text-slate-600" }, "No findings on this platform."),
        )
      : h(
          "ul",
          { className: "mt-4 grid gap-3 xl:grid-cols-2" },
          ...report.findings.map((finding, index) => h(FindingRow, { key: index, finding, index })),
        );

  return h(
    "article",
    {
      "data-testid": "platform-card",
      "data-platform": report.platform,
      className: "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6",
    },
    h(
      "div",
      { className: "flex flex-wrap items-start justify-between gap-3" },
      h(
        "div",
        null,
        h("h3", { className: "text-lg font-bold text-slate-900" }, label),
        h(
          "p",
          { className: "mt-0.5 text-sm text-slate-500" },
          PLATFORM_SUBTITLES[report.platform] ?? report.platform,
        ),
      ),
      h(
        "div",
        { className: "text-right" },
        h(
          "p",
          { className: "flex items-baseline justify-end gap-2" },
          h("span", { className: "text-3xl font-bold text-slate-900" }, report.safety_score),
          h("span", { className: "text-sm font-medium text-slate-400" }, "/ 100"),
          h(
            "span",
            { className: "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600" },
            findingsCount === 0
              ? "No issues"
              : findingsCount === 1
                ? "1 finding"
                : `${findingsCount} findings`,
          ),
        ),
        h(
          "div",
          { className: "mt-2 h-1.5 w-44 rounded-full bg-slate-100", "aria-hidden": true },
          h("div", {
            className: "h-1.5 rounded-full bg-blue-600",
            style: { width: `${Math.min(100, Math.max(0, report.safety_score))}%` },
          }),
        ),
      ),
    ),
    h(
      "div",
      { className: "mt-4 flex flex-wrap items-center gap-x-6 gap-y-2" },
      h(
        "p",
        { className: "flex items-center gap-2 text-sm" },
        h("span", { className: "font-medium text-slate-500" }, "Status"),
        h(
          "span",
          {
            className: `rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASSES[report.status] ?? STATUS_CLASSES.aman}`,
          },
          STATUS_LABELS[report.status] ?? report.status,
        ),
      ),
      h(
        "p",
        { className: "text-sm" },
        h("span", { className: "font-medium text-slate-500" }, "Top risk: "),
        h("span", { className: "text-slate-700" }, report.top_risk),
      ),
    ),
    findingsNode,
  );
}

export default PlatformCard;
