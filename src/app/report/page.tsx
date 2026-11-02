"use client";

import { createElement as h, use, useEffect, useState } from "react";
import { mockFinalReport } from "../../lib/contracts/fixtures";
import { DISCLAIMER } from "../../lib/contracts/schemas";
import type {
  AgentProgress,
  AgentProgressState,
  FinalReport,
} from "../../lib/contracts/schemas";
import { AgentProgressCard } from "../../components/AgentProgressCard";
import { PlatformCard } from "../../components/PlatformCard";
import { RiskCard } from "../../components/RiskCard";
import { FixChecklist } from "../../components/FixChecklist";
import { SiteHeader } from "../../components/SiteHeader";
import { friendlyJobError, useJobPolling } from "../../components/useJobPolling";

type SearchParamsLike = { job?: string | string[] };

function toAgentProgress(entry: {
  agent: (typeof mockFinalReport.agent_statuses)[number]["agent"];
  status: (typeof mockFinalReport.agent_statuses)[number]["status"];
}): AgentProgress {
  const state: AgentProgressState =
    entry.status === "selesai" ? "done" : entry.status === "batas_waktu" ? "timeout" : "failed";
  return { agent: entry.agent, state };
}

function extractJobId(value: SearchParamsLike | null | undefined): string | null {
  if (!value || typeof value !== "object") return null;
  const raw = value.job;
  if (typeof raw === "string" && raw) return raw;
  if (Array.isArray(raw) && typeof raw[0] === "string" && raw[0]) return raw[0];
  return null;
}

function jobIdFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get("job");
  } catch {
    return null;
  }
}

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

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  facebook: "Facebook",
};

function renderPartialBanner(report: FinalReport) {
  const unfinished = report.agent_statuses.filter((entry) => entry.status !== "selesai").length;
  if (unfinished === 0) return null;
  return h(
    "p",
    {
      key: "partial",
      className:
        "flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900",
    },
    h("span", { "aria-hidden": true }, "ⓘ"),
    `Partial report, ${unfinished} of 6 checks could not be completed.`,
  );
}

function renderSummary(report: FinalReport) {
  return h(
    "section",
    {
      key: "summary",
      className: "mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6",
      "aria-labelledby": "final-recommendation",
    },
    h(
      "div",
      { className: "grid gap-6 lg:grid-cols-[1fr_300px]" },
      h(
        "div",
        null,
        h(
          "h2",
          { id: "final-recommendation", className: "text-sm font-medium text-slate-500" },
          "Final recommendation",
        ),
        h("p", { className: "mt-2 text-lg font-semibold leading-7 text-slate-900" }, report.overall_recommendation),
        h("p", { className: "mt-4 text-sm italic leading-6 text-slate-500" }, DISCLAIMER),
        h(
          "p",
          { className: "mt-2 text-sm text-slate-500" },
          h("span", null, "Rules version"),
          " ",
          h("span", null, report.rules_version),
        ),
      ),
      h(
        "div",
        { className: "rounded-xl bg-slate-50 p-4" },
        h("p", { className: "text-sm font-semibold text-slate-900" }, "Scores by platform"),
        h(
          "ul",
          { className: "mt-3 space-y-2.5" },
          ...report.platforms.map((platformReport) =>
            h(
              "li",
              { key: platformReport.platform, className: "flex items-center gap-2 text-sm" },
              h("span", { className: "flex-1 font-medium text-slate-700" }, PLATFORM_LABELS[platformReport.platform] ?? platformReport.platform),
              h(
                "span",
                {
                  className: `rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASSES[platformReport.status] ?? STATUS_CLASSES.aman}`,
                },
                STATUS_LABELS[platformReport.status] ?? platformReport.status,
              ),
              h("span", { className: "w-14 text-right font-bold text-slate-900" }, `${platformReport.safety_score} / 100`),
            ),
          ),
        ),
        h(
          "p",
          { className: "mt-3 border-t border-slate-200 pt-3 text-[13px] leading-5 text-slate-500" },
          "Copyright and Indonesian legal risk are reported as risk levels below, not scores.",
        ),
      ),
    ),
  );
}

function renderAgentStatus(progresses: AgentProgress[]) {
  return h(
    "section",
    { key: "status", className: "mt-10", "aria-labelledby": "status-agen" },
    h("h2", { id: "status-agen", className: "text-xl font-bold text-slate-900" }, "Agent status"),
    h(
      "p",
      { className: "mt-1 text-sm text-slate-500" },
      "Six checks run from the same evidence bundle. Sections that are not finished stay marked on this report.",
    ),
    h(
      "div",
      { className: "mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" },
      ...progresses.map((progress) =>
        h(AgentProgressCard, { key: progress.agent, progress }),
      ),
    ),
  );
}

function renderReportSections(report: FinalReport, progresses: AgentProgress[]) {
  return [
    renderPartialBanner(report),
    renderSummary(report),
    renderAgentStatus(progresses),
    h(
      "section",
      { key: "platforms", className: "mt-10", "aria-labelledby": "hasil-platform" },
      h("h2", { id: "hasil-platform", className: "text-xl font-bold text-slate-900" }, "Detailed findings"),
      h(
        "p",
        { className: "mt-1 text-sm text-slate-500" },
        "Findings are grouped by check. Each item shows severity, where it appears, and the evidence behind it.",
      ),
      h(
        "div",
        { className: "mt-4 space-y-4" },
        ...report.platforms.map((platformReport) =>
          h(PlatformCard, { key: platformReport.platform, report: platformReport }),
        ),
      ),
    ),
    h(
      "section",
      { key: "risks", className: "mt-6", "aria-labelledby": "other-risks" },
      h(
        "h2",
        { id: "other-risks", className: "sr-only" },
        "Copyright and Indonesian legal risk",
      ),
      h(
        "div",
        { className: "space-y-4" },
        h(
          "section",
          { "data-testid": "copyright-card" },
          h(RiskCard, {
            title: "Copyright Risk",
            subtitle: "Audio and third-party material risk check",
            riskLevel: report.copyright.risk_level,
            findings: report.copyright.segments,
          }),
        ),
        h(
          "section",
          { "data-testid": "legal-card" },
          h(RiskCard, {
            title: "Indonesian Legal Risk",
            subtitle: "Consumer protection and health-claim risk themes",
            riskLevel: report.legal_id.risk_level,
            findings: report.legal_id.themes,
          }),
        ),
      ),
    ),
    h(
      "div",
      { key: "checklist", className: "mt-6" },
      h(FixChecklist, { items: report.fix_checklist }),
    ),
  ];
}

export default function ReportPage(props: {
  searchParams?: Promise<SearchParamsLike>;
}) {
  const rawSearchParams: unknown = props?.searchParams;
  const resolvedSearchParams: SearchParamsLike | null =
    rawSearchParams &&
    typeof rawSearchParams === "object" &&
    "then" in (rawSearchParams as object)
      ? use(rawSearchParams as Promise<SearchParamsLike>)
      : ((rawSearchParams as SearchParamsLike | undefined) ?? null);
  const [jobId, setJobId] = useState<string | null>(() => {
    return extractJobId(resolvedSearchParams) ?? jobIdFromLocation();
  });

  useEffect(() => {
    if (jobId) return;
    const candidate = props?.searchParams as Promise<SearchParamsLike> | undefined;
    if (candidate && typeof (candidate as { then?: unknown }).then === "function") {
      let active = true;
      (candidate as Promise<SearchParamsLike>)
        .then((resolved) => {
          if (!active) return;
          const id = extractJobId(resolved) ?? jobIdFromLocation();
          if (id) setJobId(id);
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }
    const fromLocation = jobIdFromLocation();
    if (fromLocation) setJobId(fromLocation);
    return undefined;
    // Resolve the job source once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { progress, report, error, snapshot } = useJobPolling(jobId);

  if (!jobId) {
    const mockReport = mockFinalReport;
    const progresses = mockReport.agent_statuses.map(toAgentProgress);
    return h(
      "div",
      { className: "min-h-screen" },
      h(SiteHeader),
      h(
        "main",
        { className: "mx-auto w-full max-w-6xl px-4 py-8 text-slate-900 sm:px-6" },
        h("h1", { className: "text-2xl font-bold tracking-tight" }, "Video screening report"),
        ...renderReportSections(mockReport, progresses),
      ),
    );
  }

  const displayError =
    error ?? (snapshot?.error ? friendlyJobError(snapshot.error) : null);
  const progresses: AgentProgress[] | null =
    progress ??
    (report ? report.agent_statuses.map(toAgentProgress) : null);

  const bodyChildren: unknown[] = [
    h(
      "h1",
      { key: "title", className: "text-2xl font-bold tracking-tight" },
      report ? "Video screening report" : "Analyzing your video",
    ),
  ];

  if (!report && !displayError) {
    bodyChildren.push(
      h(
        "p",
        { key: "waiting", className: "mt-1.5 text-[15px] text-slate-500" },
        "Checks are running. Agent status refreshes on a cycle until the report is ready. You can open the report while the rest are still running.",
      ),
    );
  }

  if (displayError) {
    bodyChildren.push(
      h(
        "p",
        {
          key: "error",
          role: "alert",
          className: "mt-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800",
        },
        displayError,
      ),
    );
  }

  if (progresses) {
    if (report) {
      bodyChildren.push(...renderReportSections(report, progresses));
    } else {
      bodyChildren.push(renderAgentStatus(progresses));
    }
  } else if (!displayError) {
    bodyChildren.push(
      h(
        "p",
        { key: "loading", className: "mt-8 text-sm text-slate-500" },
        "Loading agent status...",
      ),
    );
  }

  return h(
    "div",
    { className: "min-h-screen" },
    h(SiteHeader),
    h(
      "main",
      { className: "mx-auto w-full max-w-6xl px-4 py-8 text-slate-900 sm:px-6" },
      ...(bodyChildren as never[]),
    ),
  );
}
