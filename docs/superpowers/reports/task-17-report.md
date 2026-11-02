# Laporan Selesai — Task 17 (T-403 Scan Larangan)

Task: T-403
Ringkasan: Checker larangan lomba `scripts/check-prohibitions.mjs` (plain Node, tanpa dependensi) dibuat dan dijalankan atas seluruh repo teks. Hasil bersih: 0 hit di kelas (a), (b), (c), (d), (f) dan PASS di kelas (e). Tidak ada temuan nyata untuk dirutekan; tidak ada file produk yang diubah oleh task ini.
File diubah: `scripts/check-prohibitions.mjs` (baru, satu-satunya file kode task ini), `docs/superpowers/reports/task-17-report.md` (laporan ini). Tidak menyentuh `src/`, `data/rules/`, `data/examples/`, `docs/contracts.md`, `TASKS.md`, atau `AGENTS.md`. Tidak ada commit (workspace tanpa repositori git, konsisten dengan laporan Task 1–16).
Uji dijalankan: `node scripts/check-prohibitions.mjs` (scan resmi, keluaran penuh di bawah); probe penangkapan terkontrol dengan file sementara di `src/` yang ditanam lalu dihapus (bukti checker tidak vakum, diringkas di bawah); `npm test` (suite penuh, checker bukan bagian suite).
Hasil uji: `node scripts/check-prohibitions.mjs` exit `0` / `Result: PASS` dengan hit `(a) 0, (b) 0, (c) 0, (d) 0, (e) PASS, (f) 0` atas 107 file teks sebelum laporan ini ditulis (108 sesudah laporan ini mendarat — file laporan itu sendiri, di bawah `docs/superpowers/**` yang dikecualikan — dengan hit identik nol; lihat catatan sesudah blok keluaran). `npm test` hijau: `Test Files 15 passed (15), Tests 203 passed (203)`. `node --check scripts/check-prohibitions.mjs` exit `0`.
Penyimpangan: tidak ada dari kontrak. Tiga keputusan tuning didokumentasikan di header checker dan di bagian Borderline di bawah: ambang panjang awalan kunci, pengecualian `*.test.*` dari kelas (c), dan strip literal regex untuk kelas (f). Ketiganya mengikuti instruksi task secara eksplisit, bukan perubahan scope.
Kebutuhan lanjut: verifier Muse Wonder 1.0 konteks baru menjalankan ulang `node scripts/check-prohibitions.mjs` dan `npm test`, memvalidasi daftar pengecualian di header checker terhadap `docs/contracts.md` dan `AGENTS.md`, lalu Lead memutuskan Done. Karena hit saat ini nol, gerbang Step 4 rencana Task 17 (nol hit) sudah terpenuhi pada scan ini; scan wajib diulang setelah perbaikan di masa depan mendarat.

---

## 1. Artefak checker

File: `scripts/check-prohibitions.mjs` — plain Node (`node:fs`, `node:path`, `node:url` saja), tanpa dependensi, tanpa akses jaringan. Root repo diturunkan dari lokasi script (`scripts/..`), jadi perintah bekerja dari direktori mana pun selama dipanggil sebagai `node scripts/check-prohibitions.mjs`. Setiap hit dicetak sebagai `file:line` dan proses keluar non-nol bila ada hit atau disclaimer FAIL; nol bila bersih.

Kepala script menyatakan daftar pengecualian secara eksplisit (syarat task). Ringkasannya:

| Kelas | Pola | Cakupan file | Pengecualian |
|---|---|---|---|
| (a) Model non-Meta | `YOLO`, `Whisper`, `OpenAI`, `Google Vision`, `ElevenLabs` (case-insensitive) | Semua file teks repo | `docs/superpowers/plans/2026-10-30-cekdulu-mvp.md` (file rencana ini), `AGENTS.md`, `TASKS.md`, `docs/contracts.md`, `docs/superpowers/**`, `scripts/check-prohibitions.mjs` (checker sendiri; wajib menyebut pola untuk mencarinya) |
| (b) Kunci asli | `META_API_KEY=` bernilai non-placeholder; awalan `sk-…` (20+ char), `gsk_…` (20+ char), `AKIA…` (16 char) | Sama dengan (a) | Pengecualian ledger yang sama (file itu mendeskripsikan pola dalam prosa, bukan berisi rahasia). Nilai kosong/placeholder/contoh di `.env.example` tidak pernah hit (lihat tuning di bawah) |
| (c) Klaim real-time | `real-time`, `realtime`, `real time`, `live detection`, `deteksi langsung` (case-insensitive) | Hanya copy yang menghadap pengguna: `src/app/**` + `src/components/**` + `data/rules/**` + `data/examples/*.md`, tanpa `*.test.*` | Komentar kode tentang batch di `src/lib/**`, `scripts/`, dan dokumen ledger bukan copy pengguna sehingga di luar cakupan (pembenaran di header). File uji dikecualikan karena bukan copy terbit; `vi.useRealTimers()` adalah nama API fake-timer Vitest, bukan klaim |
| (d) Bahasa kepastian | `pasti bebas`, `pasti melanggar`, `aman secara hukum` (case-insensitive, toleran spasi) | `src/**` + `data/**` | `*.test.*` dikecualikan: uji yang menjaga larangan ini wajib memuat string itu sebagai literal untuk menegaskan ketiadaannya (mis. daftar `BANNED` di `data/rules/rules.test.ts`); mem-flag penjaga itu sendiri akan menghukum perlindungannya. Juga dikecualikan `docs/superpowers/**`, `AGENTS.md`, `TASKS.md`, `docs/contracts.md` (mengutip larangan; di luar cakupan `src+data` dalam hal apa pun) dan checker sendiri |
| (e) Disclaimer | Bukan scan hit; cek PASS/FAIL | `src/lib/contracts/schemas.ts` + UI di `src/app/**`, `src/components/**` | PASS mensyaratkan `DISCLAIMER` diekspor dengan kalimat kontrak persis DAN dirujuk UI laporan. `FinalReport.legal_id.disclaimer` bertipe literal itu di skema |
| (f) Karangan pasal | `/pasal\s*\d+/i` (longgar; menangkap juga `Pasal28` tanpa spasi, menutup low terparkir Task 10) | `src/**` + `data/**` TERMASUK file uji | Literal regex penjaga seperti `/Pasal\s+\d+/i` dan konstanta `PASAL_PATTERN` bukan karangan. Pendekatan kasar terdokumentasi: tiap baris distrip dari literal regex `/.../` lalu baris berisi fragmen escape (`\s`, `\d`) atau nama `PASAL_PATTERN` dilewati sebagai definisi pola; regex pasal hanya diterapkan ke baris bersih. Konstruksi string `["Pasal", "28"].join(" ")` juga tidak pernah match karena tidak ada urutan literal pasal+digit di teks sumber |

Pengabaian global semua kelas: direktori `node_modules/`, `.next/`, `.git/`; file tergenerasi `package-lock.json` dan `tsconfig.tsbuildinfo` (hash lockfile dan daftar file build bukan copy sumber; kebenaran dependensi adalah `package.json`, yang DIPINDAI); file biner (denylist ekstensi + sniff byte NUL, sehingga `.mp4` contoh tidak pernah dibaca sebagai teks).

### Tuning kelas (b) — placeholder tidak boleh hit

Fungsi `isPlaceholderValue` menormalkan nilai sesudah `META_API_KEY=` (membuka quote/backtick, mengambil token pertama, membuang `;` ekor) lalu menggolongkannya sebagai placeholder bila: kosong; hanya tanda baca (mis. backtick kutipan dokumentasi); ada di himpunan persis (`placeholder`, `example`, `test`, `mock`, `changeme`, `your-api-key`, `xxx`, `...`, `todo`, `none`, `null`, dst.); mengandung `example`/`placeholder`/`your-`/`your_`/`changeme`/`insert`/`replace`; berbentuk kurung sudut `<...>`; ekspansi `${...}`/`$...`; deretan `xxx`; atau berawalan `test-`/`mock-`/`fake-`/`dummy-`/`sample-`. Setiap penugasan placeholder yang dilewati tetap dicetak checker di bagian Borderline agar tuning bisa diaudit, tetapi tidak dihitung sebagai hit. Awalan kunci memakai ambang panjang (`sk-`/`gsk_` + 20 char, `AKIA` + 16 char) supaya substring pendek pada kata biasa — `risk-card`, `task-*`, nama file — tidak pernah hit, dan kutipan dokumentasi `sk-…` (elipsis) tetap di bawah ambang.

## 2. Keluaran scan penuh (bukti resmi)

Perintah persis: `node scripts/check-prohibitions.mjs` (exit `0`). Keluaran verbatim:

```text
CekDulu prohibition scan (T-403)
Repo root: F:\PC\Project\hackathon\ide\video analisa\app
Text files scanned: 107 (node_modules/, .next/, .git/, binary and generated files skipped)
Exclusions (a)/(b): docs/superpowers/plans/2026-10-30-cekdulu-mvp.md, AGENTS.md, TASKS.md, docs/contracts.md, docs/superpowers/**, scripts/check-prohibitions.mjs

(a) Non-Meta model names [YOLO|Whisper|OpenAI|Google Vision|ElevenLabs]: 0 hit(s)
  (none)
(b) Real API-key material [META_API_KEY non-placeholder + sk-/gsk_/AKIA prefixes]: 0 hit(s)
  (none)
(c) Real-time claims in user-facing copy [src/app + src/components + data/rules + data/examples/*.md, tests excluded]: 0 hit(s)
  (none)
(d) Certainty wording in source+data [tests excluded]: 0 hit(s)
  (none)
(e) Disclaimer presence: PASS (DISCLAIMER in src/lib/contracts/schemas.ts; UI refs: src/app/page.tsx:7, src/app/page.tsx:96, src/app/report/page.tsx:5, src/app/report/page.tsx:164, src/app/report/page.tsx:190, src/components/report.test.tsx:7, src/components/report.test.tsx:67, src/components/report.test.tsx:68, src/components/wiring.test.tsx:7, src/components/wiring.test.tsx:148, src/components/wiring.test.tsx:196)
(f) Pasal invention guard [/pasal\s*\d+/i over src+data incl. tests, guard literals stripped]: 0 hit(s)
  (none)

Summary (hit counts per class):
  (a) 0
  (b) 0
  (c) 0
  (d) 0
  (e) PASS
  (f) 0

Borderline (b) placeholder assignments skipped as non-hits (1):
  .env.example:3: META_API_KEY=
Borderline notes:
  - .env.example ships empty META_API_KEY=/META_BASE_URL=/META_MOCK= values; they are placeholders by the rule above and never hit. Any future non-empty, non-placeholder assignment there WILL hit.
  - src/lib/meta/config.ts reads process.env.META_API_KEY (no '=' assignment) and src/lib/meta/client.ts only mentions the variable name in an error message; neither is an assignment and neither hits.
  - Key-prefix patterns require 20+ chars after sk-/gsk_ (16 after AKIA), so risk-card, task-*, and file names can never hit; docs quoting 'sk-...' with an ellipsis stay below the threshold.
  - src/components/wiring.test.tsx vi.useRealTimers() contains the substring 'realtime' but is test harness, excluded from (c) as non-copy; it is not a user-facing real-time claim.
  - Certainty literals inside *.test.* (for example data/rules/rules.test.ts BANNED list) are the absence guard and are excluded from (d) by design.
  - Pasal guard definitions (/Pasal\s+\d+/i, PASAL_PATTERN) are stripped/skipped in (f); a literal 'Pasal 28' or 'Pasal28' in src/data would still hit.

Total hits (a+b+c+d+f): 0; disclaimer: PASS
Result: PASS
```

Catatan penghitungan file: blok di atas adalah scan resmi sebelum file laporan ini ada (107 file). Menjalankan ulang perintah yang sama sesudah laporan ini mendarat melaporkan `Text files scanned: 108` — tambahan satu-satunya adalah `docs/superpowers/reports/task-17-report.md` itu sendiri, yang berada di bawah pengecualian `docs/superpowers/**` untuk (a)/(b) dan di luar cakupan (c)/(d)/(f) — dengan hit per kelas identik `(a) 0, (b) 0, (c) 0, (d) 0, (e) PASS, (f) 0`, total `0`, `Result: PASS`, exit `0` (dijalankan ulang dan teramati pada sesi ini). Verifier yang menjalankan ulang harus mengharapkan 108, bukan 107, selama laporan ini ada.

Catatan disclaimer (e): rujukan produksi saja sudah memenuhi syarat tanpa file uji — `src/app/page.tsx:96` dan `src/app/report/page.tsx:164,190` merender `DISCLAIMER`; rujukan di `report.test.tsx`/`wiring.test.tsx` hanya bukti tambahan. Kalimat yang dicocokkan persis: `Skrining awal, bukan keputusan platform, bukan Content ID, dan bukan nasihat hukum.` di `src/lib/contracts/schemas.ts`.

## 3. Tabel hit per kelas

| Kelas | Pemeriksaan | Hit | Hasil |
|---|---|---|---|
| (a) | Nama model non-Meta (`YOLO`/`Whisper`/`OpenAI`/`Google Vision`/`ElevenLabs`) | 0 | Bersih |
| (b) | Kunci asli (`META_API_KEY=` non-placeholder + awalan `sk-`/`gsk_`/`AKIA`) | 0 | Bersih (1 placeholder `.env.example:3` dilewati dengan benar) |
| (c) | Klaim real-time pada copy pengguna | 0 | Bersih |
| (d) | Bahasa kepastian pada sumber + data | 0 | Bersih |
| (e) | Kehadiran disclaimer (cek PASS/FAIL) | — | PASS |
| (f) | Karangan pasal (`pasal\s*\d+`) pada `src` + `data` | 0 | Bersih |
| **Total** | Hit (a)+(b)+(c)+(d)+(f) | **0** | **Findings: 0** |

File teks terpindai: 107 pada scan resmi di atas (108 pada jalan-ulang sesudah laporan ini mendarat; lihat catatan penghitungan). Tidak ada `file:line` hit untuk dirutekan pada scan ini. Task ini tidak memperbaiki apa pun di luar checker, sesuai wilayahnya.

## 4. Rutekan temuan ke wilayah pemilik

Temuan nyata pada scan ini: **0**. Tidak ada task perbaikan yang dibuka dari scan ini.

Agar putusan verifier dan perbaikan di masa depan tidak menebak pemilik, peta rutekan yang akan dipakai checker bila hit muncul adalah peta kepemilikan `AGENTS.md` / `docs/contracts.md`:

| Wilayah file bila hit | Pemilik (rutekan via Lead) | Kelas yang paling mungkin |
|---|---|---|
| `src/lib/contracts/` | Lead | (a), (d), (e), (f) |
| `src/lib/meta/`, `.env.example`, `package.json` | A1 | (a), (b) |
| `src/lib/evidence/` | A2 | (a), (c), (f) |
| `data/rules/` | A3 | (a), (c), (d), (f) |
| `src/lib/agents/youtube.ts` / `tiktok.ts` / `facebook.ts` / `copyright.ts` / `legal_id.ts` / `packaging_privacy.ts` | A4 (satu modul satu pemilik) | (a), (c), (d), (f) |
| `src/lib/merge/` | A5 | (d), (e) |
| `src/lib/jobs/`, `src/app/api/` | Lead (T-302) | (a), (b), (c) |
| `src/app/`, `src/components/` | A6 (route API bersama Lead) | (c), (d), (e) |
| `data/examples/` | A7 | (a), (c), (d), (f) |

Task ini sendiri hanya memiliki `scripts/check-prohibitions.mjs`; setiap hit di luar file itu adalah milik wilayah pada tabel di atas dan hanya boleh diperbaiki pemiliknya lewat Lead.

## 5. Bukti checker tidak vakum (probe terkontrol)

Scan bersih saja tidak membuktikan checker mampu menangkap pelanggaran. Dua probe file sementara ditanam di dalam repo, checker dijalankan, lalu file dihapus pada sesi yang sama (tidak ada residu; pemeriksaan `Get-ChildItem *\__t403\*` kosong sesudahnya dan scan akhir kembali 107 file / PASS):

1. Probe pelanggaran (`src/__t403_probe__.ts` berisi `YOLO whisper`, `META_API_KEY=` bernilai kunci contoh, `pasti bebas`, `Pasal28`; `src/app/__t403_probe__.tsx` berisi `real-time deteksi langsung`): checker melaporkan `(a) 2, (b) 2, (c) 1, (d) 1, (f) 1`, total `7`, `Result: FAIL`, exit `1`, masing-masing dengan `file:line` yang benar. Ini membuktikan kelas (f) menangkap bentuk tanpa spasi `Pasal28` yang lolos dari pola lama Task 10.
2. Probe negatif (`src/lib/__t403_probe2__.ts` berisi komentar `realtime` di luar cakupan (c), `META_API_KEY=your-api-key-here`, dan literal penjaga `/Pasal\s+\d+/i`; `src/lib/__t403_probe2__.test.ts` berisi literal `pasti bebas`/`pasti melanggar` dan pola pasal penjaga): checker tetap `(a) 0, (b) 0, (c) 0, (d) 0, (f) 0`, exit `0`, dan mencatat penugasan placeholder probe sebagai borderline yang dilewati (bukan hit). Ini membuktikan tuning placeholder, cakupan (c), pengecualian uji (d), dan strip penjaga (f) bekerja dua arah.

## 6. Borderline yang dilaporkan (bukan temuan)

| Kasus | Lokasi | Keputusan | Alasan |
|---|---|---|---|
| Penugasan kosong | `.env.example:3` (`META_API_KEY=`) | Bukan hit (dilewati, dicetak sebagai borderline) | Placeholder kosong persis seperti syarat task; nilai non-kosong non-placeholder apa pun di file itu di masa depan AKAN hit |
| Baca env, bukan penugasan | `src/lib/meta/config.ts` (`process.env.META_API_KEY`), `src/lib/meta/client.ts` (nama variabel di pesan error) | Bukan hit | Tidak ada bentuk `META_API_KEY=<nilai>`; membaca env adalah pola yang diwajibkan kontrak |
| Substring timer uji | `src/components/wiring.test.tsx:21` (`vi.useRealTimers()`) | Di luar cakupan (c) | File uji bukan copy terbit; substring `realtime` berasal dari nama API Vitest. Verifier pendahulu mencatat hal yang sama sebagai positif palsu |
| Literal penjaga kepastian | `data/rules/rules.test.ts:34` dan pembangunan frasa via `join` di agen | Di luar cakupan (d) untuk `*.test.*`; konstruksi `join` tidak membentuk literal | Keduanya adalah penjaga ketiadaan itu sendiri; mem-flag-nya akan menghukum perlindungan. Verifier wajib mengonfirmasi asersi itu benar-benar menegaskan ketiadaan |
| Definisi penjaga pasal | `src/lib/agents/legal_id.ts:19`, `legal_id.test.ts:80`, `data/rules/rules.test.ts:120` (`/Pasal\s+\d+/i`) | Dilewati oleh strip literal regex di (f) | Pola penjaga, bukan nomor pasal karangan. Literal `Pasal 28`/`Pasal28` sungguhan tetap hit (terbukti di probe 1) |
| Kutipan larangan di dokumen demo | `docs/demo-script.md` (frasa kepastian dan real-time hanya di bagian larangan ucap) | Di luar cakupan (c)/(d) | Naskah demo bukan `src`/`data` dan kemunculannya adalah larangan, bukan klaim. Bila Lead ingin naskah demo ikut gerbang, perluasan cakupan adalah keputusan Lead, bukan perubahan diam-diam di task ini |

## 7. Hasil suite

Perintah: `npm test`. Hasil: `Test Files 15 passed (15)`, `Tests 203 passed (203)` — tetap hijau, identik dengan gerbang Task 16. Checker berada di `scripts/` dan tidak termasuk pola uji Vitest, jadi suite tidak berubah oleh task ini (sesuai syarat). Peringatan `configLoader` Vitest pada keluaran adalah peringatan kosmetik yang sudah terparkir sejak Task 2, bukan kegagalan.

Ulangi gerbang ini kapan pun dengan:

```powershell
node scripts/check-prohibitions.mjs
npm test
```
