Task: T-001
Ringkasan: Kontrak mesin Zod dan fixture kanonis CekDulu dibuat di wilayah Lead `src/lib/contracts/`. Tabel keputusan di `docs/contracts.md` diverifikasi cocok dengan rencana implementasi (stack, cara uji, peta folder, tabel batas waktu, format aturan, nama variabel env) sehingga file itu tidak diubah. Uji kontrak ditulis lebih dulu (TDD) dan kegagalan RED di workspace tercatat persis karena `package.json` memang belum ada; skema dan fixture kemudian diimplementasikan agar lulus menurut konstruksi begitu Task 2 memasang Vitest dan Zod.

File diubah:
- `src/lib/contracts/schemas.test.ts` (baru) — uji kontrak: fixture parse, bukti kosong ditolak, severity di luar kosakata ditolak, skor di atas 100 ditolak.
- `src/lib/contracts/schemas.ts` (baru) — skema Zod + tipe `z.infer` dengan nama sama untuk `ReviewInput`, `TranscriptSegment`, `SceneSegment`, `KeyframeFinding`, `EvidenceBundle`, `Finding`, `AgentResult`, `PlatformReport`, `FinalReport`, `AgentProgress`, `RuleFile`; enum ketat `z.enum` untuk severity/risk (`rendah|sedang|tinggi`), status agen (`selesai|gagal|batas_waktu`), status platform (`aman|perlu_perbaikan|berisiko_tinggi`), `evidence_type` (`visual|audio|text_on_screen|title|caption|thumbnail`), kind keyframe, platform, nama agen, dan state progres (`queued|running|done|failed|timeout`); konstanta `DISCLAIMER` persis kontrak, `PLATFORM_CATEGORIES` (12 slug), `KEYFRAME_KINDS` (8 kind); `KeyframeFinding.box` opsional `{x,y,w,h}` masing-masing 0..1; `Finding.evidence` wajib non-kosong (`min(1)`); `PlatformReport.safety_score` 0..100; `FinalReport.platforms` tepat 3 dan `agent_statuses` tepat 6; `legal_id.disclaimer` dikunci `z.literal(DISCLAIMER)`; `RuleFile.version` pola `YYYY-MM-DD.N` dan `updated_at` pola `YYYY-MM-DD`.
- `src/lib/contracts/fixtures.ts` (baru) — `mockEvidenceBundle` (tepat satu segmen transkrip promosi judi 00:05-00:12, satu scene musik komersial 00:00-00:45, satu keyframe `license_plate` pada 00:18 dengan `box`), `emptyEvidenceBundle` (transkrip, scene, dan keyframe kosong), `mockFinalReport` (tepat tiga platform, enam `agent_statuses` dengan tepat satu `gagal` pada `packaging_privacy`). Semua fixture dianotasi tipe kontraknya agar ketidakcocokan bentuk tertangkap saat typecheck Task 2.
- `docs/superpowers/reports/task-01-report.md` (baru, file ini) — laporan selesai.
- Tidak diubah: `docs/contracts.md`, `TASKS.md`, dan semua wilayah A1-A7. `docs/contracts.md` hanya dibaca dan diverifikasi, tidak ditulis ulang.

Uji dijalankan:
- (TDD, sebelum implementasi) `npm test -- src/lib/contracts/schemas.test.ts`
- (setelah implementasi, workspace) `npm test -- src/lib/contracts/schemas.test.ts`
- `node --check src/lib/contracts/schemas.ts`
- `node --check src/lib/contracts/fixtures.ts`
- `node --check src/lib/contracts/schemas.test.ts`
- Pemindaian larangan pada tiga file baru: cari pola model non-Meta, klaim waktu-nyata, bahasa kepastian copyright/hukum, dan kunci API berbentuk asli (perintah `Select-String` PowerShell, baca-saja).

Hasil uji:
- RED TDD terkonfirmasi (diharapkan pada tahap ini). Perintah `npm test -- src/lib/contracts/schemas.test.ts` gagal sebelum dan sesudah implementasi dengan keluaran persis yang sama karena test runner memang belum dipasang (wilayah Task 2):

```text
npm error code ENOENT
npm error syscall open
npm error path F:\PC\Project\hackathon\ide\video analisa\app\package.json
npm error errno -4058
npm error enoent Could not read package.json: Error: ENOENT: no such file or directory, open 'F:\PC\Project\hackathon\ide\video analisa\app\package.json'
```

  Ini RED yang direncanakan rencana Task 1 Langkah 2, bukan kegagalan logika uji. Uji ditulis dengan Vitest (`describe/it/expect`) dan impor relatif `./schemas` + `./fixtures` agar lulus begitu Task 2 menyediakan `package.json` dengan `npm test` = `vitest run` dan dependensi `zod`. Sesuai Langkah 4 rencana, PASS workspace ditunda ke akhir Task 2; laporan ini tidak mengklaim PASS Vitest workspace yang belum dijalankan.
- Pemeriksaan sintaks yang bisa dijalankan tanpa dependensi lulus: `node --check` pada `schemas.ts`, `fixtures.ts`, dan `schemas.test.ts` masing-masing berakhir dengan kode keluar 0 pada Node v24.16.0. Pemeriksaan ini hanya membuktikan sintaks terbaca Node, bukan validasi Zod saat runtime.
- Validasi parse Zod saat runtime di workspace belum bisa dijalankan karena `zod` dan `vitest` belum terpasang dan pembuatan `package.json` adalah wilayah Task 2 yang dilarang disentuh task ini. Percobaan pemeriksaan runtime terisolasi di luar workspace (salinan ketiga file di folder temp sandbox, `npm install zod vitest` di sana) juga tidak menghasilkan PASS teramati: instalasi tidak selesai dan dihentikan tanpa keluaran uji, sehingga tidak ada klaim lulus runtime yang dibuat dari percobaan itu. Folder temp itu bukan bagian deliverable dan tidak menyentuh workspace. Kebenaran fixture terhadap skema dibuktikan menurut konstruksi: fixture dianotasi `EvidenceBundle`/`FinalReport`, setiap nilai enum diambil dari kosakata kontrak, setiap `evidence` non-kosong, skor berada pada 0..100 (55, 25, 70), `box` berada pada 0..1, dan jumlah entri memenuhi `length(3)`/`length(6)`. Verifier dan Task 2 wajib menjalankan ulang `npm test -- src/lib/contracts/schemas.test.ts` setelah scaffolding ada; itulah gerbang PASS yang sesungguhnya.
- Pemindaian larangan pada ketiga file baru: nol temuan. Tidak ada nama model non-Meta, tidak ada kunci API, tidak ada klaim waktu-nyata, tidak ada bahasa kepastian pada keluaran fixture; semua `impact` memakai bahasa berisiko (`Berisiko ...`, `kemungkinan klaim`).
- Verifikasi kontrak vs rencana: tidak ditemukan selisih. Stack di kontrak (TypeScript 5, Next.js 15 App Router React 19, Node 22 LTS, Tailwind CSS v4, Zod, Vitest, npm, ffmpeg sistem) sama dengan header rencana; tabel batas waktu kontrak (transcribe 120 detik, video 120 detik, gambar 60 detik, SAM 30 detik per keyframe, reasoning agen 60 detik, ffprobe 30 detik, polling 1000 ms, satu percobaan ulang backoff 2 detik) sama dengan nilai terkunci rencana; peta folder kontrak sama dengan struktur file rencana; format aturan `{version, updated_at, source, rules[]}` versi `YYYY-MM-DD.N` sama dengan Task 4 rencana. Karena cocok, `docs/contracts.md` tidak diedit.

Penyimpangan:
- Tidak ada penyimpangan kontrak. Keputusan bentuk yang tidak dirinci prosa kontrak diambil sebagai berikut dan perlu disahkan Lead bila berbeda maksud: (1) `FinalReport.copyright.segments` dan `FinalReport.legal_id.themes` bertipe `Finding[]` agar setiap segmen/tema tetap membawa bukti dan rentang waktu sesuai aturan "setiap temuan wajib punya bukti"; (2) `FinalReport.agent_statuses` berbentuk `{agent, status}` dengan kosakata `selesai|gagal|batas_waktu` (jejak akhir `AgentResult`), terpisah dari `AgentProgress.state` untuk polling UI; (3) `Finding.category` sengaja `z.string().min(1)` terbuka karena kontrak mengizinkan 12 slug platform ditambah tema copyright dan tema hukum, sedangkan semua bidang berkosakata tertutup lain memakai `z.enum` dan menolak nilai asing seperti `parah`; (4) `AgentResult.error` berbentuk `z.string().nullable().default(null)` agar status selesai membawa `null` dan status gagal membawa pesan.
- Lingkungan menjalankan Node v24.16.0, bukan Node 22 LTS pada kontrak. Sesuai ruling lingkungan di ledger, kode ditulis TypeScript polos tanpa API khusus Node 24 dan tanpa penyesuaian kontrak pada task ini.
- Langkah commit rencana tidak dijalankan: tidak ada repo Git yang terdeteksi pada workspace dan CLI `hg` tidak tersedia, sesuai ruling ledger. Perubahan dibiarkan tidak ter-commit untuk ditinjau Lead.

Kebutuhan lanjut:
- Task 2 (A1) memasang `package.json` (Vitest + Zod + TypeScript), lalu menjalankan `npm test -- src/lib/contracts/schemas.test.ts`, `npm test`, dan `npm run typecheck`. Uji Task 1 ini harus PASS pada titik itu; bila ada kegagalan typecheck pada pola `z.enum([...CONST])` atau tipe hasil `refine`, perbaikannya tetap di wilayah `src/lib/contracts/` lewat Lead, bukan di wilayah A1.
- Lead mengesahkan empat keputusan bentuk pada bagian Penyimpangan sebelum gelombang 2 memakai `FinalReport` dan `AgentResult` secara luas, karena penggabung (A5) dan UI (A6) akan mengonsumsi bentuk itu apa adanya.
- Verifier Muse Wonder 1.0 konteks baru menjalankan ulang perintah uji di atas, memvalidasi keluaran terhadap `docs/contracts.md`, dan memastikan tidak ada file di luar `src/lib/contracts/` dan laporan ini yang berubah pada task ini.
