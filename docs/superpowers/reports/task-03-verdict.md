# Verdict Task 3 (T-102) — Pipeline Bukti

## Putusan: PASS

Verifier: Muse Wonder 1.0 (konteks baru, bukan implementor). Tanggal verifikasi: 2026-10-30.
Sumber yang dibaca: `docs/superpowers/reports/task-03-report.md`, rencana Task 3 di `docs/superpowers/plans/2026-10-30-cekdulu-mvp.md`, `docs/contracts.md` (bagian EvidenceBundle dan Kontrak Kegagalan), `src/lib/evidence/{validate.ts,extract.ts,bundle.ts,bundle.test.ts}`, `package.json`.

## Perintah yang dijalankan ulang oleh verifier (hasil aktual)

### 1. `npm test`

Hasil aktual (verifier, fresh run):

```text
> cekdulu@0.1.0 test
> vitest run
RUN v5.0.5
 ✓ src/lib/contracts/schemas.test.ts (6 tests) 10ms
 ✓ src/lib/meta/client.test.ts (6 tests) 118ms
[evidence-test] real-media probe duration_sec=2 video=C:\Users\Danu\AppData\Local\Temp\cekdulu-evidence-test-25896-1793349898891\video.mp4
[evidence-test] real-media audio=C:\Users\Danu\AppData\Local\Temp\cekdulu-evidence-test-25896-1793349898891\audio.wav
[evidence-test] real-media keyframes=C:\Users\Danu\AppData\Local\Temp\cekdulu-evidence-test-25896-1793349898891\keyframe_0001.jpg
 ✓ src/lib/evidence/bundle.test.ts (14 tests) 840ms
 Test Files  3 passed (3)
      Tests  26 passed (26)
```

Sesuai harapan: 26/26 (schemas 6 + meta client 6 + evidence 14). Suite sebelumnya tetap hijau.

### 2. `npm run typecheck`

Hasil aktual:

```text
> cekdulu@0.1.0 typecheck
> tsc --noEmit
EXIT:0
```

Exit 0, tanpa error.

## Hasil per item

| # | Item | Hasil | Bukti |
|---|---|---|---|
| 1 | `validateDuration(181)` → `too_long`; `(180)` lolos; `<=0`/NaN/Infinity → `unreadable` | PASS | `validate.ts:17-24`: `!Number.isFinite \|\| <=0` → `unreadable`, `>180` → `too_long`. Uji `bundle.test.ts:162-197` mencakup 181/180/0/-1/NaN/Infinity, lulus dalam run di atas. |
| 2 | Probe ffprobe timeout 30 detik → `unreadable` | PASS | `validate.ts:49` `PROBE_TIMEOUT_MS = 30_000`; timer `kill()` + `fail(...)` bertipe `EvidenceError("unreadable")` (`validate.ts:74-81`). Kegagalan spawn, exit non-nol, JSON tidak valid, dan durasi tidak ditemukan semuanya memetakan ke `unreadable` (`validate.ts:89-116`). |
| 3 | Binary absen → error bertipe, tanpa throw tak tertangani | PASS | ffmpeg absen → `extract_failed` (`extract.ts:44-46,66-75`), ffprobe absen → `unreadable` (`validate.ts:89-92`). Diuji via env override `FFMPEG_PATH`/`FFPROBE_PATH` bogus (`bundle.test.ts:338-363`), lulus; tidak ada crash. |
| 4 | Tiga cabang Tahap 1 konkuren; cabang menolak → bentuk kosong; bundle tidak pernah gugur karena itu | PASS | `bundle.ts:126-142` membuat tiga promise lalu `Promise.allSettled`; status `rejected` → `[]` untuk transcript/scenes/keyframes. Uji per-cabang (`bundle.test.ts:248-278`) memverifikasi masing-masing cabang kosong sementara cabang lain utuh. Ekstraksi (Tahap 0) memakai `Promise.all` terpisah (`bundle.ts:116-119`) — penolakan di sana adalah `extract_failed` bertipe, bukan jalur Tahap 1, sesuai kontrak kegagalan. |
| 5 | SAM `localizeKeyframe` hanya untuk kind yang dapat dilokalisasi | PASS | `bundle.ts:32-40,86-108`: `LOCALIZABLE_KINDS` berisi 7 kind, mengecualikan `other`; kind lain dikembalikan apa adanya. Uji call-log (`bundle.test.ts:280-299`) membuktikan konsep yang dipanggil tepat `[license_plate, logo, watermark]` dan `other` tidak pernah dipanggil. SAM menolak → temuan asli dipertahankan (`bundle.ts:102-104`, uji `bundle.test.ts:301-311`). |
| 6 | Bundle final di-parse skema | PASS | `bundle.ts:151-160` mengembalikan `EvidenceBundleSchema.parse({...})`; skema di `src/lib/contracts/schemas.ts:129-139` cocok dengan tabel EvidenceBundle di kontrak. |
| 7 | `getDemoEvidenceBundle()` tanpa ffmpeg/Meta/jaringan | PASS (dari kode) | `bundle.ts:46-48` hanya `EvidenceBundleSchema.parse(clone(mockEvidenceBundle))`. Tidak ada parameter Meta, tidak ada impor/panggilan `extract*`/`probe*`/`spawn`/`fetch` di jalur itu. Uji `bundle.test.ts:203-227` membuktikan parse + timestamp + deterministik dua panggilan. |
| 8 | `bundle.test.ts` menguji perilaku nyata (fake MetaClient objek polos, call-log) | PASS | Fake adalah objek literal yang mengimplementasikan `MetaClient` (`bundle.test.ts:50-85`) dengan `callLog`/`localizeCalls`. Asersi SAM via `localizeCalls` (butir 5) dan asersi tanpa panggilan Meta pada file hilang via `callLog === []` (`bundle.test.ts:313-323`, sekaligus membuktikan penolakan `unreadable` terjadi sebelum Meta dipanggil). |
| 9 | Uji real-media ada dan benar-benar jalan (bukan skip diam-diam) | PASS | Uji `bundle.test.ts:370-391` jalan pada run verifier: log teramati `duration_sec=2`, `audio=.../audio.wav`, `keyframes=.../keyframe_0001.jpg` (1 frame). Jalur skip eksplisit dengan alasan juga ada (`bundle.test.ts:145-148,372-373`) bila binary tidak tersedia. |
| 10 | `package.json` hanya berubah oleh dua dependensi terotorisasi | PASS (audit isi) | Isi saat ini: `ffmpeg-static ^5.3.0` dan `ffprobe-static ^3.1.0` di `dependencies`, sisanya (next/react/zod, scripts, devDependencies) tidak berubah bentuk. `package-lock.json` memuat kedua entri. Catatan: workspace tanpa repository git (`git status` → `fatal: not a git repository`), jadi diff historis tidak dapat dibuktikan; audit isi dan cap waktu konsisten dengan klaim laporan. |
| 11 | `src/lib/contracts` dan `src/lib/meta` tidak tersentuh | PASS (spot-check) | Nama ekspor teramati utuh: schemas mengekspor `EvidenceBundle`, `KeyframeFinding`, `TranscriptSegment`, `SceneSegment`, `Finding`, `AgentResult`, `FinalReport`, `RuleFile`, `DISCLAIMER`, `KEYFRAME_KINDS`, dll.; meta mengekspor `MetaClient`, `createMetaClient`, `MetaError`, `loadMetaConfig`, `DEFAULT_TIMEOUTS`. Cap waktu contracts/meta (14:58–15:31) mendahului berkas evidence (15:42–15:43). |
| 12 | Pemindaian larangan di `src/lib/evidence` | PASS | Pencarian `YOLO\|Whisper\|OpenAI\|Google Vision\|real-time\|realtime\|pasti bebas\|pasti melanggar\|aman secara hukum\|META_API_KEY\|sk-…` pada `src/lib/evidence/*.ts`: nol temuan. Tidak ada model non-Meta, klaim real-time, bahasa kepastian copyright/hukum, atau kunci API. |

## Temuan (bernomor, per tingkat keparahan)

### Kritis
Tidak ada.

### Mayor
Tidak ada.

### Minor

1. **Pemetaan `thumbnail_finding` adalah heuristik, bukan pelanggaran kontrak beku.** `bundle.ts:144-147` mengambil `description` temuan terakhir dari panggilan gabungan `understandImages` (keyframe + thumbnail) sebagai `thumbnail_finding` bila thumbnail ada. Teks beku kontrak (`docs/contracts.md` EvidenceBundle) hanya mendefinisikan bidang itu sebagai "Deskripsi dan teks terbaca pada thumbnail" dan tidak membekukan pemetaan per-gambar dari respons Meta — bentuk `understandImages(imagePaths) → KeyframeFinding[]` memang tidak membawa penanda gambar asal. Karena itu penyimpangan ini **tidak melanggar teks kontrak beku** dan status Lead "perlu-verifikasi untuk API nyata" tepat. Risiko nyata: bila cabang gambar hanya mengembalikan temuan keyframe, deskripsi keyframe dapat salah teratribusi ke thumbnail. Wajib diverifikasi ulang saat bentuk respons Image Understanding Meta nyata dikonfirmasi; tidak menghalangi PASS untuk mock saat ini.
2. **`LOCALIZABLE_KINDS` lebih luas dari yang diuji.** Kode melokalisasi 7 dari 8 kind (semua kecuali `other`, `bundle.ts:32-40`), sedangkan uji hanya mematok `logo`/`license_plate`/`watermark`. Rencana Task 3 tidak menghitung kind yang dapat dilokalisasi dan kontrak tidak membekukannya, jadi ini bukan pelanggaran; dicatat agar Lead sadar `document`/`child`/`sensitive_object`/`third_party_clip` juga memicu SAM.
3. **`extractAudio` mengembalikan `null` untuk hampir semua exit non-nol ffmpeg** (`extract.ts:97-117`), tidak hanya untuk video tanpa stream audio. File dengan kontainer valid tetapi audio rusak dapat terbaca sebagai "senyap" (transkrip kosong) alih-alih `extract_failed`. Probe durasi tetap menjaga jalur `unreadable`, dan binary absen tetap `extract_failed`, jadi kontrak kegagalan inti terpenuhi; ini catatan ketahanan, bukan kegagalan.
4. **Keterbatasan bukti diff.** Tanpa repository git, butir 10–11 dibuktikan lewat audit isi + cap waktu, bukan `git diff`. Konsisten dengan laporan Task 1–2; bukan kesalahan worker.

## Kesimpulan

PASS. Semua perintah uji yang diklaim worker berhasil direproduksi persis oleh verifier (`npm test` 26/26 termasuk bukti real-media yang benar-benar jalan; `npm run typecheck` exit 0), seluruh perilaku kontrak T-102 terverifikasi dari kode dan call-log, dan tidak ditemukan larangan maupun perubahan di luar wilayah. Temuan Minor 1 adalah satu-satunya hal yang wajib dibawa Lead ke verifikasi API nyata.
