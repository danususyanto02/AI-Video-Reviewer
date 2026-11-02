import { describe, expect, it, vi } from "vitest";
import { mockEvidenceBundle } from "../contracts/fixtures";
import { FinalReport as FinalReportSchema } from "../contracts/schemas";
import type { AgentName, AgentProgress, AgentResult } from "../contracts/schemas";
import type { EvidenceInput } from "../evidence/bundle";
import { createMetaClient } from "../meta/client";

vi.mock("../evidence/bundle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../evidence/bundle")>();
  return {
    ...actual,
    buildEvidenceBundle: async (input: EvidenceInput) => {
      if (input.videoPath.includes("too-long")) {
        throw new actual.EvidenceError(
          "too_long",
          "Durasi video melebihi batas maksimum 180 detik.",
        );
      }
      if (input.videoPath.includes("unreadable")) {
        throw new actual.EvidenceError("unreadable", "File video tidak terbaca.");
      }
      return {
        ...mockEvidenceBundle,
        title: input.title,
        caption: input.caption,
        extra_context: input.extraContext,
      };
    },
  };
});

import { POST as postAnalyze } from "../../app/api/analyze/route";
import { GET as getJobSnapshot } from "../../app/api/jobs/[id]/route";
import { EvidenceError } from "../evidence/bundle";
import { analyzeReview } from "./analyze";
import type { AgentRunners } from "./analyze";
import { createJob, getJob, updateJob } from "./store";

const ALL_AGENTS: AgentName[] = [
  "youtube",
  "tiktok",
  "facebook",
  "copyright",
  "legal_id",
  "packaging_privacy",
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function selesai(agent: AgentName): AgentResult {
  return { agent, status: "selesai", risk_level: "rendah", findings: [], error: null };
}

function fakeInput(videoPath = "fake-video.mp4"): EvidenceInput {
  return {
    videoPath,
    thumbnailPath: null,
    title: "Judul uji orkestrasi",
    caption: "Caption uji orkestrasi",
    extraContext: "",
  };
}

type EventKind = "start" | "end";
type RunEvent = { kind: EventKind; agent: AgentName; at: number };

function makeRunners(opts: {
  delays: Partial<Record<AgentName, number>>;
  throwing?: AgentName | null;
  hanging?: AgentName | null;
  events: RunEvent[];
  calls: Record<AgentName, number>;
}): AgentRunners {
  const runners = {} as AgentRunners;
  for (const agent of ALL_AGENTS) {
    runners[agent] = async () => {
      opts.calls[agent] += 1;
      opts.events.push({ kind: "start", agent, at: Date.now() });
      if (opts.hanging === agent) {
        return new Promise<AgentResult>(() => {});
      }
      const wait = opts.delays[agent] ?? 10;
      await delay(wait);
      opts.events.push({ kind: "end", agent, at: Date.now() });
      if (opts.throwing === agent) {
        throw new Error(`runner ${agent} meledak (fake)`);
      }
      return selesai(agent);
    };
  }
  return runners;
}

function freshCalls(): Record<AgentName, number> {
  return {
    youtube: 0,
    tiktok: 0,
    facebook: 0,
    copyright: 0,
    legal_id: 0,
    packaging_privacy: 0,
  };
}

function collectProgress() {
  const history: AgentProgress[][] = [];
  const onProgress = (progress: AgentProgress[]) => {
    history.push(progress.map((p) => ({ ...p })));
  };
  return { history, onProgress };
}

describe("analyzeReview — konkurensi dan progres", () => {
  it("(a) keenam agen mulai sebelum ada yang selesai", async () => {
    const meta = createMetaClient({ forceMock: true });
    const events: RunEvent[] = [];
    const calls = freshCalls();
    const runners = makeRunners({
      delays: {
        youtube: 10,
        tiktok: 60,
        facebook: 120,
        copyright: 180,
        legal_id: 240,
        packaging_privacy: 300,
      },
      events,
      calls,
    });
    const { onProgress } = collectProgress();

    await analyzeReview(fakeInput(), meta, onProgress, {
      agentTimeoutMs: 5000,
      retryDelayMs: 5,
      runners,
    });

    const starts = events.filter((e) => e.kind === "start");
    const ends = events.filter((e) => e.kind === "end");
    expect(starts).toHaveLength(6);
    expect(new Set(starts.map((e) => e.agent)).size).toBe(6);
    expect(ends).toHaveLength(6);
    const lastStartAt = Math.max(...starts.map((e) => e.at));
    const firstEndAt = Math.min(...ends.map((e) => e.at));
    // Bukti konkurensi: start terakhir mendahului end pertama.
    expect(lastStartAt).toBeLessThanOrEqual(firstEndAt);
    for (const agent of ALL_AGENTS) {
      expect(calls[agent]).toBe(1);
    }
  });

  it("(b) progres fast done saat slow masih running, sebelum yang terlambat selesai", async () => {
    const meta = createMetaClient({ forceMock: true });
    const events: RunEvent[] = [];
    const calls = freshCalls();
    const runners = makeRunners({
      delays: {
        youtube: 10,
        tiktok: 60,
        facebook: 120,
        copyright: 180,
        legal_id: 240,
        packaging_privacy: 300,
      },
      events,
      calls,
    });
    const { history, onProgress } = collectProgress();

    await analyzeReview(fakeInput(), meta, onProgress, {
      agentTimeoutMs: 5000,
      retryDelayMs: 5,
      runners,
    });

    // Snapshot awal: keenamnya queued.
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]?.every((p) => p.state === "queued")).toBe(true);
    expect(history[0]).toHaveLength(6);

    // Ada snapshot di mana youtube (10ms) sudah done sementara
    // packaging_privacy (300ms) masih running — bukti progres parsial.
    const partial = history.find((snap) => {
      const yt = snap.find((p) => p.agent === "youtube");
      const slow = snap.find((p) => p.agent === "packaging_privacy");
      return yt?.state === "done" && slow?.state === "running";
    });
    expect(partial).toBeDefined();

    // Setiap agen pernah terlihat running.
    for (const agent of ALL_AGENTS) {
      const seenRunning = history.some((snap) =>
        snap.some((p) => p.agent === agent && p.state === "running"),
      );
      expect(seenRunning).toBe(true);
    }
  });

  it("(e) total elapsed < 2x slowest (300ms), bukan jumlah semua delay", async () => {
    const meta = createMetaClient({ forceMock: true });
    const events: RunEvent[] = [];
    const calls = freshCalls();
    const delays: Record<AgentName, number> = {
      youtube: 10,
      tiktok: 50,
      facebook: 100,
      copyright: 150,
      legal_id: 200,
      packaging_privacy: 300,
    };
    const runners = makeRunners({ delays, events, calls });
    const { onProgress } = collectProgress();

    const slowest = 300;
    const sum = Object.values(delays).reduce((a, b) => a + b, 0);
    const startedAt = Date.now();
    const report = await analyzeReview(fakeInput(), meta, onProgress, {
      agentTimeoutMs: 5000,
      retryDelayMs: 5,
      runners,
    });
    const elapsed = Date.now() - startedAt;
    console.info(
      `[analyze-test] slowest=${slowest}ms sum=${sum}ms elapsed=${elapsed}ms`,
    );

    expect(() => FinalReportSchema.parse(report)).not.toThrow();
    expect(sum).toBe(810);
    expect(elapsed).toBeLessThan(2 * slowest);
    expect(elapsed).toBeLessThan(sum);
    // Elapsed minimal mendekati slowest: agen terlambat memang berjalan penuh.
    expect(elapsed).toBeGreaterThanOrEqual(slowest - 30);
  });

  it("(c) agen yang melempar berakhir gagal dan FinalReport tetap kembali valid", async () => {
    const meta = createMetaClient({ forceMock: true });
    const events: RunEvent[] = [];
    const calls = freshCalls();
    const runners = makeRunners({
      delays: {
        youtube: 10,
        tiktok: 10,
        facebook: 10,
        copyright: 10,
        legal_id: 10,
        packaging_privacy: 10,
      },
      throwing: "tiktok",
      events,
      calls,
    });
    const { history, onProgress } = collectProgress();

    const report = await analyzeReview(fakeInput(), meta, onProgress, {
      agentTimeoutMs: 5000,
      retryDelayMs: 5,
      runners,
    });

    expect(() => FinalReportSchema.parse(report)).not.toThrow();
    // Retry tepat satu kali: throwing dipanggil 2x, yang lain 1x.
    expect(calls.tiktok).toBe(2);
    for (const agent of ALL_AGENTS) {
      if (agent !== "tiktok") expect(calls[agent]).toBe(1);
    }
    const statuses = new Map(report.agent_statuses.map((s) => [s.agent, s.status]));
    expect(statuses.get("tiktok")).toBe("gagal");
    for (const agent of ALL_AGENTS) {
      if (agent !== "tiktok") expect(statuses.get(agent)).toBe("selesai");
    }
    const finalProgress = history[history.length - 1];
    expect(finalProgress?.find((p) => p.agent === "tiktok")?.state).toBe("failed");
    for (const agent of ALL_AGENTS) {
      if (agent !== "tiktok") {
        expect(finalProgress?.find((p) => p.agent === agent)?.state).toBe("done");
      }
    }
  });

  it("(d) agen yang menggantung berakhir batas_waktu setelah satu retry", async () => {
    const meta = createMetaClient({ forceMock: true });
    const events: RunEvent[] = [];
    const calls = freshCalls();
    const runners = makeRunners({
      delays: {
        youtube: 10,
        tiktok: 10,
        facebook: 10,
        copyright: 10,
        legal_id: 10,
        packaging_privacy: 10,
      },
      hanging: "legal_id",
      events,
      calls,
    });
    const { history, onProgress } = collectProgress();

    const startedAt = Date.now();
    const report = await analyzeReview(fakeInput(), meta, onProgress, {
      agentTimeoutMs: 50,
      retryDelayMs: 5,
      runners,
    });
    const elapsed = Date.now() - startedAt;
    console.info(`[analyze-test] timeout-case elapsed=${elapsed}ms calls.legal_id=${calls.legal_id}`);

    expect(() => FinalReportSchema.parse(report)).not.toThrow();
    // Dua percobaan (awal + 1 retry), masing-masing timeout 50ms.
    expect(calls.legal_id).toBe(2);
    expect(elapsed).toBeGreaterThanOrEqual(90);
    expect(elapsed).toBeLessThan(2000);
    const statuses = new Map(report.agent_statuses.map((s) => [s.agent, s.status]));
    expect(statuses.get("legal_id")).toBe("batas_waktu");
    for (const agent of ALL_AGENTS) {
      if (agent !== "legal_id") expect(statuses.get(agent)).toBe("selesai");
    }
    const finalProgress = history[history.length - 1];
    expect(finalProgress?.find((p) => p.agent === "legal_id")?.state).toBe("timeout");
  });

  it("(f) pemetaan status akhir progres: selesai->done, gagal->failed, batas_waktu->timeout", async () => {
    const meta = createMetaClient({ forceMock: true });
    const events: RunEvent[] = [];
    const calls = freshCalls();
    // Kombinasi: 4 selesai, tiktok selalu melempar, legal_id menggantung.
    const base = makeRunners({
      delays: {
        youtube: 10,
        tiktok: 10,
        facebook: 10,
        copyright: 10,
        legal_id: 10,
        packaging_privacy: 10,
      },
      throwing: "tiktok",
      hanging: "legal_id",
      events,
      calls,
    });
    const { history, onProgress } = collectProgress();

    const report = await analyzeReview(fakeInput(), meta, onProgress, {
      agentTimeoutMs: 50,
      retryDelayMs: 5,
      runners: base,
    });

    expect(() => FinalReportSchema.parse(report)).not.toThrow();
    const statusByAgent = new Map(report.agent_statuses.map((s) => [s.agent, s.status]));
    expect(statusByAgent.get("youtube")).toBe("selesai");
    expect(statusByAgent.get("facebook")).toBe("selesai");
    expect(statusByAgent.get("copyright")).toBe("selesai");
    expect(statusByAgent.get("packaging_privacy")).toBe("selesai");
    expect(statusByAgent.get("tiktok")).toBe("gagal");
    expect(statusByAgent.get("legal_id")).toBe("batas_waktu");

    const finalProgress = history[history.length - 1];
    expect(finalProgress).toHaveLength(6);
    const stateByAgent = new Map(finalProgress?.map((p) => [p.agent, p.state]));
    expect(stateByAgent.get("youtube")).toBe("done");
    expect(stateByAgent.get("facebook")).toBe("done");
    expect(stateByAgent.get("copyright")).toBe("done");
    expect(stateByAgent.get("packaging_privacy")).toBe("done");
    expect(stateByAgent.get("tiktok")).toBe("failed");
    expect(stateByAgent.get("legal_id")).toBe("timeout");
  });

  it("EvidenceError dari paket bukti diteruskan sebagai error bertipe tanpa memulai agen", async () => {
    const meta = createMetaClient({ forceMock: true });
    const events: RunEvent[] = [];
    const calls = freshCalls();
    const runners = makeRunners({
      delays: {
        youtube: 10,
        tiktok: 10,
        facebook: 10,
        copyright: 10,
        legal_id: 10,
        packaging_privacy: 10,
      },
      events,
      calls,
    });
    const { onProgress } = collectProgress();

    let caught: unknown;
    try {
      await analyzeReview(fakeInput("too-long-video.mp4"), meta, onProgress, {
        agentTimeoutMs: 5000,
        retryDelayMs: 5,
        runners,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(EvidenceError);
    expect((caught as EvidenceError).code).toBe("too_long");
    // Tidak ada agen yang dimulai.
    expect(events).toEqual([]);
    for (const agent of ALL_AGENTS) expect(calls[agent]).toBe(0);
  });

  it("runner bawaan dengan Meta mock menghasilkan FinalReport valid", async () => {
    const meta = createMetaClient({ forceMock: true });
    const { history, onProgress } = collectProgress();

    const report = await analyzeReview(fakeInput(), meta, onProgress);

    expect(() => FinalReportSchema.parse(report)).not.toThrow();
    expect(report.platforms).toHaveLength(3);
    expect(report.agent_statuses).toHaveLength(6);
    expect(report.rules_version).toBe("2026-10-30.1");
    const finalProgress = history[history.length - 1];
    expect(finalProgress?.every((p) => p.state === "done")).toBe(true);
  });
});

describe("job store — logika store tanpa server", () => {
  it("createJob menghasilkan id UUID yang tidak dapat ditebak dan snapshot awal queued", () => {
    const idA = createJob();
    const idB = createJob();
    expect(idA).not.toBe(idB);
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(uuidPattern.test(idA)).toBe(true);
    expect(uuidPattern.test(idB)).toBe(true);

    const snap = getJob(idA);
    expect(snap).not.toBeNull();
    expect(snap?.report).toBeNull();
    expect(snap?.error).toBeNull();
    expect(snap?.progress).toHaveLength(6);
    expect(snap?.progress.map((p) => p.agent)).toEqual(ALL_AGENTS);
    expect(snap?.progress.every((p) => p.state === "queued")).toBe(true);
  });

  it("updateJob/getJob mencerminkan progres, laporan, dan error; id tak dikenal null", async () => {
    const id = createJob();
    const running: AgentProgress[] = ALL_AGENTS.map((agent) => ({
      agent,
      state: "running" as const,
    }));
    updateJob(id, { progress: running });
    expect(getJob(id)?.progress.every((p) => p.state === "running")).toBe(true);

    const meta = createMetaClient({ forceMock: true });
    const { onProgress } = collectProgress();
    const report = await analyzeReview(fakeInput(), meta, onProgress, {
      agentTimeoutMs: 5000,
      retryDelayMs: 5,
      runners: makeRunners({
        delays: {
          youtube: 10,
          tiktok: 10,
          facebook: 10,
          copyright: 10,
          legal_id: 10,
          packaging_privacy: 10,
        },
        events: [],
        calls: freshCalls(),
      }),
    });
    updateJob(id, { report });
    expect(getJob(id)?.report).toEqual(report);
    expect(getJob(id)?.error).toBeNull();

    const idErr = createJob();
    updateJob(idErr, { error: "Durasi video melebihi batas maksimum 180 detik." });
    expect(getJob(idErr)?.error).toContain("180 detik");
    expect(getJob(idErr)?.report).toBeNull();

    expect(getJob("job-yang-tidak-ada-123")).toBeNull();
    // updateJob pada id tak dikenal tidak melempar.
    expect(() => updateJob("job-yang-tidak-ada-123", { error: "x" })).not.toThrow();
    expect(getJob("job-yang-tidak-ada-123")).toBeNull();
  });

  it("dua instance store (re-instantiation modul) berbagi state via globalThis", async () => {
    const idFromFirst = createJob();
    updateJob(idFromFirst, { error: "penanda-dari-instance-pertama" });
    expect(getJob(idFromFirst)?.error).toBe("penanda-dari-instance-pertama");

    vi.resetModules();
    const second = await import("./store");

    // Instance kedua melihat job yang dibuat instance pertama.
    expect(second.getJob(idFromFirst)?.error).toBe("penanda-dari-instance-pertama");
    expect(second.getJob(idFromFirst)?.progress).toHaveLength(6);

    // Dan sebaliknya: job dari instance kedua terlihat di instance pertama.
    const idFromSecond = second.createJob();
    second.updateJob(idFromSecond, { error: "penanda-dari-instance-kedua" });
    expect(getJob(idFromSecond)?.error).toBe("penanda-dari-instance-kedua");

    // Snapshot tetap hasil klon: mutasi hasil getJob tidak mengubah store.
    const snap = second.getJob(idFromFirst);
    expect(snap).not.toBeNull();
    if (snap && snap.progress[0]) {
      snap.progress[0].state = "done";
      snap.error = "mutasi-lokal";
    }
    expect(second.getJob(idFromFirst)?.error).toBe("penanda-dari-instance-pertama");
    expect(getJob(idFromFirst)?.progress[0]?.state).toBe("queued");

    // Map yang sama memang berada di globalThis.
    const globalMap = (
      globalThis as unknown as { __cekduluJobs?: Map<string, unknown> }
    ).__cekduluJobs;
    expect(globalMap).toBeInstanceOf(Map);
    expect(globalMap?.has(idFromFirst)).toBe(true);
    expect(globalMap?.has(idFromSecond)).toBe(true);
  });
});

// Route handler dipanggil langsung sebagai fungsi (tanpa boot server).
describe("route handlers — pemanggilan langsung tanpa server", () => {
  it("POST tanpa video mengembalikan 400 JSON {error}", async () => {
    const form = new FormData();
    form.set("title", "Judul tanpa video");
    const res = await postAnalyze(
      new Request("http://localhost/api/analyze", { method: "POST", body: form }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: unknown };
    expect(typeof body.error).toBe("string");
    expect((body.error as string).length).toBeGreaterThan(0);
  });

  it("GET job tak dikenal mengembalikan 404 JSON {error}", async () => {
    const res = await getJobSnapshot(
      new Request("http://localhost/api/jobs/tidak-ada"),
      { params: Promise.resolve({ id: "tidak-ada-sama-sekali" }) },
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: unknown };
    expect(typeof body.error).toBe("string");
  });

  it("POST dengan META_MOCK=1 mengembalikan 202 {job_id} lalu GET memberi laporan valid", async () => {
    const savedMock = process.env.META_MOCK;
    process.env.META_MOCK = "1";
    try {
      const form = new FormData();
      form.set(
        "video",
        new File([new Uint8Array([1, 2, 3, 4])], "clip.mp4", { type: "video/mp4" }),
      );
      form.set("title", "Judul rute uji");
      form.set("caption", "Caption rute uji");
      form.set("extraContext", "");
      const res = await postAnalyze(
        new Request("http://localhost/api/analyze", { method: "POST", body: form }),
      );
      expect(res.status).toBe(202);
      const body = (await res.json()) as { job_id?: unknown };
      expect(typeof body.job_id).toBe("string");
      const jobId = body.job_id as string;
      expect(jobId.length).toBeGreaterThan(0);

      type SnapshotJson = {
        progress: AgentProgress[];
        report: unknown;
        error: string | null;
      };
      let snapshot: SnapshotJson | null = null;
      for (let attempt = 0; attempt < 100; attempt++) {
        const getRes = await getJobSnapshot(
          new Request(`http://localhost/api/jobs/${jobId}`),
          { params: Promise.resolve({ id: jobId }) },
        );
        expect(getRes.status).toBe(200);
        snapshot = (await getRes.json()) as SnapshotJson;
        if (snapshot && (snapshot.report !== null || snapshot.error !== null)) break;
        await delay(20);
      }
      expect(snapshot).not.toBeNull();
      expect(snapshot?.error).toBeNull();
      expect(snapshot?.report).not.toBeNull();
      expect(() => FinalReportSchema.parse(snapshot?.report)).not.toThrow();
      expect(snapshot?.progress).toHaveLength(6);
    } finally {
      if (savedMock === undefined) delete process.env.META_MOCK;
      else process.env.META_MOCK = savedMock;
    }
  });
});
