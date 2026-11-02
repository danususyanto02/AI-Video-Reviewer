# Laporan FIX-1 — Ekstraksi keyframe gagal pada video pendek

Task: FIX-1 (wilayah A2, `src/lib/evidence/*`)
Status worker: selesai (menunggu verifikasi terpisah)

## Akar masalah (terbukti, sebelum perbaikan)

**Kalimat akar masalah:** sampling keyframe `fps=1/3` (1 frame per 3 detik) menghasilkan **nol frame** untuk video yang lebih pendek dari interval sampling — teramati pada video 1,00 detik — dan `extractKeyframes` tidak punya jaminan minimal satu keyframe, sehingga hasil nol frame itu berujung gagal atau kosong tergantung binary ffmpeg yang kebetulan berjalan.

Dua lapis bukti, dari reproduksi sistematis (tanpa perbaikan sebelum akar masalah terbukti):

### Lapis 1 — nol frame pada video 1 detik (kedua binary)

Perintah persis argumen `extract.ts` saat ini (`-vf fps=1/3 -q:v 2 keyframe_%04d.jpg`) pada mp4 testsrc+sine:

| Durasi | ffmpeg-static 6.1.1 (node_modules) | ffmpeg sistem 8.1.1 (PATH) |
|---|---|---|
| 1 dtk | exit 0, **0 frame** | exit **-22**, **0 frame** |
| 2 dtk | exit 0, 1 frame | exit 0, 1 frame |
| 3–4 dtk | exit 0, 1 frame | exit 0, 1 frame |
| 5 dtk | exit 0, 2 frame | exit 0, 2 frame |

stderr kunci video 1 detik, binary static (exit 0, diam-diam kosong):

```text
[out#0/image2] Output file is empty, nothing was encoded(check -ss / -t / -frames parameters if used)
frame=    0 fps=0.0 q=0.0
```

stderr kunci video 1 detik, binary sistem (exit -22, fatal):

```text
[vf#0:0] No filtered frames for output stream, trying to initialize anyway.
[mjpeg] Non full-range YUV is non-standard, set strict_std_compliance to at most unofficial to use it.
[mjpeg] ff_frame_thread_encoder_init failed
[vost#0:0/mjpeg] Error while opening encoder - maybe incorrect parameters such as bit_rate, rate, width or height.
[out#0/image2] Nothing was written into output file, because at least one of its streams received no packets.
Conversion failed!
```

### Lapis 2 — binary yang berjalan berbeda antara jalur langsung dan server

Panggilan langsung `buildEvidenceBundle(input, createMetaClient({ forceMock: true }))` lewat vitest **tidak** melempar (bug tidak tereproduksi di jalur ini — perbedaan ini sendiri adalah bukti):

```text
[repro] ffmpeg resolved=F:\PC\Project\hackathon\ide\video analisa\app\node_modules\ffmpeg-static\ffmpeg.exe exists=true
[repro] tiny1.mp4 RAW fps=1/3 code=0 ... Output file is empty, nothing was encoded
[repro] tiny1.mp4 extractKeyframes OK frames=[]
[repro] tiny1.mp4 buildEvidenceBundle OK duration=1 transcript=1 scenes=1 keyframes=1
```

Di jalur ini binary static ter-resolve benar, exit 0 dengan nol frame diterima diam-diam, bundle tetap jadi karena klien mock mengembalikan temuan canned walau daftar gambar kosong (cacat laten: Image Understanding tidak menerima keyframe sama sekali).

Jalur API nyata (`npm run build` + `npm start`, `META_MOCK=1`, POST mp4 1 detik yang sama) **ter reproduksi persis**:

```text
POST /api/analyze -> {"job_id":"6cf8077c-dfca-401d-8f6b-042201404c3f"}
GET /api/jobs/<id> -> {"progress":[enam agen "queued"],"report":null,"error":"Ekstraksi keyframe gagal."}
```

Penyebab perbedaan: webpack Next membundel `ffmpeg-static/index.js` ke `.next/server/app/api/analyze/route.js`, sehingga `__dirname` di dalamnya menunjuk folder `.next/server/...`, bukan `node_modules/ffmpeg-static`. Verifikasi: `Test-Path .next/server/app/api/analyze/ffmpeg.exe` = False dan `.../bin/win32/x64/ffprobe.exe` = False, sedangkan `node_modules/ffmpeg-static/ffmpeg.exe` = True. Karena `existsSync` gagal, `resolveFfmpegPath()` jatuh ke `"ffmpeg"` di PATH (Gyan 8.1.1) yang keluar -22 pada kasus nol frame di atas, lalu `extractKeyframes` melempar `EvidenceError("Ekstraksi keyframe gagal.")`. ffprobe mengalami fallback yang sama tetapi ffprobe sistem membaca durasi dengan benar, jadi probe lolos dan kegagalan berhenti tepat di keyframe — konsisten dengan gejala.

### Putusan hipotesis awal

| Hipotesis | Putusan |
|---|---|
| (a) filter fps menghasilkan 0 frame untuk video <3 dtk | **Terbukti** sebagai akar (1,00 dtk → 0 frame di kedua binary). Klausa "kode memperlakukan 0 frame sebagai kegagalan" hanya benar secara tidak langsung: pada binary static 0 frame diterima diam-diam (exit 0); yang fatal adalah tidak adanya jaminan ≥1 keyframe. |
| (b) jalur binary/spawn berbeda di cwd server | **Terbukti sebagai penyebab pemicu gejala API**: bundel webpack membuat path paket tidak ada → fallback ffmpeg PATH 8.1.1 → exit -22. Bukan spawn ENOENT (pesan errornya akan berbeda). |
| (c) direktori/pola output | **Tersingkir**: pola dan direktori yang sama berhasil pada jalur langsung dan pada video 2 detik di kedua binary. |
| (d) thumbnail null | **Tersingkir**: bundle jalur langsung dengan `thumbnailPath: null` selesai; fallback gambar sudah memakai `videoPath`. |

## Tes regresi (ditulis dulu, diamati gagal)

Ditambahkan describe `FIX-1 regression: video 1 detik` di [bundle.test.ts](/F:/PC/Project/hackathon/ide/video analisa/app/src/lib/evidence/bundle.test.ts): video uji 1 detik dibuat dengan binary ffmpeg ter-resolve (pola fixture yang sama seperti video 2 detik yang sudah ada), lalu (1) `extractKeyframes` wajib menghasilkan ≥1 berkas yang ada di disk, (2) `buildEvidenceBundle` dengan MetaClient palsu wajib valid terhadap skema dan argumen pertama `understandImages` wajib berisi ≥1 path keyframe.

Hasil RED pada kode lama (`npx vitest run src/lib/evidence/bundle.test.ts`): **2 failed, 14 passed** — `AssertionError: expected 0 to be greater than or equal to 1` pada kedua tes baru; log `[evidence-test] FIX-1 keyframes 1 detik=` (kosong).

## Perbaikan (minimal, di akar masalah)

Satu-satunya perubahan logika produksi ada di [extract.ts](/F:/PC/Project/hackathon/ide/video analisa/app/src/lib/evidence/extract.ts) pada `extractKeyframes`:

1. Hasil sampling `fps=1/3` dikumpulkan lewat helper `listKeyframeFiles` (pola sortir yang sama seperti sebelumnya) dan hanya dikembalikan bila exit 0 **dan** jumlah frame > 0.
2. Bila sampling menghasilkan nol frame (exit 0 diam-diam maupun exit non-nol tanpa frame), dijalankan satu tangkapan frame pertama: `-frames:v 1 -q:v 2 keyframe_0001.jpg`. Bila menghasilkan berkas, berkas itu dikembalikan. Perintah fallback ini diverifikasi manual exit 0 + berkas terbentuk pada **kedua** binary (static 6.1.1 dan sistem 8.1.1) untuk video 1 detik yang sama.
3. Bila tetap nol frame, dilempar `EvidenceError("extract_failed", "Ekstraksi keyframe gagal.")` seperti sebelumnya. Semantik lama dipertahankan: binary absen tetap `extract_failed` dari `runBinary` (reject spawn tidak ditangkap), exit non-nol yang tetap menghasilkan frame sebagian tetap gagal seperti sebelumnya, dan video rusak tetap gagal (probe `unreadable` lebih dulu di jalur bundle).

Yang sengaja **tidak** diubah: resolusi binary (`resolveFfmpegPath`/`resolveFfprobePath`), interval sampling kontrak 1 frame per 3 detik, `bundle.ts`, `validate.ts`, dan semua wilayah lain. Perbaikan membuat ekstraksi benar di bawah binary mana pun yang ter-resolve — dibuktikan di bawah pada kedua binary — alih-alih bergantung pada pilihan binary tertentu. Tidak ada perubahan kontrak di `docs/contracts.md`.

## Perintah uji dan hasil

| Perintah | Hasil |
|---|---|
| `npx vitest run src/lib/evidence/bundle.test.ts` (sebelum fix) | 2 failed (tes FIX-1 baru), 14 passed — RED teramati |
| `npx vitest run src/lib/evidence/bundle.test.ts` (sesudah fix) | **16 passed**; log `FIX-1 keyframes 1 detik=.../keyframe_0001.jpg` |
| `FFMPEG_PATH=<ffmpeg sistem 8.1.1>` + `npx vitest run src/lib/evidence/bundle.test.ts` | **16 passed** — fix benar juga di bawah binary yang dipakai jalur API |
| `npm test` | **Test Files 14 passed (14), Tests 187 passed (187)** (sebelumnya 185; +2 tes FIX-1) |
| `npm run typecheck` | exit 0, tanpa output error |

## Bukti ujung-ke-ujung (API nyata)

Sesudah `npm run build` (sukses) + `npm start -p 3102` dengan `META_MOCK=1`, berkas yang sama dengan reproduksi awal (`tiny1.mp4`, 1 detik, testsrc+sine):

```text
GET / -> 200
POST /api/analyze -> {"job_id":"2984fbe9-b354-4456-adda-47f39d5ba266"}
GET /api/jobs/<id> (terminal): error=null, progress keenam agen "done",
report terisi: overall_recommendation, platforms[3] (safety_score 100, status "aman"),
copyright{risk_level "rendah"}, legal_id{risk_level "rendah", disclaimer skrining},
fix_checklist[], rules_version "2026-10-30.1",
agent_statuses keenam agen "selesai"
```

Bandingkan snapshot terminal sebelum fix pada alur identik: `error:"Ekstraksi keyframe gagal."`, keenam agen tetap `queued`, `report:null`. Server bukti dimatikan sesudahnya (listener port 3102 terverifikasi tidak ada lagi, termasuk proses anak `next start` yatim dari sesi terminasi).

## Format laporan selesai

```text
Task: FIX-1
Ringkasan: Video lebih pendek dari interval sampling keyframe (mis. 1 detik) kini selalu menghasilkan minimal 1 keyframe lewat fallback frame pertama, sehingga unggahan mp4 kecil yang valid tidak lagi berhenti pada "Ekstraksi keyframe gagal."
File diubah: src/lib/evidence/extract.ts (fallback keyframe di extractKeyframes + helper listKeyframeFiles), src/lib/evidence/bundle.test.ts (describe regresi FIX-1 video 1 detik, 2 tes), docs/superpowers/reports/fix-01-report.md (laporan ini). Tes reproduksi sementara __fix1-repro.test.ts dibuat untuk diagnosis lalu dihapus. Tidak menyentuh agen/meta/kontrak/UI/jobs/TASKS.md; tanpa git.
Uji dijalankan: reproduksi langsung vitest (lulus diam-diam, 0 frame), reproduksi API build+start sebelum fix (error keyframe teramati), sapuan durasi 1–5 dtk pada dua binary ffmpeg, fallback manual dua binary, vitest bundle RED lalu GREEN, vitest bundle dengan FFMPEG_PATH sistem, npm test penuh, npm run typecheck, build+start+POST+poll sesudah fix.
Hasil uji: RED 2 failed/14 passed; GREEN bundle 16 passed (kedua binary); npm test 14 files/187 passed; typecheck exit 0; API sesudah fix report lengkap dengan agent_statuses selesai.
Penyimpangan: Tidak ada dari kontrak. Resolusi binary ala webpack (fallback ke ffmpeg PATH di server) didokumentasikan sebagai konteks akar masalah tetapi tidak diubah: wilayah perbaikan yang diminta adalah ekstraksi, dan ekstraksi kini benar pada kedua binary.
Kebutuhan lanjut: Tidak ada.
```
