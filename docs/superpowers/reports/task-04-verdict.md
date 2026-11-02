# Verdict Verifier — Task 4 (T-103 Data Aturan)

**Putusan: PASS**

Task: T-103
Verifier: Muse Wonder 1.0, konteks baru (bukan implementor Task 4)
Tanggal verifikasi: 2026-10-30
Acuan: `docs/superpowers/reports/task-04-report.md` (klaim diperlakukan tidak terverifikasi sampai dibuktikan di bawah), rencana implementasi Task 4 di `docs/superpowers/plans/2026-10-30-cekdulu-mvp.md`, konsep Modul 1–3 di `../cekdulu-ai-video-reviewer.md`, skema `RuleFile` di `src/lib/contracts/schemas.ts`, kontrak beku `docs/contracts.md`.

---

## Perintah yang dijalankan ulang verifier (bukan klaim worker)

| # | Perintah | Hasil aktual verifier |
|---|---|---|
| 1 | `npm test` | exit 0 — `Test Files 4 passed (4)`, `Tests 44 passed (44)` (schemas 6 + rules 18 + meta client 6 + evidence 14). Peringatan `configLoader: 'native'` Vitest muncul di stderr tetapi suite hijau. |
| 2 | `npm test -- data/rules/rules.test.ts` | exit 0 — `Test Files 1 passed (1)`, `Tests 18 passed (18)`. |
| 3 | `npm run typecheck` | exit 0 — `tsc --noEmit` tanpa error. |
| 4 | Grep independen teks mentah kelima JSON (regex PowerShell atas isi file, bukan lewat uji worker) | 0 untuk semua pola terlarang. Rincian di bagian berikut. |
| 5 | Spot-check web GET dengan header browser pada URL sumber dari file | HTTP 200 dan judul halaman cocok dengan nama pedoman. Rincian di bagian Web. |
| 6 | Inspeksi teritori lewat cap waktu file (workspace bukan repo git) | Hanya `data/rules/*` + laporan berubah di jendela Task 4. Rincian di bagian Teritori. |

Klaim laporan worker yang cocok dengan reproduksi verifier: `npm test` 44/44, `rules.test.ts` 18/18, typecheck exit 0, versi `2026-10-30.1` di kelima file. Klaim RED awal (18 failed ENOENT) tidak dapat direproduksi pasca-implementasi dan tidak dipakai sebagai bukti.

---

## Scan larangan independen (teks mentah, di luar uji worker)

Verifier membaca ulang kelima file JSON secara langsung dan menghitung pola berikut pada gabungan kelima file:

| Pola | Jumlah |
|---|---|
| `pasti bebas` | 0 |
| `pasti melanggar` | 0 |
| `aman secara hukum` | 0 |
| `Pasal\s+\d+` (case-insensitive) | 0 |
| `YOLO` | 0 |
| `Whisper` | 0 |
| `OpenAI` / `GPT` | 0 |
| `Google Vision` | 0 |
| `ElevenLabs` | 0 |
| Nama model non-Meta lain yang dipindai (`Claude`, `GPT-4`, `Gemini`, `Llama`) | 0 |
| `real-time` / `realtime` | 0 |
| Bentuk kunci (`sk-…`, `META_API_KEY=…`, `api_key`) | 0 |

Hasil ini sejalan dengan klaim laporan dan dengan pantangan konsep Modul 2 (selalu bahasa risiko: "risiko copyright" dan "kemungkinan klaim").

---

## Hasil per file

Skema `RuleFile` (`src/lib/contracts/schemas.ts`): `{version: YYYY-MM-DD.N, updated_at: YYYY-MM-DD, source: string non-kosong, rules: [{id, category, guidance, consequence?, perlu_verifikasi?}]}`. Kelima file lulus `RuleFile.parse` lewat uji yang dijalankan ulang.

### youtube.json
- `version: "2026-10-30.1"`, `updated_at: "2026-10-30"` — sesuai kunci kontrak.
- Source menamai destinasi resmi: `YouTube Community Guidelines (https://support.google.com/youtube/answer/9288567)` dan `YouTube Channel Monetization Policies (https://support.google.com/youtube/answer/1311392)`.
- 12 aturan, tepat satu per slug `PLATFORM_CATEGORIES` (kekerasan, seksual, ujaran_kebencian, perundungan, keselamatan_anak, perilaku_berbahaya, narkoba_alkohol_senjata, judi, misinformasi, spam_clickbait_reupload, grafis_medis, privasi_data_pribadi); semua punya `consequence` non-kosong; id unik.
- `perlu_verifikasi: true` pada 2 entri: `youtube-spam-clickbait-reupload`, `youtube-grafis-medis` — sama persis dengan laporan.
- Guidance bahasa Indonesia awam dengan kata risiko (`berisiko`) di 12/12 entri.

### tiktok.json
- `version: "2026-10-30.1"`, `updated_at: "2026-10-30"`.
- Source: `TikTok Community Guidelines (https://www.tiktok.com/community-guidelines)`.
- 12 aturan mencakup ke-12 slug kategori, semua dengan `consequence`, id unik.
- `perlu_verifikasi: true` pada 2 entri: `tiktok-misinformasi`, `tiktok-grafis-medis` — sama persis dengan laporan.
- Guidance `berisiko`/`kemungkinan` di 12/12 entri.

### facebook.json
- `version: "2026-10-30.1"`, `updated_at: "2026-10-30"`.
- Source: `Meta Community Standards (https://transparency.meta.com/policies/community-standards/)` dan `Facebook Policies Center termasuk kebijakan monetisasi (https://www.facebook.com/policies_center/)`.
- 12 aturan mencakup ke-12 slug kategori, semua dengan `consequence`, id unik.
- `perlu_verifikasi: true` pada 3 entri: `facebook-misinformasi`, `facebook-spam-clickbait-reupload`, `facebook-grafis-medis` — sama persis dengan laporan.

### copyright.json
- `version: "2026-10-30.1"`, `updated_at: "2026-10-30"`.
- Source: `YouTube Copyright Policies — How YouTube Works (https://www.youtube.com/howyoutubeworks/policies/copyright/)` dan kebijakan hak cipta platform tujuan sebagai parameter risiko skrining.
- 7 aturan dengan id sekaligus kategori: `musik_komersial`, `klip_pihak_ketiga`, `watermark_platform_lain`, `logo_merek_dominan`, `stok_berlisensi`, `reupload_tanpa_transformasi`, `teks_lirik_berhak_cipta` — menutupi ketujuh parameter Modul 2 konsep (musik komersial, potongan pihak ketiga, watermark platform lain, logo merek dominan, stok berlisensi, reupload tanpa transformasi, teks/lirik berhak cipta dalam porsi besar). Bidang `consequence` absen, yang diizinkan skema (`consequence` opsional) dan memang tidak dijanjikan rencana untuk file ini.
- `perlu_verifikasi: true` pada 3 entri: `klip_pihak_ketiga`, `stok_berlisensi`, `teks_lirik_berhak_cipta` — sama persis dengan laporan.
- Guidance memakai bahasa risiko dan "kemungkinan klaim" di 7/7 entri; tanpa kata kepastian terlarang.

### legal_id.json
- `version: "2026-10-30.1"`, `updated_at: "2026-10-30"`.
- Source: `Basis Peraturan Republik Indonesia (https://peraturan.go.id/)` dengan tema konseptual UU ITE dan KUHP untuk skrining awal, tanpa kutipan bunyi ketentuan.
- 9 aturan dengan id sekaligus kategori: `hoaks`, `ujaran_kebencian_sara`, `pencemaran_nama_baik`, `kesusilaan_pornografi`, `judi_online`, `provokasi_kekerasan_terorisme`, `klaim_menyesatkan_produk_investasi`, `privasi_data_pribadi`, `endorsement_tanpa_pengungkapan` — menutupi kesembilan tema Modul 3 konsep.
- `perlu_verifikasi: true` pada seluruh 9/9 entri — sesuai laporan dan sesuai perintah konsep bahwa nomor pasal yang belum terverifikasi tidak dikarang. Dikonfirmasi 0 kemunculan pola `Pasal\s+\d+` di seluruh repo aturan.
- Guidance bahasa awam dengan framing "berisiko terkait tema …" di 9/9 entri; tanpa kepastian hukum.

Persilangan klaim laporan vs temuan verifier: jumlah `perlu_verifikasi` per file (YouTube 2, TikTok 2, Facebook 3, copyright 3, legal 9-semua) **persis sama** dengan daftar di laporan, id per id.

---

## Konsekuensi per platform memang berbeda (kutipan)

Konsep Modul 1 mengunci risiko utama per platform (YouTube: teguran/demonetisasi/iklan terbatas; TikTok: tidak layak For You/penghapusan; Facebook: pembatasan distribusi/demonetisasi Page). Untuk kategori yang sama (`kekerasan`), ketiga file menulis konsekuensi yang berbeda secara harfiah — tidak ada kategori yang teks `consequence`-nya identik di ketiga file (diverifikasi per pasangan untuk ke-12 kategori):

- **YouTube** (`youtube-kekerasan`): "Video berisiko dihapus dan channel dapat menerima teguran; bila tetap tayang, video berisiko terkena iklan terbatas."
- **TikTok** (`tiktok-kekerasan`): "Video berisiko dihapus; bila tetap tayang, video berisiko menjadi tidak layak rekomendasi For You."
- **Facebook** (`facebook-kekerasan`): "Konten berisiko dihapus; bila tetap tayang, distribusi konten berisiko dibatasi dan Page dapat terkena pembatasan."

Satu contoh kedua untuk kategori monetisasi-relevan (`spam_clickbait_reupload`):
- YouTube: "…konten pakai ulang berisiko ditolak monetisasinya atau terkena demonetisasi."
- TikTok: "Video berisiko menjadi tidak layak rekomendasi For You; unggahan ulang tanpa transformasi berisiko dihapus."
- Facebook: "Distribusi konten berisiko dibatasi dan Page berisiko terkena demonetisasi Page; konten tidak orisinal berisiko dihapus dari rekomendasi."

Hitungan kata kunci penanda di pembacaan verifier sejalan: YouTube mengandung `teguran` 10× / `iklan terbatas` 8× / `For You` 0×; TikTok `For You` 9× / `teguran` 0×; Facebook `distribusi` 13× / `demonetisasi Page` hadir / `For You` 0×.

---

## Pemeriksaan rules.test.ts — asersi nyata, bukan tautologi

`data/rules/rules.test.ts` (122 baris) memuat asersi substantif atas isi file, bukan sekadar keberadaan file:

1. Mem-parsing tiap file dengan `RuleFile.parse` skema kontrak dan menegaskan `version === "2026-10-30.1"`, `updated_at === "2026-10-30"`, `source` non-kosong dan mengandung `http`, `rules` non-kosong, id unik per file, dan `guidance` non-kosong per aturan.
2. Menegaskan tiap file platform mencakup ke-12 slug `PLATFORM_CATEGORIES` dari kontrak dan tiap aturan platform punya `consequence`, plus kata kunci konsekuensi khas per platform (YouTube teguran/demonetisasi/iklan terbatas; TikTok For You/penghapusan; Facebook distribusi/demonetisasi).
3. Menegaskan cakupan copyright 7 id dan legal 9 id, masing-masing sebagai `id` sekaligus `category`.
4. Memindai **teks file mentah** (`loadRaw`) untuk tiga string kepastian terlarang dan pola `Pasal\s+\d+` — pemindaian ini menembus ringkasan terstruktur, jadi tidak bisa dilewati dengan memindahkan kata terlarang ke field lain.

Batasan uji yang dicatat sebagai temuan minor (bukan kegagalan task): uji hanya menegaskan `source` mengandung `http`, bukan domain resmi; dan tidak menegaskan flag `perlu_verifikasi`. Kedua celah itu tertutup oleh pembacaan manual serta spot-check web verifier di dokumen ini.

---

## Web — spot-check satu sumber resmi

Web tersedia untuk verifier. Akses memakai GET dengan header browser (permintaan HEAD sempat menjawab 404 pada dua domain; itu artefak metode HEAD, bukan halaman mati — dibuktikan GET di bawah):

| URL dari file | Metode verifier | Hasil |
|---|---|---|
| `https://support.google.com/youtube/answer/9288567` (sumber youtube.json) | GET | HTTP 200, judul halaman "YouTube’s Community Guidelines - YouTube Help" — memang destinasi Community Guidelines resmi YouTube. |
| `https://support.google.com/youtube/answer/1311392` (sumber youtube.json) | GET | HTTP 200, judul "YouTube channel monetization policies - YouTube Help". |
| `https://www.tiktok.com/community-guidelines` (sumber tiktok.json) | GET | HTTP 200; halaman TikTok (judul berbahasa Indonesia "Kebijakan & keterlibatan \| TikTok"). |
| `https://transparency.meta.com/policies/community-standards/`, `https://peraturan.go.id/`, `https://www.youtube.com/howyoutubeworks/policies/copyright/` | HEAD | HTTP 200 masing-masing. |

Kesimpulan web: URL sumber di file benar-benar menyelesaikan ke pedoman resmi yang dinamai. Verifier tidak menilai apakah ringkasan per aturan setia baris-per-baris terhadap teks pedoman; yang dipastikan adalah nama sumber dan versinya, sesuai lingkup T-103. Klaim laporan "halaman resmi menjawab HTTP 200" terbukti dapat direproduksi.

---

## Teritori

Workspace ini bukan repo git (`git status` menjawab "not a git repository"), jadi pemeriksaan teritori tidak memakai diff, melainkan cap waktu modifikasi file dan daftar isi direktori:

- `data/rules/rules.test.ts` 15:47:21, kelima JSON 15:48:13–15:48:48, laporan 15:49:11 — berurutan dan hanya di wilayah A3 (`data/rules/`) ditambah laporan task.
- File kontrak `src/lib/contracts/*` terakhir berubah 14:58, klien Meta `src/lib/meta/*` 15:31, pipeline bukti `src/lib/evidence/*` 15:43 — semuanya **sebelum** jendela Task 4, tidak tersentuh task ini.
- `docs/superpowers/ledger-cekdulu-mvp.md` berubah 15:46:17 (sebelum jendela penulisan aturan) — itu catatan Lead, bukan artefak worker.
- `docs/contracts.md` dan `TASKS.md` tidak berubah di jendela Task 4.

Temuan: teritori bersih dalam batas bukti yang tersedia. Keterbatasan metode (tanpa git) dicatat sebagai temuan info, bukan pelanggaran.

---

## Temuan bernomor menurut tingkat keparahan

### Blocker
- Tidak ada.

### Major
- Tidak ada.

### Minor
1. **Celah cakupan uji `rules.test.ts`:** pemeriksaan `source` hanya menegaskan mengandung `http` (bukan domain resmi), dan flag `perlu_verifikasi` tidak ditegaskan oleh uji sama sekali. Cacat data di kedua titik itu akan lolos suite hijau. Saat ini tidak terwujud — pembacaan manual verifier menunjukkan domain resmi dan flag persis seperti klaim laporan — tetapi A4 yang mengonsumsi data ini sebaiknya mengandalkan daftar flag di bagian "Hasil per file" dokumen ini, bukan hanya suite. Bukan alasan FAIL: rencana Task 4 Step 1 hanya mewajibkan uji parsing, cakupan kategori/tema, dan string terlarang, dan ketiganya ditegaskan nyata.

### Info
1. Catatan metode web: dua URL sumber (YouTube Help, TikTok) menjawab 404 untuk HEAD tetapi 200 untuk GET. Klaim HTTP 200 di laporan worker terbukti benar; checker otomatis di masa depan harus memakai GET.
2. Catatan metode teritori: tanpa repo git, kepatuhan wilayah dibuktikan dari cap waktu modifikasi dan daftar isi, bukan dari diff. Bukti yang ada konsisten; tidak ada indikasi sentuhan ke kontrak, klien Meta, atau pipeline bukti.
3. File `copyright.json` dan `legal_id.json` tidak menyediakan field `consequence`. Ini diizinkan skema `RuleFile` (consequence opsional) dan tidak dijanjikan rencana untuk kedua file tersebut; agen runtime perlu membaca `guidance` (yang sudah memuat saran penurunan risiko per segmen/tema) sebagai pengganti.

---

## Kesimpulan

Lima file aturan memenuhi kontrak `RuleFile` dan kunci T-103: versi `2026-10-30.1` / `2026-10-30`, sumber resmi bernama yang terverifikasi hidup, 12 kategori persis per platform dengan konsekuensi yang benar-benar dibedakan per platform, 7 parameter copyright, 9 tema hukum Indonesia dengan `perlu_verifikasi: true` di seluruhnya dan tanpa nomor pasal karangan, serta 0 kemunculan bahasa kepastian terlarang, model non-Meta, klaim real-time, dan kunci API. Suite penuh ter-reproduksi hijau (44/44) dan typecheck bersih. Putusan: **PASS** — Lead dapat mempertimbangkan pemindahan T-103 ke Done.
