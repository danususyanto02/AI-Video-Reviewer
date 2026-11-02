# Verdict — Task 6 (T-201 Agen YouTube)

## Putusan: PASS

## Perintah yang dijalankan ulang + keluaran

- `npm test` → exit 0. `Test Files 6 passed (6)`, `Tests 65 passed (65)`: rules 18, youtube 13, schemas 6, meta client 6, evidence 14, report UI 8. Cocok dengan klaim laporan (65/65).
- `npm run typecheck` → exit 0, tanpa error (`tsc --noEmit` bersih).
- Pemindaian pola pada `src/lib/agents/youtube.ts` + `youtube.test.ts`: nol temuan untuk model non-Meta (`YOLO|Whisper|OpenAI|Google Vision|ElevenLabs`), klaim real-time/live, dan bahasa kepastian terlarang (`pasti bebas`, `pasti melanggar`, `aman secara hukum`).
- Pencarian hitungan skor pada `youtube.ts`: nol aritmetika skor; satu-satunya temuan adalah instruksi prompt "Jangan menghitung skor akhir dalam bentuk apa pun." (baris 66). Tidak ada `safety_score`, tidak ada pengurangan 30/15/5.
- Pemeriksaan wilayah: hanya `src/lib/agents/youtube.ts` (16:03:57), `youtube.test.ts` (16:03:35), dan laporan task-06 yang berubah pada jendela task; `src/lib/agents/` hanya berisi dua file itu. Tidak ada perubahan pada contracts/rules/meta/evidence/UI setelah 16:00.

## Hasil per item

| # | Item | Hasil | Bukti |
|---|---|---|---|
| 1 | Tepat satu panggilan `reason` | LULUS | `youtube.ts:71` satu-satunya `await reason(systemPrompt, { bundle, rules })`; tanpa retry internal. Uji menegaskan `calls` length 1 pada kasus sukses, kosong, severity invalid, reason melempar, dan tangkapan prompt. |
| 2 | Validasi keluaran via skema `Finding`; invalid → `gagal`, `findings []`, `error` terisi, `risk_level rendah` | LULUS | `AgentOutput = {findings: Finding[]}` (`youtube.ts:9-11`); `Finding` menolak evidence kosong (`min(1)`), severity di luar enum, dan `end_sec < start_sec` (`schemas.ts:144-157`). Semua kegagalan `safeParse` dan exception `reason` dipetakan ke `gagal()` (`youtube.ts:29-37, 72-80`). Uji: severity `parah`, evidence kosong, rentang terbalik, 5 bentuk non-temuan, dan reason melempar — semua `gagal` ber-findings kosong. |
| 3 | `risk_level` diturunkan dari severity maksimum; kosong → `rendah` | LULUS | `deriveRiskLevel` (`youtube.ts:19-27`), mulai `rendah`, ambil maksimum. Uji membuktikan klaim `risk_level` model diabaikan dan campuran rendah+sedang+tinggi → `tinggi`. |
| 4 | Tanpa hitungan skor | LULUS | Lihat pemindaian di atas; modul hanya menghasilkan temuan + `risk_level`. |
| 5 | Tanpa impor agen lain / merge | LULUS | Impor hanya `zod` dan `../contracts/schemas` (`youtube.ts:1-3`). |
| 6 | Prompt/payload hanya aturan YouTube; asersi tangkapan nyata | LULUS | Prompt menyematkan hanya `rules` argumen (`youtube.ts:51-67`); payload persis `{bundle, rules}`. Uji menangkap argumen fake `reason`, menegaskan semua `rule.id` youtube ada di payload, `youtube-misinformasi` ada di prompt, tanpa awalan `tiktok-`/`facebook-`, dan payload sama persis dengan bundle+rules yang diteruskan (`youtube.test.ts:220-243`). Asersi membaca tangkapan panggilan asli, bukan string statis. |
| 7 | Pemicu wajib: klaim kesehatan → `misinformasi` + dampak monetisasi bahasa risiko | LULUS | Uji kesehatan: kategori `misinformasi`, severity `sedang`, evidence verbatim `HEALTH_QUOTE`, impact mengandung "iklan terbatas" + "demonetisasi" dengan awalan "Berisiko" (`youtube.test.ts:70-89`). Didukung aturan `youtube-misinformasi` di `data/rules/youtube.json` (konsekuensi iklan terbatas/demonetisasi) yang disematkan ke prompt. |
| 8 | Asersi TDD menguji perilaku nyata | LULUS | Uji memanggil `runYoutubeAgent` sungguhan dengan fake `reason`, mem-parse hasil dengan `AgentResult` schema, dan menegaskan turunan risiko, pemetaan gagal, dan tangkapan payload — bukan tautologi. |
| 9 | Larangan: non-Meta, real-time, kepastian | LULUS | Nol temuan pada kedua file. Kata "dijamin" hanya di dalam kutipan transkrip fixture yang sedang dinilai, bukan klaim produk. |
| 10 | Wilayah file | LULUS | Hanya dua file agen baru + laporan; wilayah lain tidak tersentuh pada jendela task. |

## Temuan (bernomor, per tingkat keparahan)

Critical: tidak ada. High: tidak ada. Medium: tidak ada.

1. [Low] Plan Gelombang 2 menulis keluaran model di-parse sebagai `{risk_level, findings}`; implementasi mem-parse `{findings}` saja dan menurunkan `risk_level`, membuang klaim model (Zod strip). Perilaku ini sesuai kriteria verifikasi dan lebih aman (model tidak dapat memalsukan risiko), tetapi laporan menyebutnya "sesuai kontrak bersama yang dibekukan" — redaksi plan sebenarnya ambigu. Tidak menghalangi PASS; Lead cukup mencatat turunan deterministik sebagai penafsiran resmi untuk Task 7-11.
2. [Low] Uji pemicu kesehatan memakai fake `reason` yang mengembalikan temuan jadi: ia membuktikan validasi/terusan agen, bukan bahwa model nyata akan menandai klaim itu. Ini sesuai desain kontrak bersama (reason dipalsukan di uji); deteksi nyata baru terbukti saat integrasi Task 13.
3. [Info] Validasi evidence bersifat skema (non-kosong) plus instruksi verbatim di prompt; tidak ada pemeriksaan programatik bahwa string evidence benar-benar ada di bundle. Sesuai lingkup kontrak bersama Task 6-11; dicatat agar tidak diklaim lebih dari itu.

## Kesimpulan

PASS — 65/65 uji dan typecheck bersih pada pengulangan independen, semua item kritis (satu panggilan, validasi Finding, turunan risiko, tanpa skor, isolasi domain, pemicu kesehatan, kebersihan larangan, wilayah) terpenuhi dengan bukti perintah dan baca kode.
