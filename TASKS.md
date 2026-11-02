# Task Board: CekDulu

Concept source: `../cekdulu-ai-video-reviewer.md`. Delegation rules: `AGENTS.md`. Shared contract: `docs/contracts.md`.

Only the Lead changes status on this board, after reviewing the agent completion report. Allowed statuses: Done, On Progress, Todo, Blocked.

How to read IDs: T-0xx wave 0, T-1xx wave 1, T-2xx wave 2, T-3xx wave 3, T-4xx wave 4.

---

## DONE

| ID | Task | Owner | Completion evidence |
|---|---|---|---|
| D-01 | Product concept: YouTube, TikTok, Facebook scope, Indonesian law, max 3 minute videos | Lead | Concept document, Locked Scope section |
| D-02 | Three-module design: 12-category platform rules, copyright risk, Indonesian legal risk | Lead | Concept document, Three Analysis Modules section |
| D-03 | Parallel architecture design: parallel evidence stage, six parallel scoring agents, deterministic merger | Lead | Concept document, Parallel Analysis Architecture section |
| D-04 | Delegation charter, file ownership map, and initial shared contract | Lead | `AGENTS.md` and `docs/contracts.md` in this folder |
| T-001 | Freeze wave 0 decisions (stack, tests, folders, Meta timeouts) | Lead | `docs/contracts.md` FROZEN 2026-10-30 + `docs/superpowers/plans/2026-10-30-cekdulu-mvp.md` + verifier PASS `docs/superpowers/reports/task-01-verdict.md`, runtime GREEN closed in T-101 (`npm test` 12/12) |
| T-101 | App foundation and Meta client | A1 | `npm test` 12/12, typecheck + build exit 0, verifier PASS `docs/superpowers/reports/task-02-verdict.md` |
| T-102 | Evidence pipeline with mock | A2 | `npm test` 26/26 including real-media proof, verifier PASS `docs/superpowers/reports/task-03-verdict.md` |
| T-103 | Per-domain rule data | A3 | `npm test` 44/44, five `data/rules/` files version `2026-10-30.1`, verifier PASS `docs/superpowers/reports/task-04-verdict.md` |
| T-104 | Report UI from mock | A6 | `npm test` 52/52, build exit 0, verifier PASS `docs/superpowers/reports/task-05-verdict.md` |
| T-201 | YouTube agent | A4 | `npm test` 65/65, verifier PASS `docs/superpowers/reports/task-06-verdict.md` |
| T-202 | TikTok agent | A4 | `npm test` 78/78, verifier PASS `docs/superpowers/reports/task-07-verdict.md` |
| T-203 | Facebook agent | A4 | `npm test` 91/91, verifier PASS `docs/superpowers/reports/task-08-verdict.md` |
| T-204 | Copyright agent | A4 | `npm test` 105/105, verifier PASS `docs/superpowers/reports/task-09-verdict.md` |
| T-205 | Indonesian legal agent | A4 | `npm test` 121/121, verifier PASS `docs/superpowers/reports/task-10-verdict.md` |
| T-206 | Packaging and Privacy agent | A4 | `npm test` 136/136, verifier PASS `docs/superpowers/reports/task-11-verdict.md` |
| T-301 | Deterministic merger and scoring | A5 | `npm test` 167/167, verifier PASS `docs/superpowers/reports/task-12-verdict.md` |
| T-302 | End-to-end parallel orchestration | Lead/A2/A4/A5 | `npm test` 180/180, verifier PASS `docs/superpowers/reports/task-13-verdict.md` |
| T-303 | Wire UI to live orchestration | A6/Lead | `npm test` 185/185, verifier PASS `docs/superpowers/reports/task-14-verdict.md` |
| FIX-1 | Short-video keyframe extraction fix (T-303 finding) | A2 | `npm test` 187/187 + 1-second video E2E, verifier PASS `docs/superpowers/reports/fix-01-verdict.md` |
| FIX-2 | Shared job store + server binary resolution fix (T-303 finding) | Lead/A1 | `npm test` 188/188 + E2E without PATH ffmpeg, verifier PASS `docs/superpowers/reports/fix-02-verdict.md` |
| T-401 | Three example videos and expected results | A7 | `npm test` 203/203, verifier PASS `docs/superpowers/reports/task-15-verdict.md` |
| T-402 | Demo rehearsal and fallback path | A7/Lead | 170-second demo script + `data/examples/saved-report.json`, verifier PASS `docs/superpowers/reports/task-16-verdict.md` |
| T-403 | Competition prohibition check | Lead | `node scripts/check-prohibitions.mjs` exit 0 (mutation test caught), verifier PASS `docs/superpowers/reports/task-17-verdict.md` |

All waves are complete and verified. The whole-branch final review and scope honesty notes live in `docs/superpowers/ledger-cekdulu-mvp.md` and the final report.

---

## ON PROGRESS

| ID | Task | Owner | Completion gate |
|---|---|---|---|
No task is On Progress. Every wave 0 to 4 task plus FIX-1 and FIX-2 is Done (see the DONE table). The task details below stay as the scope record. Official status is the DONE table above and `docs/superpowers/ledger-cekdulu-mvp.md`.

---

## TODO: Wave 1 (parallel after T-001)

### Task T-101: App foundation and Meta client

**Owner:** A1. **Depends on:** T-001.

**Files:** Foundation and Meta client territory per the folder names frozen by T-001. Create an environment example with no real key and a mock mode for every Meta capability.

**Interfaces:** Produces one call function per capability (transcribe, video, image, SAM, structured reasoning) returning a result or a typed timeout error. Other tasks only use this interface and never call the Meta API directly.

- [ ] Write a test proving mock mode returns sample results with no network and no API key.
- [ ] Run the test and confirm it fails because the foundation does not exist yet.
- [ ] Build the runnable empty app skeleton and the Meta client with mock mode.
- [ ] Run tests until they pass and record the commands and results in the completion report.

### Task T-102: Evidence pipeline with mock

**Owner:** A2. **Depends on:** T-001. May run parallel with T-101, T-103, T-104 because it uses the contract.

**Files:** Upload and evidence bundle territory.

**Interfaces:** Consumes `ReviewInput` from the contract. Produces an `EvidenceBundle` exactly per contract, including a mode returning a sample evidence bundle for the bundled video.

- [ ] Write a test: the sample evidence bundle passes contract validation and every segment has a timestamp.
- [ ] Run the test and confirm it fails.
- [ ] Build max 3 minute duration validation, audio and keyframe extraction, and the evidence bundle builder. The real Meta path uses the T-101 interface, the sample path uses the mock.
- [ ] Run tests until they pass and report.

### Task T-103: Per-domain rule data

**Owner:** A3. **Depends on:** T-001. Fully parallel, touches no code.

**Files:** Rule data folder. One file per domain: youtube, tiktok, facebook, copyright, legal_id.

**Interfaces:** Each file holds version, date, official source, and a rule list in plain language per category. File format frozen by T-001. Produces data A4 reads per domain slice only.

- [ ] Write a checklist: the 12 concept categories present in each platform file, copyright parameters per Module 2, legal themes per Module 3.
- [ ] Compose all five files from official sources. Anything unverified is written as a theme and marked needs verification. Never invent article numbers.
- [ ] Check the checklist holds for all five files and report each file with its source.

### Task T-104: Report UI from mock

**Owner:** A6. **Depends on:** T-001. Parallel with T-101 to T-103.

**Files:** Interface territory.

**Interfaces:** Consumes a mock `FinalReport` exactly per contract. Computes no scores and changes no statuses.

- [ ] Write a display test: the mock report renders as three platform cards, one copyright card, one legal card, and a checklist.
- [ ] Run the test and confirm it fails.
- [ ] Build the upload page, six agent status cards that can fill partially, and the report page including the one-failed-agent state and the required disclaimer.
- [ ] Run tests until they pass and report.

---

## TODO: Wave 2 (parallel, one module one owner)

Every wave 2 task consumes a mock `EvidenceBundle` and one rule slice from T-103, and produces an `AgentResult` exactly per contract. All use the same steps:

- [ ] Write a test with a mock evidence bundle deliberately containing that domain trigger, and confirm the test fails first.
- [ ] Build the domain-specific prompt and small output schema. Accept only its own rule slice.
- [ ] Run tests until output is contract-valid, every finding carries evidence, and risk language is correct. Report to the Lead.

| ID | Runtime agent module | Owner | Required test trigger |
|---|---|---|---|
| T-201 | YouTube | A4 | Exaggerated health claim triggers limited ads or demonetization risk |
| T-202 | TikTok | A4 | Disguised gambling promotion triggers recommendation ineligibility |
| T-203 | Facebook | A4 | Untransformed reupload triggers distribution restriction |
| T-204 | Copyright | A4 | Commercial music and another-platform watermark raise per-segment risk |
| T-205 | Indonesian Legal | A4 | Misleading medicine claim and online gambling promotion trigger legal themes, with disclaimer |
| T-206 | Packaging and Privacy | A4 | Misleading clickbait thumbnail and a keyframe license plate marked for blurring |

Wave 2 exit gate: all six modules pass their own mock tests. No module computes final scores.

---

## TODO: Wave 3 (integration, sequential)

### Task T-301: Deterministic merger and scoring

**Owner:** A5. **Depends on:** Wave 2 complete.

**Files:** Merger territory.

**Interfaces:** Consumes six `AgentResult` values. Produces a `FinalReport` exactly per contract with scores from the contract Deterministic Scoring Contract section.

- [ ] Write a test: duplicate findings shrink, scores follow the frozen deductions, a failed agent still yields a partial report.
- [ ] Run the test and confirm it fails.
- [ ] Build merging, score computation, checklist deduplication, and final recommendation selection with no LLM calls.
- [ ] Run tests until they pass and report.

### Task T-302: End-to-end parallel orchestration

**Owner:** Lead with A2, A4, A5. **Depends on:** T-301.

**Files:** Orchestration territory frozen by T-001. Does not take over module owner territory.

**Interfaces:** Connects upload to the parallel evidence stage, six parallel agents, then T-301. Produces per-agent status the T-104 UI consumes as-is.

- [ ] Write an integration test with mocked Meta: six agents called concurrently, partial results appear before the slowest agent finishes, and one forced-failure agent does not fail the report.
- [ ] Run the test and confirm it fails.
- [ ] Build concurrent orchestration with a timeout and one retry per agent.
- [ ] Run integration tests until they pass and record total time against the slowest agent time.

### Task T-303: Wire UI to live orchestration

**Owner:** A6 with Lead. **Depends on:** T-302.

- [ ] Switch the UI data source from mock to live status and reports without changing any frontend computation.
- [ ] Test the states: all agents done, one agent failed, slow network, and the bundled example video.
- [ ] Report test results per state.

---

## TODO: Wave 4 (QA and demo)

### Task T-401: Three example videos and expected results

**Owner:** A7. **Depends on:** T-302.

- [ ] Prepare a safe video, a platform and copyright risk video, and an Indonesian legal risk video, each with a human expected-findings list.
- [ ] Run all three through the live path and record finding differences from expectations as QA findings, not by silently changing code.

### Task T-402: Demo rehearsal and fallback path

**Owner:** A7 with Lead. **Depends on:** T-401 and T-303.

- [ ] Rehearse the concept demo flow: open with the problem, upload the main video, show six parallel cards, open the three platform outcomes, open copyright and legal, close with the checklist.
- [ ] Prove the fallback path still runs with no network using the sample evidence bundle and saved report.
- [ ] Record demo timing and cut any step that pushes past 3 minutes.

### Task T-403: Competition prohibition check

**Owner:** Lead. **Depends on:** T-401.

- [ ] Search the whole app repo: no YOLO, Whisper, OpenAI, Google Vision, ElevenLabs, real API keys, or real-time claims.
- [ ] Check every user-facing text: copyright and legal always use risk language, the disclaimer shows, and there is no guaranteed-pass promise.
- [ ] Report search results as evidence. Findings become fix tasks for the owning territory.

---

## BLOCKED

None yet. A task waiting on a decision or another agent is written here by the Lead with its blocker, never left hanging in Todo.

---

## RULING

| Date | Decision | Reason | Cost if wrong |
|---|---|---|---|
| 2026-10-30 | Execution locked: worker Muse Spark 1.3, verifier Muse Wonder 1.0 fresh context, Done only after verifier PASS. All models at max reasoning on every task without exception, replacing the earlier max/standard split | The project owner put maximum reasoning quality first in every role, and worker and checker stay separate so there is no self-review | Cost and time rise in every wave, including light tasks. If the execution path offers no Spark 1.3, the Lead must record a deviation ruling before the task starts and may not claim that model |
| 2026-10-30 | T-001 stack locked on owner instruction ("use your proposed stack"): TypeScript 5 + Next.js 15 App Router (React 19) + Tailwind CSS v4 + Zod + Vitest, Node 22 LTS, npm, system ffmpeg. Final folders, Meta timeouts, and rule JSON format frozen in `docs/contracts.md`. Work order frozen in `docs/superpowers/plans/2026-10-30-cekdulu-mvp.md` | One language for UI and parallel orchestration lets the Zod machine contract serve every territory as-is, tests need one `npm test` command, and the demo needs one `npm start` process. This is the Lead proposal the owner approved, not a concept finding | Video upload through Next.js routes and ffmpeg extraction is the most fragile point. If proven unreliable, the fallback is a split backend (for example FastAPI) and a contract re-freeze, voiding parts of plan Tasks 2, 3, and 13 |
| 2026-10-30 | Worker model path deviation recorded before wave 1 starts: this session sub-agent catalog offers only `general-purpose` and `workflow-subagent` definitions with no per-worker Muse Spark 1.3 model picker, so wave 1 workers run on the available session model and results are not claimed as Spark 1.3 work. The verifier stays Muse Wonder 1.0 fresh context per the lock | The execution-path honesty clause in `AGENTS.md` requires a deviation ruling before a task starts when Spark 1.3 is unavailable. Claiming otherwise is forbidden | Worker model consistency differs from the initial claim and per-task cost/time follows the session model. If a Spark 1.3 path opens mid-way, the Lead records a recovery ruling and tasks re-verify when the model changes |
| 2026-10-30 | Full English conversion on owner instruction: app UI, agent prompts, merger output, error messages, rule data, examples, README, demo script, and this board plus `AGENTS.md` and `docs/contracts.md` move to English. Machine codes (severity, status, category slugs) stay unchanged. Display labels are English. The frozen disclaimer changes officially to "Initial screening, not a platform decision, not Content ID, and not legal advice." with a contract change log entry | The owner asked for everything in English. Keeping machine codes avoids a contract-breaking rename across schemas, rules, agents, and tests, while display translation covers everything users read | Historical reports and verdicts under `docs/superpowers/reports/` stay Indonesian as past evidence and no longer match current copy word for word. Any missed Indonesian string in user-facing scope is a defect to fix, not a style choice |

The Lead records the next ruling in this table with the same format: decision, reason, cost if wrong.

---

## How to use this board

The locked model execution rule applies at every step: worker Muse Spark 1.3, verifier Muse Wonder 1.0. Detail is in `AGENTS.md`, Model Execution Rules section (locked 2026-10-30).

1. The Lead finishes T-001 and moves ready wave 1 tasks to On Progress, at most one task per agent.
2. Worker Spark 1.3 at max reasoning works only on its own On Progress task, in its file territory, with contract mocks. Every task at max reasoning without exception.
3. The worker sends a completion report in the `AGENTS.md` format, including test commands and results.
4. Verifier Muse Wonder 1.0 at max reasoning from a fresh context re-runs the tests, validates contracts and prohibitions, then gives a `PASS` or `FAIL` verdict with evidence. On `FAIL`, the task returns to the same worker.
5. The Lead moves a task to Done only after a recorded `PASS` verdict.
6. The next wave opens only when its wave gate holds, not because one agent happens to be idle.
