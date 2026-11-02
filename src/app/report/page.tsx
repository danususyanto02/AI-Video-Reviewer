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

const AGENT_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  facebook: "Facebook",
  copyright: "Copyright",
  legal_id: "Indonesian Law",
  packaging_privacy: "Packaging & Privacy",
};

function renderPartialBanner(report: FinalReport) {
  const unfinished = report.agent_statuses.filter((entry) => entry.status !== "selesai");
  if (unfinished.length === 0) return null;
  const names = unfinished
    .map((entry) => AGENT_LABELS[entry.agent] ?? entry.agent)
    .join(", ");
  const message =
    unfinished.length === 1
      ? `Partial report. ${names} could not be checked, so that section is missing.`
      : `Partial report. ${names} could not be checked, so those sections are missing.`;
  return h(
    "p",
    {
      key: "partial",
      className:
        "flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900",
    },
    h("span", { "aria-hidden": true }, "ⓘ"),
    message,
  );
}

function renderSummary(report: FinalReport) {
  return h(
    "section",
    {
      key: "summary",
      className: "mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm",
      "aria-labelledby": "final-recommendation",
    },
    h(
      "div",
      { className: "grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]" },
      h(
        "div",
        null,
        h(
          "h2",
          { id: "final-recommendation", className: "text-sm font-medium text-slate-500" },
          "Final recommendation",
        ),
        h("p", { className: "mt-1.5 text-base font-semibold leading-6 text-slate-900 sm:text-lg" }, report.overall_recommendation),
        h("p", { className: "mt-3 text-[13px] italic leading-5 text-slate-500" }, DISCLAIMER),
        h(
          "p",
          { className: "mt-1.5 text-xs text-slate-500" },
          h("span", null, "Rules version"),
          " ",
          h("span", null, report.rules_version),
        ),
      ),
      h(
        "div",
        { className: "rounded-xl bg-slate-50 p-3" },
        h("p", { className: "text-sm font-semibold text-slate-900" }, "Scores by platform"),
        h(
          "ul",
          { className: "mt-2 grid grid-cols-3 gap-2" },
          ...report.platforms.map((platformReport) =>
            h(
              "li",
              { key: platformReport.platform, className: "rounded-lg bg-white px-2.5 py-2" },
              h(
                "span",
                { className: "block truncate text-xs font-medium text-slate-500" },
                PLATFORM_LABELS[platformReport.platform] ?? platformReport.platform,
              ),
              h(
                "span",
                { className: "mt-0.5 block text-lg font-bold leading-6 text-slate-900" },
                `${platformReport.safety_score} / 100`,
              ),
              h(
                "span",
                {
                  className: `mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASSES[platformReport.status] ?? STATUS_CLASSES.aman}`,
                },
                STATUS_LABELS[platformReport.status] ?? platformReport.status,
              ),
            ),
          ),
        ),
        h(
          "p",
          { className: "mt-2 border-t border-slate-200 pt-2 text-xs leading-4 text-slate-500" },
          "Copyright and Indonesian legal risk are reported as risk levels below, not scores.",
        ),
      ),
    ),
  );
}

function renderAgentStatus(progresses: AgentProgress[], compact = false) {
  return h(
    "section",
    { key: "status", className: compact ? "mt-6" : "mt-8", "aria-labelledby": "status-agen" },
    h(
      "h2",
      { id: "status-agen", className: compact ? "text-lg font-bold text-slate-900" : "text-xl font-bold text-slate-900" },
      "Agent status",
    ),
    h(
      "p",
      { className: compact ? "mt-0.5 text-xs leading-5 text-slate-500" : "mt-1 text-sm text-slate-500" },
      "Six checks run from the same evidence bundle. Sections that are not finished stay marked on this report.",
    ),
    h(
      "div",
      {
        className: compact
          ? "mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
          : "mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
      },
      ...progresses.map((progress) =>
        h(AgentProgressCard, { key: progress.agent, progress, compact }),
      ),
    ),
  );
}

function renderReportSections(report: FinalReport, progresses: AgentProgress[]) {
  return [
    renderPartialBanner(report),
    renderSummary(report),
    renderAgentStatus(progresses, true),
    h(
      "section",
      { key: "platforms", className: "mt-6", "aria-labelledby": "hasil-platform" },
      h("h2", { id: "hasil-platform", className: "text-lg font-bold text-slate-900" }, "Detailed findings"),
      h(
        "p",
        { className: "mt-0.5 text-xs leading-5 text-slate-500" },
        "Findings are grouped by check. Each item shows severity, where it appears, and the evidence behind it.",
      ),
      h(
        "div",
        { className: "mt-3 grid items-start gap-4 lg:grid-cols-2" },
        ...report.platforms.map((platformReport) =>
          h(PlatformCard, { key: platformReport.platform, report: platformReport }),
        ),
        h(
          "section",
          { key: "copyright", "data-testid": "copyright-card" },
          h(RiskCard, {
            title: "Copyright Risk",
            subtitle: "Audio and third-party material risk check",
            riskLevel: report.copyright.risk_level,
            findings: report.copyright.segments,
          }),
        ),
        h(
          "section",
          { key: "legal", "data-testid": "legal-card" },
          h(RiskCard, {
            title: "Indonesian Legal Risk",
            subtitle: "Consumer protection and health-claim risk themes",
            riskLevel: report.legal_id.risk_level,
            findings: report.legal_id.themes,
          }),
        ),
        h(FixChecklist, { key: "checklist", items: report.fix_checklist }),
      ),
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
        { className: "mx-auto w-full max-w-[1440px] px-4 py-5 text-slate-900 sm:px-6" },
        h("h1", { className: "text-xl font-bold tracking-tight sm:text-2xl" }, "Video screening report"),
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
      { key: "title", className: "text-xl font-bold tracking-tight sm:text-2xl" },
      report ? "Video screening report" : "Analyzing your video",
    ),
  ];

  if (!report && !displayError) {
    bodyChildren.push(
      h(
        "p",
        { key: "waiting", className: "mt-1.5 text-[15px] text-slate-500" },
        "Checks are still running. Finished sections fill in as they complete, and the rest stay marked.",
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
      { className: "mx-auto w-full max-w-[1440px] px-4 py-5 text-slate-900 sm:px-6" },
      ...(bodyChildren as never[]),
    ),
  );
}
