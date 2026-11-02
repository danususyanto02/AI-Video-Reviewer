# Agent Delegation: CekDulu (AI Video Reviewer)

This document governs who does what while building CekDulu, so parallel agents never collide and results match the concept in `../cekdulu-ai-video-reviewer.md`.

The concept is the source of truth. When this document and the concept differ, the concept wins and the difference is reported to the Lead.

---

## Delegation principles

1. **One domain, one agent.** Each agent owns one file territory. Agents never edit files owned by another agent.
2. **Freeze the contract first, parallel after.** Parallel work starts only after the shared schema in `docs/contracts.md` is frozen. Mid-flight contract changes go through the Lead only.
3. **Mock first, integration last.** Each agent builds and tests its part with mock data from the contract, never waiting on another agent to finish.
4. **Honest technical claims.** No YOLO, Whisper, OpenAI, Google Vision, or non-Meta models. No real-time claims. SAM 3.1 is for keyframes only. Copyright and legal language is always risk language.
5. **Every finish is reported in the fixed format.** See the Completion Report Format section. Without that report, a task does not count as done.
6. **Workers never verify themselves.** Every worker result must pass a separate verifier agent before Done. See the locked Model Execution Rules.

---

## Model execution rules (locked 2026-10-30)

This decision is locked with project owner approval and applies to every wave. Changing it requires a Lead ruling in `TASKS.md`.

| Role | Locked model | Reasoning | Responsibility |
|---|---|---|---|
| Worker or implementer | Muse Spark 1.3 | Max, every task without exception | Writes code and data in its territory, runs its task tests, sends the completion report |
| Verifier | Muse Wonder 1.0 | Max, every check without exception | Checks worker results from a fresh context: re-runs tests, validates contracts, checks prohibitions and out-of-territory changes |
| Lead | Muse Wonder 1.0 in the coordinator session | Max | Freezes contracts, delegates, accepts or rejects verification results, updates status in `TASKS.md` |

All models at max reasoning, locked 2026-10-30 by project owner decision:

- No reasoning load splitting. Worker Spark 1.3, verifier Muse Wonder 1.0, and the Lead all run max reasoning on every task and every check, including light tasks.
- Accepted consequence: slower and costlier execution in every wave. Speed must never be bought by quietly lowering reasoning. When cost or time limits force a change, the Lead records a new ruling in `TASKS.md` before the next task starts.

Verification flow per task, without exception:

1. Worker Spark 1.3 does one task in its territory and sends a fixed-format completion report, including test commands and results.
2. Verifier Muse Wonder 1.0, which did not do that task, checks from a fresh context. Checking means more than reading code and sharing an impression: re-running the worker test commands, validating output against `docs/contracts.md`, searching all changes for prohibitions (non-Meta models, API keys, real-time claims, copyright and legal certainty language), and confirming no file outside the owner territory changed.
3. The verifier gives one of two verdicts: `PASS` or `FAIL` with command evidence and results. On `FAIL`, the verifier writes findings per issue and the task returns to the same Spark worker, never a new agent.
4. The Lead moves a task to Done only after a recorded `PASS` verdict. A worker report alone, with no verifier verdict, is not enough.

Execution path honesty:

- When the available execution path offers no Muse Spark 1.3 model choice for worker sub-agents, the worker runs on the available session model and the Lead records that deviation as a ruling in `TASKS.md` before the task starts. The result may not be claimed as Spark 1.3 work.
- The verifier role stays Muse Wonder 1.0 in that case, because the Lead session runs on that model.
- Model names in this document are assignment rules, not proof that a given task ran on that model. Per-task proof is the recorded completion report and verifier verdict.

---

## Two agent layers, never confuse them

| Layer | Meaning | Governed in |
|---|---|---|
| Runtime agents | AI agents inside the product analyzing video in parallel (YouTube, TikTok, Facebook, Copyright, Legal, Packaging) | Concept, Parallel Analysis Architecture section |
| Build agents | Agents or people building this product in parallel | This document |

This document governs only the second layer.

---

## Build agent roster

### Lead: Coordinator and Integrator

- **Owns:** `TASKS.md`, `docs/contracts.md`, final merging, scope decisions.
- **Duties:** Freezes contracts, splits tasks, reviews completion reports, runs integration tests, rejects results that break competition limits.
- **May not:** Hand scope decisions (a fourth platform, a second country, videos over 3 minutes) to another agent.
- **The only role** allowed to change task status in `TASKS.md` after reviewing evidence.

### A1: Foundation and Meta Client

- **Owns:** App repo skeleton, environment config, Meta Model API client (Responses, Transcribe, Image, SAM), shared error and timeout handling.
- **Output:** A runnable empty app, one Meta call function per capability with mock mode, an example `.env` with no real key.
- **May not:** Write scoring prompts, platform rules, or report display.

### A2: Evidence Pipeline (Stages 0 and 1)

- **Owns:** Upload intake, duration validation, audio and keyframe extraction, Transcribe, Scene, Visual, and Localization calls, evidence bundle builder.
- **Output:** One contract-shaped evidence bundle JSON from one video file, plus a mock evidence bundle mode for the example video.
- **May not:** Judge violations. This agent only gathers evidence and gives no scores.

### A3: Rule Data

- **Owns:** The structured rule data folder and its versions.
- **Output:** 12-category rules for YouTube, TikTok, Facebook, copyright risk parameters, and Indonesian legal themes, each as a separate per-domain data file for per-agent use.
- **May not:** Write scoring code or prompts. Every rule needs an official source and a version date. Article numbers are never invented: when unverified, write the theme only.

### A4: Runtime Specialist Agents (Stage 2)

- **Owns:** Prompts and small output schemas for six runtime agents: YouTube, TikTok, Facebook, Copyright, Indonesian Legal, Packaging and Privacy.
- **Output:** Six separate modules, one file per agent, each testable alone with the same mock evidence bundle.
- **May not:** Compute final scores or merge results across agents. That is A5 territory.
- **Parallel note:** The six modules are independent domains. When several agents build them, one agent holds at most two modules that share no files.

### A5: Merger and Scoring (Stage 3)

- **Owns:** Finding merging, deterministic score computation, checklist deduplication, final recommendation selection.
- **Output:** One final contract-shaped report JSON from six mock agent results.
- **May not:** Call an LLM to rewrite the report. This stage is plain code with unit tests.

### A6: Interface and Reports

- **Owns:** Upload page, six agent card parallel status, progressive report page, checkable checklist.
- **Output:** A complete UI running on mock report JSON alone, including the one-failed-agent state and the partial result state.
- **May not:** Compute scores in the frontend or change status meanings from the contract.

### A7: QA and Demo

- **Owns:** Example videos, test scenarios, demo script, demo day checklist.
- **Output:** Three example videos labeled with expected results, test results against real reports, and a backup demo that still runs with no network.
- **May not:** Change product code to make the demo look successful. QA findings are reported as new tasks.

---

## File ownership map

The Lead freezes the final stack and folder names in the first task and records them in `docs/contracts.md`. This map locks territories, not final file names:

| Territory | Owner | Other agents |
|---|---|---|
| Contract, schemas, shared types | Lead | Read-only |
| Meta client and config | A1 | Use only through the A1 interface |
| Upload, extraction, evidence bundle | A2 | Consume the evidence bundle only |
| Per-domain rule data | A3 | Read per domain slice only |
| Six runtime agent modules | A4 | One module never edits another module |
| Merger and scoring | A5 | Consume the six agent results only |
| Upload UI, status, reports | A6 | Consume final reports and status only |
| Example videos and tests | A7 | Never edit product code |

When two tasks feel they need the same file, the territory owner goes first. Other agents raise the need through the Lead, never by editing directly.

---

## Work waves

Parallel work happens only inside one wave, and the next wave waits for its gate.

| Wave | Contents | Entry gate | Shape |
|---|---|---|---|
| 0 | Freeze contracts, file territories, rule format, stack choice | Concept approved | Sequential, Lead |
| 1 | Meta foundation, mock evidence pipeline, rule data, mock report UI | Contract frozen | Parallel, different file domains |
| 2 | Six runtime agent modules | Mock evidence bundle and per-domain rules ready | Parallel, one module one owner |
| 3 | Parallel orchestration, merger, partial status, progressive reports | Every module passes its own mock test | Sequential integration by Lead, A5, A6 |
| 4 | Example videos, real tests, demo rehearsal, finding fixes | Whole report runs from upload to checklist | A7 leads, fixes return to territory owners |

Agents in waves 1 and 2 must work with contract mocks. Waiting for the whole previous wave to finish breaks the plan, unless its gate truly does not hold yet.

---

## How the Lead delegates one task

Every delegation is written with these five elements. Without one of them, an agent may refuse and ask the Lead to complete it:

1. **Scope:** One task from `TASKS.md` with its ID.
2. **Context:** The relevant concept and contract parts, pasted or referenced exactly.
3. **Territory:** Files that may be created or changed, and files that must never be touched.
4. **Output:** Artifacts and tests proving completion, including test commands and expected results.
5. **Report format:** Findings summary, changed files, test commands run with results, and deviations when any.

Compact example:

```text
Build T-201, the Copyright agent.
Context: concept Module 2 and the AgentResult contract in docs/contracts.md.
Territory: the copyright agent module only. Never touch platform agents, the merger, or the UI.
Output: a module taking a mock EvidenceBundle and returning a valid copyright
AgentResult, plus a test proving a risky music segment is detected.
Report: changed files, test command + result, contract deviations when any.
```

---

## Completion report format

Every agent ends its task with this report. The Lead moves task status to Done only after checking its contents:

```text
Task: T-xxx
Summary: one to three sentences of result.
Files changed: file list.
Tests run: exact commands.
Test results: pass or fail, with key output.
Deviations: none, or the decision taken with its reason.
Follow-up needs: contract or files from other agents still needed, when any.
```

A completion claim with no test command and result is rejected.

---

## Definition of Done per task

A task may move to Done only when all of this holds:

- The promised artifact exists in its owner file territory.
- The tests named in the task ran and results are reported.
- Output follows `docs/contracts.md` with no silent contract change.
- No non-Meta models, no real-time claims, no certainty language for copyright and law.
- Verifier Muse Wonder 1.0 gave a `PASS` verdict with re-run test evidence, per the Model Execution Rules.
- The Lead reviewed the completion report and the verifier verdict, then updated `TASKS.md`.

---

## Prohibitions for every agent

- Inventing article numbers, platform rule wording, or policy thresholds. Anything unverified is written as a theme and marked needs verification.
- Promising a certain pass score, guaranteed copyright freedom, or legal safety.
- Widening scope with no Lead decision: a fourth platform, a second country, videos over 3 minutes, live streams, platform logins, automatic publishing, or automatic video editing.
- Storing real API keys in the repo, in example files, or in reports.
- Editing `TASKS.md` yourself. Agents propose status changes through the completion report. The Lead updates it.

---

## Rulings

Decisions taken mid-flight are recorded by the Lead in the `TASKS.md` Ruling section in this format: what was decided, why, and the cost when the decision is wrong. Rulings are never rewritten in many places. One note on the task board is the source.
