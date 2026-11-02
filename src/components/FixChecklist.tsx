"use client";

import { createElement as h, useState } from "react";

export type FixChecklistProps = {
  items?: string[];
  checklist?: string[];
  fixChecklist?: string[];
  fix_checklist?: string[];
};

export function FixChecklist(props: FixChecklistProps) {
  const items = props.items ?? props.checklist ?? props.fixChecklist ?? props.fix_checklist ?? [];
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [copyStatus, setCopyStatus] = useState<string>("");

  function toggle(index: number) {
    setChecked((previous) => ({ ...previous, [index]: !previous[index] }));
  }

  async function handleCopy() {
    const text = items.map((item) => `- ${item}`).join("\n");
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopyStatus("Checklist copied as text.");
        return;
      }
      throw new Error("Clipboard API unavailable.");
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied =
          typeof document.execCommand === "function" ? document.execCommand("copy") : false;
        document.body.removeChild(textarea);
        setCopyStatus(
          copied
            ? "Checklist copied as text."
            : "Copy manually: select the checklist text, then copy.",
        );
      } catch {
        setCopyStatus("Copy manually: select the checklist text, then copy.");
      }
    }
  }

  const doneCount = items.filter((_, index) => checked[index]).length;
  const percent = items.length === 0 ? 0 : Math.round((doneCount / items.length) * 100);

  const listNode =
    items.length === 0
      ? h(
          "p",
          { className: "mt-4 text-sm text-slate-600" },
          "No fix actions in this report.",
        )
      : h(
          "ul",
          { className: "mt-4 space-y-2.5" },
          ...items.map((item, index) => {
            const isChecked = Boolean(checked[index]);
            return h(
              "li",
              { key: `${item}-${index}` },
              h(
                "label",
                {
                  className:
                    "flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-slate-300",
                },
                h("input", {
                  type: "checkbox",
                  checked: isChecked,
                  onChange: () => toggle(index),
                  className: "h-5 w-5 shrink-0 accent-blue-600",
                }),
                h(
                  "span",
                  {
                    className: isChecked
                      ? "text-sm leading-6 text-slate-400 line-through"
                      : "text-sm leading-6 text-slate-800",
                  },
                  item,
                ),
              ),
            );
          }),
        );

  return h(
    "section",
    {
      "data-testid": "fix-checklist",
      className: "rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm sm:p-6",
    },
    h(
      "div",
      { className: "flex flex-wrap items-start justify-between gap-3" },
      h(
        "div",
        null,
        h("h2", { className: "text-lg font-bold" }, "Fix checklist"),
        h(
          "p",
          { className: "mt-0.5 text-sm text-slate-500" },
          "Tick items off as you edit, then re-check before posting.",
        ),
      ),
      h(
        "div",
        { className: "flex flex-col items-end gap-2" },
        h(
          "p",
          { className: "text-sm font-semibold text-blue-700" },
          `${doneCount} of ${items.length} fixed`,
        ),
        h(
          "button",
          {
            type: "button",
            onClick: handleCopy,
            className:
              "min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50",
          },
          "Copy checklist as text",
        ),
      ),
    ),
    h(
      "div",
      { className: "mt-4", "aria-hidden": true },
      h(
        "div",
        { className: "h-2 overflow-hidden rounded-full bg-slate-100" },
        h("div", {
          className: "h-2 rounded-full bg-blue-600 transition-all",
          style: { width: `${percent}%` },
        }),
      ),
      h(
        "div",
        { className: "mt-1.5 flex justify-between text-xs text-slate-500" },
        h("span", null, `${percent}% complete`),
        h("span", null, `${items.length - doneCount} items left`),
      ),
    ),
    listNode,
    copyStatus
      ? h("p", { "aria-live": "polite", className: "mt-3 text-sm text-slate-600" }, copyStatus)
      : null,
  );
}

export default FixChecklist;
