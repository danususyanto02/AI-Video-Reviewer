# Putusan Verifier — Task 14 (T-303 UI tersambung)

Putusan: **PASS** (cakupan UI Task 14)

Verifier: Muse Wonder 1.0, konteks baru, tidak mengerjakan task ini. Verifikasi hanya membaca dan menjalankan ulang; tidak ada berkas produk yang diubah oleh verifier.

## Pernyataan eksplisit

Penyelesaian unggahan nyata ujung ke ujung (upload → laporan final dari server nyata) **TIDAK terbukti oleh task ini** dan tidak diklaim lulus di sini. Yang terbukti adalah cakupan UI: submit, navigasi, polling, render progres verbatim, render laporan dari snapshot, dan permukaan error. Alur server nyata yang teramati pekerja berhenti pada snapshot error ekstraksi keyframe; jalur itu milik wilayah pipeline, bukan kegagalan UI (lihat Temuan F-1).

## Perintah yang dijalankan ulang + hasil

| Perintah | Hasil teramati verifier |
|---|---|
| `npm test` | Test Files 14 passed (14), Tests 185 passed (185); termasuk `src/components/wiring.test.tsx` 5 passed dan `src/components/report.test.tsx` 8 passed |
| `npm run typecheck` | exit 0 (`tsc --noEmit`, tanpa output error) |
| `npm run build` | Sukses; `/report` tercatat `ƒ` (Dynamic), `/api/analyze` dan `/api/jobs/[id]` tetap terdaftar |
| Pemindaian hitung skor frontend + larangan pada `src/app/page.tsx`, `src/app/report/page.tsx`, `src/components/useJobPolling.ts` | Nol aritmetika skor / nol ambang penghasil status; nol klaim terlarang (dua positif palsu grep: kata "Pastikan" dan API uji `useRealTimers`, bukan bahasa kepastian atau klaim real-time) |

Klaim RED awal pekerja (4 gagal, 1 lulus sebelum implementasi) tidak dapat dijalankan ulang tanpa membatalkan implementasi; dicatat sebagai klaim pekerja yang tidak terverifikasi ulang, dan tidak memengaruhi putusan karena GREEN saat ini direproduksi penuh.

## Pemeriksaan kritis (bukti kode)

1. **Bidang FormData cocok dengan yang dibaca route.** Route (`src/app/api/analyze/route.ts`) membaca `form.get("video")`, `form.get("thumbnail")`, `title`, `caption`, dan `extraContext` ‖ `extra_context` ‖ `extra-context`. Halaman upload (`src/app/page.tsx`) membangun `FormData` bersih baru dan mengirim tepat satu nama kanonis `extraContext` (input DOM `extra_context` tidak ikut terkirim), plus `video`, `thumbnail` (hanya bila File tak kosong), `title`, `caption`. Uji wiring menegaskan `body.get("extraContext") !== null`, `video` berupa `File`, dan `title` terkirim.
2. **Navigasi.** Respons 202 `{job_id}` → `router.push("/report?job=<id>")` dengan fallback `window.location.assign`; penolakan 400/413 menampilkan `data.error` server pada `role="alert"` tanpa navigasi dan tanpa crash; tombol nonaktif selama submit.
3. **Tanpa `?job` = nol fetch + mock.** `useJobPolling(null)` keluar lebih awal di `useEffect` sebelum fetch apa pun; cabang tanpa job merender `mockFinalReport` dengan komponen yang sama. Uji menegaskan `fetch` tidak dipanggil dan 3 kartu platform mock tampil. "Muat contoh" tetap tautan polos ke `/report`.
4. **Dengan `?job` = polling ±1000ms, progres verbatim, berhenti yang benar.** Hook fetch segera lalu `setTimeout` 1000ms berantai; berhenti permanen saat `data.report` tiba, saat `snapshot.error` muncul, dan saat respons tidak ok (termasuk 404 `Job tidak ditemukan.`). Progres snapshot diteruskan apa adanya ke `AgentProgressCard` (`progress` prop). Uji timer palsu: snapshot pertama tepat 2 `done` + 4 `running` tanpa kartu platform, setelah 1000ms laporan final tampil, dan setelah +3000ms jumlah fetch tetap 2.
5. **Tidak ada skor frontend; skor tampil verbatim.** Halaman laporan dan hook tidak pernah membaca `safety_score`; tidak ada aritmetika atau perbandingan ambang yang menghasilkan status di ketiga berkas UI. `PlatformCard` merender `report.safety_score` dan `report.status` langsung. Uji skor bertentangan itu nyata: fixture diubah menjadi `safety_score: 99, status: "aman"` di atas temuan berisiko dan uji menegaskan kartu YouTube memuat "99" dan "aman" — klien akan gagal uji ini bila menghitung ulang. Satu-satunya pemetaan status adalah adapter kosakata kontrak `agent_statuses` (`selesai→done`, `batas_waktu→timeout`, `gagal→failed`) untuk kartu progres mock/final, pola yang sudah ada sejak Task 5; bukan penurunan status dari skor.
6. **Error jujur tanpa stack.** `friendlyJobError` hanya mengambil baris pertama, membuang akhiran ` at ...`, menolak jalur berkas/`node_modules`, dan memetakan kode `EvidenceError` nyata (`too_long` → "terlalu panjang … 180 detik", `unreadable` → "tidak terbaca"). Uji memberi error durasi + dua baris `at …(file.ts:…)` dan menegaskan alert memuat "terlalu panjang" + "180", tidak memuat baris stack, dan polling berhenti.
7. **Props komponen Task 5 tidak berubah.** `PlatformCard`/`RiskCard`/`FixChecklist`/`AgentProgressCard` tidak disentuh (panggilan di halaman laporan memakai prop yang sama: `report`, `title/riskLevel/findings`, `items`, `progress`); 8 uji lama `report.test.tsx` tetap lulus. Route API tidak diubah dari Task 13.
8. **Uji wiring menilai perilaku, bukan trivia.** Kelima uji memakai `fetch` termock + timer palsu dan menegaskan hasil yang teramati di DOM (URL/metode/FormData, pesan alert, nol fetch, hitungan kartu per `data-state`, skor verbatim, berhentinya polling), bukan internal hook atau snapshot markup.
9. **Kejujuran UI atas dua temuan luar wilayah.** Snapshot error ekstraksi (`Ekstraksi keyframe gagal.`) lolos pemetaan sebagai pesan Indonesia singkat tanpa stack pada `role="alert"` dan polling berhenti — UI menampilkannya dengan jujur, bukan spinner abadi. Job hilang di server dev dingin menghasilkan 404 yang dipetakan hook menjadi alert `Job tidak ditemukan.` dan polling berhenti — juga jujur.

## Temuan menurut tingkat keparahan

### Mayor — di luar wilayah T-303, dirutekan (bukan kegagalan UI)

- **F-1 (pemilik: A2 Pipeline Bukti; tindak lanjut Lead):** Unggahan nyata valid dengan `META_MOCK=1` berhenti pada snapshot error `Ekstraksi keyframe gagal.` sehingga laporan final nyata tidak pernah teramati ujung ke ujung. Ini memblokir demo nyata penuh dan harus dibuktikan/diperbaiki di wilayah pipeline (Task 15/16 bergantung padanya). Cakupan UI atas error ini lulus (Temuan pemeriksaan 9).

### Minor — di luar wilayah T-303, dirutekan (bukan kegagalan UI)

- **F-2 (pemilik: A1/Lead, infrastruktur dev):** Pada server dev dingin, job yang baru dibuat dapat hilang sebelum GET pertama (store job in-memory per instance modul dev), menghasilkan 404 sesaat; setelah route hangat alur yang sama bekerja. UI menangani 404 ini dengan jujur (alert + berhenti polling). Rekomendasi: latihan demo memakai `npm run build && npm start`, atau pemilik store mencatat batasan dev ini.

### Minor — di dalam cakupan, tidak memblokir

- **F-3:** Tidak ada uji wiring khusus untuk jalur 404 pada `useJobPolling`; perilaku berhenti-saat-404 terverifikasi dari pembacaan kode (cabang `!response.ok` yang sama dengan jalur error teruji) dan dari observasi curl pekerja, bukan dari uji otomatis. Disarankan sebagai uji tambahan murah, bukan syarat PASS.

### Nit

- **F-4:** Uji submit tidak menegaskan bidang `caption`/`thumbnail` terkirim; keduanya terverifikasi dari pembacaan kode halaman upload.

## Batas putusan

PASS ini hanya untuk cakupan UI Task 14 sesuai rencana (submit → navigasi → polling 1000ms → progres verbatim → laporan final berstruktur sama dengan mock → error tanpa stack → contoh tanpa jaringan). Putusan ini **bukan** bukti penyelesaian unggahan nyata ujung ke ujung; itu tetap terbuka lewat F-1 untuk pemilik pipeline dan gerbang demo berikutnya.
