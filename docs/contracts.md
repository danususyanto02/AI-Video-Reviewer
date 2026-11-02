# Shared Contract: CekDulu

This document freezes the interfaces between territories so parallel agents work with no waiting and no collisions. Concept source: `../../cekdulu-ai-video-reviewer.md`.

Only the Lead may change contract status. Changes are recorded in the Change Log at the bottom with date and reason.

Status: **FROZEN since 2026-10-30 (T-001, Lead decision)**. The implementation plan binding this table: `docs/superpowers/plans/2026-10-30-cekdulu-mvp.md`. The Zod machine schemas in `src/lib/contracts/` are the programmed form of this contract. When a schema and this document differ, this document wins and the difference is reported to the Lead.

---

## Decisions frozen by the Lead in the first task

The Lead fills and locks these rows before wave 1 starts. Agents never guess on their own.

| Decision | Locked value | Filled by |
|---|---|---|
| App language and framework | TypeScript 5, Next.js 15 (App Router, React 19), Node 22 LTS, Tailwind CSS v4, Zod for contract schemas. One language for frontend and backend. System ffmpeg/ffprobe binaries for Stage 0 media extraction. Package manager npm, lockfile must be committed | Lead, task T-001, locked 2026-10-30 |
| How to run tests | Vitest: `npm test` (= `vitest run`), `npm run typecheck` (= `tsc --noEmit`), `npm run build` for build checks. UI tests use Testing Library + jsdom. Exact per-task commands live in the implementation plan | Lead, task T-001, locked 2026-10-30 |
| Final folder names per territory | See the Final Folder Map table below. `src/lib/contracts/` belongs to the Lead and is read-only for other agents | Lead, task T-001, locked 2026-10-30 |
| Meta call timeouts | See the Timeout and Retry table below. One retry, 2 second backoff, typed timeout errors | Lead, task T-001, locked 2026-10-30 |
| Rule data format | JSON per domain in `data/rules/`, shaped `{version, updated_at, source, rules[]}`. Rule version format: `YYYY-MM-DD.N` (first `2026-10-30.1`) | Lead, task T-001, locked 2026-10-30 |
| Meta model per capability | Muse Spark/Wonder, Muse Voice Transcribe, Muse Image, SAM 3.1 per the concept | Locked by concept |
| API keys | Environment only, never in the repo. Variable names: `META_API_KEY`, `META_BASE_URL`, `META_MOCK` (`1` = mock mode with no network and no key) | Locked by concept, variable names locked by T-001 2026-10-30 |

### Final folder map (T-001)

The workspace root is the Next.js project root.

| Path | Owner | Contents |
|---|---|---|
| `src/lib/contracts/` | Lead | Zod schemas, shared types, contract constants, canonical mock fixtures. Read-only for A1-A7 |
| `src/lib/meta/` | A1 (T-101) | Meta client in mock and real modes, env config, typed errors |
| `src/lib/evidence/` | A2 (T-102) | Duration validation, ffmpeg extraction, `EvidenceBundle` builder, demo bundle |
| `data/rules/` | A3 (T-103) | `youtube.json`, `tiktok.json`, `facebook.json`, `copyright.json`, `legal_id.json` |
| `src/lib/agents/` | A4 (T-201 to T-206) | One file per runtime agent: `youtube.ts`, `tiktok.ts`, `facebook.ts`, `copyright.ts`, `legal_id.ts`, `packaging_privacy.ts`. No file imports another agent file |
| `src/lib/merge/` | A5 (T-301) | Finding merging, deterministic scoring, checklist, `FinalReport` builder |
| `src/lib/jobs/` | Lead (T-302) | In-memory job store and `analyzeReview` Stage 0-3 orchestration |
| `src/app/`, `src/components/` | A6 (T-104, T-303) | Upload page, six progress cards, progressive report page, checklist. `src/app/api/` orchestration routes are Lead work with A6 in T-302/T-303 |
| `data/examples/` | A7 (T-401, T-402) | Three labeled example cases, expected findings, saved report for the offline path |
| `docs/`, `TASKS.md` | Lead | Contract, plans, task board |

### Timeouts and retries (T-001)

Every call that fails on timeout produces a typed `timeout` error, distinct from network and HTTP errors. These values bind the Failure Contract below.

| Call | Timeout | Retry |
|---|---|---|
| Muse Voice Transcribe (`transcribe`) | 120 seconds | 1 time, 2 second backoff |
| Video Understanding (`understandVideo`) | 120 seconds | 1 time, 2 second backoff |
| Image Understanding (`understandImages`) | 60 seconds | 1 time, 2 second backoff |
| SAM 3.1 localization per keyframe (`localizeKeyframe`) | 30 seconds | 1 time, 2 second backoff |
| Reasoning per Stage 2 agent (each of six agents) | 60 seconds | 1 time, 2 second backoff |
| ffprobe duration probe (Stage 0) | 30 second process limit | No retry. The file is declared unreadable |
| UI job status polling | 1000 ms interval | Not a Meta call. Stops at the final report or a job error |

---

## Contract rules for every agent

1. Every data exchange between territories uses the shapes in this document. No homemade side shapes.
2. Status and level values may only use the registered vocabulary. Free text belongs only in evidence, impact, and fix fields.
3. Every finding must carry evidence. A finding with no timestamp and no thumbnail, title, caption, or transcript reference is invalid.
4. A5 computes final scores only. Runtime agents supply findings and severity levels, never final scores.
5. User-facing output language always uses risk language for copyright and law. The phrases "guaranteed copyright-free", "definitely violates", and "legally safe" are forbidden in every output. The earlier Indonesian bans ("pasti bebas", "pasti melanggar", "aman secara hukum") stay forbidden as well.

---

## Shared data shapes

### User input: `ReviewInput`

| Field | Shape | Notes |
|---|---|---|
| `video_ref` | File reference | One video file, 3 minutes at most |
| `title` | Text | Proposed title from the user |
| `caption` | Text | Proposed caption from the user |
| `thumbnail_ref` | File reference | One thumbnail image |
| `extra_context` | Text, may be empty | Work owner permission, news context, or an endorsement note |
| `platforms` | Always three values | `youtube`, `tiktok`, `facebook` in the MVP |

### Evidence bundle: `EvidenceBundle`

Produced by A2, consumed by every A4 agent. No A4 agent processes raw video on its own.

| Field | Contents |
|---|---|
| `duration_sec` | Video duration in seconds |
| `transcript` | Segment list `{start_sec, end_sec, text}` from Muse Voice Transcribe |
| `scenes` | Segment list `{start_sec, end_sec, description}` from Video Understanding |
| `keyframe_findings` | List of `{at_sec, kind, description, box when present}` from Image Understanding and SAM keyframes |
| `thumbnail_finding` | Description and readable text on the thumbnail |
| `title` and `caption` | Exact text from the user |
| `extra_context` | Exact text from the user, may be empty |

Keyframe `kind` may only be: `logo`, `watermark`, `license_plate`, `document`, `child`, `sensitive_object`, `third_party_clip`, `other`.

### One agent result: `AgentResult`

Produced by each A4 module, consumed by A5. One small schema shared by six agents so merging stays simple.

| Field | Contents |
|---|---|
| `agent` | One of: `youtube`, `tiktok`, `facebook`, `copyright`, `legal_id`, `packaging_privacy` |
| `status` | `selesai` (done), `gagal` (failed), or `batas_waktu` (timed out). Machine codes stay as frozen. Display labels are English |
| `risk_level` | `rendah` (Low), `sedang` (Medium), or `tinggi` (High). For platform agents this is a rough summary only. Final scores belong to A5 |
| `findings` | `Finding` list, may be empty |
| `error` | Failure message when status is not done, otherwise null |

### One finding: `Finding`

| Field | Contents |
|---|---|
| `start_sec` and `end_sec` | Evidence time range. Both 0 only for title, caption, or thumbnail findings |
| `evidence_type` | `visual`, `audio`, `text_on_screen`, `title`, `caption`, or `thumbnail` |
| `evidence` | Transcript quote or human-checkable evidence description |
| `category` | One of the 12 concept categories, or a copyright theme, or a legal theme |
| `severity` | `rendah` (Low), `sedang` (Medium), or `tinggi` (High) |
| `impact` | Plain-language effect per platform or legal theme |
| `fix` | One concrete repair action |

### Final report: `FinalReport`

Produced by A5, consumed by A6 exactly as-is.

| Field | Contents |
|---|---|
| `overall_recommendation` | One final recommendation sentence |
| `platforms` | Exactly three entries: score 0 to 100, status, top risk, findings list |
| `copyright` | Risk level and risky segment list |
| `legal_id` | Risk level, theme list, and the required disclaimer |
| `fix_checklist` | Deduplicated fix actions, highest severity first |
| `rules_version` | Version and date of the rule base in use |
| `agent_statuses` | Final status of all six agents, including failed ones |

Platform status may only be: `aman` (Safe), `perlu_perbaikan` (Needs fixes), `berisiko_tinggi` (High risk). Machine codes stay as frozen. Display labels are English.

Required disclaimer, always shown: "Initial screening, not a platform decision, not Content ID, and not legal advice."

---

## Deterministic scoring contract

So scores stay explainable and testable with no LLM:

1. Each platform starts at 100.
2. Each `tinggi` finding deducts 30, `sedang` deducts 15, `rendah` deducts 5.
3. Scores never go below 0.
4. Scores 80 to 100 are `aman`, 50 to 79 `perlu_perbaikan`, 0 to 49 `berisiko_tinggi`.
5. These thresholds live here so the Lead can change them in one place, and every change requires updated A5 tests.

---

## Failure contract

- One failed agent never fails the report. A5 still publishes the report with that agent section marked unfinished.
- The UI shows partial results as soon as one agent finishes, without waiting for all six.
- Every Meta call has a timeout and one retry. Timeout values are locked by the Lead with the stack choice (T-001, 2026-10-30. See the Timeout and Retry table above). Stage 2 timeouts carry status `batas_waktu`, other failures carry `gagal`.
- One failed Stage 1 branch never fails the evidence bundle: that branch appears in its empty form (for example an empty transcript for a silent video) and agents judge from the evidence that exists.

### Additional shapes frozen by T-001

The following shapes complete `ReviewInput` through `FinalReport` above and bind equally:

| Shape | Fields |
|---|---|
| `EvidenceInput` (on-disk form of `ReviewInput`, produced by the upload route) | `videoPath`, `thumbnailPath` (may be null), `title`, `caption`, `extraContext` |
| `AgentProgress` (UI progress, separate from `AgentResult.status`) | `agent`, `state` one of `queued`, `running`, `done`, `failed`, `timeout` |
| `RuleFile` (one `data/rules/*.json` file) | `version`, `updated_at` (YYYY-MM-DD), `source`, `rules[]` holding `{id, category, guidance, consequence when present, perlu_verifikasi when present}` |
| `KeyframeFinding.box` when present | `{x, y, w, h}`, each a number from 0 to 1 |
| Platform categories (canonical slugs for platform agent `Finding.category`) | `kekerasan`, `seksual`, `ujaran_kebencian`, `perundungan`, `keselamatan_anak`, `perilaku_berbahaya`, `narkoba_alkohol_senjata`, `judi`, `misinformasi`, `spam_clickbait_reupload`, `grafis_medis`, `privasi_data_pribadi` |
| Meta client errors | Typed errors with `code` one of `timeout`, `http`, `network`, `config`. Real mode with no `META_API_KEY` is `config`. Mock mode (`META_MOCK=1`) needs no key and touches no network |

Runtime agent functions frozen for wave 2: each module exports one `run<Domain>Agent(bundle, rules, reason)` function returning an `AgentResult`. `reason` is the Meta reasoning caller from the A1 client. Tests fake it. Model output that fails the schema (findings without evidence, vocabulary outside the contract) makes agent status `gagal`, never a forwarded finding.

---

## Change log

| Date | Change | By | Reason |
|---|---|---|---|
| None yet | Initial contract created from the concept | Lead | Wave 0 starting point |
| 2026-10-30 | T-001 frozen: TypeScript/Next.js/Vitest stack, final folder map, timeout and retry table, JSON rule data format, environment variable names, additional `EvidenceInput`/`AgentProgress`/`RuleFile`/`box`/category slug/Meta error shapes, and the wave 2 agent function contract. Executing plan: `docs/superpowers/plans/2026-10-30-cekdulu-mvp.md` | Lead | Wave 0 gate so wave 1 runs parallel with no stack guessing. The Zod schemas in `src/lib/contracts/` (plan Task 1) are the programmed derivative of this document |
| 2026-10-30 | Full English conversion on owner instruction: this contract, `TASKS.md`, `AGENTS.md`, README, demo script, UI copy, agent prompts, merger output, error messages, rule data, and examples move to English. Machine codes (severity, status, category slugs) stay unchanged. The required disclaimer changes from "Skrining awal, bukan keputusan platform, bukan Content ID, dan bukan nasihat hukum." to "Initial screening, not a platform decision, not Content ID, and not legal advice." in the schema constant, fixtures, checker expectation, and every render path | Lead | The owner asked for everything in English. Display translation covers everything users read while frozen machine codes keep schemas, rules, agents, and tests stable |
