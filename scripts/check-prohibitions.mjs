#!/usr/bin/env node
/**
 * CekDulu prohibition scan — T-403 (Task 17).
 *
 * Plain Node, no dependencies. Walks repo text files and prints
 * file:line per hit. Exit code is non-zero when any hit class has a
 * hit or the disclaimer check fails; zero when clean.
 *
 * Run: node scripts/check-prohibitions.mjs
 *
 * ------------------------------------------------------------------
 * Exclusion list for class (a) — non-Meta model names
 * ------------------------------------------------------------------
 * The following files legitimately name the banned models while
 * stating the ban itself, so they are excluded from class (a):
 *   - docs/superpowers/plans/2026-10-30-cekdulu-mvp.md  (this plan file)
 *   - AGENTS.md
 *   - TASKS.md
 *   - docs/contracts.md
 *   - docs/superpowers/**  (ledger, reports, verdicts, and the plan;
 *     they quote the ban and prior scan evidence)
 *   - scripts/check-prohibitions.mjs  (this checker; it must name
 *     the patterns in order to search for them)
 * The same ledger exclusions are applied to class (b) for the same
 * reason: those files describe key patterns in prose, they do not
 * contain real secrets. Product and demo-facing files (README.md,
 * docs/demo-script.md, .env.example, src/**, data/**,
 * package.json) ARE scanned.
 *
 * Global ignores for every class:
 *   - directories: node_modules/, .next/, .git/
 *   - local secret files: .env.local and .env.*.local (never committed;
 *     the scanner guards the committed tree, and .gitignore lists them.
 *     Added 2026-10-30 when a local key was installed. .env.example
 *     remains scanned and must stay placeholder-only)
 *   - generated files: package-lock.json, tsconfig.tsbuildinfo
 *     (lockfile hashes and build file lists are not source copy;
 *     dependency truth is package.json, which IS scanned)
 *   - binary files (denylist extensions + NUL-byte sniff)
 *
 * ------------------------------------------------------------------
 * Classes
 * ------------------------------------------------------------------
 * (a) Non-Meta model names, case-insensitive:
 *     YOLO, Whisper, OpenAI, Google Vision, ElevenLabs.
 *     Scope: all scanned text files except the exclusion list above.
 *
 * (b) Real API-key material. Two sub-checks over the same scope
 *     as (a):
 *       1. META_API_KEY assignments whose value is not a
 *          placeholder (see isPlaceholderValue). Empty values,
 *          example/placeholder/your-* values, angle-bracket
 *          placeholders, ${...} expansions, and punctuation-only
 *          values are NOT hits. In particular .env.example, which
 *          ships empty placeholders, must never hit.
 *       2. Common key prefixes with a length threshold so short
 *          substrings in ordinary words never hit:
 *          sk- + 20+ chars, gsk_ + 20+ chars, AKIA + 16 chars.
 *          The threshold is why data-testid="risk-card" or the
 *          word "task" can never hit; see the borderline notes
 *          printed with the results.
 *
 * (c) Real-time claims in USER-FACING copy only.
 *     Scope: src/app/** + src/components/** + data/rules/** +
 *     data/examples/*.md, excluding *.test.* files.
 *     Patterns (case-insensitive): "real-time", "realtime",
 *     "real time", "live detection", "deteksi langsung".
 *     Justification: src/app pages/routes, components, rule
 *     guidance, and the examples README are shipped or demo-facing
 *     copy. src/lib/** internals, scripts, and docs/superpowers
 *     are excluded because comments there may discuss batch vs
 *     real-time behaviour without making a user claim. Test files
 *     are excluded because they are never shipped copy; the
 *     Vitest API name vi.useRealTimers() contains the substring
 *     "realtime" but is a fake-timer call, not a claim, and prior
 *     verifiers recorded it as a known false positive.
 *
 * (d) Certainty wording in source + data:
 *     "pasti bebas", "pasti melanggar", "aman secara hukum"
 *     (case-insensitive, whitespace-tolerant).
 *     Scope: src/** + data/**, excluding *.test.* files.
 *     Why tests are excluded: tests that guard this ban must
 *     contain these strings as literals (for example the BANNED
 *     list in data/rules/rules.test.ts) in order to assert their
 *     absence from product output. Flagging the guard itself
 *     would punish the protection; the separate verifier confirms
 *     those assertions really assert absence. Also excluded (they
 *     quote the ban; outside the src+data scope in any case):
 *     docs/superpowers/**, AGENTS.md, TASKS.md, docs/contracts.md,
 *     and this checker.
 *
 * (e) Disclaimer presence — reported as PASS/FAIL, not a hit scan.
 *     PASS requires both:
 *       1. src/lib/contracts/schemas.ts exports DISCLAIMER with
 *          the exact contract sentence, and
 *       2. report UI under src/app/** or src/components/**
 *          references DISCLAIMER (the report renders it verbatim;
 *          FinalReport.legal_id.disclaimer is typed as that
 *          literal in the schema).
 *
 * (f) Pasal invention guard: /pasal\s*\d+/i (loose on purpose so
 *     it also catches "Pasal28" with no space — this closes the
 *     Task 10 parked low where /Pasal\s+\d+/ missed that form).
 *     Scope: src/** + data/** INCLUDING test files, because a
 *     literal "Pasal 28" anywhere in source or data is an
 *     invented article number.
 *     Guard-pattern handling: regex literals in code such as
 *     /Pasal\s+\d+/i are the guard itself, not an invention.
 *     Approach (crude, documented): each line is first stripped
 *     of /.../ regex literals, and any line containing an escaped
 *     regex fragment (backslash-s or backslash-d) or the
 *     PASAL_PATTERN constant name is skipped as a pattern
 *     definition. The pasal regex is then applied to the cleaned
 *     line only. String constructions such as
 *     ["Pasal", "28"].join(" ") never match the cleaned-line
 *     regex either, because no literal pasal+digits sequence
 *     exists in the source text.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const CHECKER_REL = "scripts/check-prohibitions.mjs";
const EXPECTED_DISCLAIMER =
  "Initial screening, not a platform decision, not Content ID, and not legal advice.";

const IGNORED_DIRS = new Set(["node_modules", ".next", ".git"]);
const IGNORED_FILES = new Set([".env.local"]);

function isLocalEnvFile(name) {
  return IGNORED_FILES.has(name) || /^\.env\..+\.local$/i.test(name);
}
const GENERATED_FILES = new Set(["package-lock.json", "tsconfig.tsbuildinfo"]);
const TEXT_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".md", ".txt", ".css", ".html", ".htm",
  ".xml", ".yaml", ".yml", ".toml", ".sh", ".ps1",
  ".example", ".env",
]);
const BINARY_EXTS = new Set([
  ".mp4", ".mov", ".avi", ".mkv", ".webm",
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf",
  ".zip", ".gz", ".woff", ".woff2", ".ttf", ".eot",
  ".mp3", ".wav", ".ogg", ".bin", ".exe", ".dll",
]);

function toPosix(p) {
  return p.split(sep).join("/");
}

function isTestFile(relPosix) {
  return /\.test\.[^.]+$/i.test(relPosix) || /\.spec\.[^.]+$/i.test(relPosix);
}

function isExcludedLedger(relPosix) {
  if (relPosix === CHECKER_REL) return true;
  if (relPosix === "AGENTS.md") return true;
  if (relPosix === "TASKS.md") return true;
  if (relPosix === "docs/contracts.md") return true;
  if (relPosix === "docs/superpowers/plans/2026-10-30-cekdulu-mvp.md") return true;
  if (relPosix.startsWith("docs/superpowers/")) return true;
  return false;
}

function walk(dirAbs, out) {
  let entries;
  try {
    entries = readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walk(join(dirAbs, entry.name), out);
    } else if (entry.isFile()) {
      if (isLocalEnvFile(entry.name)) continue;
      out.push(join(dirAbs, entry.name));
    }
  }
  return out;
}

function isCandidateText(absPath, relPosix) {
  const ext = extname(absPath).toLowerCase();
  if (BINARY_EXTS.has(ext)) return false;
  const base = relPosix.split("/").pop() ?? "";
  if (base.startsWith(".env")) return true;
  if (TEXT_EXTS.has(ext)) return true;
  if (ext === "") {
    try {
      const buf = readFileSync(absPath);
      if (buf.length > 2_000_000) return false;
      const probe = buf.subarray(0, 8192);
      return !probe.includes(0);
    } catch {
      return false;
    }
  }
  return false;
}

// --- class (a) patterns -------------------------------------------------
const MODEL_PATTERNS = [
  { name: "YOLO", regex: /yolo/i },
  { name: "Whisper", regex: /whisper/i },
  { name: "OpenAI", regex: /openai/i },
  { name: "Google Vision", regex: /google\s+vision/i },
  { name: "ElevenLabs", regex: /elevenlabs/i },
];

// --- class (b) helpers --------------------------------------------------
function isPlaceholderValue(rawValue) {
  let v = String(rawValue ?? "").trim();
  // Unquote a quoted value; otherwise take the first token.
  if ((v.startsWith('"') && v.includes('"', 1)) || (v.startsWith("'") && v.includes("'", 1))) {
    const quote = v[0];
    const end = v.indexOf(quote, 1);
    v = v.slice(1, end);
  } else if (v.startsWith("`") && v.includes("`", 1)) {
    const end = v.indexOf("`", 1);
    v = v.slice(1, end);
  } else {
    v = v.split(/[\s#;]/)[0] ?? "";
  }
  v = v.replace(/;$/, "").trim();
  if (!v) return true;
  if (/^[`'"\s;,.\]\)}…]+$/.test(v)) return true;
  const lower = v.toLowerCase();
  const exact = new Set([
    "placeholder", "example", "test", "mock", "changeme", "change-me",
    "your-api-key", "your_api_key", "your-key", "your_key",
    "xxx", "...", "todo", "none", "null", "undefined",
    "dev", "development", "sample", "dummy", "fake",
    "replace-me", "replace_me", "insert-key-here", "<your-key>",
    "1", "0",
  ]);
  if (exact.has(lower)) return true;
  if (
    lower.includes("example") ||
    lower.includes("placeholder") ||
    lower.includes("your-") ||
    lower.includes("your_") ||
    lower.includes("changeme") ||
    lower.includes("change-me") ||
    lower.includes("insert") ||
    lower.includes("replace")
  ) {
    return true;
  }
  if (v.startsWith("<") && v.endsWith(">")) return true;
  if (v.startsWith("${") || v.startsWith("$")) return true;
  if (/^x{3,}$/i.test(v)) return true;
  if (/^(test|mock|fake|dummy|sample)[-_]/i.test(v)) return true;
  return false;
}

const KEY_PREFIX_PATTERNS = [
  { name: "sk- key prefix", make: () => /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "gsk_ key prefix", make: () => /\bgsk_[A-Za-z0-9_-]{20,}\b/g },
  { name: "AKIA key prefix", make: () => /\bAKIA[A-Z0-9]{16}\b/g },
];

// --- class (c) patterns -------------------------------------------------
const REALTIME_PATTERNS = [
  { name: "real-time", regex: /real-time/i },
  { name: "realtime", regex: /realtime/i },
  { name: "real time", regex: /real\s+time/i },
  { name: "live detection", regex: /live[-\s]+detection/i },
  { name: "deteksi langsung", regex: /deteksi\s+langsung/i },
];

// --- class (d) patterns -------------------------------------------------
const CERTAINTY_PATTERNS = [
  { name: "pasti bebas", regex: /pasti\s+bebas/i },
  { name: "pasti melanggar", regex: /pasti\s+melanggar/i },
  { name: "aman secara hukum", regex: /aman\s+secara\s+hukum/i },
  { name: "guaranteed copyright-free", regex: /guaranteed\s+copyright[-\s]?free/i },
  { name: "definitely violates", regex: /definitely\s+violates/i },
  { name: "certainly violates", regex: /certainly\s+violates/i },
  { name: "legally safe", regex: /legally\s+safe/i },
  { name: "guaranteed legal", regex: /guaranteed\s+legal/i },
  { name: "guaranteed to pass", regex: /guaranteed\s+to\s+pass/i },
];

// --- class (f) helpers --------------------------------------------------
const PASAL_REGEX = /(pasal|article)\s*\d+/i;

function stripRegexLiterals(line) {
  return line.replace(/\/(?:\\.|[^/\\\n])+\/[a-z]*/gi, " ");
}

function isGuardLine(line) {
  if (line.includes("PASAL_PATTERN")) return true;
  if (line.includes("\\s") || line.includes("\\d")) return true;
  if (/\/[^/\n]*pasal[^/\n]*\//i.test(line)) return true;
  return false;
}

function isInScopeC(relPosix) {
  if (isTestFile(relPosix)) return false;
  if (relPosix.startsWith("src/app/")) return true;
  if (relPosix.startsWith("src/components/")) return true;
  if (relPosix.startsWith("data/rules/")) return true;
  if (relPosix.startsWith("data/examples/") && relPosix.toLowerCase().endsWith(".md")) return true;
  return false;
}

function isInScopeSrcData(relPosix) {
  return relPosix.startsWith("src/") || relPosix.startsWith("data/");
}

function excerpt(line) {
  const t = line.trim().replace(/\s+/g, " ");
  return t.length > 180 ? `${t.slice(0, 177)}...` : t;
}

// --- walk ----------------------------------------------------------------
const allAbs = walk(ROOT, []);
const scanned = [];
for (const abs of allAbs) {
  const relPosix = toPosix(relative(ROOT, abs));
  if (GENERATED_FILES.has(relPosix)) continue;
  if (!isCandidateText(abs, relPosix)) continue;
  scanned.push({ abs, rel: relPosix });
}
scanned.sort((a, b) => a.rel.localeCompare(b.rel));

// --- scan ----------------------------------------------------------------
const hitsA = [];
const hitsB = [];
const hitsC = [];
const hitsD = [];
const hitsF = [];
const skippedPlaceholders = [];

for (const { abs, rel } of scanned) {
  let content;
  try {
    content = readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  const lines = content.split(/\r?\n/);
  const ledgerExcluded = isExcludedLedger(rel);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const lineNo = i + 1;

    if (!ledgerExcluded) {
      // (a) non-Meta model names
      for (const pattern of MODEL_PATTERNS) {
        if (pattern.regex.test(line)) {
          hitsA.push({ file: rel, line: lineNo, pattern: pattern.name, text: excerpt(line) });
        }
      }
      // (b1) META_API_KEY assignments
      const metaMatch = line.match(/META_API_KEY\s*=\s*(.*)$/);
      if (metaMatch) {
        const rawValue = metaMatch[1] ?? "";
        if (isPlaceholderValue(rawValue)) {
          skippedPlaceholders.push({ file: rel, line: lineNo, text: excerpt(line) });
        } else {
          hitsB.push({
            file: rel,
            line: lineNo,
            pattern: "META_API_KEY with non-placeholder value",
            text: excerpt(line),
          });
        }
      }
      // (b2) common key prefixes
      for (const prefix of KEY_PREFIX_PATTERNS) {
        const regex = prefix.make();
        if (regex.test(line)) {
          hitsB.push({ file: rel, line: lineNo, pattern: prefix.name, text: excerpt(line) });
        }
      }
    }

    // (c) real-time claims, user-facing copy only
    if (isInScopeC(rel)) {
      for (const pattern of REALTIME_PATTERNS) {
        if (pattern.regex.test(line)) {
          hitsC.push({ file: rel, line: lineNo, pattern: pattern.name, text: excerpt(line) });
          break;
        }
      }
    }

    // (d) certainty wording, source + data, tests excluded
    if (isInScopeSrcData(rel) && !isTestFile(rel) && !ledgerExcluded) {
      for (const pattern of CERTAINTY_PATTERNS) {
        if (pattern.regex.test(line)) {
          hitsD.push({ file: rel, line: lineNo, pattern: pattern.name, text: excerpt(line) });
        }
      }
    }

    // (f) pasal invention guard, src + data including tests
    if (isInScopeSrcData(rel)) {
      if (!isGuardLine(line)) {
        const cleaned = stripRegexLiterals(line);
        if (PASAL_REGEX.test(cleaned)) {
          hitsF.push({ file: rel, line: lineNo, pattern: "pasal + digits", text: excerpt(line) });
        }
      }
    }
  }
}

// --- class (e) disclaimer presence ---------------------------------------
let disclaimerInSchema = false;
let disclaimerUiRefs = [];
try {
  const schemaPath = join(ROOT, "src/lib/contracts/schemas.ts");
  if (existsSync(schemaPath)) {
    const schemaText = readFileSync(schemaPath, "utf8");
    disclaimerInSchema =
      schemaText.includes("export const DISCLAIMER") &&
      schemaText.includes(EXPECTED_DISCLAIMER);
  }
} catch {
  disclaimerInSchema = false;
}
for (const { abs, rel } of scanned) {
  if (!(rel.startsWith("src/app/") || rel.startsWith("src/components/"))) continue;
  try {
    const uiText = readFileSync(abs, "utf8");
    const uiLines = uiText.split(/\r?\n/);
    for (let i = 0; i < uiLines.length; i += 1) {
      if (/\bDISCLAIMER\b/.test(uiLines[i] ?? "")) {
        disclaimerUiRefs.push(`${rel}:${i + 1}`);
      }
    }
  } catch {
    // ignore unreadable UI files; the FAIL path reports it
  }
}
const disclaimerPass = disclaimerInSchema && disclaimerUiRefs.length > 0;

// --- report ---------------------------------------------------------------
function printHits(label, hits) {
  console.log(`${label}: ${hits.length} hit(s)`);
  for (const hit of hits) {
    console.log(`  ${hit.file}:${hit.line}: [${label.split(" ")[0]}] ${hit.pattern} -- ${hit.text}`);
  }
  if (hits.length === 0) {
    console.log("  (none)");
  }
}

console.log("CekDulu prohibition scan (T-403)");
console.log(`Repo root: ${ROOT}`);
console.log(`Text files scanned: ${scanned.length} (node_modules/, .next/, .git/, binary and generated files skipped)`);
console.log("Exclusions (a)/(b): docs/superpowers/plans/2026-10-30-cekdulu-mvp.md, AGENTS.md, TASKS.md, docs/contracts.md, docs/superpowers/**, scripts/check-prohibitions.mjs");
console.log("");
printHits("(a) Non-Meta model names [YOLO|Whisper|OpenAI|Google Vision|ElevenLabs]", hitsA);
printHits("(b) Real API-key material [META_API_KEY non-placeholder + sk-/gsk_/AKIA prefixes]", hitsB);
printHits("(c) Real-time claims in user-facing copy [src/app + src/components + data/rules + data/examples/*.md, tests excluded]", hitsC);
printHits("(d) Certainty wording in source+data [tests excluded]", hitsD);
if (disclaimerPass) {
  console.log(`(e) Disclaimer presence: PASS (DISCLAIMER in src/lib/contracts/schemas.ts; UI refs: ${disclaimerUiRefs.join(", ")})`);
} else {
  console.log(`(e) Disclaimer presence: FAIL (in src/lib/contracts/schemas.ts: ${disclaimerInSchema ? "found" : "MISSING"}; UI refs: ${disclaimerUiRefs.length > 0 ? disclaimerUiRefs.join(", ") : "none found in src/app/** or src/components/**"})`);
}
printHits("(f) Pasal invention guard [/pasal\\s*\\d+/i over src+data incl. tests, guard literals stripped]", hitsF);
console.log("");
console.log("Summary (hit counts per class):");
console.log(`  (a) ${hitsA.length}`);
console.log(`  (b) ${hitsB.length}`);
console.log(`  (c) ${hitsC.length}`);
console.log(`  (d) ${hitsD.length}`);
console.log(`  (e) ${disclaimerPass ? "PASS" : "FAIL"}`);
console.log(`  (f) ${hitsF.length}`);
if (skippedPlaceholders.length > 0) {
  console.log("");
  console.log(`Borderline (b) placeholder assignments skipped as non-hits (${skippedPlaceholders.length}):`);
  for (const item of skippedPlaceholders) {
    console.log(`  ${item.file}:${item.line}: ${item.text}`);
  }
}
console.log("Borderline notes:");
console.log("  - .env.example ships empty META_API_KEY=/META_BASE_URL=/META_MOCK= values; they are placeholders by the rule above and never hit. Any future non-empty, non-placeholder assignment there WILL hit.");
console.log("  - src/lib/meta/config.ts reads process.env.META_API_KEY (no '=' assignment) and src/lib/meta/client.ts only mentions the variable name in an error message; neither is an assignment and neither hits.");
console.log("  - Key-prefix patterns require 20+ chars after sk-/gsk_ (16 after AKIA), so risk-card, task-*, and file names can never hit; docs quoting 'sk-...' with an ellipsis stay below the threshold.");
console.log("  - src/components/wiring.test.tsx vi.useRealTimers() contains the substring 'realtime' but is test harness, excluded from (c) as non-copy; it is not a user-facing real-time claim.");
console.log("  - Certainty literals inside *.test.* (for example data/rules/rules.test.ts BANNED list) are the absence guard and are excluded from (d) by design.");
console.log("  - Pasal guard definitions (/Pasal\\s+\\d+/i, PASAL_PATTERN) are stripped/skipped in (f); a literal 'Pasal 28' or 'Pasal28' in src/data would still hit.");

const totalHits = hitsA.length + hitsB.length + hitsC.length + hitsD.length + hitsF.length;
const failed = totalHits > 0 || !disclaimerPass;
console.log("");
console.log(`Total hits (a+b+c+d+f): ${totalHits}; disclaimer: ${disclaimerPass ? "PASS" : "FAIL"}`);
console.log(failed ? "Result: FAIL" : "Result: PASS");
process.exitCode = failed ? 1 : 0;
