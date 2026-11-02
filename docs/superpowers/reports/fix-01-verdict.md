# Putusan Verifikasi FIX-1 — Ekstraksi keyframe pada video pendek

Task: FIX-1 (verifikasi independen, konteks baru; verifier tidak menulis perbaikan ini)
Putusan: **PASS**

## Bukti perintah yang dijalankan ulang oleh verifier

| Perintah | Hasil aktual verifier |
|---|---|
| `npm test` | exit 0 — `Test Files 14 passed (14)`, `Tests 187 passed (187)`; log `[evidence-test] FIX-1 keyframes 1 detik=.../keyframe_0001.jpg` teramati |
| `npm run typecheck` | exit 0, tanpa output error (`tsc --noEmit`) |
| `npx vitest run src/lib/evidence/bundle.test.ts` | exit 0 — 16 passed; kedua tes FIX-1 jalan (tidak skip) |
| `npm run build` | exit 0 — 6/6 halaman statis, route `/api/analyze` dan `/api/jobs/[id]` terdaftar |

## Pemeriksaan tes regresi FIX-1 (bukan tautologi)

Di `src/lib/evidence/bundle.test.ts` describe `FIX-1 regression: video 1 detik` (mulai baris 398):

1. `extractKeyframes pada video 1 detik menghasilkan minimal 1 keyframe` (baris 450): memanggil `extractKeyframes` nyata pada mp4 1 detik yang dibuat ffmpeg ter-resolve, lalu `expect(frames.length).toBeGreaterThanOrEqual(1)` dan `expect(existsSync(f)).toBe(true)` untuk setiap berkas. Nyata: akan gagal pada perilaku lama (0 frame).
2. `buildEvidenceBundle ... understandImages menerima keyframe` (baris 458): parse skema `EvidenceBundle`, durasi 0,5–1,6 detik, dan `expect(understandImagesArgs[0]?.length ?? 0).toBeGreaterThanOrEqual(1)`. Terverifikasi di `src/lib/evidence/bundle.ts:121-129`: `understandImages` dipanggil tepat satu kali dengan `imagePaths = [...keyframePaths]` (thumbnail `null` pada tes), jadi asersi ini benar-benar mengukur path keyframe yang diteruskan, bukan panggilan lain.

Klaim RED pekerja (2 failed sebelum fix) tidak dijalankan ulang karena workspace bukan repo git sehingga kode lama tidak dapat dipulihkan dengan aman; klaim itu konsisten dengan log reproduksi di laporan dan dengan semantik asersi di atas. Status GREEN diverifikasi penuh oleh verifier.

## Pemeriksaan wilayah diff `src/lib/evidence/extract.ts`

- Interval kontrak tidak berubah: sampling tetap `fps=1/3` (baris 134).
- Fallback hanya saat sampling menghasilkan nol frame: blok fallback dijaga `if (sampled.length === 0)` (baris 142), menjalankan `-frames:v 1` ke `keyframe_0001.jpg` (baris 146-150). Sampling yang sukses dikembalikan langsung hanya bila `code === 0 && sampled.length > 0` (baris 138). Fallback juga terpicu bila exit non-nol tanpa frame — perilaku ini diungkap laporan dan tetap memenuhi syarat "hanya saat nol frame".
- Semantik `extract_failed` utuh: binary absen tetap ditolak `runBinary` sebagai `EvidenceError("extract_failed", ...)` pada ENOENT (baris 70-74) dan tidak ditangkap `extractKeyframes`; tetap nol frame berakhir `throw new EvidenceError("extract_failed", "Ekstraksi keyframe gagal.")` (baris 159). Tes lama `binary ffmpeg yang absen memetakan ke EvidenceError extract_failed` (baris 338-352, mencakup `extractAudio` dan `extractKeyframes`) masih ada dan lulus dalam 16 tes.
- Pindai larangan pada kedua file yang berubah (model non-Meta, klaim real-time, bahasa kepastian, kunci API): tanpa temuan.

## Bukti ujung-ke-ujung independen (verifier)

- Video uji dibuat dengan binary repo `node_modules/ffmpeg-static/ffmpeg.exe`: `testsrc=duration=1` + `sine`, terverifikasi ffprobe durasi `1.000000`, ukuran 17232 byte.
- `npm start -- -p 3107` dengan `META_MOCK=1`: `GET /` → 200, server Ready.
- `POST /api/analyze` (multipart, field `video`) → `{"job_id":"d6200758-c74a-4b61-825b-b8f50a58b3d5"}`.
- Terminal pada poll ke-2 (<90 detik): `error: null`; `progress` keenam agen `state: "done"` (youtube, tiktok, facebook, copyright, legal_id, packaging_privacy); `report` terisi: `platforms[3]` (youtube/tiktok/facebook, `safety_score` 100, status `aman`), `copyright.risk_level "rendah"`, `legal_id.risk_level "rendah"` dengan disclaimer skrining, `rules_version "2026-10-30.1"`, `agent_statuses` keenam agen `"selesai"`.
- Server dimatikan (pohon proses PID 25424), terverifikasi 0 listener di port 3107 dan port tidak terjangkau.

## Wilayah perubahan

Workspace bukan repo git (`fatal: not a git repository`), jadi pemeriksaan wilayah memakai cap waktu berkas: satu-satunya penulisan di `src/` pada jendela FIX-1 (≥16:52) adalah `bundle.test.ts` 16:54:44 dan `extract.ts` 16:55:11, disusul laporan 16:59:28. `bundle.ts` dan `validate.ts` tak tersentuh (15:43), `docs/contracts.md` tak tersentuh (14:50:59). Berkas repro sementara (`*repro*`, `__fix1*`) tidak ditemukan — sudah absen seperti diklaim.

## Temuan per tingkat keparahan

- Kritis: tidak ada.
- Mayor: tidak ada.
- Minor: tidak ada.
- Info: klaim RED pekerja diterima dari laporan + konsistensi kode, bukan dari menjalankan ulang kode lama (tidak ada VCS untuk memulihkan versi lama dengan aman). Ini tidak mengubah putusan karena perilaku GREEN dan jalur fallback terverifikasi langsung.
