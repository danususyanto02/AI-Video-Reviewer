import { randomUUID } from "node:crypto";
import type { AgentName, AgentProgress, FinalReport } from "../contracts/schemas";

export interface JobSnapshot {
  progress: AgentProgress[];
  report: FinalReport | null;
  error: string | null;
}

const ALL_AGENTS: AgentName[] = [
  "youtube",
  "tiktok",
  "facebook",
  "copyright",
  "legal_id",
  "packaging_privacy",
];

function initialProgress(): AgentProgress[] {
  return ALL_AGENTS.map((agent) => ({ agent, state: "queued" as const }));
}

function cloneSnapshot(snapshot: JobSnapshot): JobSnapshot {
  return {
    progress: snapshot.progress.map((p) => ({ ...p })),
    report: snapshot.report
      ? (JSON.parse(JSON.stringify(snapshot.report)) as FinalReport)
      : null,
    error: snapshot.error,
  };
}

const globalRef = globalThis as typeof globalThis & {
  __cekduluJobs?: Map<string, JobSnapshot>;
};
const jobs: Map<string, JobSnapshot> =
  globalRef.__cekduluJobs ?? (globalRef.__cekduluJobs = new Map<string, JobSnapshot>());

export function createJob(): string {
  const id = randomUUID();
  jobs.set(id, { progress: initialProgress(), report: null, error: null });
  return id;
}

export function getJob(id: string): JobSnapshot | null {
  const found = jobs.get(id);
  if (!found) return null;
  return cloneSnapshot(found);
}

export function updateJob(id: string, patch: Partial<JobSnapshot>): void {
  const found = jobs.get(id);
  if (!found) return;
  if (patch.progress !== undefined) {
    found.progress = patch.progress.map((p) => ({ ...p }));
  }
  if (patch.report !== undefined) {
    found.report = patch.report
      ? (JSON.parse(JSON.stringify(patch.report)) as FinalReport)
      : null;
  }
  if (patch.error !== undefined) {
    found.error = patch.error;
  }
}
