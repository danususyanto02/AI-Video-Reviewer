// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFinalReport } from "../lib/contracts/fixtures";
import { DISCLAIMER } from "../lib/contracts/schemas";
import type { PlatformReport } from "../lib/contracts/schemas";
import ReportPage from "../app/report/page";
import HomePage from "../app/page";
import { PlatformCard } from "./PlatformCard";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("halaman laporan dari mockFinalReport", () => {
  it("menampilkan tiga kartu platform dengan skor, status, dan risiko terbesar apa adanya", () => {
    render(React.createElement(ReportPage));
    const cards = screen.getAllByTestId("platform-card");
    expect(cards).toHaveLength(3);
    expect(cards[0]?.textContent).toContain("55");
    expect(cards[0]?.textContent).toContain("Needs fixes");
    expect(cards[0]?.textContent).toContain(mockFinalReport.platforms[0]?.top_risk);
    expect(cards[1]?.textContent).toContain("25");
    expect(cards[1]?.textContent).toContain("High risk");
    expect(cards[2]?.textContent).toContain("70");
    expect(screen.getByText(mockFinalReport.overall_recommendation)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(mockFinalReport.rules_version))).toBeInTheDocument();
  });

  it("menampilkan satu kartu copyright dan satu kartu hukum", () => {
    render(React.createElement(ReportPage));
    const copyrightCard = screen.getByTestId("copyright-card");
    const legalCard = screen.getByTestId("legal-card");
    expect(within(copyrightCard).getByText("Copyright Risk")).toBeInTheDocument();
    expect(copyrightCard.textContent).toContain("High");
    expect(copyrightCard.textContent).toContain(
      mockFinalReport.copyright.segments[0]?.evidence as string,
    );
    expect(within(legalCard).getByText("Indonesian Legal Risk")).toBeInTheDocument();
    expect(legalCard.textContent).toContain("High");
    expect(legalCard.textContent).toContain(
      mockFinalReport.legal_id.themes[0]?.category as string,
    );
    expect(legalCard.textContent).toContain(
      mockFinalReport.legal_id.themes[0]?.evidence as string,
    );
    expect(screen.getAllByTestId("risk-card")).toHaveLength(2);
  });

  it("menampilkan enam kartu progres agen dengan tepat satu gagal", () => {
    render(React.createElement(ReportPage));
    const cards = screen.getAllByTestId("agent-progress-card");
    expect(cards).toHaveLength(6);
    const failed = cards.filter((card) => card.getAttribute("data-state") === "failed");
    const done = cards.filter((card) => card.getAttribute("data-state") === "done");
    expect(failed).toHaveLength(1);
    expect(done).toHaveLength(5);
    expect(failed[0]?.textContent?.toLowerCase()).toContain("not finished, try again");
    expect(failed[0]?.getAttribute("data-agent")).toBe("packaging_privacy");
  });

  it("menampilkan disclaimer verbatim", () => {
    render(React.createElement(ReportPage));
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
    expect(DISCLAIMER).toBe(
      "Initial screening, not a platform decision, not Content ID, and not legal advice.",
    );
  });

  it("memformat rentang temuan sebagai mm:ss-mm:ss", () => {
    render(React.createElement(ReportPage));
    const ranges = screen
      .getAllByTestId("finding-range")
      .map((element) => element.textContent);
    expect(ranges).toContain("00:05-00:12");
    expect(ranges).toContain("00:18-00:18");
    expect(ranges).toContain("00:00-00:45");
  });

  it("checklist bisa dicentang dan salin sebagai teks memakai clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(React.createElement(ReportPage));
    const checklist = screen.getByTestId("fix-checklist");
    const checkboxes = within(checklist).getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(mockFinalReport.fix_checklist.length);
    const first = checkboxes[0] as HTMLInputElement;
    expect(first.checked).toBe(false);
    fireEvent.click(first);
    expect(first.checked).toBe(true);
    fireEvent.click(first);
    expect(first.checked).toBe(false);

    const copyButton = within(checklist).getByRole("button", { name: /copy/i });
    fireEvent.click(copyButton);
    await Promise.resolve();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = String(writeText.mock.calls[0]?.[0] ?? "");
    expect(copied).toContain(mockFinalReport.fix_checklist[0] as string);
    expect(copied).toContain(mockFinalReport.fix_checklist[1] as string);
  });
});

describe("temuan 0-0 pada PlatformCard", () => {
  it("menampilkan label jenis bukti, bukan 00:00-00:00", () => {
    const report: PlatformReport = {
      platform: "youtube",
      safety_score: 90,
      status: "aman",
      top_risk: "Tidak ada risiko dominan pada contoh ini.",
      findings: [
        {
          start_sec: 0,
          end_sec: 0,
          evidence_type: "thumbnail",
          evidence: "Thumbnail menampilkan teks klaim cepat kaya.",
          category: "spam_clickbait_reupload",
          severity: "sedang",
          impact: "Berisiko menyesatkan penonton sebelum video ditonton.",
          fix: "Ubah teks thumbnail agar sesuai isi video.",
        },
        {
          start_sec: 0,
          end_sec: 0,
          evidence_type: "title",
          evidence: "Judul menjanjikan hasil instan tanpa bukti.",
          category: "misinformasi",
          severity: "rendah",
          impact: "Berisiko menimbulkan ekspektasi yang tidak sesuai isi.",
          fix: "Ubah judul agar sesuai isi video.",
        },
      ],
    };
    const rendered = render(React.createElement(PlatformCard, { report }));
    const container = rendered.container;
    const ranges = within(container)
      .getAllByTestId("finding-range")
      .map((element) => element.textContent);
    expect(ranges).toContain("thumbnail");
    expect(ranges).toContain("title");
    expect(container.textContent).not.toContain("00:00-00:00");
    expect(container.textContent).toContain("Thumbnail menampilkan teks klaim cepat kaya.");
  });
});

describe("halaman upload", () => {
  it("menampilkan masukan video, thumbnail, judul, caption, konteks, Analisa, dan Muat contoh", () => {
    render(React.createElement(HomePage));
    expect(screen.getByLabelText(/video/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/thumbnail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/caption/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/extra context/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analyze video/i })).toBeInTheDocument();
    const contoh = screen.getByRole("link", { name: /load example/i });
    expect(contoh).toBeInTheDocument();
    expect(contoh.getAttribute("href")).toBe("/report");
    expect(screen.queryByTestId("platform-card")).not.toBeInTheDocument();
  });
});
