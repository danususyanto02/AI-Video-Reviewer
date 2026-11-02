# Verdict Task 10 — T-205 Agen Hukum Indonesia

**Putusan: PASS**

Task: T-205
Modul terverifikasi: `src/lib/agents/legal_id.ts`, `src/lib/agents/legal_id.test.ts`
Laporan worker (tidak diverifikasi, hanya titik awal): `docs/superpowers/reports/task-10-report.md`

## Perintah yang dijalankan ulang dan hasilnya

- `npm test` — exit 0. Test Files 10 passed (10), Tests 121 passed (121). Termasuk `src/lib/agents/legal_id.test.ts` 16 passed (16).
- `npm run typecheck` (`tsc --noEmit`) — exit 0, tanpa error.

Kedua angka cocok persis dengan klaim laporan worker: 10 berkas, 121 uji, typecheck bersih.

## Hasil per butir pemeriksaan

| # | Butir | Hasil | Bukti ringkas |
|---|---|---|---|
| 1 | Satu panggilan `reason` | PASS | `legal_id.ts:106` hanya satu `await reason(systemPrompt, { bundle, rules })`; uji assertion `calls` length 1 pada jalur selesai, kosong, invalid, dan lempar error (`legal_id.test.ts:145,181,203,327,338`). |
| 2 | Validasi `Finding` + pemetaan `gagal` | PASS | `AgentOutput = {findings: Finding[]}` (`:9-11`); `Finding` dari `contracts/schemas` menolak evidence kosong, severity di luar kosakata, rentang terbalik. `findContractViolation` menolak kategori di luar `rules`, pola pasal, kesimpulan kepastian. Semua jalur invalid -> `gagal()` `findings: []`, `error` terisi, `risk_level: rendah`. |
| 3 | `risk_level` turunan, klaim model diabaikan | PASS | `deriveRiskLevel` (`:27-35`) maksimum severity, kosong -> `rendah`. Uji `:148-164`: model mengaku `tinggi` dengan temuan `rendah` -> hasil tetap `rendah`; campuran -> `tinggi`. Pola identik dengan `youtube.ts`/`copyright.ts` (Parse `{findings}` saja) — penyimpangan (2) laporan terkonfirmasi sebagai preseden gelombang 2, bukan pelanggaran. |
| 4 | Tanpa hitungan skor | PASS | Tidak ada `100/-30/-15/-5`/`safety_score` di modul (grep kosong). Prompt `:101` melarang hitung skor. Hasil hanya 5 kunci kontrak. |
| 5 | Tanpa impor agen/merge | PASS | Impor hanya `zod` dan `../contracts/schemas` (`:1-3`). Tidak ada `agents/*`, `merge/*`, `jobs/*`. |
| 6 | Payload hanya irisan aturan `legal_id` | PASS | Payload persis `{bundle, rules}`. Prompt menyematkan `JSON.stringify(rules)` yang diteruskan. Uji `:345-363` membuktikan semua 9 id `legal_id.json` ada di payload, payload `bundle`/`rules` `toEqual`, dan tidak ada prefix `youtube-`/`tiktok-`/`facebook-`/`musik_komersial`. |
| 7 | Pemicu obat menyesatkan + judi online, kategori = id tema | PASS | `medicineFinding` kategori `klaim_menyesatkan_produk_investasi` (13-20 dtk), `gamblingFinding` kategori `judi_online` (5-12 dtk), keduanya id sah di `data/rules/legal_id.json`. Bukti verbatim, `fix` tidak kosong, `impact` memuat `berisiko terkait tema`, `risk_level: tinggi` turunan. Kutipan judi sama persis dengan `mockEvidenceBundle.transcript[0]` (assert `:137`). Bundle uji adalah `mockEvidenceBundle` + satu segmen obat — penyimpangan (1) laporan akurat karena fixture kanonis hanya memuat judi. |
| 8 | Tanpa `/Pasal\s+\d+/i` pada modul, fixture, keluaran | PASS | Pemindaian raw: 0 kecocokan `Pasal`+digit pada kedua berkas (regex penolak adalah definisi `/Pasal\s+\d+/i`, bukan keluaran). Fixture pasal `["Pasal","28"].join(" ")` hanya menjadi masukan invalid -> `gagal` berbukti kosong, lalu `expectNoPasalAndNoCertainty` membuktikan keluaran ter-serialisasi bersih. |
| 9 | Tanpa kepastian hukum | PASS | Raw: 0 `melanggar UU`/`pasti bebas`/`pasti melanggar`/`aman secara hukum` (frasa terlarang dibangun via `join` agar berkas bersih, perilakunya nyata). Penolak modul: `CERTAINTY_CONCLUSION_PATTERN /melanggar\s+(UU|undang-undang|hukum)\b/i` + 3 frasa terlarang. Uji kesimpulan `melanggar UU ITE` -> `gagal`. Prompt memakai kerangka `berisiko terkait tema`. |
| 10 | Prompt framing skrining | PASS | `:84` "skrining tema risiko hukum, bukan putusan hukum dan bukan nasihat hukum", `:95` wajib frasa `berisiko terkait tema`, `:96-99` larangan nomor pasal/kepastian/disclaimer per temuan. |
| 11 | Modul tidak melampirkan disclaimer sendiri | PASS | Hasil tepat 5 kunci `agent,error,findings,risk_level,status`; `expectAgentResultShapeOnly` (`:99-104`) membuktikan tanpa properti `disclaimer` dan tanpa string `DISCLAIMER`. Modul bahkan tidak mengimpor `DISCLAIMER`; disclaimer tetap milik penggabung/UI sesuai `FinalReport.legal_id.disclaimer`. |
| 12 | Assertion uji perilaku nyata | PASS | Uji menjalankan fungsi asli dengan fake `reason` terbingkai dan memeriksa kontrak, kategori, rentang, evidence verbatim, isi `fix`, `risk_level` turunan, prompt tertangkap, payload `toEqual`, serta 10+ jalur invalid nyata (severity `parah`, evidence kosong, rentang terbalik, kategori `misinformasi`, pasal, kepastian, 5 bentuk malformed, `reason` melempar). Bukan snapshot, bukan tautologi. |
| 13 | Larangan model non-Meta, real-time, kunci | PASS | 0 temuan `YOLO/Whisper/OpenAI/Google Vision/ElevenLabs/real-time/realtime` dan pola kunci pada kedua berkas. |
| 14 | Wilayah file | PASS | Cap waktu: `legal_id.test.ts` 16:17:08, `legal_id.ts` 16:17:27, laporan 16:17:54; berkas gelombang sebelumnya (copyright 16:13) tidak berubah. `tsconfig.tsbuildinfo` terbarui adalah artefak typecheck, bukan wilayah. |

## Temuan bernomor

### Kritikal
Tidak ada.

### Tinggi
Tidak ada.

### Sedang
Tidak ada.

### Rendah
1. **Celah varian regex.** Penolak pasal `/Pasal\s+\d+/i` tidak menangkap `Pasal28` (tanpa spasi) dan penolak kepastian tidak menangkap `melanggar undang undang` (tanpa tanda hubung). Keduanya di luar pola dan frasa yang dikunci kontrak (`Pasal\s+\d+`, `melanggar UU`, `pasti bebas`, `pasti melanggar`, `aman secara hukum`) dan prompt melarang keduanya, serta jalur umum gagal-aman. Penyempitan di masa depan bisa menangani varian ini.
2. **Daftar kategori ganda.** Validasi memakai himpunan dinamis dari `rules` (tepat), tetapi prompt `:91` juga menulis hardcode 9 id yang sama. Pada aturan beku keduanya identik; bila `legal_id.json` versi berikutnya mengubah id, prompt perlu diselaraskan manual agar tidak menyuruh model mengeluarkan id yang kemudian ditolak validator.

### Informasi
3. **Verbatim hanya di prompt.** Bukti fiktif tak kosong lolos skema selama kategori valid dan tanpa frasa terlarang; kutipan verbatim ditegakkan instruksi prompt, bukan pencocokan deterministik ke bundle. Perilaku sama dengan agen saudara `youtube.ts`/`copyright.ts` dan mengikuti skema `Finding` beku (`evidence` min 1), bukan penyimpangan.
4. **Bentuk parse `{findings}` saja.** Plan gelombang 2 menulis parse `{risk_level, findings}`, tetapi implementasi mengabaikan `risk_level` model dan menurunkannya, dikonfirmasi sebagai preseden T-201/T-204 dan teruji eksplisit di Task 10. Konsisten dan fail-aman.

Putusan akhir: **PASS** — semua butir kontrak T-205 terpenuhi, uji ulang 121/121 dan typecheck bersih, tanpa temuan pemblokir.
