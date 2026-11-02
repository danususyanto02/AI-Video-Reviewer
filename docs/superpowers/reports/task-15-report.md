# Laporan Task 15 — Tiga Video Contoh dan Harapan Hasil (T-401)

Task: T-401
Ringkasan: Tiga kasus contoh berlabel (safe, platform-copyright-risk, legal-risk) selesai dibuat di `data/examples/`: video sintetis pendek, bundle bukti tulisan tangan, harapan temuan tulisan manusia, dan uji yang menjalankan enam agen nyata + `mergeReports` nyata dengan `reason` harness khusus uji. Tidak ada selisih harapan vs aktual pada jalur harness; tidak ada kode produk yang diubah.
Wilayah: hanya `data/examples/*` plus laporan ini. Modul produk (kontrak, enam agen, merge) hanya diimpor baca-saja.

## Artefak

| Berkas | Isi |
|---|---|
| `data/examples/safe.mp4` | `testsrc` 320x240 + sine 440 Hz, 8,0 detik, 105.596 byte |
| `data/examples/platform-copyright-risk.mp4` | `testsrc` 320x240 + sine 880 Hz, 10,0 detik, 130.251 byte |
| `data/examples/legal-risk.mp4` | `color` merah tua 320x240 + sine 220 Hz, 10,0 detik, 96.693 byte |
| `data/examples/safe.bundle.json` | Transkrip masak bersih, tanpa isyarat risiko |
| `data/examples/platform-copyright-risk.bundle.json` | Adegan musik pop komersial dominan, adegan putar ulang tanpa transformasi, keyframe `watermark`; tanpa judi |
| `data/examples/legal-risk.bundle.json` | Transkrip klaim obat menyesatkan + transkrip promosi judi, keyframe `license_plate` |
| `data/examples/safe.expected.json` | `must_include: []`, 25 kategori dilarang, hint `aman` |
| `data/examples/platform-copyright-risk.expected.json` | 7 pasangan agen→kategori wajib, 6 kategori dilarang, hint `perlu_perbaikan` |
| `data/examples/legal-risk.expected.json` | 13 pasangan agen→kategori wajib, 7 kategori dilarang, hint `berisiko_tinggi` |
| `data/examples/README.md` | Isi tiap video, bagian pengganti sintetis, dan tempat klaim teks tinggal (bundle) |
| `data/examples/examples.test.ts` | 15 uji: parse bundle, agen nyata + merge nyata via harness uji, status, ffprobe |

Video dibuat dengan ffmpeg repo (`node_modules/ffmpeg-static/ffmpeg.exe`, lavfi `testsrc`/`color` + `sine`, libx264/aac). Teks tidak dibakar ke video: font `drawtext` tidak dianggap andal lintas mesin, jadi klaim teks layar tinggal di bundle pendamping dan dijelaskan di `README.md`.

## Harapan vs aktual per kasus

Harapan ditulis manusia dari isi bundle. Aktual adalah keluaran enam agen nyata (`runYoutubeAgent`, `runTiktokAgent`, `runFacebookAgent`, `runCopyrightAgent`, `runLegalAgent`, `runPackagingPrivacyAgent`) dengan `reason` harness deterministik khusus uji (pencocok kata kunci/isyarat di atas bundle, hanya di `examples.test.ts`), digabung `mergeReports` nyata. Label jujur: **test harness, bukan deteksi model** — deteksi model Meta tidak dibuktikan di sini.

| Kasus | Harapan manusia (must_include) | Aktual harness + merge | Status platform aktual | Selisih |
|---|---|---|---|---|
| safe | Tidak ada temuan; hint `aman` | Semua agen `[]`; copyright `rendah`, legal `rendah`, checklist 0 | YouTube 100 `aman`, TikTok 100 `aman`, Facebook 100 `aman` | Tidak ada |
| platform-copyright-risk | youtube/tiktok/facebook `spam_clickbait_reupload`; copyright `musik_komersial`, `watermark_platform_lain`, `reupload_tanpa_transformasi`; packaging_privacy `spam_clickbait_reupload`; hint `perlu_perbaikan` | Platform: `spam_clickbait_reupload/sedang` x2 per platform; copyright: `musik_komersial/tinggi`, `reupload_tanpa_transformasi/tinggi`, `watermark_platform_lain/sedang`; packaging: `spam_clickbait_reupload/sedang` (fix-nya masuk checklist); legal `[]` | Ketiga platform 70 `perlu_perbaikan`; copyright `tinggi`, legal `rendah`, checklist 4 | Tidak ada |
| legal-risk | youtube/tiktok/facebook `judi`, `misinformasi`, `privasi_data_pribadi`; legal_id `judi_online`, `klaim_menyesatkan_produk_investasi`, `privasi_data_pribadi`; packaging_privacy `privasi_data_pribadi`; hint `berisiko_tinggi` | Platform: `judi/tinggi`, `misinformasi/sedang`, `privasi_data_pribadi/sedang` per platform; legal: `klaim_menyesatkan_produk_investasi/tinggi`, `judi_online/tinggi`, `privasi_data_pribadi/sedang`; packaging: `privasi_data_pribadi/sedang`; copyright `[]`; disclaimer persis `DISCLAIMER` | Ketiga platform 40 `berisiko_tinggi`; copyright `rendah`, legal `tinggi`, checklist 4 | Tidak ada |

Uji tambahan yang lolos: kasus safe tanpa temuan `tinggi` dan status platform hanya `aman`/`perlu_perbaikan`; kasus legal memuat tema hukum + `DISCLAIMER`; setiap `.mp4` ada dan ffprobe membaca durasi 8,0 / 10,0 / 10,0 detik (rentang wajib 1..180 detik).

## Temuan QA

Selisih harapan vs aktual: **0**. Lima catatan QA berikut adalah keterbatasan bukti, bukan selisih yang ditutupi; tidak satu pun diperbaiki dengan mengubah kode produk atau mengedit harapan diam-diam.

1. **QA-15-1 — `packaging_privacy` tidak punya bagian sendiri di `FinalReport`.** Kontrak membekukan laporan final sebagai tiga platform + copyright + legal + checklist, jadi pasangan `packaging_privacy→kategori` hanya bisa diverifikasi pada `AgentResult` dan lewat `fix` temuan itu yang masuk `fix_checklist`. Uji menegaskan persis jalur itu. Pemilik wilayah bila ingin tampil eksplisit: Lead/A5.
2. **QA-15-2 — Deteksi model tidak terbukti.** Yang terverifikasi adalah jalur agen nyata + validasi skema + merge nyata dengan `reason` pencocok kata kunci. Model Meta sungguhan dapat memberi kategori/severity berbeda; kasus ini siap dipakai ulang untuk perbandingan itu tanpa mengubah harapan manusia.
3. **QA-15-3 — Diferensiasi per platform tidak terbukti.** Harness memberi temuan platform yang identik untuk YouTube/TikTok/Facebook, sehingga skor ketiganya selalu sama per kasus. Aturan per platform berbeda di `data/rules/`, tetapi pembuktiannya butuh model nyata atau harness per platform yang lebih kaya. Pemilik: A4/A7.
4. **QA-15-4 — Judul/thumbnail legal-risk dibaca konservatif.** "Ramuan Ajaib Sembuh Total, Bonus Pendaftar Baru!" dan thumbnail klaim sembuh cepat secara manusiawi juga bisa dibaca sebagai clickbait (`spam_clickbait_reupload`). Harapan sengaja tidak mewajibkan dan tidak melarang kategori itu pada kasus legal agar tidak mengunci tafsir; model nyata yang menandainya bukan selisih otomatis. Pemilik keputusan label: Lead/A7.
5. **QA-15-5 — Video adalah pengganti sintetis.** Piksel `testsrc`/`color` dan nada sine tidak mengandung masakan, konser, watermark, plat, atau lagu komersial nyata; seluruh klaim isi tinggal di bundle tulisan tangan. Uji ffprobe hanya membuktikan berkas video terbaca dan durasinya masuk rentang. Pemilik bila video rekaman nyata diinginkan: A7.

## Perintah uji persis dan hasil

- `npm test -- data/examples/examples.test.ts` → lulus: 1 file, 15 uji lulus.
- `npm test` → lulus: 15 file, 203 uji lulus.
- `npm run typecheck` → lulus: `tsc --noEmit` exit 0.
- Pembuatan video: `node_modules\ffmpeg-static\ffmpeg.exe -f lavfi -i testsrc/color... -f lavfi -i sine=... -c:v libx264 -pix_fmt yuv420p -c:a aac` per berkas; verifikasi durasi dengan `node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe -show_entries format=duration` → 8,0 / 10,0 / 10,0 detik.

Penyimpangan: tidak ada dari kontrak. Harapan tidak pernah diedit agar cocok dengan aktual yang salah; satu-satunya penajaman harapan adalah mengeluarkan `spam_clickbait_reupload` dari daftar larangan kasus legal sebelum uji pertama dijalankan, karena judul/thumbnail-nya yang berlebihan membuat larangan itu tidak jujur secara manusiawi (lihat QA-15-4).
Kebutuhan lanjut: tidak ada. Verifikasi verifier terpisah dan pembaruan `TASKS.md` adalah langkah Lead berikutnya.
