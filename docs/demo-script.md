# CekDulu Demo Script for Judges (T-402)

Total target: **150 seconds** for the main flow, plus **20 seconds** for the fallback path when used. Worst case **170 seconds**, under the 180 second limit. Every score in this script comes from **mock mode** (`META_MOCK=1` or the built-in example report). No number in this script comes from a real Meta call.

Two different mock number sources are in play and must never be confused on stage:

| Script label | Source | Contents |
|---|---|---|
| **LIVE-MOCK** | A real upload to the local server with `META_MOCK=1`, saved in `data/examples/saved-report.json` | YouTube 100 `aman`, TikTok 100 `aman`, Facebook 100 `aman`, copyright `rendah`, legal `rendah`, empty checklist. Mock reasoning returns zero findings, so this path proves the pipeline runs, not different platform outcomes. |
| **EXAMPLE-MOCK** | The **Load example report** button (`/report` with no job), the app built-in example report | YouTube 55 `perlu_perbaikan` (Needs fixes), TikTok 25 `berisiko_tinggi` (High risk), Facebook 70 `perlu_perbaikan` (Needs fixes), copyright `tinggi` (High), legal `tinggi` (High), 3 checklist items, one `gagal` (failed) agent. These are the numbers for the three different outcomes story. |

## Operator prep (before judges enter)

```powershell
npm run build
$env:META_MOCK = "1"
npm start -- -p 3106
```

- Open **http://localhost:3106** in the browser.
- `META_MOCK=1` must be set **before** `npm start`. Without it, and with a local key present in `.env.local`, the server runs in real mode instead of demo mock mode.
- Port `3106` is the rehearsal session spare port. Swap in any free port when needed and adjust the URL.
- Keep `data/examples/platform-copyright-risk.mp4` easy to pick.
- Measured in the rehearsal session: build 12.0 seconds, server ready 0.8 seconds, `/` load 51 ms, `/report` load 72 ms, POST to terminal report 252 ms. These are rehearsal machine timings, not stage promises.

## Main flow (150 seconds)

### Step 1: One-sentence opening (target 15 seconds, cumulative 0:15)

Clicks: none. Stay on the home page at `http://localhost:3106`.

Say: "Creators can lose monetization and accounts over videos already published. CekDulu checks the same video **before** the publish button is pressed."

Point at the disclaimer line on the page: "Initial screening, not a platform decision, not Content ID, and not legal advice."

### Step 2: Upload the main video (target 30 seconds, cumulative 0:45)

Exact clicks:

1. **Video** field, pick `data/examples/platform-copyright-risk.mp4`.
2. **Title** field, fill `Latest Hits Concert Full Performance`.
3. **Caption** field, fill `Full performance from yesterday's concert, watch to the end.`
4. **Thumbnail** and **Extra context** fields, leave empty.
5. **Analyze video** button.

The page moves to `/report?job=<id>`. Say: "One video now gets checked for three platforms at once, plus copyright and Indonesian law."

Stage honesty: in mock mode the analysis finishes in under a second (252 ms measured in rehearsal). Do not promise stage pause from this step. Fill talk time with narration, not server waiting.

### Step 3: Six parallel cards fill in (target 25 seconds, cumulative 1:10)

Clicks: none. Stay on the **Agent status** section of the job report page.

Point at the six cards: YouTube, TikTok, Facebook, Copyright, Indonesian Legal, Packaging and Privacy. Say: "Six checks run from the same evidence bundle, at the same time, not in a queue. Finished cards appear first. A failed card stays marked and never fails the report."

Stage honesty: in LIVE-MOCK all six cards move from `queued` to `done` almost together (under one 1000 ms polling interval), so one-by-one filling is **not observable** in mock mode. One-by-one filling only shows when real agents take different times. To show a failed agent state, use the EXAMPLE-MOCK report in Step 4: the Packaging and Privacy card there is `gagal` (failed).

### Step 4: Three different platform outcomes (target 30 seconds, cumulative 1:40)

Exact clicks: return to the home page (`http://localhost:3106`), then the **Load example report** button. The `/report` page shows with no upload and no API call.

State the **EXAMPLE-MOCK** numbers as what they are, an example report in mock mode:

| Platform | Score | Status | Top risk pointed at |
|---|---|---|---|
| YouTube | 55 | `perlu_perbaikan` (Needs fixes) | Gambling promotion risks limiting monetization and reach |
| TikTok | 25 | `berisiko_tinggi` (High risk) | Gambling promotion risks making the video ineligible for recommendation |
| Facebook | 70 | `perlu_perbaikan` (Needs fixes) | Commercial music with no transformation risks limiting distribution |

Say the concept line: "One video, three different outcomes." Explain in one sentence that deterministic code computes the scores from findings (start 100, `tinggi` (High) -30, `sedang` (Medium) -15, `rendah` (Low) -5), never the model. Point at one timestamped finding `00:05-00:12` with its evidence quote.

Mandatory honesty note when judges ask: the LIVE-MOCK upload in Step 2 returns 100 `aman` (Safe) on all three platforms because mock reasoning returns zero findings. The three-outcome difference in this step comes from the built-in example report, also mock mode, not from the live upload.

### Step 5: Copyright and Indonesian legal cards (target 25 seconds, cumulative 2:05)

Clicks: scroll to the **Copyright and Indonesian legal risk** section on the same `/report` page.

- **Copyright Risk** card (EXAMPLE-MOCK): level `tinggi` (High), commercial music segment `00:00-00:45` with a possible claim risk. Use risk language: "at risk of a possible claim". Never say "definitely violates" or "guaranteed copyright-free".
- **Indonesian Legal Risk** card (EXAMPLE-MOCK): level `tinggi` (High), theme `judi_online` at `00:05-00:12`. Point at the exact disclaimer: "Initial screening, not a platform decision, not Content ID, and not legal advice." Stress this is theme screening, not legal advice.

### Step 6: Close with the checklist (target 25 seconds, cumulative 2:30)

Clicks: scroll to the **Fix checklist**. Tick one checkbox in front of the judges to show the checklist is workable, then read the three EXAMPLE-MOCK items:

1. Cut the gambling promo segment at 00:05-00:12 before uploading.
2. Replace the background music with royalty-free audio before uploading.
3. Blur the license plate in the keyframe around 00:18 before uploading.

Close with one sentence: "The end result is not a verdict. It is a fix list an editor can execute before the video is published." Stop at 150 seconds. The remaining 30 seconds to the 180 second limit is question reserve, not a new step.

## No-network fallback path (target 20 seconds, only when the main path fails)

Use this path when upload fails, the API is slow, or stage network dies.

Honest prerequisite: the local server still has to run (`npm run build`, then `npm start` with `META_MOCK=1` as in Prep). "No network" here means **no internet and no Meta API calls**. The presenter machine still serves the pages on `localhost`.

Exact clicks:

1. Open `http://localhost:3106`.
2. Click **Load example report**.
3. The example report shows at `/report`. Continue from Step 4 of this script (three platforms, copyright, legal, checklist) with no upload repeat.

Second fallback file: `data/examples/saved-report.json` is a real `FinalReport` captured from the LIVE-MOCK upload path (job `28b58383-5685-4975-bcf6-b4927bdec648`) and passes the `FinalReport` schema. Open that file in a text editor when judges ask for stored artifact proof. Its honest limit: the interface today **does not load** `saved-report.json` directly. The Load example report button shows the app built-in example report with the same report structure. Both are mock mode.

Proven in rehearsal: with the local production server running, `GET /` answered 200 in 51 ms, `GET /report` answered 200 in 72 ms, and the Load example report path calls no `fetch` at all from code (the report page with no `job` renders the built-in report, and the polling hook stops before `fetch` when there is no job). The Meta client mock branch also touches no network from code: it returns sample data without calling `fetch`.

**Not yet proven:** this rehearsal never physically cut machine network, never ran a real end-to-end browser click path, and never tested real Meta mode with an API key on stage. The "offline" claim must never stretch past the evidence in the paragraph above.

## Forbidden lines during the demo

- Never say "real-time", "live", or "live detection".
- Never say a video is "guaranteed copyright-free", "definitely violates", or "legally safe". Always risk language.
- Never present EXAMPLE-MOCK numbers as live upload results, and never present LIVE-MOCK numbers (100 `aman` on all three) as proof the example video is safe. Both are mock mode from different sources, explained in the opening table.
- SAM is for selected keyframes only. Never promise object tracking.
