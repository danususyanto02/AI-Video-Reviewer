# Verdict Task 15 — T-401 (Verifier, fresh context)

**Putusan: PASS**

## Perintah yang dijalankan ulang

- `npm test` → 15 files, **203 passed**, exit 0 (examples.test.ts 15 passed).
- `npm run typecheck` → exit 0.
- ffprobe repo (`node_modules/ffprobe-static/.../ffprobe.exe`): safe 8.0s/105596B, platform-copyright-risk 10.0s/130251B, legal-risk 10.0s/96693B — semua 1..180s, non-trivial.

## Audit expected-vs-actual

| Kasus | Expected (report) | Aktual (test lulus) | Kesimpulan |
|---|---|---|---|
| safe | `must_include []`, hint `aman`, 25 exclude | agen `[]`, platform 100 `aman`, checklist 0 | cocok; tanpa cue risiko di bundle |
| platform-copyright-risk | 7 must_include, 6 exclude, `perlu_perbaikan` | platform `spam_clickbait_reupload`, copyright tinggi, checklist 4, platform 70 | cocok; tanpa judi di bundle/expected |
| legal-risk | 13 must_include, 7 exclude, `berisiko_tinggi` | platform 40, legal tinggi + `DISCLAIMER`, copyright rendah | cocok |

Spot-check cue (3 pasangan): (1) legal transcript “dijamin sembuh total dari diabetes” → `klaim_menyesatkan_produk_investasi`/`misinformasi` — ada cue; (2) legal transcript “situs toto…bonus new member” → `judi`/`judi_online` — ada cue; (3) legal keyframe `license_plate` plat tanpa blur → `privasi_data_pribadi` (semua agent) — ada cue. Platform: scene “Musik latar lagu pop komersial” → `musik_komersial`, keyframe `watermark` → `watermark_platform_lain`, scene “diputar ulang secara utuh…tanpa transformasi” → `reupload_tanpa_transformasi`/`spam_clickbait_reupload` — semua ada cue. Tidak ditemukan expectation tanpa cue di bundle-nya. `must_exclude` non-kosong di ketiga kasus.

Harness: `examples.test.ts:7-30` mengimpor enam `run*Agent` nyata + `mergeReports` nyata; `reason` harness (keyword matcher) hanya tinggal di file uji itu dan berlabel “test harness, bukan deteksi model” (baris 32-37, 96, 248-250, 317); assert pada `FinalReport` (must_include/exclude/status), safe constraints (no `tinggi`), legal `DISCLAIMER` persis (baris 384-395). README jujur melabeli video sintetis (`testsrc`/`color`+sine, klaim tinggal di bundle).

## Wilayah

Hanya `data/examples/*` + report berubah (mtime 17:21-17:23); file produk terbaru 17:06 (sebelum task ini). Tidak ada edit produk yang dideklarasikan maupun teramati. Scan larangan di examples: tidak ada YOLO/Whisper/pasti-lolos/real-time.

## Temuan

- **Info:** QA-15-1 (`packaging_privacy` tanpa bagian sendiri di `FinalReport`, diverifikasi via `AgentResult`+checklist), QA-15-2 (deteksi model tidak terbukti), QA-15-3 (diferensiasi per-platform tidak terbukti), QA-15-4 (judul legal dibaca konservatif, tidak dikunci), QA-15-5 (video pengganti sintetis) — diteruskan apa adanya; jujur dan tidak digelembungkan.
- **Minor/Blocker:** tidak ada. Catatan: tidak ada repo git, jadi wilayah diverifikasi via mtime + deklarasi report.
