# Laporan Task 16 — Latihan Demo dan Jalur Cadangan (T-402)

Task: T-402
Ringkasan: Laporan tersimpan ditangkap dari jalur nyata produksi (`META_MOCK=1`, POST `platform-copyright-risk.mp4`, polling sampai terminal) ke `data/examples/saved-report.json` dan lolos skema `FinalReport`; naskah demo 150 detik + 20 detik cadangan ditulis mengikuti alur konsep dengan sumber angka mock ditandai eksplisit per langkah. Latihan offline dibuktikan sebatas server lokal + pembacaan kode (nol panggilan API pada jalur contoh dan cabang mock), bukan pemutusan jaringan fisik. Tidak ada kode produk yang diubah.
File diubah: `data/examples/saved-report.json` (baru, tangkapan terminal verbatim), `docs/demo-script.md` (baru), `docs/superpowers/reports/task-16-report.md` (laporan ini). Berkas cek satu kali `data/examples/task16-saved-report.check.test.ts` dibuat hanya untuk verifikasi skema lalu dihapus pada sesi yang sama; bukan artefak tinggal.
Wilayah: hanya `docs/demo-script.md` + `data/examples/saved-report.json` (+ laporan ini), sesuai delegasi. Modul produk hanya dibaca dan dijalankan, tidak diedit.

## Tangkapan laporan tersimpan (Deliverable 1)

- Perintah persiapan persis: `npm run build` (exit 0, 11,98 detik), lalu server produksi `node node_modules/next/dist/bin/next start -p 3106` dengan `META_MOCK=1` (PID 21548, siap dalam 0,78 detik, log `Ready in 493ms`). Port 3106 dipilih karena 3105 sudah terpakai proses lain yang tidak disentuh.
- POST persis: `curl.exe -F video=@data/examples/platform-copyright-risk.mp4 -F title="Konser Hits Terbaru Full Performance" -F caption="Full performance konser kemarin, tonton sampai habis." -F extraContext= http://127.0.0.1:3106/api/analyze` → HTTP 202, `job_id` **`28b58383-5685-4975-bcf6-b4927bdec648`**.
- Polling `GET /api/jobs/<id>` pertama sudah terminal. Bidang kunci laporan terminal yang disimpan verbatim (objek `report`, bukan bungkus `{progress, report, error}`): rekomendasi "Tidak ditemukan risiko menonjol pada skrining ini, sehingga video dapat dipertimbangkan untuk diterbitkan setelah pemeriksaan akhir sebelum mengunggah."; YouTube/TikTok/Facebook masing-masing skor **100**, status **`aman`**, `top_risk` kosong, `findings: []`; copyright `risk_level: rendah`, `segments: []`; hukum `risk_level: rendah`, `themes: []`, disclaimer persis kontrak; `fix_checklist: []`; `rules_version: 2026-10-30.1`; keenam `agent_statuses` **`selesai`**.
- Penulisan berkas: `node -e` mengambil ulang `GET /api/jobs/28b58383-5685-4975-bcf6-b4927bdec648` dari server yang sama dan menulis `j.report` ke `data/examples/saved-report.json` (1.342 byte). Nilai tidak diedit tangan.
- Server dimatikan hanya pada PID terverifikasi milik sesi ini (`Stop-Process -Id 21548` setelah pemeriksaan command line `next start -p 3106`). Konfirmasi akhir: tidak ada listener di 3106 dan `GET http://127.0.0.1:3106/` ditolak koneksi.

## Uji dijalankan

- `npm run build` → exit 0; rute `/`, `/report`, `/api/analyze`, `/api/jobs/[id]` terdaftar.
- POST + polling di atas → job terminal dengan `error: null`; laporan disimpan.
- Verifikasi skema satu kali (perintah persis): `npm test -- data/examples/task16-saved-report.check.test.ts` dengan berkas cek sementara yang mem-parse `data/examples/saved-report.json` memakai `FinalReport` dari `src/lib/contracts/schemas.ts` dan menegaskan 3 platform + 6 status agen → **1 passed** (206 ms). Berkas cek dihapus setelah lulus; perintah ini dapat dibuat ulang persis dari deskripsi ini.
- Pemeriksaan isi: parse Node atas berkas tersimpan → ketiga platform `100:aman`, checklist 0, keenam agen `selesai`; disclaimer sama persis dengan konstanta kontrak; nol kemunculan `pasti bebas`, `pasti melanggar`, `aman secara hukum`, `real-time`, `realtime`.
- Pengukuran waktu presisi (run kedua khusus waktu, tidak menimpa tangkapan): `node -e` dengan `fetch` FormData + polling 200 ms → POST 202 dalam 41 ms (`job_id` `c807b6d6-a048-4b82-b42a-9f7881479372`), polling pertama `queued`×6, polling kedua laporan terminal pada **252 ms** sejak awal POST. Laporan run waktu **deep-equal** dengan berkas tersimpan (`TIMING_RUN_EQUALS_SAVED true`), jadi angka 252 ms berlaku untuk tangkapan yang sama secara deterministik. Catatan kejujuran: tangkapan pertama sendiri hanya terikat longgar (sudah terminal pada polling pertama, ≤ ±5 detik termasuk latensi antar-perintah); angka presisi berasal dari run kedua yang isinya terbukti identik.

## Latihan offline dan waktu terukur (Deliverable 3)

Yang dijalankan dengan server produksi lokal menyala, sebelum server dimatikan:

| Langkah latihan | Perintah / jalur | Hasil terukur |
|---|---|---|
| Build produksi | `npm run build` | exit 0, 11,98 detik |
| Server siap | `next start -p 3106`, `META_MOCK=1` | siap 0,78 detik (`Ready in 493ms`) |
| Halaman awal | `GET /` | 200, 51 ms, 7.447 byte; memuat CekDulu, Analisa, Muat contoh, disclaimer |
| Laporan contoh | `GET /report` | 200, 72 ms, 16.834 byte; memuat skor 55/25/70, rekomendasi contoh, ketiga butir checklist, disclaimer |
| Laporan job | `GET /report?job=28b58383-5685-4975-bcf6-b4927bdec648` | 200, 48 ms (SSR; polling klien tidak teramati lewat curl) |
| Upload sampai terminal | POST + polling 200 ms (run waktu) | 252 ms total; POST sendiri 41 ms |
| Berkas tersimpan | baca `data/examples/saved-report.json` + parse skema | lolos (lihat Uji) |

Bukti nol panggilan API dari kode (dibaca, bukan ditebak):

- `src/lib/meta/client.ts:208` cabang `config.mock` mengembalikan klien contoh; `reasonJson` pada baris 231–233 mengembalikan `{risk_level: "rendah", findings: []}` tanpa jaringan. Satu-satunya pemanggilan `fetchFn` ada di `requestJson` (baris 157) yang hanya dipakai cabang nyata (baris 237+).
- `src/app/report/page.tsx:154-176`: tanpa `job`, halaman merender `mockFinalReport` bawaan. `src/components/useJobPolling.ts:87`: `if (!jobId) return;` sebelum `fetch` apa pun. Jadi klik **Muat contoh** melakukan nol panggilan API dari kode.
- `src/lib/meta/config.ts:42-44`: `META_MOCK=1` mengaktifkan mode mock tanpa kunci.

Apa arti "offline" yang terbukti dan yang tidak:

- **Terbukti:** aplikasi yang sudah ter-build dan berjalan di `localhost` melayani `/` dan `/report` contoh tanpa internet dan tanpa panggilan API Meta, berdasarkan pembacaan kode di atas ditambah muatan halaman lokal yang teramati. Berkas `saved-report.json` terbaca dan lolos skema secara lokal.
- **Tidak terbukti:** jaringan mesin tidak diputus secara fisik (tidak ada mode pesawat / cabut kabel pada sesi ini); klik peramban nyata ujung ke ujung tidak dijalankan (bukti halaman adalah curl/SSR dan fetch Node, bukan DOM peramban); mode Meta nyata dengan kunci tidak diuji; naskah belum diucapkan presenter manusia di depan juri, jadi waktu langkah adalah target naskah dibanding waktu muat terukur, bukan waktu pentas. Klaim offline tidak boleh diperluas melewati daftar terbukti ini.

## Temuan (dilaporkan, tidak diperbaiki — sesuai wilayah task)

1. **QA-16-1 — Upload LIVE-MOCK tidak dapat menunjukkan tiga nasib berbeda.** Reasoning mock mengembalikan nol temuan untuk setiap agen, sehingga upload nyata mode mock selalu berakhir 100 `aman` bertiga dengan checklist kosong, apa pun videonya. Cerita demo "satu video, tiga nasib berbeda" hanya tersedia dari laporan contoh bawaan (CONTOH-MOCK 55/25/70). Naskah menandai pemisahan ini eksplisit agar presenter tidak mengklaim angka contoh sebagai hasil upload. Pemilik keputusan bila mock ingin lebih demonstratif: A1 (klien mock) / Lead. Ini keterbatasan data mock, bukan kegagalan pipeline: ekstraksi, enam agen, dan penggabung deterministik semua berjalan dan laporan lolos skema.
2. **QA-16-2 — `saved-report.json` belum dimuat antarmuka.** Pencarian repo: nol rujukan ke `saved-report` di `src/`. Tombol Muat contoh merender `mockFinalReport` dari fixture, bukan berkas tersimpan ini. Jalur cadangan di naskah karena itu ditulis dua tingkat: tampilan lewat Muat contoh, artefak bukti lewat berkas. Bila Lead ingin UI memuat berkas tersimpan persis, itu task A6/Lead, bukan perbaikan di task ini.
3. **QA-16-3 — Pengisian kartu satu per satu tidak teramati pada mode mock.** Seluruh analisis selesai dalam 252 ms, lebih cepat dari interval polling UI 1000 ms; kartu berpindah hampir bersamaan. Naskah melarang presenter menjanjikan efek itu di mode mock dan mengarahkannya ke narasi + keadaan `gagal` pada laporan contoh.
4. **QA-16-4 — Isi bukti LIVE-MOCK bukan isi video contoh.** Pada mode mock, transkrip/adegan/keyframe berasal dari fixture kanonis, sedangkan durasi (10 detik, ter-probe dari berkas nyata) dan judul/caption berasal dari form. Presenter tidak boleh mengklaim sine 880 Hz pada berkas contoh "terdeteksi sebagai lagu komersial" pada jalur ini; klaim isi video contoh tinggal di bundle tulisan tangan Task 15.

## Penyimpangan

Tidak ada penyimpangan dari kontrak beku. Dua keputusan tercatat: (1) objek yang disimpan adalah bidang `report` verbatim dari respons job terminal, bukan bungkus snapshot polling, karena kontrak menamai artefak itu `FinalReport`; (2) run kedua khusus pengukuran waktu dijalankan tanpa menimpa tangkapan, dan kesetaraan isinya dibuktikan deep-equal sebelum angkanya dipakai. Berkas cek skema sementara dihapus setelah lulus agar wilayah tinggal sesuai delegasi. Tanpa commit git: workspace bukan repo git (`git status` menjawab not a git repository), artefak dibiarkan tidak ter-commit sesuai pola task sebelumnya.

## Kebutuhan lanjut

- Verifier Muse Wonder 1.0 konteks baru menjalankan ulang: build, start `META_MOCK=1`, POST contoh, polling, parse skema berkas tersimpan, dan muat `/` + `/report`.
- Keputusan Lead bila QA-16-1/QA-16-2 ingin ditindaklanjuti sebagai task pemilik wilayah (A1 mock reasoning lebih kaya, atau A6 memuat `saved-report.json`). Task ini tidak mengedit keduanya.
- Latihan pentas manusia (pengucapan + klik peramban nyata, idealnya sekali dengan jaringan diputus fisik) tetap perlu dijadwalkan Lead/A7 sebelum hari demo; lihat daftar tidak terbukti di atas.

Hasil uji: build exit 0; POST 202 job `28b58383-5685-4975-bcf6-b4927bdec648` terminal `error: null`; skema 1 passed; halaman `/` 51 ms dan `/report` 72 ms (keduanya 200); POST→terminal 252 ms; port 3106 bebas setelah server dimatikan.
