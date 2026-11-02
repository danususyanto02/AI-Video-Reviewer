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
          { className: "mt-3 rounded-xl bg-slate-50 px-4 py-4 text-center" },
          h(
            "span",
            {
              className:
                "mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-base font-bold text-emerald-700",
              "aria-hidden": true,
            },
            "✓",
          ),
          h("p", { className: "mt-2 text-sm text-slate-600" }, "No findings in this section."),
        )
      : h(
          "ul",
          {
            className:
              findings.length > 1
                ? "mt-3 grid gap-3 sm:grid-cols-2 xl:max-h-[460px] xl:overflow-y-auto xl:pr-1"
                : "mt-3 space-y-3 xl:max-h-[460px] xl:overflow-y-auto xl:pr-1",
          },
          ...findings.map((finding, index) => h(FindingRow, { key: index, finding, index })),
        );

  return h(
    "article",
    {
      "data-testid": "risk-card",
      className: "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm",
    },
    h(
      "div",
      { className: "flex flex-wrap items-start justify-between gap-3" },
      h(
        "div",
        null,
        h("h3", { className: "text-base font-bold text-slate-900" }, props.title),
        props.subtitle
          ? h("p", { className: "mt-0.5 text-xs leading-5 text-slate-500" }, props.subtitle)
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
