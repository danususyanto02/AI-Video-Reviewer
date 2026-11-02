# Putusan Verifier — Task 17 (T-403 Scan Larangan)

**Putusan: PASS**

Verifier: Muse Wonder 1.0, konteks baru (tidak mengerjakan task ini). Tanggal verifikasi: sesi ini. Tidak ada kode produk yang diperbaiki oleh verifier; satu-satunya file yang ditulis verifier adalah putusan ini. Probe mutasi dibuat di `src/` lalu dihapus pada sesi yang sama.

Ringkasan bukti satu baris: checker bersih exit 0 `(a)0 (b)0 (c)0 (d)0 (e)PASS (f)0` atas 108 file; probe mutasi ditangkap exit 1 dengan hit bernama probe di (a),(b),(d),(f) dan (c)=0 yang benar secara cakupan; sesudah probe dihapus checker kembali exit 0; `npm test` 203/203; grep independen atas `src`+`data` nol di luar konteks penjaga uji.

---

## 1. Jalan ulang resmi (perintah persis dari laporan)

Perintah: `node scripts/check-prohibitions.mjs`. Catatan metode: setiap pemanggilan diakhiri `Write-Host "EXIT_CODE=$LASTEXITCODE"` pada shell yang sama, jadi nilai `EXIT_CODE=` di bawah adalah kode keluar checker itu sendiri.

### 1a. Jalan bersih pertama — exit 0

```text
CekDulu prohibition scan (T-403)
Repo root: F:\PC\Project\hackathon\ide\video analisa\app
Text files scanned: 108 (node_modules/, .next/, .git/, binary and generated files skipped)
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
EXIT_CODE=0
```

Hit per kelas jalan bersih: (a) 0, (b) 0, (c) 0, (d) 0, (e) PASS, (f) 0. Jumlah file 108 sesuai catatan laporan sesudah laporan Task 17 mendarat.

Perintah: `npm test`. Hasil: exit 0, `Test Files 15 passed (15)`, `Tests 203 passed (203)` — sesuai harapan 203/203.

Perintah tambahan: `node --check scripts/check-prohibitions.mjs` exit 0.

## 2. Bukti mutasi (penentu: checker yang lulus semua bisa saja rusak)

Probe dibuat persis seperti yang diperintahkan: file `src/__probe_prohibitions.txt` (di root `src/`, bukan di direktori terkecuali) berisi dua baris:

```text
OpenAI pasti bebas Pasal 12 real-time
META_API_KEY=sk-probe123456
```

### 2a. Jalan dengan probe — exit 1, FAIL, probe dinamai

```text
CekDulu prohibition scan (T-403)
Repo root: F:\PC\Project\hackathon\ide\video analisa\app
Text files scanned: 109 (node_modules/, .next/, .git/, binary and generated files skipped)
Exclusions (a)/(b): docs/superpowers/plans/2026-10-30-cekdulu-mvp.md, AGENTS.md, TASKS.md, docs/contracts.md, docs/superpowers/**, scripts/check-prohibitions.mjs

(a) Non-Meta model names [YOLO|Whisper|OpenAI|Google Vision|ElevenLabs]: 1 hit(s)
  src/__probe_prohibitions.txt:1: [(a)] OpenAI -- OpenAI pasti bebas Pasal 12 real-time
(b) Real API-key material [META_API_KEY non-placeholder + sk-/gsk_/AKIA prefixes]: 1 hit(s)
  src/__probe_prohibitions.txt:2: [(b)] META_API_KEY with non-placeholder value -- META_API_KEY=[REDACTED]
(c) Real-time claims in user-facing copy [src/app + src/components + data/rules + data/examples/*.md, tests excluded]: 0 hit(s)
  (none)
(d) Certainty wording in source+data [tests excluded]: 1 hit(s)
  src/__probe_prohibitions.txt:1: [(d)] pasti bebas -- OpenAI pasti bebas Pasal 12 real-time
(e) Disclaimer presence: PASS (DISCLAIMER in src/lib/contracts/schemas.ts; UI refs: src/app/page.tsx:7, src/app/page.tsx:96, src/app/report/page.tsx:5, src/app/report/page.tsx:164, src/app/report/page.tsx:190, src/components/report.test.tsx:7, src/components/report.test.tsx:67, src/components/report.test.tsx:68, src/components/wiring.test.tsx:7, src/components/wiring.test.tsx:148, src/components/wiring.test.tsx:196)
(f) Pasal invention guard [/pasal\s*\d+/i over src+data incl. tests, guard literals stripped]: 1 hit(s)
  src/__probe_prohibitions.txt:1: [(f)] pasal + digits -- OpenAI pasti bebas Pasal 12 real-time

Summary (hit counts per class):
  (a) 1
  (b) 1
  (c) 0
  (d) 1
  (e) PASS
  (f) 1

Borderline (b) placeholder assignments skipped as non-hits (1):
  .env.example:3: META_API_KEY=
Borderline notes:
  - .env.example ships empty META_API_KEY=/META_BASE_URL=/META_MOCK= values; they are placeholders by the rule above and never hit. Any future non-empty, non-placeholder assignment there WILL hit.
  - src/lib/meta/config.ts reads process.env.META_API_KEY (no '=' assignment) and src/lib/meta/client.ts only mentions the variable name in an error message; neither is an assignment and neither hits.
  - Key-prefix patterns require 20+ chars after sk-/gsk_ (16 after AKIA), so risk-card, task-*, and file names can never hit; docs quoting 'sk-...' with an ellipsis stay below the threshold.
  - src/components/wiring.test.tsx vi.useRealTimers() contains the substring 'realtime' but is test harness, excluded from (c) as non-copy; it is not a user-facing real-time claim.
  - Certainty literals inside *.test.* (for example data/rules/rules.test.ts BANNED list) are the absence guard and are excluded from (d) by design.
  - Pasal guard definitions (/Pasal\s+\d+/i, PASAL_PATTERN) are stripped/skipped in (f); a literal 'Pasal 28' or 'Pasal28' in src/data would still hit.

Total hits (a+b+c+d+f): 4; disclaimer: PASS
Result: FAIL
EXIT_CODE=1
```

Penilaian mutasi: WAJIB terpenuhi — exit non-nol (1), `Result: FAIL`, dan probe dinamai dengan `file:line` yang benar di kelas (a) baris 1, (b) baris 2, (d) baris 1, (f) baris 1. Kelas (c)=0 adalah perilaku yang BENAR, bukan kebutaan: probe berada di `src/__probe_prohibitions.txt`, di luar cakupan (c) yang hanya `src/app/**` + `src/components/**` + `data/rules/**` + `data/examples/*.md`, sehingga kata `real-time` pada probe memang tidak boleh hit (c). Kelas (b) tertangkap lewat sub-cek penugasan `META_API_KEY=` non-placeholder; awalan `sk-` pada probe hanya 11 karakter sesudah awalan sehingga di bawah ambang 20+ sub-cek awalan — lihat Temuan Info-2. Checker terbukti tidak vakum.

### 2b. Sesudah probe dihapus — exit 0, probe tidak ada

Perintah: `Remove-Item src\__probe_prohibitions.txt`, lalu `Test-Path` melaporkan `False`, lalu checker dijalankan ulang:

```text
probe exists after delete: False
CekDulu prohibition scan (T-403)
Repo root: F:\PC\Project\hackathon\ide\video analisa\app
Text files scanned: 108 (node_modules/, .next/, .git/, binary and generated files skipped)
Exclusions (a)/(b): docs/superpowers/plans/2026-10-30-cekdulu-mvp.md, AGENTS.md, TASKS.md, docs/contracts.md, docs/superpowers/**, scripts/check-prohibitions
...[truncated 6379 chars]