# Verdict Task 9 — T-204 Agen Copyright

## Putusan: PASS

## Perintah yang dijalankan ulang + keluaran

- `npm test` — Test Files 9 passed (9), Tests 105 passed (105). Rincian: copyright.test.ts 14, youtube 13, tiktok 13, facebook 13, rules 18, schemas 6, meta client 6, evidence 14, report UI 8. Sesuai klaim laporan (105/105).
- `npm run typecheck` — `tsc --noEmit`, exit 0, tanpa error.

## Hasil per item

| # | Item pemeriksaan | Hasil | Bukti |
|---|---|---|---|
| 1 | Satu panggilan `reason` | PASS | `copyright.ts:73` satu-satunya `await reason(systemPrompt, { bundle, rules })`; uji menegaskan `calls` length 1 di jalur sukses, gagal, dan lempar error |
| 2 | Validasi `Finding` + pemetaan `gagal` | PASS | `AgentOutput = {findings: z.array(Finding)}` memakai skema kontrak (`severity` enum, `evidence` min 1, `end_sec >= start_sec`, `evidence_type` enum); gagal parse dan `reason` melempar dipetakan ke `status: gagal, findings: [], risk_level: rendah, error` terisi (`copyright.ts:79-82, 72-77`). Uji mencakup severity `parah`, evidence kosong, rentang terbalik, 5 bentuk keluaran non-temuan, dan reason melempar |
| 3 | `risk_level` diturunkan, bukan dari model | PASS | `deriveRiskLevel` mengambil severity tertinggi, kosong menjadi `rendah`; `AgentOutput` hanya mem-parse `findings` sehingga klaim `risk_level` model terbuang. Uji: temuan rendah + klaim model `tinggi` tetap `rendah`; campuran rendah+sedang+tinggi menjadi `tinggi` |
| 4 | Tanpa aritmetika skor | PASS | Tidak ada `safety_score`/pengurangan skor di `copyright.ts`; prompt baris 68 justru melarang menghitung skor. Skor tetap wilayah A5 sesuai kontrak |
| 5 | Tanpa impor agen lain / merge | PASS | Impor implementasi hanya `zod` dan `../contracts/schemas`; nol rujukan youtube/tiktok/facebook/legal/merge di `copyright.ts` |
| 6 | Payload hanya aturan copyright | PASS | Prompt hanya menyematkan `rules` yang diteruskan (`copyright.ts:55-56`) dan melarang aturan/domain lain (baris 53); payload persis `{bundle, rules}`. Uji menegaskan semua `rule.id` copyright ada di payload, tanpa awalan `youtube-`/`tiktok-`/`facebook-`, dan `bundle`/`rules` payload sama persis dengan argumen |
| 7 | Pemicu musik komersial | PASS | Temuan `musik_komersial` 0–45 detik, severity `tinggi`, `evidence` sama persis dengan deskripsi adegan `mockEvidenceBundle` (ditegaskan terhadap fixture), `impact` memuat `risiko` + `kemungkinan klaim`, `fix` memuat `ganti musik` |
| 8 | Pemicu watermark platform lain | PASS | Temuan `watermark_platform_lain` 22–22 detik (pola keyframe `at_sec` ke `at_sec`), `evidence` verbatim deskripsi keyframe, `fix` cocok `/crop\|potong/` |
| 9 | Klaim izin di `extra_context` tidak menghapus temuan (Review Focus item 4) | PASS | Bundle izin tetap mengembalikan kedua temuan, `risk_level: tinggi`; modul tidak punya kode penghapus berbasis `extra_context` (bundle diteruskan apa adanya, dibuktikan payload memuat `berlisensi penuh`); prompt baris 66 menginstruksikan konteks izin `tidak menghapus risiko dan tidak menghapus temuan` |
| 10 | Ketiadaan frasa kepastian terlarang pada hasil | PASS | `expectNoCertaintyWording` me-serialisasi hasil (lowercase) dan menegaskan ketiadaan `pasti bebas`, `pasti melanggar`, `aman secara hukum`; dipanggil pada uji pemicu utama dan uji izin. Frasa dibangun dari potongan kata agar berkas uji sendiri bersih dari literal terlarang |
| 11 | Prompt bahasa risiko + konteks tidak menghapus | PASS | Baris 64 mewajibkan kata `risiko` dan frasa `kemungkinan klaim`; baris 66 aturan `extra_context`; baris 54 melarang kepastian. Uji tangkapan prompt menegaskan ketiganya |
| 12 | Uji menegaskan perilaku nyata | PASS | Uji memakai `reason` palsu dan menegaskan parse `AgentResult`, rentang/evidence/severity/fix, turunan risiko, pemetaan gagal, dan tangkapan prompt+payload — bukan sekadar snapshot. Batasan melekat kontrak gelombang 2: penalaran model nyata memang dipalsukan di uji (Task 13 yang mengikat Meta nyata) |
| 13 | Kejujuran kontrak copyright | PASS | Prompt membingkai hasil sebagai skrining pemetaan risiko, `bukan penentu klaim, bukan keputusan platform, dan bukan nasihat hukum` (baris 54), selaras larangan kontrak `docs/contracts.md:64` |
| 14 | Pemindaian larangan | PASS | Nol nama model non-Meta (YOLO/Whisper/OpenAI/GPT/Gemini/dll.), nol klaim real-time/live, nol literal kepastian terlarang, nol kunci API/`sk-` di kedua file. Satu-satunya kemunculan `skor` adalah larangan menghitung skor di prompt |
| 15 | Wilayah file | PASS | Hanya `src/lib/agents/copyright.ts` dan `src/lib/agents/copyright.test.ts` baru (mtime 16:13) plus laporan task-09; file agen sibling dan wilayah lain tidak berubah pada jendela task ini |

## Temuan

### Blocker
Tidak ada.

### Major
Tidak ada.

### Minor
Tidak ada.

### Info
1. Plan gelombang 2 (baris 139) menulis parse `{risk_level, findings}`, sedangkan implementasi mem-parse `{findings}` saja dan menurunkan `risk_level` secara deterministik. Ini penyimpangan yang diungkap laporan (poin 2), konsisten dengan pola agen YouTube/TikTok/Facebook yang sudah lolos, dan lebih aman daripada memercayai klaim model — bukan cacat.
2. Fixture kanonis `mockEvidenceBundle` tidak memuat keyframe `watermark` (hanya `license_plate`), sehingga uji menurunkan bundle dengan satu keyframe watermark tambahan pada detik 22. Diungkap transparan di laporan (poin 1); modul menerima bundle apa pun sebagai argumen, jadi perilaku pemicu tetap terbukti dan wilayah fixture milik Lead tidak disentuh.
3. `Finding.category` di kontrak memang string terbuka (komentar `schemas.ts:141-143`), jadi daftar 7 tema copyright ditegakkan lewat prompt, bukan enum Zod — sama seperti agen sibling dan sesuai desain kontrak beku.
