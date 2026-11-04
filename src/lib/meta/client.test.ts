import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMetaClient, MetaError } from "./client";

const ENV_KEYS = ["META_MOCK", "META_API_KEY", "META_BASE_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("mock mode", () => {
  it("returns transcript segments with numeric timestamps without a key", async () => {
    const client = createMetaClient({ forceMock: true });
    const segments = await client.transcribe("audio.wav");
    expect(segments.length).toBeGreaterThan(0);
    for (const s of segments) {
      expect(typeof s.start_sec).toBe("number");
      expect(typeof s.end_sec).toBe("number");
      expect(s.end_sec).toBeGreaterThanOrEqual(s.start_sec);
      expect(s.text.length).toBeGreaterThan(0);
    }
  });

  it("returns fixture-shaped scenes and keyframe findings without a key", async () => {
    const client = createMetaClient({ forceMock: true });
    const scenes = await client.understandVideo("video.mp4");
    expect(scenes.length).toBeGreaterThan(0);
    expect(typeof scenes[0]?.start_sec).toBe("number");
    const findings = await client.understandImages(["frame.jpg"]);
    expect(findings.length).toBeGreaterThan(0);
    expect(typeof findings[0]?.at_sec).toBe("number");
    const localized = await client.localizeKeyframe("frame.jpg", "license_plate");
    expect(localized.length).toBeGreaterThan(0);
    expect(typeof localized[0]?.at_sec).toBe("number");
  });

  it("honours META_MOCK=1 from the environment with no network and no key", async () => {
    process.env.META_MOCK = "1";
    const client = createMetaClient();
    const segments = await client.transcribe("audio.wav");
    expect(segments.length).toBeGreaterThan(0);
  });

  it("reasonJson resolves in mock mode without a key", async () => {
    const client = createMetaClient({ forceMock: true });
    await expect(client.reasonJson("sys", { a: 1 })).resolves.toBeDefined();
  });
});

describe("real mode config", () => {
  it("throws MetaError code config without an API key", () => {
    let caught: unknown;
    try {
      createMetaClient({ forceMock: false });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MetaError);
    expect((caught as MetaError).code).toBe("config");
  });
});

describe("real mode Responses shape (observed live 2026-10-30)", () => {
  it("posts model+input with Bearer auth and parses output message text as JSON", async () => {
    let seenUrl = "";
    let seenAuth: string | null = null;
    let seenBody: unknown;
    const fetchFn = (async (url: unknown, init: { headers?: Record<string, string>; body?: string }) => {
      seenUrl = String(url);
      seenAuth = init?.headers?.authorization ?? init?.headers?.Authorization ?? null;
      seenBody = JSON.parse(String(init?.body ?? "{}")) as unknown;
      return new Response(
        JSON.stringify({
          object: "response",
          status: "completed",
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: '{"findings":[]}' }],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    const client = createMetaClient({
      forceMock: false,
      apiKey: "test-key-not-real",
      baseUrl: "https://api.meta.ai/v1",
      fetchFn,
      retryDelayMs: 0,
    });
    await expect(client.reasonJson("sys", { a: 1 })).resolves.toEqual({ findings: [] });
    expect(seenUrl).toBe("https://api.meta.ai/v1/responses");
    expect(seenAuth).toBe("Bearer test-key-not-real");
    expect((seenBody as { model?: string }).model).toBe("muse-spark-1.3");
    expect(Array.isArray((seenBody as { input?: unknown }).input)).toBe(true);
  });
});

describe("real mode images via Responses (base64 lampiran)", () => {
  it("mengirim frame sebagai input_image data URL dan men-snap at_sec ke label terdekat", async () => {
    const framePath = join(tmpdir(), `cekdulu-client-test-${process.pid}.jpg`);
    await writeFile(framePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    let seenUrl = "";
    let seenBody: unknown;
    const fetchFn = (async (url: unknown, init: { body?: string }) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body ?? "{}")) as unknown;
      return new Response(
        JSON.stringify({
          object: "response",
          status: "completed",
          output: [
            {
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: '[{"at_sec":7,"kind":"license_plate","description":"A plate is visible."}]',
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    const client = createMetaClient({
      forceMock: false,
      apiKey: "test-key-not-real",
      baseUrl: "https://api.meta.ai/v1",
      fetchFn,
      retryDelayMs: 0,
    });
    const findings = await client.understandImages([framePath], [5]);
    expect(seenUrl).toBe("https://api.meta.ai/v1/responses");
    const body = seenBody as {
      input?: Array<{ content?: Array<{ type?: string; image_url?: string; text?: string }> }>;
    };
    const parts = body.input?.[0]?.content ?? [];
    const imagePart = parts.find((part) => part.type === "input_image");
    expect(imagePart?.image_url?.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(parts.some((part) => part.text === "Frame at 5 seconds:")).toBe(true);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.at_sec).toBe(5);
    expect(findings[0]?.kind).toBe("license_plate");
  });
});

describe("timeout handling", () => {
  it("rejects with code timeout when fetch never resolves", async () => {
    const hangingFetch = (() =>
      new Promise<Response>(() => {})) as unknown as typeof fetch;
    const client = createMetaClient({
      forceMock: false,
      apiKey: "test-key-not-real",
      baseUrl: "https://example.invalid",
      fetchFn: hangingFetch,
      timeoutMs: { transcribe: 50 },
      retryDelayMs: 0,
    });
    let caught: unknown;
    try {
      await client.transcribe("audio.wav");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MetaError);
    expect((caught as MetaError).code).toBe("timeout");
  });
});
