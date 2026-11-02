import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { NextResponse } from "next/server";
import type { EvidenceInput } from "../../../lib/evidence/bundle";
import { analyzeReview } from "../../../lib/jobs/analyze";
import { createJob, updateJob } from "../../../lib/jobs/store";
import { createMetaClient } from "../../../lib/meta/client";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 200 * 1024 * 1024;

function textField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function safeFileName(originalName: string, fallbackBase: string): string {
  const base = basename(originalName || "");
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (cleaned && cleaned !== "." && cleaned !== "..") return cleaned;
  return fallbackBase;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Analysis failed to start.";
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form format." }, { status: 400 });
  }

  const videoEntry = form.get("video");
  if (!(videoEntry instanceof File) || videoEntry.size === 0) {
    return NextResponse.json({ error: "Video file is required." }, { status: 400 });
  }
  if (videoEntry.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "Video file exceeds the 200MB limit." },
      { status: 413 },
    );
  }

  const thumbnailEntry = form.get("thumbnail");
  const thumbnail =
    thumbnailEntry instanceof File && thumbnailEntry.size > 0 ? thumbnailEntry : null;
  if (thumbnail && thumbnail.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "Thumbnail file exceeds the 200MB limit." },
      { status: 413 },
    );
  }

  const title = textField(form, "title");
  const caption = textField(form, "caption");
  const extraContext =
    textField(form, "extraContext") ||
    textField(form, "extra_context") ||
    textField(form, "extra-context");

  let meta;
  try {
    meta = createMetaClient();
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }

  const jobId = createJob();

  try {
    const dir = join(tmpdir(), "cekdulu", jobId);
    await mkdir(dir, { recursive: true });

    const videoExt = extname(videoEntry.name) || ".mp4";
    const videoFileName = safeFileName(videoEntry.name, `video${videoExt}`);
    const videoPath = join(dir, videoFileName);
    await writeFile(videoPath, Buffer.from(await videoEntry.arrayBuffer()));

    let thumbnailPath: string | null = null;
    if (thumbnail) {
      const thumbExt = extname(thumbnail.name) || ".jpg";
      thumbnailPath = join(dir, safeFileName(thumbnail.name, `thumbnail${thumbExt}`));
      await writeFile(thumbnailPath, Buffer.from(await thumbnail.arrayBuffer()));
    }

    const evidenceInput: EvidenceInput = {
      videoPath,
      thumbnailPath,
      title,
      caption,
      extraContext,
    };

    void analyzeReview(evidenceInput, meta, (progress) => {
      updateJob(jobId, { progress });
    })
      .then((report) => {
        updateJob(jobId, { report });
      })
      .catch((err: unknown) => {
        updateJob(jobId, { error: errorMessage(err) });
      });

    return NextResponse.json({ job_id: jobId }, { status: 202 });
  } catch (err) {
    const message = errorMessage(err);
    updateJob(jobId, { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
