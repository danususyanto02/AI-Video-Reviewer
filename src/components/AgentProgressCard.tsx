import { createElement as h } from "react";
import type {
  AgentName,
  AgentProgress,
  AgentProgressState,
} from "../lib/contracts/schemas";

type AgentStatusEntry = {
  agent: string;
  status: string;
};

export type AgentProgressCardProps = {
  progress?: AgentProgress;
  agentProgress?: AgentProgress;
  agentStatus?: AgentStatusEntry;
  agent?: string;
  state?: AgentProgressState | string;
  status?: string | AgentStatusEntry;
};

const AGENT_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  facebook: "Facebook",
  copyright: "Copyright",
  legal_id: "Indonesian Law",
  packaging_privacy: "Packaging & Privacy",
};

const AGENT_DESCRIPTIONS: Record<string, string> = {
  youtube: "Checks YouTube Community Guidelines.",
  tiktok: "Checks TikTok Community Guidelines.",
  facebook: "Checks Facebook Community Standards.",
  copyright: "Scans for copyrighted audio and visuals.",
  legal_id: "Checks Indonesian legal risk themes.",
  packaging_privacy: "Reviews packaging claims and privacy.",
};

const PILL_TEXT: Record<AgentProgressState, string> = {
  queued: "Queued",
  running: "Running",
  done: "Done",
  failed: "Failed",
  timeout: "Timed out",
};

const PILL_CLASSES: Record<AgentProgressState, string> = {
  queued: "bg-slate-100 text-slate-600",
  running: "bg-blue-50 text-blue-700",
  done: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  timeout: "bg-amber-50 text-amber-800",
};

const DOT_CLASSES: Record<AgentProgressState, string> = {
  queued: "bg-slate-400",
  running: "bg-blue-600",
  done: "bg-emerald-500",
  failed: "bg-red-500",
  timeout: "bg-amber-500",
};

function iconPaths(agent: string) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (agent) {
    case "youtube":
      return h(
        "svg",
        common,
        h("rect", { x: 2.5, y: 5.5, width: 19, height: 13, rx: 4 }),
        h("path", { d: "m10 9.5 5 2.5-5 2.5z", fill: "currentColor", stroke: "none" }),
      );
    case "tiktok":
      return h(
        "svg",
        common,
        h("path", { d: "M9 18.5V6l10-2v11.5" }),
        h("circle", { cx: 6.5, cy: 18.5, r: 2.5 }),
        h("circle", { cx: 16.5, cy: 15.5, r: 2.5 }),
      );
    case "facebook":
      return h(
        "svg",
        common,
        h("path", { d: "M15.5 3.5h-2.75a4 4 0 0 0-4 4v2.75H6.5v3.5h2.25v6.75h3.5V13.75h2.5l.75-3.5h-3.25V7.75a.75.75 0 0 1 .75-.75h2.5z" }),
      );
    case "copyright":
      return h(
        "svg",
        common,
        h("circle", { cx: 12, cy: 12, r: 9 }),
        h("path", { d: "M14.8 9.6a3.4 3.4 0 1 0 0 4.8" }),
      );
    case "legal_id":
      return h(
        "svg",
        common,
        h("path", { d: "M12 3v18" }),
        h("path", { d: "M7 21h10" }),
        h("path", { d: "M5 7h14" }),
        h("path", { d: "m5 7-2 5a3.2 3.2 0 0 0 4 0L5 7z" }),
        h("path", { d: "m19 7-2 5a3.2 3.2 0 0 0 4 0l-2-5z" }),
      );
    default:
      return h(
        "svg",
        common,
        h("path", { d: "M12 3 4 7v10l8 4 8-4V7l-8-4z" }),
        h("path", { d: "M4 7l8 4 8-4" }),
        h("path", { d: "M12 11v10" }),
      );
  }
}

function toState(value: string | undefined): AgentProgressState {
  if (value === "selesai" || value === "done") return "done";
  if (value === "gagal" || value === "failed") return "failed";
  if (value === "batas_waktu" || value === "timeout") return "timeout";
  if (value === "running" || value === "queued") return value;
  return "queued";
}

function resolveCard(props: AgentProgressCardProps): { agent: string; state: AgentProgressState } {
  if (props.progress) {
    return { agent: props.progress.agent, state: props.progress.state };
  }
  if (props.agentProgress) {
    return { agent: props.agentProgress.agent, state: props.agentProgress.state };
  }
  if (props.agentStatus) {
    return { agent: props.agentStatus.agent, state: toState(props.agentStatus.status) };
  }
  if (props.status && typeof props.status === "object") {
    return { agent: props.status.agent, state: toState(props.status.status) };
  }
  const agent = props.agent ?? "";
  const rawState = typeof props.status === "string" ? props.status : props.state;
  return { agent, state: toState(typeof rawState === "string" ? rawState : undefined) };
}

export function AgentProgressCard(props: AgentProgressCardProps) {
  const resolved = resolveCard(props);
  const agent = resolved.agent;
  const state = resolved.state;
  const label = AGENT_LABELS[agent] ?? agent;
  const agentName = agent as AgentName;

  const note =
    state === "failed"
      ? h("p", { className: "mt-2 text-sm text-red-600" }, "Not finished, try again.")
      : state === "timeout"
        ? h("p", { className: "mt-2 text-sm text-amber-700" }, "Not finished, try again (timed out).")
        : null;

  return h(
    "article",
    {
      "data-testid": "agent-progress-card",
      "data-state": state,
      "data-agent": agentName,
      className: "rounded-xl border border-slate-200 bg-white p-5 shadow-sm",
    },
    h(
      "div",
      { className: "flex items-start gap-3" },
      h(
        "span",
        { className: "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600" },
        iconPaths(agent),
      ),
      h(
        "span",
        {
          className: `ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${PILL_CLASSES[state]}`,
        },
        h("span", { className: `h-1.5 w-1.5 rounded-full ${DOT_CLASSES[state]}`, "aria-hidden": true }),
        PILL_TEXT[state],
      ),
    ),
    h("h3", { className: "mt-3.5 text-base font-semibold text-slate-900" }, label),
    h(
      "p",
      { className: "mt-1 text-sm leading-6 text-slate-500" },
      AGENT_DESCRIPTIONS[agent] ?? "Runs one check from the evidence bundle.",
    ),
    note,
  );
}

export default AgentProgressCard;
