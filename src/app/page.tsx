"use client";

import { createElement as h, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DISCLAIMER } from "../lib/contracts/schemas";
import { SiteHeader } from "../components/SiteHeader";

function UploadIcon() {
  return h(
    "svg",
    {
      width: 26,
      height: 26,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true,
    },
    h("path", { d: "M7 18a4.5 4.5 0 1 1 .6-8.96A5.5 5.5 0 0 1 18.3 11 3.5 3.5 0 0 1 17.5 18H7z" }),
    h("path", { d: "M12 12v8" }),
    h("path", { d: "m9.5 14.5 2.5-2.5 2.5 2.5" }),
  );
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

const inputClass =
  "mt-2 block min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";

export default function HomePage() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [captionLength, setCaptionLength] = useState(0);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const thumbInputRef = useRef<HTMLInputElement | null>(null);
  let router: ReturnType<typeof useRouter> | null = null;
  try {
    // Outside an App Router context (for example component tests) no router exists.
    router = useRouter();
  } catch {
    router = null;
  }

  function handleVideoChange(event: ChangeEvent<HTMLInputElement>) {
    setVideoFile(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (videoInputRef.current) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      videoInputRef.current.files = transfer.files;
    }
    setVideoFile(file);
  }

  function removeVideo() {
    if (videoInputRef.current) videoInputRef.current.value = "";
    setVideoFile(null);
  }

  function handleThumbChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setThumbPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const form = event.currentTarget;
      const raw = new FormData(form);
      const payload = new FormData();
      const video = raw.get("video");
      if (video !== null) payload.append("video", video as Blob);
      const thumbnail = raw.get("thumbnail");
      if (thumbnail instanceof File && thumbnail.size > 0) {
        payload.append("thumbnail", thumbnail);
      }
      const title = raw.get("title");
      payload.append("title", typeof title === "string" ? title : "");
      const caption = raw.get("caption");
      payload.append("caption", typeof caption === "string" ? caption : "");
      const extraRaw = raw.get("extraContext") ?? raw.get("extra_context");
      payload.append(
        "extraContext",
        typeof extraRaw === "string" ? extraRaw : "",
      );

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: payload,
      });

      if (!response.ok) {
        let message = `Upload rejected (${response.status}).`;
        try {
          const data = (await response.json()) as { error?: unknown };
          if (typeof data.error === "string" && data.error.trim()) {
            message = data.error;
          }
        } catch {
          // Keep the status message when the body is not JSON.
        }
        setError(message);
        setSubmitting(false);
        return;
      }

      const data = (await response.json()) as { job_id?: unknown };
      if (typeof data.job_id !== "string" || !data.job_id) {
        setError("The server did not return an analysis job ID. Try again.");
        setSubmitting(false);
        return;
      }

      const target = `/report?job=${encodeURIComponent(data.job_id)}`;
      if (router) {
        router.push(target);
      } else if (typeof window !== "undefined") {
        window.location.assign(target);
      }
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  const dropzone = h(
    "div",
    {
      role: "button",
      tabIndex: 0,
      "aria-label": "Choose a file to upload",
      onClick: () => videoInputRef.current?.click(),
      onKeyDown: (event: { key: string }) => {
        if (event.key === "Enter" || event.key === " ") videoInputRef.current?.click();
      },
      onDragOver: (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragging(true);
      },
      onDragLeave: () => setDragging(false),
      onDrop: handleDrop,
      className: `flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors ${
        dragging ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"
      }`,
    },
    h(
      "span",
      { className: "flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600" },
      h(UploadIcon),
    ),
    h(
      "p",
      { className: "mt-3 text-[15px] font-semibold text-slate-900" },
      "Drop your video here, or ",
      h("span", { className: "text-blue-600" }, "click to browse"),
    ),
    h("p", { className: "mt-1 text-sm text-slate-500" }, "MP4 or MOV, max 3 minutes"),
  );

  const fileChip = videoFile
    ? h(
        "div",
        { className: "mt-3 flex min-h-[44px] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5" },
        h(
          "span",
          { className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-blue-600", "aria-hidden": true },
          "▦",
        ),
        h(
          "p",
          { className: "min-w-0 flex-1 truncate text-sm font-medium text-slate-800" },
          `${videoFile.name} · ${formatSize(videoFile.size)}`,
        ),
        h(
          "button",
          {
            type: "button",
            onClick: removeVideo,
            className: "min-h-[36px] shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50",
          },
          "Remove",
        ),
      )
    : null;

  return h(
    "div",
    { className: "min-h-screen" },
    h(SiteHeader),
    h(
      "main",
      { className: "mx-auto w-full max-w-4xl px-4 py-8 text-slate-900 sm:px-6 sm:py-10" },
      h(
        "form",
        {
          className: "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8",
          onSubmit: handleSubmit,
        },
        h("h1", { className: "text-2xl font-bold tracking-tight" }, "Upload video"),
        h(
          "p",
          { className: "mt-1.5 text-[15px] leading-6 text-slate-500" },
          "We read the transcript, watch the frames and listen to the audio. You get a list of what to fix before anyone can flag it.",
        ),
        h(
          "div",
          { className: "mt-6" },
          h("label", { htmlFor: "video", className: "block text-sm font-semibold" }, "Video"),
          h("input", {
            ref: videoInputRef,
            id: "video",
            name: "video",
            type: "file",
            accept: "video/*",
            className: "sr-only",
            onChange: handleVideoChange,
          }),
          h("div", { className: "mt-2" }, dropzone),
          error
            ? h(
                "p",
                { role: "alert", className: "mt-3 flex items-start gap-2 text-sm font-medium text-red-600" },
                h("span", { "aria-hidden": true }, "▲"),
                error,
              )
            : null,
          fileChip,
        ),
        h(
          "div",
          { className: "mt-7 border-t border-slate-100 pt-6" },
          h("label", { htmlFor: "title", className: "block text-sm font-semibold" }, "Title"),
          h("input", {
            id: "title",
            name: "title",
            type: "text",
            placeholder: "Write a proposed title",
            className: inputClass,
          }),
        ),
        h(
          "div",
          { className: "mt-5" },
          h("label", { htmlFor: "caption", className: "block text-sm font-semibold" }, "Caption"),
          h("textarea", {
            id: "caption",
            name: "caption",
            rows: 4,
            placeholder: "Write a proposed caption",
            className: inputClass,
            onChange: (event: ChangeEvent<HTMLTextAreaElement>) =>
              setCaptionLength(event.target.value.length),
          }),
          h(
            "div",
            { className: "mt-1.5 flex items-center justify-between text-[13px] text-slate-400" },
            h("span", null, "Claims in captions are checked too"),
            h("span", null, `${captionLength} characters`),
          ),
        ),
        h(
          "div",
          { className: "mt-5" },
          h("label", { htmlFor: "thumbnail", className: "block text-sm font-semibold" }, "Thumbnail"),
          h("input", {
            ref: thumbInputRef,
            id: "thumbnail",
            name: "thumbnail",
            type: "file",
            accept: "image/*",
            className: "sr-only",
            onChange: handleThumbChange,
          }),
          h(
            "div",
            { className: "mt-2 flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 p-3.5" },
            thumbPreview
              ? h("img", {
                  src: thumbPreview,
                  alt: "Thumbnail preview",
                  className: "h-20 w-32 rounded-lg object-cover",
                })
              : h(
                  "div",
                  {
                    className:
                      "flex h-20 w-32 flex-col items-center justify-center rounded-lg bg-slate-100 text-[13px] text-slate-400",
                    "aria-hidden": true,
                  },
                  h("span", { className: "text-lg" }, "▧"),
                  "Preview",
                ),
            h(
              "div",
              null,
              h(
                "button",
                {
                  type: "button",
                  onClick: () => thumbInputRef.current?.click(),
                  className:
                    "min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50",
                },
                "Upload thumbnail",
              ),
              h("p", { className: "mt-2 text-[13px] text-slate-400" }, "JPG or PNG"),
              h(
                "p",
                { className: "mt-0.5 text-[13px] text-slate-400" },
                "1080 × 1920 works best for Shorts and Reels",
              ),
            ),
          ),
        ),
        h(
          "div",
          { className: "mt-5" },
          h(
            "label",
            { htmlFor: "extra-context", className: "block text-sm font-semibold" },
            "Extra context",
          ),
          h(
            "p",
            { className: "mt-1 text-sm text-slate-500" },
            "Example: permission from the work owner, news context, or an endorsement note.",
          ),
          h("textarea", {
            id: "extra-context",
            name: "extra_context",
            rows: 3,
            placeholder: "Add extra context if you have any",
            className: inputClass,
          }),
        ),
        h(
          "div",
          { className: "mt-7 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6" },
          h(
            "button",
            {
              type: "submit",
              disabled: submitting || !videoFile,
              className:
                "min-h-[48px] rounded-lg bg-blue-600 px-6 py-3 text-[15px] font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400",
            },
            submitting ? "Starting..." : "Analyze video",
          ),
          h(
            Link,
            {
              href: "/report",
              className:
                "inline-flex min-h-[48px] items-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-[15px] font-semibold text-slate-700 hover:bg-slate-50",
            },
            "Load example report",
          ),
        ),
        h(
          "p",
          { className: "mt-3 flex items-center gap-1.5 text-sm text-slate-500" },
          videoFile
            ? "Checks run in a batch. Most reports land in a few minutes."
            : "Select a video to continue.",
        ),
        h("p", { className: "mt-4 text-sm italic leading-6 text-slate-500" }, DISCLAIMER),
      ),
    ),
  );
}
