# AGNIBHŪMĪ — Menyatukan MODIS dan VIIRS Jadi Satu Riwayat Karhutla

**NASA Space Apps Challenge 2026 — "Harmonization of MODIS and VIIRS Hot Spots"**

Live Operator View: `/operator` · Live Community View: `/community` · Peta interaktif: `/map`

---

AGNIBHŪMĪ adalah platform web untuk petugas pemantau kebakaran hutan dan lahan (karhutla), ilmuwan, dan pengelola lahan — serta, sebagai kapabilitas pendukung untuk konteks Indonesia, warga yang tinggal dekat area rawan kebakaran. AGNIBHŪMĪ menyelaraskan deteksi titik panas MODIS dan VIIRS menjadi satu catatan kejadian, membangunnya menjadi kalender aktivitas kebakaran berbasis arsip nyata 26 tahun (2000–2026), membandingkan kondisi hari ini dengan baseline historis per wilayah, dan menghubungkan laporan visual warga ke deteksi satelit terdekat untuk mempercepat verifikasi lapangan. Tujuannya menjawab langsung tantangan resmi NASA: satelit sudah merekam titik panas selama lebih dari dua dekade, tapi rekamannya terpecah per sensor dan tidak mudah dibandingkan — AGNIBHŪMĪ menyatukan rekaman itu menjadi satu bahasa yang bisa dibaca petugas.

## Prinsip Desain

- **Setiap angka penting selalu berasal dari pipeline Python (`python-service/fire_pipeline/`).** Frontend tidak pernah menghitung sendiri confidence, skor prioritas, baseline historis, ketahanan sel grid, atau korelasi laporan-satelit — ia hanya menampilkan apa yang dikembalikan backend.
- **Tiap sensor tetap jujur pada karakteristik aslinya.** Confidence MODIS (0–100%, kontinu) tidak pernah dikonversi jadi angka yang disamakan dengan confidence VIIRS (kategori rendah/nominal/tinggi) — keduanya ditampilkan terpisah, sesuai skema aslinya masing-masing menurut dokumentasi resmi NASA FIRMS.
- **Tidak ada klaim prediksi.** Skor `attention_score`/`priority_score` adalah formula deterministik untuk mengurutkan prioritas verifikasi, bukan model AI dan bukan prediksi kebakaran — ditandai eksplisit di kode maupun di UI, termasuk fakta bahwa bobotnya belum divalidasi eksternal.
- **Deteksi satelit ≠ konfirmasi kebakaran.** Disclaimer ini konsisten di semua halaman Operator maupun Community — titik panas adalah anomali termal, perlu verifikasi lapangan sebelum ditindaklanjuti.
- **Data contoh selalu dilabeli jelas, terpisah dari data nyata.** Konstanta `DEMO_*` yang tersisa (fallback ketika pipeline nyata gagal/kosong) diberi badge "Contoh data" dan tidak pernah bercampur diam-diam dengan hasil pipeline.

## Latar Belakang Masalah

Satelit NASA sudah merekam titik panas aktif selama lebih dari dua dekade: MODIS sejak tahun 2000, VIIRS sejak 2012. Tapi kedua sensor ini punya karakteristik resolusi spasial, waktu lintas, dan skema confidence yang berbeda — dan menurut pernyataan tantangan resmi NASA Space Apps 2026, rekaman keduanya "tidak bisa dibandingkan langsung" (*cannot be compared directly*), sehingga petugas pemantau kehilangan gambaran konsisten soal kapan dan di mana kebakaran benar-benar terjadi.

Di Indonesia, masalah ini bukan sekadar soal teknis. Musim kering di Kalimantan dan Sumatra membawa kabut asap yang berulang setiap tahun — 2015 dan 2019 adalah dua musim terparah yang terdokumentasi luas, menutup bandara dan membebani fasilitas kesehatan. Tiga kesenjangan menghalangi pemantauan yang efektif:

1. **Data satelit terpisah per sensor**, tanpa penjelasan hubungan antar-deteksi — petugas tidak tahu apakah titik MODIS dan titik VIIRS di dekatnya adalah kejadian fisik yang sama.
2. **Tidak ada baseline historis yang mudah diakses** — tanpa riwayat multi-tahun, mustahil menilai apakah aktivitas hari ini "wajar" atau "tidak biasa" untuk wilayah tertentu.
3. **Laporan warga terputus dari data satelit resmi** — padahal warga yang tinggal dekat titik bakar sering mencium asap jauh sebelum satelit berikutnya melintas dan mencatatnya.

## Terminologi (penting — jangan disamakan)

Empat istilah ini terdengar mirip tapi berarti berbeda, dan dipakai terpisah secara konsisten di seluruh aplikasi:

| Istilah | Apa artinya di AGNIBHŪMĪ | Apa yang BUKAN artinya |
|---|---|---|
| **Deteksi hotspot** | Satu baris data mentah dari MODIS/VIIRS: anomali radiasi termal yang terdeteksi sensor pada koordinat & waktu tertentu (`fire_pipeline/clean.py`, `live.py`). | Bukan konfirmasi ada kebakaran di lapangan — hanya sinyal termal, bisa juga flare industri, panas non-vegetasi, dll. |
| **Anomali statistik** | Satu angka (jumlah deteksi hari ini) yang secara matematis melebihi rata-rata+2×std historis sel/wilayah yang sama (`model.py: historical_baseline()`, `/calendar`'s `unusualAreas`). Murni "beda dari biasanya secara angka." | Bukan penilaian bahaya, bukan prediksi, dan sama sekali tidak tahu apakah ada kebakaran — hanya tahu angkanya tidak biasa. |
| **Prioritas investigasi** | `priority_score`/`priority_tier` — urutan rekayasa (formula tertimbang, lihat tabel di bawah) untuk membantu petugas memutuskan sel mana diverifikasi lebih dulu. Bobotnya *belum divalidasi* terhadap kriteria instansi pemadam kebakaran sungguhan. | Bukan skor bahaya kebakaran, bukan ukuran keparahan, dan bukan hasil model yang sudah teruji — murni alat bantu urutan triase. |
| **Bahaya/risiko kebakaran** | **Tidak dihitung di mana pun di sistem ini.** Tidak ada field, skor, atau klaim yang menyatakan "wilayah X berbahaya" atau "risiko kebakaran Y%" — ini butuh variabel yang sama sekali tidak dimiliki sistem (kondisi bahan bakar/vegetasi, kelembapan tanah, akses pemadam, dll.), bukan sesuatu yang bisa disimpulkan dari deteksi satelit saja. | — |

Kenapa ini ditulis eksplisit: ketiga istilah pertama sering tercampur di sistem pemantauan kebakaran lain (satu angka dipakai untuk mewakili semuanya). Di sini, mengubah salah satu urutan atau skala salah satu tidak pernah mengubah makna yang lain — tiap halaman menyebut istilah yang tepat untuk apa yang sedang ditampilkan, bukan istilah yang terdengar lebih meyakinkan.

## Fitur Utama

### 1. Harmonisasi MODIS + VIIRS (inti tantangan)

Backend (`fire_pipeline/live.py`, `matching.py`, `harmonize_events.py`) mengambil data NRT dari 4 sumber NASA FIRMS paralel (`MODIS_NRT`, `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`), membersihkannya (koordinat valid, FRP non-negatif, dedup), lalu mencocokkan deteksi MODIS dan VIIRS yang kemungkinan besar merujuk ke titik bakar fisik yang sama — jarak haversine ≤10km dan selisih waktu ≤720 menit (12 jam; dipilih setelah mengukur langsung bahwa pasangan deteksi MODIS-VIIRS yang berjarak <1km di data live sering berselisih waktu 2–15 jam, karena kedua konstelasi satelit punya jam lintas berbeda). Pasangan yang cocok digabung jadi satu "harmonized event" (FRP = nilai maksimum pasangan, bukan dijumlahkan, supaya satu kejadian fisik yang dilihat dua sensor tidak dihitung dua kali) dan ditampilkan sebagai satu marker 🔥 di peta — bukan dua marker terpisah yang ditumpuk.

### 2. Kalender Aktivitas Kebakaran & Baseline Historis

`/calendar` membaca arsip nyata NASA FIRMS 2000–2026 (177.983 baris harian per sel grid 0,25°, diolah dari 5,5 juta baris mentah via `scripts/build_historical_store.py`) dan menampilkan:

- Heatmap bulan × tahun, dengan legend intensitas.
- Yearly Activity Overview dan beberapa insight historis independen (bulan puncak agregat, deviasi bulan berjalan vs rata-rata tahun sebelumnya, tahun terburuk untuk bulan yang sama, perbandingan bulan ini vs bulan berikutnya secara historis) — masing-masing dihitung dari aritmetika murni atas data arsip, bukan narasi yang dikarang.
- Stat tile "Area dengan Aktivitas Tidak Biasa": deteksi live hari ini dibandingkan terhadap rata-rata + 2×standar deviasi historis sel grid yang sama — hanya ditandai "tidak biasa" kalau benar-benar melampaui ambang itu.

### 3. Prioritas Verifikasi Lapangan

`/priority-areas` mengurutkan sel grid 0,25° berdasarkan `priority_score` (50% attention score + 30% tren pertumbuhan + 20% jumlah deteksi; attention score sendiri = 45% FRP + 30% persistensi + 25% jumlah deteksi — lihat tabel formula di bawah), dengan tier High/Medium/Low pada ambang 0,66/0,33. Metodologi dan keterbatasannya (bobot belum divalidasi eksternal) ditampilkan apa adanya di halaman, bukan disembunyikan.

### 4. Laporan Warga & Korelasi Satelit

Warga mengirim laporan (foto, lokasi, deskripsi) lewat `/community/report`. Laporan tersimpan nyata di `reports.sqlite` dan otomatis dikorelasikan ke deteksi satelit live dalam radius 5km/24 jam (lebih longgar dari pencocokan antar-satelit, karena lokasi/waktu laporan warga secara alami kurang presisi). Korelasi ini hanya menampilkan "indikasi satelit terkait" — **tidak pernah otomatis mengubah status laporan**; itu tetap keputusan petugas di `/citizen-reports`.

### 5. Edukasi Kesiapsiagaan

`/community/edukasi` menyediakan 4 modul nyata: checklist siaga darurat (13 item), kartu perlindungan dari asap (mengutip WHO & BMKG), 6 skenario interaktif "harus ngapain sekarang" dengan tindakan aman yang selalu ditampilkan (tidak digantung ke jawaban benar), dan panduan sumber daya lokal — yang belum terverifikasi ditandai jelas, bukan dikarang.

### 6. Cuaca & Kualitas Udara

`/community/udara` dan kartu "Cek Kualitas Udara" di beranda menampilkan angin dan kualitas udara nyata dari Open-Meteo (gratis, tanpa API key) — PM2.5, PM10, dan US AQI (skala EPA Amerika, **bukan** ISPU Indonesia, karena ambang batasnya berbeda dan dilabeli jelas sebagai US AQI).

**Cakupan**: AGNIBHŪMĪ diposisikan sebagai alat bantu keputusan untuk pemantauan dan triase verifikasi — bukan sistem deteksi real-time pengganti petugas lapangan, bukan sistem peringatan dini resmi, dan bukan pengganti layanan darurat.

## Filter Region & Rentang Waktu (TopBar)

Dua dropdown di header Operator menulis `?region=` dan `?range=` ke URL. Link sidebar dan link antar-halaman membawa keduanya, jadi pilihan tetap berlaku saat pindah halaman.

- **Region** = provinsi asli (34 provinsi BPS 2020; 7 provinsi rawan karhutla di urutan teratas). Titik & area live dicocokkan dari `admin.provinsi` masing-masing; data arsip disaring di server (`?province=`) — sel grid 0,25° masuk bila salah satu dari 9 titik sampelnya jatuh di provinsi itu, jadi sel perbatasan bisa terhitung di dua provinsi.
- **Rentang waktu**:

| Pilihan | Sumber | Catatan |
|---|---|---|
| 24 Jam Terakhir | NASA FIRMS NRT live | Seperti sebelumnya |
| 7 Hari / 30 Hari Terakhir | NASA FIRMS NRT live, pipeline penuh (matching, skor prioritas, nama wilayah) | API FIRMS hanya menerima 1–5 hari per request, jadi diambil per potongan 5 hari bertanggal (7 hari = 8 request, 30 hari = 28 request), di-cache per potongan. Pemuatan pertama 30 hari bisa ±2 menit. Peta menampilkan maks. 3.000 deteksi FRP tertinggi; area, total, dan grafik tetap dihitung dari semua deteksi |
| Jan 2023 – Des 2024 (arsip) | `historical.sqlite` (total harian per grid) | Tanpa titik individual & tanpa skor prioritas — Priority Areas/Analytics menampilkan 24 jam live dengan catatan |

`/calendar` sengaja tetap membandingkan data live **24 jam** dengan baseline harian per sel: menjumlah 7/30 hari lalu membandingkannya ke rata-rata harian adalah ketidakcocokan satuan.

## Deploy

Panduan lengkap demo publik (Vercel + Render, Docker, cache warmer, kebutuhan RAM, file data): **[DEPLOY.md](DEPLOY.md)**.

## Cara Angka Dihitung

| Perhitungan | Formula / Aturan | Lokasi |
|---|---|---|
| Filter confidence (default) | Kelas resmi FIRMS **sedang + tinggi**: MODIS ≥ 30%, VIIRS `"n"`/`"h"`; hanya `"low"` disembunyikan. Sejak 20 Okt 2026 — sebelumnya hanya "tinggi" (VIIRS `"h"` = piksel jenuh saja), yang menyembunyikan ±94% deteksi VIIRS sah. Arsip historis dibangun ulang dengan filter yang sama | `clean.py: confidence_tier()`, `usable_confidence_mask()` |
| Pencocokan MODIS↔VIIRS | Haversine ≤10km DAN selisih waktu ≤720 menit, greedy nearest-neighbor deterministik (bukan optimal secara global) | `matching.py: match_modis_viirs()` |
| Harmonized event (anti dobel-hitung) | Pasangan MATCHED digabung jadi 1 event, FRP = maksimum pasangan (bukan dijumlahkan) | `harmonize_events.py` |
| Attention score | `0.45 × rank(FRP) + 0.30 × persistensi + 0.25 × rank(jumlah deteksi)` | `features.py: attention_features()` |
| Priority score & tier | `0.5 × attention + 0.3 × rank(tren) + 0.2 × rank(jumlah deteksi)`; tier High ≥0,66, Medium ≥0,33 | `model.py: deterministic_priority()` |
| Baseline historis per sel | Rata-rata & standar deviasi `frp_sum` harian dari arsip nyata per sel grid 0,25°; fallback ke statistik same-batch (dilabeli jelas via `baselineSource`) kalau sel itu belum punya riwayat | `model.py: historical_baseline()` |
| Anomali live vs historis | Deteksi live hari ini (1 hari) > rata-rata **harian** sel + 2×standar deviasi **harian** sel yang sama — diperbaiki 2026-10-19, sebelumnya salah dibandingkan terhadap rata-rata *bulanan* (satuan tidak sepadan, lihat Riset di atas) | `calendar/page.tsx`, `historical.py: load_calendar_summary()` |
| Korelasi laporan↔satelit | Haversine ≤5km DAN selisih waktu ≤24 jam | `correlation.py: correlate_report()` |

Semua formula ini deterministik dan bisa diverifikasi langsung dari kode — **tidak ada model machine learning atau AI di balik angka manapun** yang dipakai untuk keputusan prioritas, keselamatan, atau investasi apa pun di sistem ini. Kalau pipeline Python tidak bisa dijangkau atau arsip historis kosong, endpoint terkait mengembalikan state kosong/error eksplisit yang dilabeli jelas di UI ("Contoh data" atau pesan error) — tidak pernah diam-diam diganti angka karangan.

## Riset: Apakah ML Layak Dipakai untuk Deteksi Anomali?

Sebelum menambah ML/AI ke sistem ini, dilakukan riset terisolasi (`python-service/ml_experiments/anomaly_detection/`, **tidak** memengaruhi produksi) untuk menjawab: apakah metode statistik lain bisa mendeteksi aktivitas tidak biasa lebih baik dari aturan deterministik yang sudah ada?

**Temuan terverifikasi (bisa direproduksi, lihat README riset untuk perintah persisnya):**
- Tabel arsip (`daily_area_activity`) hanya menyimpan hari-dengan-deteksi — tidak ada baris "0 deteksi". Ini berarti hari yang hilang **tidak bisa** diasumsikan nol (bisa saja satelit tidak lewat, atau deteksi ada tapi di bawah ambang confidence) — diverifikasi langsung, bukan diasumsikan.
- Baseline per-sel grid sangat jarang datanya (median 34 hari observasi per sel sepanjang rentang 26 tahun) — metode berbasis wilayah+musim diuji sebagai alternatif.
- Dibandingkan head-to-head dengan evaluasi rolling-origin (tanpa kebocoran data masa depan) + uji sensitivitas: kedua metode **sepakat 95-97%** dari waktu ke waktu, dan metode wilayah+musim masih sering (31,5%) jatuh ke fallback karena arsip VIIRS belum cukup tahun.
- **Keputusan: lanjutkan riset, jangan ganti metode produksi dulu** — tidak ada bukti ground-truth kebakaran sungguhan untuk menentukan metode mana yang benar-benar lebih baik, dan selisih keduanya tidak cukup besar untuk membenarkan penggantian.

Detail lengkap, semua angka, dan cara mereproduksi ada di [`python-service/ml_experiments/anomaly_detection/README.md`](python-service/ml_experiments/anomaly_detection/README.md).

## Arsitektur Sistem

```text
NASA FIRMS (MODIS + VIIRS NRT)  ──┐
Open-Meteo (cuaca + kualitas udara) ──┤
                                    ├──►  FastAPI (Python)         ──►  Next.js (React, TypeScript, Tailwind)
Arsip FIRMS 2000–2026 (offline)  ──┘      fire_pipeline/                 src/app/{operator,community,...}
                                           │
                                           ├── SQLite read-only: historical.sqlite (arsip, dibangun offline)
                                           └── SQLite read-write: reports.sqlite (laporan warga, runtime)
```

- **Aplikas web**: Next.js (App Router), React, TypeScript, Tailwind CSS. Dua pengalaman terpisah tapi berbagi backend & peta yang sama: **Operator View** (`/operator`, `/map`, `/analytics`, `/calendar`, `/priority-areas`, `/citizen-reports`, `/data-model`) dan **Community View** (`/community` + subhalaman). **Tidak ada autentikasi di kedua sisi** — ini keputusan sadar yang didokumentasikan eksplisit sebagai keterbatasan prototipe, bukan oversight; endpoint `PATCH /api/reports/{id}` secara eksplisit menyebut di docstring-nya bahwa siapa pun yang bisa mengakses endpoint ini bisa mengubah status laporan.
- **Mesin hitung**: layanan Python/FastAPI terpisah (`python-service/`), diakses di `PYTHON_PROCESSING_API_URL` (bawaan `http://127.0.0.1:8000`). Menangani seluruh pipeline harmonisasi, baseline historis, korelasi laporan, dan cuaca/kualitas udara.
- **Lapisan data**: SQLite (bukan database terkelola — proyek ini sengaja tidak menambah layanan eksternal hanya demi tampilan arsitektur). `historical.sqlite` dibangun sekali secara offline dari arsip FIRMS resmi dan dibundel sebagai aset read-only; `reports.sqlite` ditulis saat runtime. **Keterbatasan yang diketahui**: filesystem yang tidak persisten (mis. Vercel serverless) akan membuat `reports.sqlite` kehilangan data antar-deploy — untuk produksi sungguhan butuh database terkelola, belum diimplementasikan di sini.
- **Identitas pelapor warga**: token anonim acak di `localStorage` browser, bukan akun/identitas terverifikasi — didokumentasikan jelas di UI.
- **Cuaca/kualitas udara**: panggilan langsung ke Open-Meteo (`api.open-meteo.com`, `air-quality-api.open-meteo.com`) via `urllib`, tanpa API key. Gagal di satu sisi (misal cuaca) tidak pernah memblokir sisi lain (misal kualitas udara) — keduanya independen dan dilabeli jujur kalau salah satu gagal.

## Peta Modul

| Modul | Halaman | Pipeline Python |
|---|---|---|
| Harmonisasi & peta live | `/map`, `/operator` | `live.py`, `matching.py`, `harmonize_events.py`, `clean.py` |
| Kalender & baseline historis | `/calendar` | `historical.py`, `model.py: historical_baseline()` |
| Prioritas verifikasi | `/priority-areas` | `features.py`, `model.py: deterministic_priority()` |
| Analitik & tren | `/analytics` | `live.py`, `historical.py` |
| Laporan warga (kirim & lihat) | `/community/report`, `/community/saya`, `/community/reports/[id]` | `reports.py`, `correlation.py` |
| Antrean & verifikasi petugas | `/citizen-reports` | `reports.py` |
| Edukasi kesiapsiagaan | `/community/edukasi` (+ `siaga`, `asap`, `simulasi`, `sekitar`) | – (konten statis + data live untuk konteks) |
| Cuaca & kualitas udara | `/community/udara` | `weather.py` |
| Metadata sumber data | `/data-model` | – |

## Referensi API (backend Python, `python-service/main.py`)

| Endpoint | Metode | Fungsi |
|---|---|---|
| `/api/health` | GET | Health check sederhana |
| `/api/hotspots` (alias `/api/live/hotspots`) | GET | Deteksi live harmonized. Param `window=24h` (default) / `7d` / `30d`; `include_all_confidence=true` untuk menyertakan confidence rendah/menengah (default: hanya tinggi). Respons juga berisi `daily` (jumlah per tanggal UTC × provinsi, dari semua deteksi) |
| `/api/historical/calendar` | GET | Data bulanan + baseline per-sel (harian & bulanan) untuk `/calendar`. Param opsional `province=<nama provinsi>` atau `min_lat/max_lat/min_lon/max_lon` |
| `/api/historical/map` | GET | Agregat grid historis untuk overlay peta (7/30 hari atau rentang tanggal kustom), param opsional `province` |
| `/api/region` | GET | Titik → kecamatan / kab-kota / provinsi (offline, `lat`, `lon` wajib) |
| `/api/weather` | GET | Cuaca & kualitas udara real-time untuk satu titik (`lat`, `lon` wajib) |
| `/api/reports` | POST | Kirim laporan warga baru (otomatis dikorelasikan ke deteksi satelit) |
| `/api/reports` | GET | Daftar laporan, filter opsional `submitterToken`/`status` |
| `/api/reports/{id}` | GET | Detail satu laporan + tautan korelasi satelit |
| `/api/reports/{id}` | PATCH | Ubah status laporan (**tanpa autentikasi** — lihat Keterbatasan) |
| `/api/reports/{id}/photo` | GET | Ambil foto laporan |

Dokumentasi interaktif (Swagger) otomatis tersedia di `http://127.0.0.1:8000/docs` saat backend berjalan lokal.

## Tech Stack

| Lapisan | Teknologi |
|---|---|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS, Leaflet (peta) |
| Backend | Python 3.12, FastAPI, pandas, numpy |
| Data satelit | NASA FIRMS (MODIS Collection 6.1, VIIRS Collection 1 — SNPP/NOAA-20/NOAA-21), via API resmi `firms.modaps.eosdis.nasa.gov` |
| Cuaca & kualitas udara | Open-Meteo (`api.open-meteo.com`, `air-quality-api.open-meteo.com`), gratis tanpa API key |
| Batas wilayah administratif | OCHA COD-AB Indonesia (BPS, berlaku 2020-04-01, lisensi CC BY-IGO) — [data.humdata.org/dataset/cod-ab-idn](https://data.humdata.org/dataset/cod-ab-idn). Lookup kecamatan/kab-kota/provinsi dilakukan offline (point-in-polygon, `shapely`), tanpa API. 34 provinsi — belum memuat pemekaran Papua 2022. |
| Penyimpanan | SQLite (`historical.sqlite` read-only, `reports.sqlite` read-write) — tanpa ORM, lewat `sqlite3` standar library |
| Pengujian backend | pytest, **86 test produksi** (`python-service/tests/`, termasuk test kesamaan output matching vs implementasi lama) + **22 test riset terisolasi** (`python-service/ml_experiments/`, dijalankan terpisah) |

## Struktur Repositori

```text
Nasa-Space-App-Challange/
├── src/
│   ├── app/
│   │   ├── operator/, map/, analytics/, calendar/, priority-areas/, citizen-reports/, data-model/   # Operator View
│   │   ├── community/          # Community View: report/, map/, edukasi/, notifikasi/, pengaturan/, saya/, udara/, alert/[id]/, reports/[id]/
│   │   └── api/                # Proxy routes Next.js → Python (hotspots, historical, reports, weather)
│   ├── components/
│   │   ├── map/FireMap.tsx     # Komponen peta bersama (shapes ★MODIS/⬡VIIRS/🔥harmonized/👤laporan)
│   │   └── community/          # Ilustrasi & komponen khusus Community View
│   ├── lib/filters.ts          # Definisi region (provinsi) & rentang waktu, withFilters()
│   ├── lib/useLiveHotspots.ts  # Hook bersama: /api/hotspots per rentang waktu
│   └── types/index.ts          # Tipe bersama frontend
├── python-service/
│   ├── fire_pipeline/
│   │   ├── clean.py            # Normalisasi skema, filter confidence, quality flags
│   │   ├── matching.py         # Pencocokan spatiotemporal MODIS↔VIIRS
│   │   ├── harmonize_events.py # Penggabungan pasangan matched jadi 1 event
│   │   ├── features.py         # Agregasi grid, attention_score
│   │   ├── model.py            # priority_score, baseline historis
│   │   ├── live.py             # Orkestrasi fetch NASA FIRMS + pipeline end-to-end
│   │   ├── historical.py       # Query arsip historis untuk /calendar
│   │   ├── reports.py          # CRUD laporan warga (SQLite read-write)
│   │   ├── correlation.py      # Korelasi laporan↔deteksi satelit
│   │   ├── weather.py          # Cuaca & kualitas udara (Open-Meteo)
│   │   └── admin_lookup.py     # Titik → kecamatan/kab-kota/provinsi (offline, OCHA COD-AB)
│   ├── scripts/build_historical_store.py   # Pembangun offline historical.sqlite dari CSV arsip FIRMS
│   ├── ml_experiments/          # Riset terisolasi, TIDAK memengaruhi produksi (lihat bagian "Riset" di atas)
│   │   ├── shared/dataset.py    # Loader read-only + definisi 5 wilayah (sama seperti src/lib/filters.ts)
│   │   └── anomaly_detection/   # data_audit.py, baselines.py, evaluate.py, README.md, tests/
│   ├── data/                   # historical.sqlite, reports.sqlite, report_photos/ (di-gitignore)
│   ├── tests/                  # 41 test produksi
│   └── requirements.txt
├── .env.example
├── package.json
└── README.md
```

## Menjalankan Secara Lokal

### Prasyarat

- Node.js 20+
- Python 3.12+
- NASA FIRMS Map Key (gratis, daftar di [firms.modaps.eosdis.nasa.gov/api/area](https://firms.modaps.eosdis.nasa.gov/api/area/))

### Instalasi

```bash
git clone <repo-url>
cd Nasa-Space-App-Challange
npm install
python3.12 -m venv python-service/.venv
python-service/.venv/bin/pip install -r python-service/requirements.txt
```

### Variabel Lingkungan (`.env.local`)

```bash
cp .env.example .env.local
# Isi NASA_FIRMS_MAP_KEY dengan key asli Anda
```

```
NASA_FIRMS_MAP_KEY=<map key asli Anda>
FIRMS_API_BASE=https://firms.modaps.eosdis.nasa.gov/api/area/csv
PYTHON_PROCESSING_API_URL=http://127.0.0.1:8000
```

### Menjalankan

```bash
# Terminal 1 — mesin hitung Python
python-service/.venv/bin/python -m uvicorn main:app --app-dir python-service --host 127.0.0.1 --port 8000

# Terminal 2 — aplikasi web Next.js
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Buka [http://127.0.0.1:3000](http://127.0.0.1:3000) untuk landing page (pilih peran Masyarakat/Petugas), atau langsung ke [http://127.0.0.1:3000/operator](http://127.0.0.1:3000/operator) / [http://127.0.0.1:3000/community](http://127.0.0.1:3000/community). Dokumentasi API Python otomatis tersedia di [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

### (Opsional) Membangun Arsip Historis dari Arsip FIRMS

`historical.sqlite` yang dipakai `/calendar` dibangun sekali secara offline dari file CSV arsip resmi NASA FIRMS (MODIS + VIIRS, archive + NRT):

```bash
python-service/.venv/bin/python python-service/scripts/build_historical_store.py \
  <path_modis_archive.csv> <path_modis_nrt.csv> <path_viirs_archive.csv> <path_viirs_nrt.csv>
```

Script ini idempotent — membangun ulang total `historical.sqlite` setiap dijalankan, bukan menambah baris secara inkremental.

### (Opsional, tapi disarankan) Membangun Data Batas Wilayah

Supaya lokasi tampil sebagai "Kec. X, Kab. Y, Provinsi Z" (bukan hanya koordinat), bangun `data/admin_boundaries.sqlite` sekali dari geodatabase OCHA COD-AB Indonesia (gratis, ±219 MB):

```bash
# 1. Unduh & unzip idn_admin_boundaries.gdb.zip dari https://data.humdata.org/dataset/cod-ab-idn
# 2. pyogrio hanya dibutuhkan untuk build, tidak saat runtime
python-service/.venv/bin/pip install pyogrio
python-service/.venv/bin/python -I python-service/scripts/build_admin_boundaries.py \
  <path_ke/idn_admin_boundaries.gdb> --out python-service/data/admin_boundaries.sqlite
```

Hasilnya ±20 MB (7.069 kecamatan, disederhanakan ±55 m). Tanpa file ini, aplikasi tetap jalan dan menampilkan koordinat saja.

### Menguji

```bash
python-service/.venv/bin/python -m pytest -c python-service/pytest.ini   # 86 test produksi
npm run lint
npm run build

# Opsional: test riset terisolasi (lihat bagian "Riset" di atas), dijalankan terpisah
python-service/.venv/bin/python -m pytest python-service/ml_experiments/anomaly_detection/tests -v   # 17 test
```

## Sumber Data & Rujukan

Semua klaim teknis di dokumen ini (skema data, skema confidence, karakteristik sensor, jadwal retirement satelit, teks tantangan resmi) diverifikasi langsung ke sumber primer berikut, bukan dikutip dari ringkasan pihak ketiga:

- **NASA Space Apps Challenge 2026 — "Harmonization of MODIS and VIIRS Hot Spots"**: [spaceappschallenge.org/2026/challenges/harmonization-of-modis-and-viirs-hot-spots](https://www.spaceappschallenge.org/2026/challenges/harmonization-of-modis-and-viirs-hot-spots/) — teks tantangan resmi yang menjadi acuan seluruh proyek ini.
- **NASA Earthdata — "Active Fire Data Attributes for MODIS and VIIRS"**: [earthdata.nasa.gov/data/tools/firms/active-fire-data-attributes-modis-viirs](https://www.earthdata.nasa.gov/data/tools/firms/active-fire-data-attributes-modis-viirs) — sumber skema confidence (MODIS numerik vs VIIRS kategorikal), definisi FRP, kolom `type` (vegetation fire), dan kode satelit (N/N20/N21). Halaman ini juga sumber pengumuman: **pengiriman observasi baru dari Suomi-NPP berhenti 2 November 2026** — data users diarahkan beralih ke NOAA-20/NOAA-21.
- **NASA FIRMS (Fire Information for Resource Management System)**: [firms.modaps.eosdis.nasa.gov](https://firms.modaps.eosdis.nasa.gov/) — sumber data mentah MODIS+VIIRS live (API Area) dan arsip historis (Archive Download) yang dipakai proyek ini.
- **Open-Meteo**: [open-meteo.com](https://open-meteo.com/) — penyedia data cuaca ([api.open-meteo.com](https://api.open-meteo.com/)) dan kualitas udara ([air-quality-api.open-meteo.com](https://air-quality-api.open-meteo.com/)) real-time yang dipakai `/community/udara`, gratis tanpa API key.
- **WHO — "Wildfires and health"**: [who.int/news-room/fact-sheets/detail/wildfires-and-health](https://www.who.int/news-room/fact-sheets/detail/wildfires-and-health) — dikutip di modul edukasi perlindungan dari asap (`/community/edukasi/asap`).
- **BMKG (Badan Meteorologi, Klimatologi, dan Geofisika)**: [bmkg.go.id](https://www.bmkg.go.id/) — dirujuk sebagai sumber resmi cuaca/kualitas udara Indonesia (US AQI dari Open-Meteo secara eksplisit dibedakan dari ISPU BMKG, lihat Keterbatasan).

## Keterbatasan yang Didokumentasikan Secara Sadar

- **Tidak ada autentikasi** di Operator maupun Community View — siapa pun dengan tautan bisa mengakses dan (untuk endpoint laporan) mengubah status laporan. Ditandai jelas di UI, bukan disembunyikan.
- **`reports.sqlite` tidak persisten di filesystem serverless** (mis. Vercel) — butuh migrasi ke database terkelola untuk produksi sungguhan.
- **Arsip VIIRS historis hanya mencakup Suomi-NPP**, belum NOAA-20/21 — perlu unduhan arsip tambahan untuk cakupan lebih lengkap. Catatan: NASA mengumumkan Suomi-NPP berhenti mengirim observasi VIIRS baru per 2 November 2026; live feed sudah memakai NOAA-20/21, hanya arsip historis offline yang masih SNPP-only.
- **Deteksi confidence "rendah" disembunyikan secara default** (kelas FIRMS "low": MODIS < 30%, VIIRS `"l"`); bisa disertakan lewat filter di `/map`. Peta menampilkan maksimal 3.000 titik dengan FRP tertinggi per permintaan; total, grafik, skor area, dan permintaan per provinsi/radius tetap dihitung dari semua deteksi.
- **Skor `attention_score`/`priority_score` belum divalidasi** terhadap kriteria instansi pemadam kebakaran sungguhan atau dataset ground-truth berlabel — ini bobot rekayasa untuk memberi urutan triase yang masuk akal, bukan skor risiko terkalibrasi.
- **US AQI, bukan ISPU Indonesia** — kategori kualitas udara di `/community/udara` memakai skala EPA Amerika karena itulah yang disediakan Open-Meteo secara gratis; ambang batasnya berbeda dari ISPU resmi Indonesia.
- **Insight di `/calendar` belum bisa diklik untuk melihat data mentah di baliknya** — alur "pilih wilayah+periode → lihat kalender → temukan pola menonjol → periksa data yang mendasarinya" belum lengkap di titik terakhir: teks insight (mis. "September tahun ini 20% di atas rata-rata") belum punya tautan ke daftar deteksi mentah yang menghasilkan angka itu. Diverifikasi langsung di kode (`src/app/calendar/page.tsx`) — bukan asumsi. Ini gap nyata, bukan sekadar polish, kalau alur verifikasi/audit data historis ingin benar-benar lengkap ujung ke ujung.
