# CekDulu: AI Video Reviewer

CekDulu checks a short video before you post it.

You upload the video together with the title, caption, and thumbnail you plan to use. The app reads all of it, checks it against the rules of YouTube, TikTok, and Facebook, looks for copyright and Indonesian legal risk, and gives you back one report. The report shows what looks risky, where it shows up in the video, and what to change.

> Initial screening, not a platform decision, not Content ID, and not legal advice.

## Why

Platforms flag videos after they go up. By then you have already lost the upload, sometimes the monetization, occasionally the account's good standing. CekDulu moves that check to before you post, while fixing things is still free.

## How it works

First the app builds an evidence bundle from your upload. It transcribes the speech, describes the scenes, samples keyframes, and keeps your title, caption, and thumbnail text alongside.

Six checks then read that same bundle at the same time. There is one for each platform, one for copyright, one for Indonesian legal themes, and one for packaging and privacy. A check can only report what it can point at, so every finding carries a timestamp and the exact words or frame it came from.

Plain code merges the six results. No second AI pass rewrites anything. Each platform starts at 100 points and loses 30 for a high severity finding, 15 for medium, 5 for low, down to a floor of 0. That score becomes a status you will recognize: Safe, Needs fixes, or High risk. Copyright and legal come back as risk levels instead, because a score would pretend to a precision that is not there.

Checks fail sometimes. When one does, the rest of the report still shows and the failed part is marked, so you get a partial report rather than an error page.

## Running it

You need Node.js 20 or newer. ffmpeg comes in as an npm package, so there is nothing else to install system-wide.

```bash
npm install
npm run build
npm start
```

Then open http://localhost:3000.

That is real mode, and it wants a Meta Model API key in `.env.local`. If you just want to look around, use demo mode. Every AI call is mocked, nothing leaves your machine, and the whole flow still works:

```powershell
# PowerShell
$env:META_MOCK="1"; npm start
```

```bash
# macOS / Linux
META_MOCK=1 npm start
```

There is also a **Load example report** button on the upload page. It shows a finished report from stored data, no upload and no network needed. Good first click.

## Sample videos

`data/examples/` holds three short videos we generated for testing:

| File | What you should get |
|---|---|
| `sample-aman.mp4` | Safe |
| `sample-resiko.mp4` | Risk |
| `sample-sangat-beresiko.mp4` | Very high legal risk |

Upload one, type any title and caption, press **Analyze video**. They are synthetic, fifteen to eighteen seconds each, with the test claims burned into the picture. Real creator videos work the same way, they just look better.

## Configuration

Copy `.env.example` to `.env.local`. Keep your real key in `.env.local` only. It is gitignored, and it should stay that way.

| Variable | What it does |
|---|---|
| `META_API_KEY` | Your Meta Model API key. Real mode only. |
| `META_BASE_URL` | API base URL. Defaults to `https://api.meta.ai/v1`. |
| `META_MOCK` | `1` means demo mode with mocked AI calls. |

## Project structure

```text
src/app/          Pages (upload, report) and the API routes
src/components/   UI pieces: agent status cards, platform cards, checklist
src/lib/
  contracts/      Shared data shapes (Zod schemas) used by every part
  meta/           Meta Model API client and configuration
  evidence/       Video intake: duration check, transcript, scenes, keyframes
  agents/         The six checks, one file each
  merge/          Deterministic merge and scoring (no AI call)
  jobs/           Background job store and polling
data/rules/       Platform, copyright, and legal rule data (versioned JSON)
data/examples/    Sample videos, evidence bundles, and expected results
docs/             Contracts, demo script, and project records
scripts/          Helper scripts, including the prohibition scan
```

## Commands

```bash
npm test                             # Run the whole test suite (Vitest)
npm run typecheck                    # TypeScript check
npm run build                        # Production build
node scripts/check-prohibitions.mjs  # Scan for banned claims and leaked keys
```

## Tech stack

TypeScript, Next.js 15 (App Router, React 19), Tailwind CSS v4, Zod, Vitest. All AI calls go to the Meta Model API.

## Read more

- `docs/contracts.md`: the frozen data shapes every part of the app shares.
- `docs/demo-script.md`: a 3 minute demo script with an offline fallback.
- `TASKS.md`: the task board and project rulings.
- `AGENTS.md`: how the project was built and who owned what.
