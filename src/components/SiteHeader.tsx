"use client";

import { createElement as h } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

function ShieldIcon() {
  return h(
    "svg",
    {
      width: 20,
      height: 20,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true,
    },
    h("path", { d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" }),
    h("path", { d: "m9 12 2 2 4-4" }),
  );
}

export function SiteHeader() {
  let pathname = "";
  try {
    // Outside an App Router context (for example component tests) no router exists.
    pathname = usePathname() ?? "";
  } catch {
    pathname = "";
  }
  const onReport = pathname.startsWith("/report");

  const navLink = (href: string, label: string, active: boolean) =>
    h(
      Link,
      {
        href,
        className: active
          ? "rounded-lg bg-blue-50 px-3.5 py-2 text-sm font-semibold text-blue-700"
          : "rounded-lg px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900",
      },
      label,
    );

  return h(
    "header",
    { className: "border-b border-slate-200 bg-white" },
    h(
      "div",
      { className: "mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6" },
      h(
        Link,
        { href: "/", className: "flex items-center gap-2.5" },
        h(
          "span",
          { className: "flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white" },
          h(ShieldIcon),
        ),
        h("span", { className: "text-lg font-bold tracking-tight text-slate-900" }, "CekDulu"),
      ),
      h("span", { className: "hidden h-5 w-px bg-slate-200 sm:block", "aria-hidden": true }),
      h("span", { className: "hidden text-sm text-slate-500 sm:block" }, "Check before you post"),
      h(
        "nav",
        { className: "ml-auto flex items-center gap-1", "aria-label": "Main" },
        navLink("/", "Home", !onReport),
        navLink("/report", "Example report", onReport),
      ),
    ),
  );
}

export default SiteHeader;
