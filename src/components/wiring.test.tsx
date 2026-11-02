// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFinalReport } from "../lib/contracts/fixtures";
import { DISCLAIMER } from "../lib/contracts/schemas";
import type { FinalReport } from "../lib/contracts/schemas";
import HomePage from "../app/page";
import ReportPage from "../app/report/page";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  pushMock.mockClear();
  vi.useRealTimers();
  window.history.pushState({}, "", "/");
});

async function flushPromises(times = 6) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

const progressSnapshot1 = {
  progress: [
    { agent: "youtube", state: "done" },
    { agent: "tiktok", state: "done" },
    { agent: "facebook", state: "running" },
    { agent: "copyright", state: "running" },
    { agent: "legal_id", state: "running" },
    { agent: "packaging_privacy", state: "running" },
  ],
  report: null,
  error: null,
};

function inconsistentReport(): FinalReport {
  const base = JSON.parse(JSON.stringify(mockFinalReport)) as FinalReport;
  // Skor sengaja bertentangan dengan temuan: klien wajib menampilkan apa adanya.
  base.platforms[0] = {
    ...base.platforms[0]!,
    safety_score: 99,
    status: "aman",
  };
  return base;
}

function progressSnapshot2(report: FinalReport) {
  return {
    progress: [
      { agent: "youtube", state: "done" },
      { agent: "tiktok", state: "done" },
      { agent: "facebook", state: "done" },
      { agent: "copyright", state: "done" },
      { agent: "legal_id", state: "done" },
      { agent: "packaging_privacy", state: "failed" },
    ],
    report,
    error: null,
  };
}

describe("sambungan UI ke orkestrasi nyata", () => {
  it("submit upload POST FormData lalu navigasi ke /report?job=<id>", async () => {
    const assignMock = pushMock;

    const fetchMock = vi.fn(async (input: unknown, init?: { method?: string }) => {
      void input;
      void init;
      return {
        ok: true,
        status: 202,
        json: async () => ({ job_id: "x" }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(HomePage));
    const videoInput = screen.getByLabelText(/video/i) as HTMLInputElement;
    const file = new File(["video"], "video.mp4", { type: "video/mp4" });
    fireEvent.change(videoInput, { target: { files: [file] } });
    const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Test title" } });

    const form = videoInput.closest("form");
    expect(form).not.toBeNull();
    await act(async () => {
      fireEvent.submit(form as HTMLFormElement);
      await flushPromises();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, { method?: string; body?: unknown }];
    expect(firstCall[0]).toBe("/api/analyze");
    expect(firstCall[1]?.method).toBe("POST");
    expect(firstCall[1]?.body).toBeInstanceOf(FormData);
    const body = firstCall[1]?.body as FormData;
    expect(body.get("video")).toBeInstanceOf(File);
    expect(body.get("title")).toBe("Test title");
    // Tepat satu nama konsisten untuk konteks tambahan yang dibaca route.
    const hasCanonical = body.get("extraContext") !== null;
    const hasSnake = body.get("extra_context") !== null;
    expect(hasCanonical !== hasSnake || hasCanonical).toBe(true);
    expect(hasCanonical).toBe(true);
    expect(assignMock).toHaveBeenCalledWith("/report?job=x");
  });

  it("penolakan upload 400 menampilkan pesan server tanpa navigasi", async () => {
    const assignMock = pushMock;
    const fetchMock = vi.fn(async () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: "Video file is required." }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(HomePage));
    const videoInput = screen.getByLabelText(/video/i) as HTMLInputElement;
    const form = videoInput.closest("form") as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
      await flushPromises();
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Video file is required.");
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("halaman laporan tanpa ?job merender contoh mock tanpa fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/report");
    render(React.createElement(ReportPage));
    await act(async () => {
      await flushPromises();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("platform-card")).toHaveLength(3);
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
  });

  it("polling menampilkan 2 selesai dulu lalu laporan final verbatim", async () => {
    vi.useFakeTimers();
    const report = inconsistentReport();
    let getCount = 0;
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      expect(url).toBe("/api/jobs/x");
      getCount += 1;
      const payload = getCount === 1 ? progressSnapshot1 : progressSnapshot2(report);
      return {
        ok: true,
        status: 200,
        json: async () => payload,
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/report?job=x");

    render(React.createElement(ReportPage));

    await act(async () => {
      await flushPromises();
    });

    // Snapshot pertama: tepat 2 done, sisanya running.
    let cards = screen.getAllByTestId("agent-progress-card");
    expect(cards).toHaveLength(6);
    expect(cards.filter((c) => c.getAttribute("data-state") === "done")).toHaveLength(2);
    expect(cards.filter((c) => c.getAttribute("data-state") === "running")).toHaveLength(4);
    expect(screen.queryByTestId("platform-card")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await flushPromises();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Laporan final: 3 kartu platform, satu agen gagal, disclaimer tampil.
    const platformCards = screen.getAllByTestId("platform-card");
    expect(platformCards).toHaveLength(3);
    cards = screen.getAllByTestId("agent-progress-card");
    const failed = cards.filter((c) => c.getAttribute("data-state") === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]?.getAttribute("data-agent")).toBe("packaging_privacy");
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
    expect(screen.getByText(report.overall_recommendation)).toBeInTheDocument();
    // Skor verbatim: 99 tetap tampil meski temuannya berisiko (tanpa hitung ulang klien).
    const youtubeCard = platformCards.find(
      (c) => c.getAttribute("data-platform") === "youtube",
    );
    expect(youtubeCard?.textContent).toContain("99");
    expect(youtubeCard?.textContent).toContain("Safe");

    // Polling berhenti setelah laporan tiba.
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await flushPromises();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(within(screen.getByTestId("fix-checklist")).getAllByRole("checkbox")).toHaveLength(
      report.fix_checklist.length,
    );
  });

  it("error job terlalu panjang dipetakan ramah tanpa stack trace dan polling berhenti", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          progress: progressSnapshot1.progress,
          report: null,
          error: "Video duration exceeds the 180 second maximum.\n    at buildEvidenceBundle (bundle.ts:10:1)\n    at analyzeReview (analyze.ts:20:1)",
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/report?job=x");

    render(React.createElement(ReportPage));
    await act(async () => {
      await flushPromises();
    });

    const alert = screen.getByRole("alert");
    expect(alert.textContent?.toLowerCase()).toContain("too long");
    expect(alert.textContent).toContain("180");
    expect(alert.textContent).not.toContain("at buildEvidenceBundle");
    expect(alert.textContent).not.toContain("analyze.ts");

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await flushPromises();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
