# Putusan Verifier — Task 13 (T-302 Orkestrasi Paralel Ujung ke Ujung)

Verifier: Muse Wonder 1.0, konteks baru, tidak mengerjakan task ini. Tanggal verifikasi: 2026-10-30.
Laporan worker yang diperiksa: `docs/superpowers/reports/task-13-report.md` (diperlakukan sebagai klaim belum terverifikasi).
Acuan: rencana Task 13 di `docs/superpowers/plans/2026-10-30-cekdulu-mvp.md`, `docs/contracts.md` bagian Kontrak Kegagalan dan Batas Waktu dan Percobaan Ulang, `TASKS.md` T-302.

## Putusan: PASS

Tidak ada temuan Critical, High, atau Medium. Perilaku yang dikontrakkan terpenuhi pada kode produksi dan dibuktikan ulang lewat eksekusi. Tiga catatan Low/Info di bagian akhir tidak menggagalkan kontrak dan tidak mengharuskan pengerjaan ulang sebelum Done; dicatat agar Lead tahu batas cakupan uji.

## Perintah yang dijalankan ulang dan hasilnya

| Perintah | Hasil teramati (verifier) |
|---|---|
| `npm test` (suite penuh) | Exit 0. `Test Files 13 passed (13)`, `Tests 180 passed (180)`. Sesuai klaim laporan (180/180). |
| `npm test -- src/lib/jobs/analyze.test.ts` | Exit 0. `Test Files 1 passed (1)`, `Tests 13 passed (13)`, durasi file 1310ms. |
| `npm run typecheck` | Exit 0, `tsc --noEmit` tanpa error. |
| `npm run build` | Exit 0. Next.js 15.5.28 compiled successfully; rute dinamis `ƒ /api/analyze` dan `ƒ /api/jobs/[id]` terdaftar. |

Catatan keluaran: `npm test` mencetak peringatan Vite tentang `configLoader: 'native'` dan `vitest.config.ts`. Peringatan itu muncul sebelum RUN, tidak mengubah exit code, dan berada di luar wilayah Task 13. Bukan kegagalan task ini.

### Bukti waktu (timing) dari keluaran uji yang dijalankan verifier

Dua jalur independen (suite penuh dan run terarah) konsisten:

- Suite penuh: `[analyze-test] slowest=300ms sum=810ms elapsed=312ms` dan `[analyze-test] timeout-case elapsed=139ms calls.legal_id=2`.
- Run terarah: `[analyze-test] slowest=300ms sum=810ms elapsed=313ms` dan `[analyze-test] timeout-case elapsed=139ms calls.legal_id=2`.
- Rincian per uji terarah: (a) 308ms, (b) 312ms, (e) 314ms.

Laporan worker mencatat elapsed 302ms pada run terakhirnya. Selisih 302 vs 312/313ms adalah variansi mesin biasa, bukan rekayasa: kedua run verifier mereproduksi pola yang sama (elapsed jauh di bawah jumlah 810ms, tepat di sekitar slowest 300ms, timeout-case 139ms untuk 2x50ms + retryDelay 5ms). Klaim waktu laporan terkorroborasi.

## Hasil per item pemeriksaan

1. **Enam agen benar-benar konkuren — LOLOS.** Di `src/lib/jobs/analyze.ts`, orkestrasi membangun `promises` lewat `ALL_AGENTS.map(async ...)` lalu `await Promise.allSettled(promises)`. Tidak ada `for...await` antar agen dan tidak ada await sekuensial yang menserialkan agen; satu-satunya loop await adalah loop retry per agen yang memang harus sekuensial. Setiap callback map memanggil runner secara sinkron sampai await pertamanya, sehingga keenam runner mulai pada tick yang sama. Uji (a) membuktikan ini secara perilaku, bukan asumsi kode: log `start`/`end` bertimestamp `Date.now()` menegaskan `lastStartAt <= firstEndAt` dengan delay berjenjang 10-300ms. Pada eksekusi sekuensial, start kedua saja sudah mendahului end pertama dan uji ini gagal. Uji (e) menguatkan dari sisi jam dinding: elapsed 312/313ms < 2x slowest (600ms) dan << sum (810ms), dengan batas bawah `elapsed >= slowest - 30` yang mencegah agen tercepat dipalsukan selesai instan.

2. **Timeout 60 detik bawaan + tepat satu retry — LOLOS.** `DEFAULT_AGENT_TIMEOUT_MS = 60_000` dan `DEFAULT_RETRY_DELAY_MS = 2_000` sejajar tabel kontrak (Tahap 2: 60 detik, 1 kali, backoff 2 detik). `runAgentWithRetry` berputar `attempt < 2`, yaitu percobaan awal + tepat satu retry, dibungkus `withTimeout` per percobaan. Uji (c): runner pelempar dipanggil tepat 2 kali, runner sehat tepat 1 kali. Uji (d): runner menggantung dengan `agentTimeoutMs: 50, retryDelayMs: 5` dipanggil tepat 2 kali dan elapsed 139ms konsisten dengan 50+5+50ms plus overhead terjadwal. Tidak ada retry kedua yang tersembunyi.

3. **Pemetaan timeout vs gagal berbentuk AgentResult — LOLOS.** Timeout berakhir `status: "batas_waktu"`, lemparan dan keluaran tak valid berakhir `status: "gagal"`, keduanya dengan `risk_level: "rendah"`, `findings: []`, dan `error` berupa pesan string. Jalur cadangan sesudah `Promise.allSettled` memakai bentuk yang sama bila ada penolakan tak terduga. Keluaran runner selalu divalidasi `AgentResultSchema.safeParse`; skema tak cocok dilempar lalu berakhir `gagal` sesudah retry, sesuai kontrak gelombang 2 bahwa keluaran tak lolos skema menjadi `gagal`, bukan temuan yang diteruskan.

4. **`analyzeReview` hanya menolak pada kegagalan tahap bukti — LOLOS dengan catatan Info.** Agen yang melempar, menggantung, atau mengembalikan skema buruk tidak pernah menolak `analyzeReview`; laporan final tetap kembali dan lolos `FinalReport.parse` pada uji (c), (d), (f). Satu-satunya penolakan yang teruji adalah `EvidenceError` dari `buildEvidenceBundle`: uji meneruskan `code: "too_long"` sebagai instance `EvidenceError` dan menegaskan nol agen dimulai (`events` kosong, semua `calls` 0). Lihat catatan Info F-3 untuk batas persisnya.

5. **`onProgress`: queued, running, lalu terminal per penyelesaian, parsial sebelum terlambat — LOLOS.** Snapshot awal memancarkan enam `queued` sebelum map dimulai. Setiap agen bertransisi `running` saat dimulai dan ke keadaan terminal saat selesai, dengan `emit()` pada setiap transisi. Pemetaan persis kontrak progres: `selesai->done`, `gagal->failed`, `batas_waktu->timeout`, diterapkan sama di progres dan di `agent_statuses` laporan (uji f memeriksa keduanya, termasuk kombinasi 4 selesai + 1 gagal + 1 batas_waktu). Uji (b) menemukan snapshot nyata di mana youtube (10ms) sudah `done` sementara packaging_privacy (300ms) masih `running`, dan menegaskan setiap agen pernah terlihat `running`. Artinya hasil parsial permukaan sebelum agen paling lambat selesai, sesuai Kontrak Kegagalan.

6. **Jalur produksi memakai bukti nyata, enam runner nyata, dan `reason` terikat MetaClient yang diteruskan — LOLOS.** `analyze.ts` mengimpor `buildEvidenceBundle` nyata, keenam `run*Agent` nyata (youtube, tiktok, facebook, copyright, legal_id, packaging_privacy; semua ekspor terverifikasi ada), dan `mergeReports` nyata. Di dalam retry, `reason` dibuat sebagai `(systemPrompt, userPayload) => meta.reasonJson(systemPrompt, userPayload)` dari parameter `meta` yang diteruskan pemanggil, bukan klien global. Pemindaian teks pada keempat file produksi (`store.ts`, `analyze.ts`, kedua route) menemukan nol kemunculan `vi.mock`, `forceMock`, `useFakeTimers`, atau pola mock lain. Satu-satunya `vi.mock` di seluruh cakupan berada di `analyze.test.ts` dan hanya mengganti `../evidence/bundle` demi mengisolasi waktu agen dari ffprobe/ffmpeg; MetaClient pada uji orkestrasi tetap client mock mode dan runner bawaan diuji terpisah tanpa mock modul agen. Keterbukaan ini sama dengan penyimpangan (2) yang dicatat worker dan dapat diterima: mock tinggal di file uji, tidak bocor ke produksi.

7. **Aturan dari `data/rules`, irisan kemasan dari dua kategori, versi ke `mergeReports` — LOLOS.** `loadAllRules` membaca kelima berkas (`youtube.json`, `tiktok.json`, `facebook.json`, `copyright.json`, `legal_id.json`) secara `Promise.all` dan memvalidasi tiap berkas dengan `RuleFile.parse`. Irisan `packaging_privacy` dirakit dari entri berkategori `privasi_data_pribadi` dan `spam_clickbait_reupload` milik ketiga berkas platform, dengan `version`/`updated_at`/`source` dari berkas youtube. Verifier memeriksa data nyata: kelima berkas berversi `2026-10-30.1`, dan tiap berkas platform memuat tepat satu aturan untuk masing-masing dari dua kategori itu, sehingga irisan kemasan berisi enam aturan. Penggabungan dipanggil sebagai `mergeReports(results, rules.youtube.version)`, dan uji runner bawaan menegaskan `report.rules_version === "2026-10-30.1"`. Tidak ada skor yang dihitung di orkestrasi; satu-satunya matematika skor (100, kurang 30/15/5, ambang 80/50) tinggal di `src/lib/merge/score.ts` milik A5.

8. **Store: UUID, kloning snapshot, GET 404 — LOLOS.** `createJob` memakai `crypto.randomUUID()`; uji menegaskan format UUID dan dua id berurutan berbeda, dengan snapshot awal enam `queued`, `report: null`, `error: null`. `getJob` mengembalikan klon (progres disalin per objek, report disalin dalam lewat JSON) dan `updateJob` mengklon patch yang masuk, mengembalikan `null`/no-op tanpa lemparan untuk id tak dikenal. `GET /api/jobs/[id]` menerjemahkan `null` menjadi 404 JSON `{error}` dan snapshot menjadi 200. Uji route langsung menegaskan GET tak dikenal 404 dan POST sukses berlanjut ke GET 200 berlaporan valid. Catatan cakupan ada di F-1.

9. **POST: guard 400/413, tmpdir, tanpa await, Meta dari env — LOLOS.** `POST /api/analyze` menolak video hilang atau kosong dengan 400 `{error}` sebelum penulisan berkas apa pun, dan menolak video maupun thumbnail di atas `200 * 1024 * 1024` byte dengan 413, keduanya sebelum probing karena `analyzeReview` belum dipanggil pada titik itu. Unggahan ditulis ke `join(tmpdir(), "cekdulu", jobId)` dengan nama berkas yang dibersihkan lewat `basename` plus sanitasi karakter, sehingga nama asli tidak dapat keluar dari direktori job. Analisis dimulai dengan `void analyzeReview(...).then(...).catch(...)` tanpa `await` (verifier menegaskan `void analyzeReview` ada dan `await analyzeReview` tidak ada), lalu handler segera mengembalikan 202 `{job_id}`; penyelesaian asinkron menulis `report` atau `error` ke store untuk polling. Klien Meta dibuat dengan `createMetaClient()` tanpa argumen, yang membaca `META_MOCK`, `META_API_KEY`, dan `META_BASE_URL` dari environment lewat `loadMetaConfig`; kegagalan konfigurasi sebelum job dimulai menjadi 500 JSON, sedangkan `EvidenceError` sesudah start tersimpan sebagai error job. Uji langsung tanpa server menegaskan POST tanpa video 400 dan alur POST `META_MOCK=1` 202 yang terpolling sampai `FinalReport` valid.

10. **Uji konkurensi/waktu menegaskan perilaku nyata, bukan timer palsu yang menyembunyikan urutan — LOLOS.** File uji tidak mengandung `useFakeTimers`, `advanceTimers`, atau mekanisme timer virtual apa pun. Semua penundaan adalah `setTimeout` nyata, semua stempel waktu `Date.now()` nyata, dan ketiga bukti (urutan start/end, snapshot parsial, batas elapsed dua arah) akan gagal pada implementasi sekuensial atau pada agen yang dipalsukan selesai seketika. Batas elapsed bersifat dua sisi: langit-langit `< 2x slowest` menolak serialisasi, lantai `>= slowest - 30` menolak penyelesaian instan palsu. Kasus timeout memakai janji yang benar-benar tidak pernah selesai, sehingga hanya pembungkus timeout nyata yang dapat mengakhiri agen itu.

11. **Pemindaian larangan pada `src/lib/jobs` dan `src/app/api` — BERSIH.** Pemindaian case-insensitive pada keempat file produksi untuk nama model non-Meta (`YOLO`, `Whisper`, `OpenAI`, `Google Vision`, `ElevenLabs`), klaim `real-time`/`realtime`, kepastian terlarang (`pasti bebas`, `pasti melanggar`, `aman secara hukum`), pola kunci (`META_API_KEY=`, `Bearer`, awalan `sk-`), serta duplikasi skor (`computePlatformScore`, `safety_score`, pengurang 30/15/5) menghasilkan nol temuan di setiap kelas. Tidak ada kunci API asli di wilayah ini. Skor tetap eksklusif milik A5.

12. **Wilayah file — SESUAI (dengan keterbatasan bukti).** Kelima file yang dijanjikan rencana ada dan hanya wilayah itu yang relevan: `src/lib/jobs/store.ts`, `src/lib/jobs/analyze.ts`, `src/lib/jobs/analyze.test.ts`, `src/app/api/analyze/route.ts`, `src/app/api/jobs/[id]/route.ts`. Workspace ini bukan repositori git (`git status` menjawab `fatal: not a git repository`), sehingga verifier tidak dapat membuktikan lewat diff bahwa task lain tidak menyentuh file di luar wilayah. Kesesuaian wilayah dinilai dari inventaris file, isi kode, dan laporan worker; tidak ditemukan kode Task 13 yang menyusup ke kontrak, Meta, evidence, agents, merge, rules, atau komponen UI. Keterbatasan ini dicatat apa adanya, bukan dianggap bukti diff.

## Temuan menurut tingkat keparahan

### Critical

Tidak ada.

### High

Tidak ada.

### Medium

Tidak ada.

### Low

- **F-1 (Low, cakupan uji): guard 413 dan isolasi mutasi store terimplementasi tetapi belum teruji.** Kode route menolak berkas di atas 200MB dengan 413 untuk video dan thumbnail, dan store mengklon snapshot pada baca maupun tulis. Namun `analyze.test.ts` hanya menguji POST 400, GET 404, dan POST 202; tidak ada uji berkas raksasa yang membuktikan 413, dan tidak ada uji yang memutasi snapshot hasil `getJob` lalu menegaskan store tidak ikut berubah. Perilakunya benar saat dibaca, jadi ini bukan kegagalan kontrak. Risikonya regresi senyap bila guard atau kloning diubah kelak. Perbaikan tersarankan tanpa menghalangi Done: tambah satu uji 413 dengan `File` besar yang disimulasikan lewat stub ukuran, dan satu uji mutasi snapshot.

- **F-2 (Low, kejelasan lapisan retry): runner nyata yang mengembalikan `gagal` bersifat terminal di orkestrasi.** Keenam agen A4 mengubah lemparan `reason` dan keluaran tak valid menjadi `AgentResult` berstatus `gagal` yang dikembalikan, bukan dilempar. Pembungkus orkestrasi hanya mengulang pada lemparan, timeout, atau kegagalan skema `AgentResult`; hasil `gagal` yang dikembalikan diterima apa adanya tanpa pemanggilan runner kedua. Untuk kegagalan panggilan reasoning, percobaan ulang yang dikontrakkan tetap terjadi satu tingkat di bawah, di dalam `MetaClient` (`requestJson` mencoba dua kali dengan backoff), sehingga total percobaan reasoning tetap dua. Untuk keluaran model tak valid, tidak ada percobaan ulang di lapisan mana pun, yang konsisten dengan bunyi kontrak bahwa retry berlaku bagi panggilan yang gagal/timeout, bukan bagi payload buruk dari panggilan yang berhasil. Uji (c) membuktikan retry orkestrasi lewat runner pelempar sesuai definisi pemeriksaan task ini. Dicatat agar Lead tidak salah membaca angka panggilan runner pada jalur nyata: `calls === 1` dengan status `gagal` di produksi adalah perilaku yang diharapkan, bukan retry yang hilang.

### Info

- **F-3 (Info): permukaan penolakan `analyzeReview` mencakup kegagalan muat aturan sebelum agen mulai.** Sesudah paket bukti berhasil, `loadAllRules()` yang gagal (berkas hilang atau tak lolos `RuleFile`) juga menolak `analyzeReview` dengan error non-`EvidenceError`. Penolakan ini terjadi sebelum agen mana pun dimulai dan diterjemahkan route menjadi error job yang dapat dipolling, sama seperti `EvidenceError`. Tahap agen sendiri tidak pernah menolak. Menelan kegagalan aturan menjadi laporan akan lebih buruk karena laporan wajib membawa `rules_version` yang sah, jadi penolakan adalah pilihan yang benar. Tidak ada tindakan yang dibutuhkan; dicatat hanya untuk meluruskan frasa "hanya menolak pada EvidenceError" agar dibaca sebagai "tidak pernah menolak karena satu agen".

- **F-4 (Info): orkestrasi menulis ulang bidang `agent` bila runner mengembalikan nama agen yang salah.** Sesudah parse berhasil, ketidakcocokan `parsed.data.agent !== agent` diperbaiki dengan menyebar hasil dan memaksa nama yang benar, bukan menggagalkan agen. Ini menjaga integritas pengelompokan di `mergeReports` tetapi dapat menutupi bug pelabelan di runner masa depan. Keenam runner nyata selalu mengembalikan nama yang benar, jadi tidak ada dampak saat ini. Lead dapat mempertimbangkan untuk mengubahnya menjadi `gagal` pada task pengerasan kelak; bukan syarat Done task ini.

## Kesimpulan verifier

Klaim laporan worker terkorroborasi pada semua poin yang dapat dieksekusi: 180/180 uji, typecheck bersih, build sukses dengan kedua rute terdaftar, dan bukti waktu direproduksi dua kali oleh verifier (elapsed 312/313ms melawan slowest 300ms dan sum 810ms; timeout-case 139ms dengan tepat dua panggilan). Pembacaan kritis mengonfirmasi konkurensi sejati lewat `Promise.allSettled` atas janji yang sudah dimulai, timeout 60 detik dengan tepat satu retry, pemetaan status tiga arah yang konsisten antara progres dan laporan, jalur produksi tanpa mock, irisan aturan kemasan enam entri dari dua kategori lintas tiga platform, store UUID berklon, dan guard route 400/413 dengan start tanpa await. Temuan F-1 sampai F-4 bersifat Low/Info dan tidak ada yang melanggar kontrak beku, larangan lomba, atau batas wilayah. Task 13 (T-302) dinyatakan **PASS** dan siap dipindahkan Lead ke Done.
