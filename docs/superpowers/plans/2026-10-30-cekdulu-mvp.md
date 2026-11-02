# CekDulu MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build CekDulu end to end: one video upload (max 3 minutes) with title, caption, and thumbnail produces one progressive report with three platform cards, one copyright card, one Indonesian legal card, and one deduplicated fix checklist.

**Architecture:** One TypeScript codebase on Next.js App Router. Tahap 0-1 build one `EvidenceBundle` from the video via the Meta client (mock mode first). Tahap 2 runs six independent specialist agents in parallel, each consuming the same bundle plus only its own rule slice. Tahap 3 merges findings and computes scores in plain deterministic code with no LLM. The UI only renders `FinalReport` and agent progress; it never computes scores.

**Tech Stack:** Node 22 LTS, TypeScript 5, Next.js 15 (App Router, React 19), Tailwind CSS v4, Zod (contract schemas), Vitest + Testing Library (tests), system `ffmpeg`/`ffprobe` binaries for Tahap 0 media extraction. Package manager: npm with committed lockfile.

**Spec:** `../cekdulu-ai-video-reviewer.md` (konsep, sumber kebenaran), `docs/contracts.md` (kontrak beku), `AGENTS.md` (peta kepemilikan), `TASKS.md` (papan task).

## Global Constraints

- All AI only from Meta Model API: Muse Spark/Wonder (reasoning, vision, video), Muse Voice Transcribe, Muse Image, SAM 3.1 on selected keyframes only. No YOLO, Whisper, OpenAI, Google Vision, ElevenLabs, or any non-Meta model, in code, dependencies, or copy.
- Batch after upload only. No real-time, live-stream, or live-detection claim anywhere in code or UI copy.
- Input is exactly 1 video file (max 180 seconds) + title + caption + 1 thumbnail. Platforms are always `youtube`, `tiktok`, `facebook`. Legal scope is Indonesia only.
- Every finding must carry evidence: transcript quote or human-checkable description plus a time range; `start_sec`/`end_sec` are both 0 only for title, caption, or thumbnail findings.
- Scores are computed only by the merger (A5): start 100, `tinggi` -30, `sedang` -15, `rendah` -5, floor 0; 80-100 `aman`, 50-79 `perlu_perbaikan`, 0-49 `berisiko_tinggi`. Agents supply findings and `risk_level`, never final scores. The frontend never computes scores.
- Copyright and legal output always uses risk language. The strings `pasti bebas`, `pasti melanggar`, and `aman secara hukum` must never appear in output or UI. Disclaimer shown verbatim everywhere a report renders: "Skrining awal, bukan keputusan platform, bukan Content ID, dan bukan nasihat hukum."
- API keys only via environment variables; never in repo, examples, fixtures, or reports. `.env.example` contains empty placeholders only.
- One agent failing never fails the report: partial results render as soon as each agent finishes; failed agents are marked and the rest still publish.
- Rule data is versioned structured data with official source per file. Unverified article numbers are written as themes marked `perlu_verifikasi: true`; no invented pasal numbers.
- Execution follows `AGENTS.md`: worker implements one task in its own file territory, separate verifier re-runs the tests and checks contracts and prohibitions, Lead moves `TASKS.md` status only after verifier `PASS`.

## Review Focus

1. Video longer than 180s, corrupt file, or video with no audio track: expect a clear rejection for duration/corruption before any Meta call, and an empty-transcript bundle (not a crash) for silent video. Pinned in Task 3.
2. One of six agents times out or throws: expect a published partial `FinalReport` with that agent marked `gagal`/`batas_waktu` and the other five sections intact. Pinned in Tasks 12 and 13.
3. Silent video plus missing thumbnail: expect agents to still run on title/caption evidence and no finding to be fabricated for absent media. Pinned in Tasks 6-11 via the shared empty-evidence fixture.
4. `extra_context` claims licensed music or permission: expect risk findings to remain (context may be quoted in `evidence`, never auto-clears a finding). Pinned in Task 9.
5. Model returns a finding without evidence or with an out-of-vocabulary severity/status: expect Zod rejection, agent status `gagal`, and no invalid finding reaching the merger. Pinned in Tasks 6-11 via the shared invalid-output test.

---

## File Structure

Workspace root is the Next.js project root. Territory ownership follows `AGENTS.md`; shared contract files are Lead-owned and read-only for everyone else.

| Path | Owner | Responsibility |
|---|---|---|
| `docs/contracts.md`, `TASKS.md` | Lead | Frozen prose contract and task board |
| `src/lib/contracts/` | Lead | Zod schemas, inferred types, canonical enums, mock fixtures |
| `src/lib/meta/` | A1 | Meta client (mock + real), env config, typed Meta errors |
| `src/lib/evidence/` | A2 | Upload validation, ffmpeg extraction, `EvidenceBundle` builder, demo mock bundle |
| `data/rules/` | A3 | Five versioned rule JSON files, one per domain |
| `src/lib/agents/` | A4 | Six agent modules, one file per agent; no cross-imports between agents |
| `src/lib/merge/` | A5 | Finding deduplication, deterministic scoring, checklist, `FinalReport` builder |
| `src/lib/jobs/` | Lead | In-memory job store and orchestration entry (Tahap 0-3 wiring) |
| `src/app/`, `src/components/` | A6 | Upload page, six progress cards, progressive report page, checklist UI |
| `data/examples/` | A7 | Three example bundles with expected findings, saved offline report |

Key shared types (defined once in `src/lib/contracts/schemas.ts`, Zod schema + `z.infer` type exported under the same name): `ReviewInput`, `TranscriptSegment`, `SceneSegment`, `KeyframeFinding`, `EvidenceBundle`, `Finding`, `AgentResult`, `PlatformReport`, `FinalReport`, `AgentProgress`, `RuleFile`. Enums are exact contract strings: severity/risk `rendah|sedang|tinggi`; agent status `selesai|gagal|batas_waktu`; platform status `aman|perlu_perbaikan|berisiko_tinggi`; evidence types `visual|audio|text_on_screen|title|caption|thumbnail`; keyframe kinds `logo|watermark|license_plate|document|child|sensitive_object|third_party_clip|other`; the 12 platform category slugs are `kekerasan`, `seksual`, `ujaran_kebencian`, `perundungan`, `keselamatan_anak`, `perilaku_berbahaya`, `narkoba_alkohol_senjata`, `judi`, `misinformasi`, `spam_clickbait_reupload`, `grafis_medis`, `privasi_data_pribadi`.

Meta timeouts locked by T-001 (one retry each, 2s backoff, typed timeout error): transcribe 120s, video understanding 120s, image understanding 60s, SAM localize 30s per keyframe, each Tahap 2 agent reasoning call 60s. Job status polling interval: 1000ms.

---

### Task 1: Kontrak Mesin dan Fixture Bersama (T-001)

**Files:**
- Modify: `docs/contracts.md` (decision table, folder map, timeout table, change log entry dated 2026-10-30)
- Create: `src/lib/contracts/schemas.ts`, `src/lib/contracts/schemas.test.ts`, `src/lib/contracts/fixtures.ts`

**Interfaces:**
- Consumes: prose contract in `docs/contracts.md`. If the filled decision table disagrees with this plan, stop and escalate to Lead; do not improvise a second stack.
- Produces: Zod schemas and inferred types `ReviewInput`, `TranscriptSegment {start_sec, end_sec, text}`, `SceneSegment {start_sec, end_sec, description}`, `KeyframeFinding {at_sec, kind, description, box?}`, `EvidenceBundle`, `Finding`, `AgentResult`, `PlatformReport`, `FinalReport`, `AgentProgress {agent, state: queued|running|done|failed|timeout}`, `RuleFile {version, updated_at, source, rules: [{id, category, guidance, consequence?, perlu_verifikasi?}]}`; `KeyframeFinding.box` when present is `{x, y, w, h}` with each number in 0..1; constants `DISCLAIMER`, `PLATFORM_CATEGORIES` (12 slugs above), `KEYFRAME_KINDS`; fixtures `mockEvidenceBundle` (contains one gambling-promo transcript segment, one commercial-music scene, one `license_plate` keyframe), `emptyEvidenceBundle` (empty transcript/scenes/keyframes), `mockFinalReport` (all three platforms, one failed agent). Later tasks import these files read-only.

- [ ] **Step 1: Write the failing contract test** — `schemas.test.ts` asserts: `mockEvidenceBundle` and `mockFinalReport` parse against their schemas; a finding with empty `evidence` throws; `severity: "parah"` throws; a `PlatformReport` score of 101 throws.
- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- src/lib/contracts/schemas.test.ts` (test runner is installed in Task 2; if `package.json` does not exist yet, record the exact failure and proceed — the test must pass by the end of Task 2). Expected: FAIL, module not found.
- [ ] **Step 3: Implement the schemas and fixtures** — One Zod schema per contract shape in `schemas.ts`, types via `z.infer`, fixtures in `fixtures.ts` built to parse. Fill the `docs/contracts.md` decision table with the stack, folder map, and timeout values from this plan's header and mark it locked.
- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- src/lib/contracts/schemas.test.ts`. Expected: PASS (after Task 2 scaffolding exists; otherwise defer and record).
- [ ] **Step 5: Commit** — `git add docs/contracts.md src/lib/contracts` ; `git commit -m "feat: freeze machine contracts and fixtures (T-001)"` (or the repo's VCS equivalent; if the workspace has no commit command available, leave uncommitted and say so in the report).

### Task 2: Fondasi Aplikasi dan Klien Meta (T-101)

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `src/lib/meta/config.ts`, `src/lib/meta/client.ts`, `src/lib/meta/client.test.ts`

**Interfaces:**
- Consumes: `src/lib/contracts/schemas.ts` types (Task 1), env vars `META_API_KEY`, `META_BASE_URL`, `META_MOCK`.
- Produces: interface `MetaClient` with `transcribe(audioPath: string): Promise<TranscriptSegment[]>`, `understandVideo(videoPath: string): Promise<SceneSegment[]>`, `understandImages(imagePaths: string[]): Promise<KeyframeFinding[]>`, `localizeKeyframe(imagePath: string, concept: string): Promise<KeyframeFinding[]>`, `reasonJson(systemPrompt: string, userPayload: unknown): Promise<unknown>`; factory `createMetaClient(): MetaClient`; error class `MetaError` with `code: "timeout" | "http" | "network" | "config"`. With `META_MOCK=1` every method resolves fixture data with no network and no key. Real mode without `META_API_KEY` throws `MetaError` code `config`. Timeouts per the locked table, enforced with `AbortSignal.timeout`, one retry.

- [ ] **Step 1: Write the failing test** — `client.test.ts`: mock client returns transcript segments with numeric timestamps and needs no key; real mode without key throws code `config`; a stubbed fetch that never resolves rejects with code `timeout` (use a 50ms test timeout override).
- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- src/lib/meta/client.test.ts`. Expected: FAIL, `createMetaClient` not defined. Then scaffold the app so the test can run: Next.js + TypeScript + Tailwind + Vitest with `npm test` = `vitest run` and `npm run typecheck` = `tsc --noEmit`.
- [ ] **Step 3: Implement the client** — `config.ts` reads env once and validates. `client.ts` implements mock mode from contract fixtures and real mode via `fetch` to `META_BASE_URL` (Responses for `reasonJson`, Transcribe for `transcribe`, Image/Video understanding, SAM for `localizeKeyframe`). `.env.example` lists the three variables as empty placeholders with a comment pointing to dev.meta.ai docs; no real key anywhere.
- [ ] **Step 4: Run tests to verify they pass** — Run: `npm test` and `npm run typecheck`. Expected: all PASS, including Task 1's deferred contract test. Also run `npm run build` once; the empty app must build.
- [ ] **Step 5: Commit** — `git commit -m "feat: app foundation and mockable Meta client (T-101)"` (or leave uncommitted and say so).

### Task 3: Pipeline Bukti dengan Mock (T-102)

**Files:**
- Create: `src/lib/evidence/validate.ts`, `src/lib/evidence/extract.ts`, `src/lib/evidence/bundle.ts`, `src/lib/evidence/bundle.test.ts`

**Interfaces:**
- Consumes: `MetaClient` (Task 2), contract types (Task 1). Defines its own input type `EvidenceInput {videoPath: string, thumbnailPath: string | null, title: string, caption: string, extraContext: string}` (the on-disk form of the contract's `ReviewInput`, produced by the upload route in Task 13; `ReviewInput` itself stays the API-level shape and is never reused for file paths).
- Produces: `validateDuration(durationSec: number): void` (throws `EvidenceError` for `> 180` or `<= 0`); `buildEvidenceBundle(input: EvidenceInput, meta: MetaClient): Promise<EvidenceBundle>`; `getDemoEvidenceBundle(): EvidenceBundle`; `EvidenceError` with `code: "too_long" | "unreadable" | "extract_failed"`. Tahap 1 calls (`transcribe`, `understandVideo`, `understandImages`) run concurrently; a failed Tahap 1 branch yields its empty form (e.g. `transcript: []`) instead of rejecting the whole bundle. SAM `localizeKeyframe` runs only for keyframes the visual branch marked with a localizable `kind`.

- [ ] **Step 1: Write the failing test** — `bundle.test.ts` with a fake `MetaClient`: demo bundle parses against `EvidenceBundle` schema and every segment has timestamps; `validateDuration(181)` throws `too_long`, `validateDuration(180)` passes; silent-video fake (empty transcript) still returns a bundle; one rejecting Tahap 1 branch still returns a bundle with that branch empty.
- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- src/lib/evidence/bundle.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement the pipeline** — `validate.ts` probes duration with `ffprobe` (30s process timeout, throw `unreadable` on probe failure). `extract.ts` shells to `ffmpeg` for audio (`-vn` wav) and keyframes (1 frame per 3s, plus the user thumbnail passed through). `bundle.ts` runs Tahap 1 with `Promise.allSettled`, assembles and schema-parses the `EvidenceBundle`, and returns the canned demo bundle from `getDemoEvidenceBundle()` without touching ffmpeg or Meta.
- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- src/lib/evidence/bundle.test.ts`. Expected: PASS. Real-ffmpeg path is exercised only when `ffmpeg` exists on the machine; otherwise that single check is reported as skipped with the reason, never silently passed.
- [ ] **Step 5: Commit** — `git commit -m "feat: evidence pipeline with demo bundle (T-102)"` (or leave uncommitted and say so).

### Task 4: Data Aturan per Domain (T-103)

**Files:**
- Create: `data/rules/youtube.json`, `data/rules/tiktok.json`, `data/rules/facebook.json`, `data/rules/copyright.json`, `data/rules/legal_id.json`, `data/rules/rules.test.ts`

**Interfaces:**
- Consumes: `RuleFile` schema and `PLATFORM_CATEGORIES` (Task 1).
- Produces: five JSON files each shaped `{version: "2026-10-30.1", updated_at: "2026-10-30", source: "<official guidelines URL or publication name>", rules: [{id, category, guidance, consequence?}]}`. Platform files hold exactly one or more rules per each of the 12 categories; `copyright.json` covers commercial music, third-party clips, other-platform watermarks, dominant brand logos, licensed stock, untransformed reupload, and large copyrighted-text portions; `legal_id.json` covers the nine Indonesian legal themes from the concept (hoaks, SARA/hate, defamation, decency, online gambling, violent provocation/terror, misleading health/product/investment claims, privacy data exposure, undisclosed endorsement) with `perlu_verifikasi: true` on any entry whose article reference is unverified. Guidance is plain-language Indonesian; no invented pasal numbers.

- [ ] **Step 1: Write the failing checklist test** — `rules.test.ts` loads all five files, parses each with `RuleFile`, asserts every platform file covers all 12 category slugs, asserts copyright and legal theme coverage by `id` list, and asserts no rule text contains `pasti bebas`, `pasti melanggar`, or `aman secara hukum`.
- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- data/rules/rules.test.ts`. Expected: FAIL, files missing.
- [ ] **Step 3: Write the five rule files** — Summarize from official sources only (YouTube Community Guidelines + monetization policies, TikTok Community Guidelines, Meta Community Standards + Facebook monetization, copyright risk parameters and Indonesian legal themes per concept). Record the real source per file. Anything not yet verified against the official text becomes a theme entry with `perlu_verifikasi: true`.
- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- data/rules/rules.test.ts`. Expected: PASS. Report each file's source and version in the completion report.
- [ ] **Step 5: Commit** — `git commit -m "feat: versioned rule data for five domains (T-103)"` (or leave uncommitted and say so).

### Task 5: UI Laporan dari Mock (T-104)

**Files:**
- Create: `src/app/page.tsx`, `src/app/report/page.tsx`, `src/components/AgentProgressCard.tsx`, `src/components/PlatformCard.tsx`, `src/components/RiskCard.tsx`, `src/components/FixChecklist.tsx`, `src/components/report.test.tsx`

**Interfaces:**
- Consumes: `mockFinalReport`, `FinalReport`, `AgentProgress` (Task 1). Renders data exactly as given; computes nothing, renames no status.
- Produces: upload page (video, thumbnail, title, caption, extra context fields, Analisa button, "Muat contoh" button loading the mock report with zero network); report view with six `AgentProgressCard`s (states `queued|running|done|failed|timeout` visually distinct, failed shows "belum selesai, coba lagi"), three `PlatformCard`s (score, status, top risk, findings with `mm:ss` ranges), copyright and legal `RiskCard`s, checkable `FixChecklist` with copy-as-text export, and `DISCLAIMER` visible on every report state including partial failure.

- [ ] **Step 1: Write the failing UI test** — `report.test.tsx` (Testing Library, jsdom) renders the report from `mockFinalReport`: expects three platform cards, one copyright card, one legal card, six progress cards with exactly one in failed state, the disclaimer string, and a checklist whose checkbox toggles.
- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- src/components/report.test.tsx`. Expected: FAIL, components not found.
- [ ] **Step 3: Implement the UI** — Server components by default; checklist toggle and copy export are the only client interactivity. Finding timestamps render as `mm:ss-mm:ss`; title/caption/thumbnail findings (0-0) render their evidence-type label instead. No score math, no status remapping, no real-time wording anywhere in copy.
- [ ] **Step 4: Run test to verify it passes** — Run: `npm test` and `npm run typecheck`. Expected: PASS. Start `npm run dev` once and confirm the example report renders from "Muat contoh" with the network disabled.
- [ ] **Step 5: Commit** — `git commit -m "feat: report UI from mock report (T-104)"` (or leave uncommitted and say so).

---

## Gelombang 2 — Enam Agen Spesialis (T-201 sampai T-206)

Shared agent contract for Tasks 6-11. Each module exports exactly one function `run<Domain>Agent(bundle: EvidenceBundle, rules: RuleFile, reason: ReasonFn): Promise<AgentResult>`, where `ReasonFn = (systemPrompt: string, userPayload: unknown) => Promise<unknown>` defaults to `MetaClient.reasonJson` bound in Task 13 and is faked in tests. Each module: builds a short domain prompt containing only its own `rules` slice plus the bundle, calls `reason` once, Zod-parses the raw output as `{risk_level, findings}`, rejects any finding with empty `evidence` or out-of-vocabulary values (whole result becomes `status: "gagal"` with `error` set, `findings: []`), and never imports another agent module or any scoring code. Every agent test reuses `mockEvidenceBundle` and `emptyEvidenceBundle` from Task 1 and includes the shared invalid-output case from Review Focus item 5.

### Task 6: Agen YouTube (T-201)

**Files:**
- Create: `src/lib/agents/youtube.ts`, `src/lib/agents/youtube.test.ts`

**Interfaces:**
- Consumes: shared agent contract above with `data/rules/youtube.json`.
- Produces: `runYoutubeAgent(...)` returning `agent: "youtube"`. Required trigger: an exaggerated health claim in the transcript produces a finding with category `misinformasi`, severity `sedang` or `tinggi`, and `impact` mentioning limited ads or demonetization risk in risk language.

- [ ] **Step 1: Write the failing test** — Fake `reason` returns one health-claim finding; assert the result parses, keeps the transcript quote as `evidence`, and carries the monetization `impact`. Add the empty-bundle case (no findings fabricated) and the invalid-output case (status `gagal`).
- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- src/lib/agents/youtube.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement the agent** — YouTube-only prompt (Community Guidelines + monetization slice), one `reason` call, strict parse, no score computation.
- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- src/lib/agents/youtube.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: YouTube specialist agent (T-201)"` (or leave uncommitted and say so).

### Task 7: Agen TikTok (T-202)

**Files:**
- Create: `src/lib/agents/tiktok.ts`, `src/lib/agents/tiktok.test.ts`

**Interfaces:**
- Consumes: shared agent contract above with `data/rules/tiktok.json`.
- Produces: `runTiktokAgent(...)` returning `agent: "tiktok"`. Required trigger: disguised gambling promotion in transcript or on-screen text produces a finding with category `judi` and `impact` mentioning loss of For You recommendation eligibility in risk language.

- [ ] **Step 1: Write the failing test** — Fake `reason` returns the gambling finding from `mockEvidenceBundle`; assert category, eligibility `impact`, and preserved evidence quote. Add empty-bundle and invalid-output cases.
- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- src/lib/agents/tiktok.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement the agent** — TikTok-only prompt including recommendation-eligibility consequences, one `reason` call, strict parse.
- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- src/lib/agents/tiktok.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: TikTok specialist agent (T-202)"` (or leave uncommitted and say so).

### Task 8: Agen Facebook (T-203)

**Files:**
- Create: `src/lib/agents/facebook.ts`, `src/lib/agents/facebook.test.ts`

**Interfaces:**
- Consumes: shared agent contract above with `data/rules/facebook.json`.
- Produces: `runFacebookAgent(...)` returning `agent: "facebook"`. Required trigger: untransformed reupload evidence (third-party clip scene with no commentary) produces a finding with category `spam_clickbait_reupload` and `impact` mentioning distribution restriction in risk language.

- [ ] **Step 1: Write the failing test** — Fake `reason` returns the reupload finding; assert category and distribution `impact`. Add empty-bundle and invalid-output cases.
- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- src/lib/agents/facebook.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement the agent** — Facebook-only prompt (Community Standards + monetization/originality slice), one `reason` call, strict parse.
- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- src/lib/agents/facebook.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: Facebook specialist agent (T-203)"` (or leave uncommitted and say so).

### Task 9: Agen Copyright (T-204)

**Files:**
- Create: `src/lib/agents/copyright.ts`, `src/lib/agents/copyright.test.ts`

**Interfaces:**
- Consumes: shared agent contract above with `data/rules/copyright.json`.
- Produces: `runCopyrightAgent(...)` returning `agent: "copyright"`. Required triggers: commercial-music scene plus other-platform `watermark` keyframe in `mockEvidenceBundle` produce per-segment findings whose `fix` suggests replacing music or cropping, all in risk language ("risiko", "kemungkinan klaim"). Permission claimed in `extra_context` must still return the findings (context may be quoted, never auto-clears — Review Focus item 4).

- [ ] **Step 1: Write the failing test** — Fake `reason` returns music and watermark findings; assert both segments kept with concrete `fix` text and no certainty wording. Add the `extra_context`-with-permission case (findings remain), empty-bundle, and invalid-output cases.
- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- src/lib/agents/copyright.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement the agent** — Copyright-parameters-only prompt; explicitly instruct risk language and that user context does not erase risk. One `reason` call, strict parse.
- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- src/lib/agents/copyright.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: copyright risk agent (T-204)"` (or leave uncommitted and say so).

### Task 10: Agen Hukum Indonesia (T-205)

**Files:**
- Create: `src/lib/agents/legal_id.ts`, `src/lib/agents/legal_id.test.ts`

**Interfaces:**
- Consumes: shared agent contract above with `data/rules/legal_id.json`.
- Produces: `runLegalAgent(...)` returning `agent: "legal_id"`. Required triggers: misleading medicine claim plus online-gambling promotion in `mockEvidenceBundle` produce findings naming Indonesian legal themes in plain language (theme strings from `legal_id.json`, no pasal numbers unless the rule entry is verified), each with `fix` and `risk_level` reflecting the highest finding.

- [ ] **Step 1: Write the failing test** — Fake `reason` returns both theme findings; assert themes match `legal_id.json` ids and no finding text asserts a legal conclusion ("melanggar UU" as certainty is rejected by the test's wording check; "berisiko terkait tema ..." passes). Add empty-bundle and invalid-output cases.
- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- src/lib/agents/legal_id.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement the agent** — Legal-themes-only prompt with screening framing ("skrining tema, bukan putusan hukum"), one `reason` call, strict parse. The disclaimer itself is attached by the merger/UI, not invented per finding.
- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- src/lib/agents/legal_id.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: Indonesian legal risk agent (T-205)"` (or leave uncommitted and say so).

### Task 11: Agen Kemasan dan Privasi (T-206)

**Files:**
- Create: `src/lib/agents/packaging_privacy.ts`, `src/lib/agents/packaging_privacy.test.ts`

**Interfaces:**
- Consumes: shared agent contract above. Rule input is the privacy/clickbait-relevant entries: platform `privasi_data_pribadi` and `spam_clickbait_reupload` guidance passed in as its slice (orchestration assembles it from the three platform files; the module itself only receives a `RuleFile`).
- Produces: `runPackagingPrivacyAgent(...)` returning `agent: "packaging_privacy"`. Required triggers: misleading clickbait thumbnail finding (`evidence_type: "thumbnail"`, range 0-0) and the `license_plate` keyframe from `mockEvidenceBundle` producing a privacy finding with `fix` to blur, carrying the keyframe `at_sec` as its range.

- [ ] **Step 1: Write the failing test** — Fake `reason` returns both findings; assert 0-0 thumbnail range, plate-blur `fix`, and `at_sec` propagation. Add empty-bundle and invalid-output cases.
- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- src/lib/agents/packaging_privacy.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement the agent** — Packaging/privacy-only prompt over title, caption, thumbnail finding, and keyframe findings; one `reason` call, strict parse. This module never calls SAM itself; localization stays in Task 3.
- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- src/lib/agents/packaging_privacy.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: packaging and privacy agent (T-206)"` (or leave uncommitted and say so).

---

## Gelombang 3 — Integrasi

### Task 12: Penggabung dan Skor Deterministik (T-301)

**Files:**
- Create: `src/lib/merge/score.ts`, `src/lib/merge/merge.ts`, `src/lib/merge/merge.test.ts`

**Interfaces:**
- Consumes: six `AgentResult` values (Tasks 6-11), any subset possibly `gagal`/`batas_waktu`.
- Produces: pure functions `computePlatformScore(findings: Finding[]): number`, `statusFromScore(score: number): "aman" | "perlu_perbaikan" | "berisiko_tinggi"`, and `mergeReports(results: AgentResult[], rulesVersion: string): FinalReport`. No LLM calls, no I/O. Deduplication key is `category + start_sec + end_sec + evidence_type`; on collision keep the higher severity, then the longer `evidence`. `platforms` always has exactly three entries (a failed platform agent yields score 100 with empty findings only if its status is honestly carried in `agent_statuses` — recommendation must still flag the incomplete check); `copyright.segments` and `legal_id.themes` come only from their own agents; `legal_id.disclaimer` is always the `DISCLAIMER` constant; `fix_checklist` is the deduplicated `fix` strings sorted by source severity (`tinggi` first); `overall_recommendation` is rule-based (any `berisiko_tinggi` platform or `tinggi` legal/copyright risk → advise not publishing yet, naming the worst domain; otherwise publish-after-fixes or ready wording without certainty claims).

- [ ] **Step 1: Write the failing test** — Assert: two `tinggi` + one `sedang` findings score 25 and status `berisiko_tinggi`; duplicate findings collapse to one checklist entry; one `gagal` agent still yields a complete `FinalReport` with that agent in `agent_statuses`; score floors at 0. Add the partial-failure case from Review Focus item 2.
- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- src/lib/merge/merge.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement merger and scoring** — Plain functions implementing the locked arithmetic (100, -30/-15/-5, floor 0, thresholds 80/50) and the dedup/sort rules above. Parse the output with the `FinalReport` schema before returning.
- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- src/lib/merge/merge.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: deterministic merger and scoring (T-301)"` (or leave uncommitted and say so).

### Task 13: Orkestrasi Paralel Ujung ke Ujung (T-302)

**Files:**
- Create: `src/lib/jobs/store.ts`, `src/lib/jobs/analyze.ts`, `src/lib/jobs/analyze.test.ts`, `src/app/api/analyze/route.ts`, `src/app/api/jobs/[id]/route.ts`

**Interfaces:**
- Consumes: `buildEvidenceBundle` (Task 3), six agent runners (Tasks 6-11), rule JSONs (Task 4), `mergeReports` (Task 12), `MetaClient` (Task 2).
- Produces: `analyzeReview(input: EvidenceInput, meta: MetaClient, onProgress: (progress: AgentProgress[]) => void): Promise<FinalReport>`; in-memory job store `createJob(): string`, `getJob(id)` returning `{progress: AgentProgress[], report: FinalReport | null, error: string | null}`. `POST /api/analyze` accepts multipart video + thumbnail + text fields (guard: reject missing video and files over 200MB before probing), stores uploads under the OS temp dir, starts `analyzeReview` without awaiting it, and returns `{job_id}`. `GET /api/jobs/[id]` returns the job snapshot for 1000ms polling. Each agent runs under the locked 60s timeout with one retry; timeout maps to `batas_waktu`, other failures to `gagal`, and `onProgress` fires on every state change so partial results surface before the slowest agent finishes.

- [ ] **Step 1: Write the failing integration test** — With fake `MetaClient` and fake agent runners at staggered delays (fast 10ms, slow 300ms, one throwing): assert all six start before any finishes (concurrency probe), `onProgress` reports the fast agent `done` while the slow one is still `running`, the throwing agent ends `gagal`, a `FinalReport` is still returned, and total elapsed stays under 2x the slowest agent rather than the sum.
- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- src/lib/jobs/analyze.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement orchestration and routes** — `Promise.allSettled` over six timeout/retry-wrapped runners fed the same bundle; assemble the packaging agent's rule slice from the platform files; merge via Task 12 with the loaded `rules_version`; wire the two route handlers to the store with no business logic of their own.
- [ ] **Step 4: Run test to verify it passes** — Run: `npm test` (full suite) and `npm run typecheck`. Expected: PASS. Record total vs slowest-agent time from the test output in the completion report.
- [ ] **Step 5: Commit** — `git commit -m "feat: parallel orchestration and job API (T-302)"` (or leave uncommitted and say so).

### Task 14: Sambungkan UI ke Orkestrasi Nyata (T-303)

**Files:**
- Modify: `src/app/page.tsx`, `src/app/report/page.tsx`; Create: `src/components/wiring.test.tsx`

**Interfaces:**
- Consumes: `POST /api/analyze` and `GET /api/jobs/[id]` (Task 13), existing report components (Task 5) unchanged in props.
- Produces: submit flow (form → `POST` → poll every 1000ms → render progress cards live → render `FinalReport` progressively as agent sections complete, final render identical in structure to the mock report); error surface for rejected uploads (duration/readability message from `EvidenceError` codes, no stack traces); "Muat contoh" still bypasses the network entirely.

- [ ] **Step 1: Write the failing wiring test** — Mock `fetch` for POST + two GET snapshots (first: two agents done; second: all done, one failed): assert progressive rendering order, failed-agent card state, final three platform cards, and disclaimer. Assert no score is computed client-side by feeding inconsistent snapshot data and checking it renders verbatim.
- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- src/components/wiring.test.tsx`. Expected: FAIL, polling not implemented.
- [ ] **Step 3: Implement the wiring** — Client-side polling hook on the report page, upload error mapping, and nothing else: no component prop changes, no frontend scoring or status remapping.
- [ ] **Step 4: Run tests to verify they pass** — Run: `npm test` and `npm run build`. Expected: PASS. Manually verify four states once in `npm run dev` with `META_MOCK=1`: all-done, one-forced-failure (mock failure flag if present, else record as unverified), slow network (throttled polling), and example upload.
- [ ] **Step 5: Commit** — `git commit -m "feat: wire UI to live orchestration (T-303)"` (or leave uncommitted and say so).

---

## Gelombang 4 — QA dan Demo

### Task 15: Tiga Video Contoh dan Harapan Hasil (T-401)

**Files:**
- Create: `data/examples/safe.expected.json`, `data/examples/platform-copyright-risk.expected.json`, `data/examples/legal-risk.expected.json`, `data/examples/examples.test.ts` (plus the three example videos or, until they exist, their `EvidenceBundle` JSON stand-ins with a README stating which is missing)

**Interfaces:**
- Consumes: `analyzeReview` with mocked Meta/agents (Task 13), contract schemas (Task 1).
- Produces: three labeled cases — safe, platform+copyright risk, Indonesian legal risk — each with a human-written expected-findings list (categories + severities that must appear). `examples.test.ts` runs the mock pipeline per case and diffs actual vs expected categories, reporting misses as QA findings in the completion report. Product code is never edited to make a case pass.

- [ ] **Step 1: Write the failing test** — Encode the three expected category sets; run against the mock pipeline. Expected first run: FAIL where expectations and mock behavior diverge; each divergence is written up, not silently fixed.
- [ ] **Step 2: Run test to verify current state** — Run: `npm test -- data/examples/examples.test.ts`. Record actual vs expected per case.
- [ ] **Step 3: Prepare the examples** — Produce or record the three short example videos (safe; music + exaggerated claim; gambling promo + misleading health claim), store their bundles, and finalize the expected-findings files from human review of the video content.
- [ ] **Step 4: Run test and report gaps** — Run: `npm test -- data/examples/examples.test.ts`. Expected: PASS, or FAIL with each miss converted into a new task proposal to the owning territory in the report.
- [ ] **Step 5: Commit** — `git commit -m "test: three labeled example cases (T-401)"` (or leave uncommitted and say so).

### Task 16: Latihan Demo dan Jalur Cadangan (T-402)

**Files:**
- Create: `docs/demo-script.md`, `data/examples/saved-report.json`

**Interfaces:**
- Consumes: the working app (Task 14) and example cases (Task 15).
- Produces: a timed 2-3 minute demo script following the concept flow (problem, upload main example, six parallel cards filling one by one, three different platform outcomes, copyright + legal cards, checklist close) and an offline path: `saved-report.json` (a real `FinalReport` captured from the mock pipeline) loadable from the UI's example flow with networking disabled, plus a recorded demo timing with any over-3-minute step cut or noted.

- [ ] **Step 1: Capture the saved report** — Run the main example through the mock pipeline once and store its parsed `FinalReport` as `data/examples/saved-report.json`; verify it parses against the schema.
- [ ] **Step 2: Write the demo script** — `docs/demo-script.md` with per-step target seconds summing to at most 180, exact click path, and the offline fallback step.
- [ ] **Step 3: Rehearse offline** — Disable networking, run `npm run build && npm start`, load the saved report via the example flow, and walk the script end to end. Record actual total time.
- [ ] **Step 4: Fix only demo assets** — Adjust script wording/timing or the saved report if stale; product bugs found here become new tasks to their owners, not edits in this task.
- [ ] **Step 5: Commit** — `git commit -m "docs: demo script and offline fallback report (T-402)"` (or leave uncommitted and say so).

### Task 17: Pemeriksaan Larangan Lomba (T-403)

**Files:**
- Create: `scripts/check-prohibitions.mjs`, and the check report appended to the completion report (no product files modified)

**Interfaces:**
- Consumes: the whole repository.
- Produces: a repeatable scan proving: no occurrences of `YOLO`, `Whisper`, `OpenAI`, `Google Vision`, `ElevenLabs` (case-insensitive, excluding this plan, `AGENTS.md`, `TASKS.md`, and the checker itself, which must name them); no real-key-shaped secrets (`META_API_KEY=` with a non-placeholder value, common key prefixes); no `real-time`/`realtime` claim in UI copy or output strings; `DISCLAIMER` present in the report components; no certainty wording (`pasti bebas`, `pasti melanggar`, `aman secara hukum`) in source or rule data.

- [ ] **Step 1: Write the checker** — Node script walking text files with the exclusion list above, exiting non-zero and printing file:line per hit.
- [ ] **Step 2: Run it and record evidence** — Run: `node scripts/check-prohibitions.mjs`. Paste the full output (hit count per class) into the completion report.
- [ ] **Step 3: Route findings** — Every hit becomes a fix task for that file's owning agent via Lead; this task edits nothing itself except the checker.
- [ ] **Step 4: Re-run after fixes land** — Expected: zero hits. Only then may Lead mark T-403 Done.
- [ ] **Step 5: Commit** — `git commit -m "test: competition prohibition scan (T-403)"` (or leave uncommitted and say so).
