# CekDulu Example Videos (T-401)

Three labeled example cases for QA and demo. Each case has four artifacts: a short synthetic video (`.mp4`), a human-written evidence bundle (`.bundle.json`), human-written expected findings (`.expected.json`), and the shared automated test in `examples.test.ts`.

## What each video holds

Every labeled-case video is made with the repo ffmpeg (`node_modules/ffmpeg-static`): `lavfi testsrc`/`color` test patterns plus a `sine` tone. The labeled-case videos carry no burned-in text: cross-machine `drawtext` fonts were not treated as reliable, so no on-screen text claim lives in those pixels. Every content claim (transcript, scene description, keyframe finding, title, caption, thumbnail) lives in the companion `.bundle.json` file, exactly as a human or the evidence pipeline would report it for that content.

| File | Duration | Synthetic visual/audio contents | Represented case |
|---|---|---|---|
| `safe.mp4` | 8 seconds | `testsrc` test pattern 320x240 + 440 Hz sine tone | Safe video: a clean home cooking demo |
| `platform-copyright-risk.mp4` | 10 seconds | `testsrc` test pattern 320x240 + 880 Hz sine tone | Platform and copyright risk: a concert clip reupload with commercial music |
| `legal-risk.mp4` | 10 seconds | Dark red `color` 320x240 + 220 Hz sine tone | Indonesian legal risk: misleading medicine claim + gambling promotion + license plate |

## Which parts are synthetic stand-ins

- The `testsrc`/`color` patterns are neutral visual stand-ins. These videos are **not** real cooking, concert, or promotion recordings. No real person, brand, watermark, or license plate exists in their pixels.
- The sine tones are neutral audio stand-ins. The 880 Hz tone in the platform-copyright case is only a file marker. It is **not** a commercial pop song and proves no music detection.
- Each `.bundle.json` file is a hand-written evidence bundle stand-in: its contents state what a human (or the Stage 0-1 pipeline) would report for a real video with that case label. On-screen text claims, promo transcripts, commercial music descriptions, watermarks, and license plates live there.
- Each `.expected.json` file is written from a human reading of the bundle: `{must_include: [{agent, category}], must_exclude_categories, expected_status_hint}`. Its contents are not a copy of code output.

## Realistic sample videos for manual tries (2026-10-30)

Three extra vertical 720x1280 files with text burned into the pixels (system Arial font, verified from extracted frames). Use these through the upload page. Their label pairings follow the labeled cases above. All three stay synthetic: moving test-pattern backgrounds and speechless sine tone audio, so a real-mode transcript comes back empty and the main cue is on-screen text.

| File | Duration | On-screen text | Label |
|---|---|---|---|
| `sample-aman.mp4` | 15 seconds | "HOMEMADE CHILI SAUCE RECIPE", "Fresh ingredients, no preservatives", "Cooks in 15 minutes, ready to serve" | Safe (`safe`) |
| `sample-resiko.mp4` | 18 seconds | "VIRAL VIDEO COMPILATION 2026", "Source @otheraccount - reupload", "Popular song background music", "other account watermark visible" | Platform + copyright risk (`platform-copyright-risk`) |
| `sample-sangat-beresiko.mp4` | 18 seconds | "MIRACLE HERB TOTAL CURE", "3 days, no side effects", "100 percent guaranteed results", "ONLINE LOTTERY SITE SIGN-UP BONUS" | Very high legal risk (`legal-risk`) |

Suggested title and caption when trying them: match the main on-screen text (for example the title "MIRACLE HERB TOTAL CURE" for the third sample) so the packaging cue gets read too.

## How the test reads these cases

`examples.test.ts` parses every bundle against the `EvidenceBundle` schema, runs the six real runtime agents with a deterministic test-only harness `reason` (a keyword and cue matcher over the bundle, living only in that test file), then merges the results with the real `mergeReports`. That harness is **not model detection**: this test proves no Meta model detection. Differences between human expectations and harness output are recorded as QA findings in the task report, never fixed by changing product code.
