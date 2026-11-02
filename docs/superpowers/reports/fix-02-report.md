# Laporan FIX-2 — Job store bersama + resolusi binary server

Task: FIX-2 (PART A wilayah jobs `src/lib/jobs/store.ts`; PART B wilayah A1 `next.config.ts`, otorisasi Lead)
Status worker: selesai (menunggu verifikasi terpisah)

## Konteks akar masalah

Dua cacat kecil yang saling terkait di jalur server produksi/dev:

1. **Job store terpisah per instance modul.** Di Next dev, modul route dapat di-instansiasi ulang sehingga `const jobs = new Map()` di level modul menghasilkan Map berbeda antara instance POST `/api/analyze` (yang memanggil `createJob`) dan instance GET `/api/jobs/[id]` (yang memanggil `getJob`). Akibatnya job yang baru dibuat dapat 404 pada GET pertama, walau logika store-nya sendiri benar.
2. **Binary paket terbundel webpack.** `ffmpeg-static`/`ffprobe-static` mengembalikan path berbasis `__dirname`. Bila webpack membundel `index.js` mereka ke `.next/server/...`, path itu menunjuk folder build, bukan `node_modules/...`, sehingga `existsSync` di `resolveFfmpegPath()`/`resolveFfprobePath()` gagal dan kode jatuh ke `"ffmpeg"`/`"ffprobe"` di PATH. Di mesin ini PATH berisi Gyan FFmpeg 8.1.1, sehingga jalur server diam-diam bergantung pada ffmpeg sistem, bukan binary paket. (Lihat juga konteks di laporan FIX-1: perbedaan binary inilah pemicu gejala API pada video 1 detik.)

FIX-2 memperbaiki keduanya di akar tanpa mengubah urutan resolusi di `src/lib/evidence/*` dan tanpa mengubah kontrak di `docs/contracts.md`.

## Perubahan

### PART A — `src/lib/jobs/store.ts`

Map kini didukung oleh `globalThis` sehingga bertahan lintas re-instansiasi modul:

```ts
const globalRef = globalThis as typeof globalThis & {
  __cekduluJobs?: Map<string, JobSnapshot>;
};
const jobs: Map<string, JobSnapshot> =
  globalRef.__cekduluJobs ?? (globalRef.__cekduluJobs = new Map<string, JobSnapshot>());
```

Signatur `createJob`/`getJob`/`updateJob` dan perilaku klon snapshot (`cloneSnapshot`, salinan `progress` per item, deep-clone `report` via JSON) tidak berubah sama sekali. Satu-satunya perbedaan adalah sumber Map: instance modul mana pun membaca/menulis Map yang sama di `globalThis.__cekduluJobs`.

### PART B — `next.config.ts` (A1, otorisasi Lead)

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
};

export default nextConfig;
```

`serverExternalPackages` (kunci konfigurasi Next 15 App Router) membuat kedua paket dimuat sebagai `require` eksternal saat runtime, bukan dibundel webpack, sehingga `__dirname` mereka tetap menunjuk `node_modules/...` dan path absolut dari paket lolos `existsSync`. Bentuk konfigurasi lain dipertahankan (sebelumnya objek kosong). Urutan resolusi di `src/lib/evidence/extract.ts`/`validate.ts` (`FFMPEG_PATH`/`FFPROBE_PATH` → path paket bila ada → fallback nama PATH) sengaja tidak diubah.

### Tes — `src/lib/jobs/analyze.test.ts`

Ditambah satu tes di describe `job store — logika store tanpa server`:

> `dua instance store (re-instantiation modul) berbagi state via globalThis`

Tes mensimulasikan re-instansiasi secara jujur dengan `vi.resetModules()` + `await import("./store")` (bukan dua referensi ke modul yang sama):

- Job dibuat + `updateJob({ error: "penanda-dari-instance-pertama" })` lewat instance pertama (impor statis di atas berkas), lalu setelah `vi.resetModules()` instance kedua hasil impor dinamis wajib melihat `error` yang sama dan `progress` 6 agen.
- Sebaliknya job dari instance kedua wajib terlihat di instance pertama.
- Klon snapshot tetap berlaku lintas instance: mutasi hasil `getJob` tidak mengubah isi store.
- `(globalThis as ...).__cekduluJobs` wajib berupa `Map` yang memuat kedua id job.

`vi.resetModules()` tidak terbukti flaky di setup ini (Node environment, store tanpa dependensi berat selain tipe kontrak), jadi tidak dipakai assertion pengganti yang lebih lemah. Tes ditempatkan sebelum describe route handler; handler yang sudah ter-impor statis tetap menunjuk Map global yang sama, sehingga tes rute sesudahnya tidak terpengaruh (terbukti oleh suite penuh hijau di bawah).

File yang diubah persis tiga berkas kode + laporan ini:

- `src/lib/jobs/store.ts`
- `next.config.ts`
- `src/lib/jobs/analyze.test.ts`
- `docs/superpowers/reports/fix-02-report.md` (laporan ini)

Skrip bukti sementara `fix02-e2e.ps1` dibuat untuk menjalankan server lalu dihapus; bukan bagian deliverable. Tanpa git.

## Perintah uji dan hasil

| Perintah | Hasil |
|---|---|
| `npm test` | **Test Files 14 passed (14), Tests 188 passed (188)** (sebelumnya 187; +1 tes FIX-2). Termasuk `src/lib/jobs/analyze.test.ts (14 tests)` hijau, di antaranya tes berbagi state baru. |
| `npm run typecheck` | exit 0, tanpa output error (`tsc --noEmit`). |
| `npm run build` | Sukses: `Compiled successfully`, 6/6 halaman statis, rute `/api/analyze` dan `/api/jobs/[id]` ƒ (dynamic) 127 B. |

Bukti bundel sesudah PART B (inspeksi `.next/server/app/api/analyze/route.js`): kedua paket kini eksternal —

```text
a.exports=require("ffprobe-static")
a.exports=require("ffmpeg-static")
g.__cekduluJobs??(g.__cekduluJobs=new Map)   // store global ikut terbukti di bundle
```

sebelumnya (konteks FIX-1) path paket di dalam bundle menunjuk `.next/server/...` dan `Test-Path .../ffmpeg.exe` = False.

## Bukti ujung-ke-ujung tanpa ffmpeg PATH

Tujuan: membuktikan binary statik ter-resolve di dalam server tanpa bantuan ffmpeg sistem.

Persiapan berkas uji 1 detik (dibangkitkan langsung dari binary paket, bukan ffmpeg PATH):

```text
node_modules/ffmpeg-static/ffmpeg.exe -y -f lavfi -i testsrc=duration=1:size=320x240:rate=10
  -f lavfi -i sine=frequency=1000:duration=1 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest
  -> %TEMP%\cekdulu-fix02-1s.mp4 (17.256 byte, ffmpeg-static 6.1.1)
```

Server dijalankan sebagai `npm start -- -p 3103` dengan `META_MOCK=1`. PATH untuk proses server saja disanitasi: entri `...\Gyan.FFmpeg...\ffmpeg-8.1.1-full_build\bin` dibuang, entri lain (termasuk `C:\Program Files\nodejs\`) dipertahankan. Verifikasi di lingkungan server sebelum start: `ffmpeg visible to server env: False`, `ffprobe visible to server env: False` (di shell normal keduanya ter-resolve ke Gyan 8.1.1). Proses anak mewarisi salinan PATH tersanitasi itu; PATH shell induk dipulihkan segera sesudah start sehingga klien `curl.exe` tidak terpengaruh.

Keluaran persis (diringkas hanya pada banner Next):

```text
gyan in orig PATH: True
gyan in sanitized PATH: False
nodejs in sanitized: True
ffmpeg visible to server env: False
ffprobe visible to server env: False
starting server: npm start -- -p 3103 (META_MOCK=1, PATH without Gyan)
GET / attempt 0 status=200
POST .../cekdulu-fix02-1s.mp4 to /api/analyze
POST response: {"job_id":"b3251bb6-0885-405d-b020-5d1fa4e2a2b4"}
poll 0 error= reportNull=False states=youtube=done,tiktok=done,facebook=done,copyright=done,legal_id=done,packaging_privacy=done
terminal error: (null)
terminal reportNull: False
platforms count: 3
agent_statuses: youtube=selesai,tiktok=selesai,facebook=selesai,copyright=selesai,legal_id=selesai,packaging_privacy=selesai
rules_version: 2026-10-30.1
E2E_RESULT=REPORT_COMPLETE
```

Artinya: tanpa ffmpeg/ffprobe di PATH server, `probeDuration` + ekstraksi tetap berhasil (hanya mungkin lewat `node_modules/ffprobe-static/.../ffprobe.exe` dan `node_modules/ffmpeg-static/ffmpeg.exe`), keenam agen selesai, dan laporan final lengkap kembali pada polling pertama. Seandainya resolusi paket masih rusak, fallback `"ffmpeg"` akan ENOENT dan terminal akan berisi `error` ekstraksi, bukan laporan.

Sesudah bukti, pohon proses server dimatikan (`taskkill /PID <pid> /T /F`, 4 proses termasuk anak `next start`) dan diverifikasi: `port 3103 listeners after kill: 0` (dicek ulang terpisah: 0 listener). Port 3105 yang terisi proses lain di mesin ini tidak disentuh.

Catatan kejujuran cakupan: pembedahan PATH dilakukan persis seperti direncanakan (bukan pengganti), jadi tidak ada sisa yang belum terbukti untuk klaim di atas. Yang tidak diklaim: perilaku di Next dev (HMR) hanya dibuktikan lewat tes re-instansiasi modul, bukan lewat server dev yang di-boot manual; klaim produksi di atas berdiri pada `next start` hasil `npm run build`.

## Format laporan selesai

```text
Task: FIX-2
Ringkasan: Job store kini berbagi satu Map lewat globalThis.__cekduluJobs sehingga POST/GET lintas instance modul tidak lagi 404, dan ffmpeg-static/ffprobe-static menjadi serverExternalPackages sehingga path paket valid di dalam server tanpa bergantung pada ffmpeg PATH.
File diubah: src/lib/jobs/store.ts (Map global), next.config.ts (serverExternalPackages), src/lib/jobs/analyze.test.ts (+1 tes re-instantiation via vi.resetModules), docs/superpowers/reports/fix-02-report.md (laporan ini). Skrip e2e sementara dibuat lalu dihapus. Tidak menyentuh src/lib/evidence resolusi, kontrak, agen, UI, atau TASKS.md; tanpa git.
Uji dijalankan: npm test penuh, npm run typecheck, npm run build + inspeksi bundle eksternal, e2e npm start -p 3103 META_MOCK=1 dengan PATH server tanpa direktori Gyan (POST mp4 1 detik dari ffmpeg-static, poll ke terminal), taskkill + cek port bebas.
Hasil uji: npm test 14 files/188 passed; typecheck exit 0; build sukses; e2e REPORT_COMPLETE (error null, 6 agen done/selesai, rules_version 2026-10-30.1) tanpa ffmpeg/ffprobe terlihat di PATH server; port 3103 bebas sesudahnya.
Penyimpangan: Tidak ada dari kontrak. next.config.ts adalah wilayah A1 dan diubah hanya atas otorisasi Lead sesuai task; urutan resolusi evidence tidak diubah.
Kebutuhan lanjut: Tidak ada.
```
