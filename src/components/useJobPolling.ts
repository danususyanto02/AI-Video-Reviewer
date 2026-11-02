"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentProgress, FinalReport } from "../lib/contracts/schemas";

export interface JobSnapshot {
  progress: AgentProgress[];
  report: FinalReport | null;
  error: string | null;
}

export interface UseJobPollingResult {
  progress: AgentProgress[] | null;
  report: FinalReport | null;
  error: string | null;
  snapshot: JobSnapshot | null;
}

const GENERIC_ERROR =
  "The analysis did not finish. Upload the video again, or use Load example report to see a sample report.";

export function friendlyJobError(raw: unknown): string {
  const text =
    typeof raw === "string"
      ? raw
      : raw instanceof Error
        ? raw.message
        : raw == null
          ? ""
          : String(raw);
  const firstLine = (text.split("\n")[0] ?? "").replace(/^Error:\s*/i, "").trim();
  const lower = firstLine.toLowerCase();
  if (
    lower.includes("too_long") ||
    lower.includes("too long") ||
    lower.includes("180") ||
    lower.includes("exceeds the limit")
  ) {
    return "Video is too long. Maximum duration is 180 seconds (3 minutes). Shorten the video and try again.";
  }
  if (
    lower.includes("unreadable") ||
    lower.includes("could not be read") ||
    lower.includes("corrupt") ||
    lower.includes("probe")
  ) {
    return "The video file could not be read. Check that the file is not corrupt and uses a supported format, then try again.";
  }
  if (!firstLine) return GENERIC_ERROR;
  const sanitized = firstLine.split(" at ")[0]?.trim().slice(0, 240) ?? "";
  if (!sanitized || sanitized.includes("\\") && sanitized.includes(".")) {
    return GENERIC_ERROR;
  }
  // Never show stack traces or internal file paths.
  if (/\.tsx?:\d+/.test(sanitized) || sanitized.includes("node_modules")) {
    return GENERIC_ERROR;
  }
  return sanitized;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data.error === "string" && data.error.trim()) return data.error;
  } catch {
    // Ignore non-JSON bodies.
  }
  return `Request failed (${response.status}).`;
}

export function useJobPolling(
  jobId: string | null,
  intervalMs = 1000,
): UseJobPollingResult {
  const [snapshot, setSnapshot] = useState<JobSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;
    setSnapshot(null);
    setError(null);
    if (!jobId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      if (cancelled || stoppedRef.current) return;
      timer = setTimeout(() => {
        void tick();
      }, intervalMs);
    };

    const tick = async () => {
      if (cancelled || stoppedRef.current) return;
      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
        if (cancelled || stoppedRef.current) return;
        if (!response.ok) {
          const message = await readErrorMessage(response);
          if (cancelled || stoppedRef.current) return;
          stoppedRef.current = true;
          setError(friendlyJobError(message));
          return;
        }
        const data = (await response.json()) as JobSnapshot;
        if (cancelled || stoppedRef.current) return;
        setSnapshot(data);
        if (data.report) {
          stoppedRef.current = true;
          return;
        }
        if (data.error) {
          stoppedRef.current = true;
          setError(friendlyJobError(data.error));
          return;
        }
        scheduleNext();
      } catch (err) {
        if (cancelled || stoppedRef.current) return;
        // Brief network failure: retry on the next interval,
        // unless the component has already stopped.
        void err;
        scheduleNext();
      }
    };

    void tick();

    return () => {
      cancelled = true;
      stoppedRef.current = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [jobId, intervalMs]);

  return {
    progress: snapshot ? snapshot.progress : null,
    report: snapshot ? snapshot.report : null,
    error,
    snapshot,
  };
}
