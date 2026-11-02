import { createElement as h } from "react";
import type { Finding, RiskLevel } from "../lib/contracts/schemas";
import { FindingRow } from "./FindingRow";

const RISK_LABELS: Record<string, string> = {
  rendah: "Low",
  sedang: "Medium",
  tinggi: "High",
};

const RISK_CLASSES: Record<string, string> = {
  rendah: "bg-slate-100 text-slate-600",
  sedang: "bg-amber-100 text-amber-800",
  tinggi: "bg-red-100 text-red-700",
};

export type RiskCardProps = {
  title: string;
  subtitle?: string;
  riskLevel?: RiskLevel | string;
  risk_level?: RiskLevel | string;
  findings?: Finding[];
  segments?: Finding[];
  themes?: Finding[];
  items?: Finding[];
};

export function RiskCard(props: RiskCardProps) {
  const riskLevel = props.riskLevel ?? props.risk_level ?? "";
  const findings = props.findings ?? props.segments ?? props.themes ?? props.items ?? [];

  const findingsNode =
    findings.length === 0
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
          h("p", { className: "mt-2.5 text-sm text-slate-600" }, "No findings in this section."),
        )
      : h(
          "ul",
          { className: "mt-4 grid gap-3 xl:grid-cols-2" },
          ...findings.map((finding, index) => h(FindingRow, { key: index, finding, index })),
        );

  return h(
    "article",
    {
      "data-testid": "risk-card",
      className: "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6",
    },
    h(
      "div",
      { className: "flex flex-wrap items-start justify-between gap-3" },
      h(
        "div",
        null,
        h("h3", { className: "text-lg font-bold text-slate-900" }, props.title),
        props.subtitle
          ? h("p", { className: "mt-0.5 text-sm text-slate-500" }, props.subtitle)
          : null,
      ),
      h(
        "p",
        { className: "flex items-center gap-2 text-sm" },
        h("span", { className: "font-medium text-slate-500" }, "Risk level"),
        h(
          "span",
          {
            className: `rounded-full px-2.5 py-0.5 text-xs font-semibold ${RISK_CLASSES[riskLevel] ?? RISK_CLASSES.rendah}`,
          },
          RISK_LABELS[riskLevel] ?? riskLevel,
        ),
      ),
    ),
    findingsNode,
  );
}

export default RiskCard;
