# Audit Data & Strategi ML (21 Oktober 2026)

Audit ini menjawab satu pertanyaan: dengan data yang benar-benar kita punya, apakah ada masalah yang memang pantas diselesaikan pakai ML? Jawaban singkatnya ada di bagian 7. Semua angka di sini diukur langsung dari `data/historical.sqlite`, file CSV mentah FIRMS, dan backend live. Skrip dan hasil mentahnya ada di folder ini.

Folder ini terpisah dari produksi. Tidak ada kode di `fire_pipeline/`, `main.py`, atau frontend yang mengimpor dari sini.

## Cara mereproduksi

Jalankan dari `python-service/`:

```bash
.venv/bin/python -m ml_experiments.audit_2026_10.measure_archive data/historical.sqlite   # kualitas dataset
.venv/bin/python -m ml_experiments.audit_2026_10.seasonal_probe data/historical.sqlite    # baseline produksi vs musiman
.venv/bin/python -m ml_experiments.audit_2026_10.live_probe                               # live vs arsip (butuh NASA_FIRMS_MAP_KEY + internet)

# forecast_probe butuh scikit-learn. Produksi tidak memakainya, jadi pasang di venv terpisah:
python3.12 -m venv /tmp/ml-venv && /tmp/ml-venv/bin/pip install -r ml_experiments/audit_2026_10/requirements.txt pandas numpy
/tmp/ml-venv/bin/python -m ml_experiments.audit_2026_10.forecast_probe data/historical.sqlite
```

Output setiap skrip tersimpan di `results/`. Semua skrip memakai seed tetap (`20261021`) dan hasilnya deterministik: dua kali run menghasilkan angka yang sama. `live_probe` pengecualiannya, karena data FIRMS berubah tiap beberapa menit.

---

## 1. Arsitektur & alur data

```text
CSV arsip FIRMS (MODIS C6.1 Terra/Aqua + VIIRS Suomi-NPP), offline
   └─ scripts/build_historical_store.py
        clean.harmonize → filter confidence (usable_confidence_mask: nominal+high)
        → type==0 (khusus baris archive) → add_quality_flags → deduplicate_detections
        → matching.match_modis_viirs (≤10 km, ≤720 menit, greedy)
        → harmonize_events.daily_grid_activity (pasangan MATCHED = 1 event, FRP = max)
        → historical.sqlite: daily_area_activity (1 baris per tanggal UTC × sel 0,25°)

FIRMS NRT live (MODIS_NRT, VIIRS_SNPP_NRT, VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT)
   └─ fire_pipeline/live.py build_live_result
        pipeline yang sama (tanpa type==0, kolomnya tidak ada di NRT)
        → features.aggregate_grid / temporal_features / attention_features
        → model.historical_baseline (hanya mengisi baselineSource) → model.deterministic_priority
        → /api/hotspots: markers, areas (skor prioritas), daily

historical.sqlite
   └─ fire_pipeline/historical.py load_calendar_summary → /api/historical/calendar
        months (semua tahun) + cells: mean/std harian per sel, hanya hari ≥ 2012-01-20

Frontend src/app/calendar/page.tsx
   "Area dengan aktivitas tidak biasa" = jumlah event live 24 jam per sel
   > dailyMean + 2 × dailyStd sel yang sama (dihitung di browser)
```

Tidak ada model ML di produksi. Semua skor adalah formula tetap:
- attention = 45% persentil FRP + 30% persistensi + 25% persentil jumlah deteksi;
- priority = 50% attention + 30% tren + 20% jumlah;
- "tidak biasa" = mean + 2×std.

## 2. Temuan audit (terverifikasi)

Urutan dari yang paling berpengaruh.

### A1. Angka "tidak biasa" di Kalender terlalu tinggi karena live memakai 3 satelit VIIRS, arsip hanya 1

- **Isi arsip:** VIIRS di arsip hanya Suomi-NPP. Di CSV mentah ada 3.542.822 baris VIIRS archive dan 347.169 baris VIIRS NRT, semuanya `satellite = SNPP`.
- **Isi live:** live mengambil S-NPP, NOAA-20, dan NOAA-21 (`live.py`, `SOURCES`).
- **Akar masalah:** `match_modis_viirs` hanya memasangkan MODIS dengan VIIRS. Dua deteksi VIIRS dari satelit berbeda untuk api yang sama tetap dihitung sebagai dua event.

Hasil pengukuran pada 21 Okt 2026 ~02:10 UTC (`results/live_probe_2026-10-21.txt`):

| Data live yang dipakai | Event | Sel "tidak biasa" | Median (jumlah live ÷ rata-rata baseline) |
|---|---|---|---|
| Semua satelit (yang dipakai produksi) | 20.480 | **333 dari 1.055 (31,6%)** | 1,77 |
| MODIS + S-NPP saja (setara arsip) | 5.224 | 53 dari 637 (8,3%) | 0,82 |
| MODIS + NOAA-20 saja | 8.133 | 143 dari 844 (16,9%) | 1,03 |
| MODIS + NOAA-21 saja | 8.377 | 122 dari 864 (14,1%) | 0,99 |

73,5% deteksi S-NPP (3.247 dari 4.417) punya deteksi NOAA-20 dalam ≤1 km dan ≤12 jam. Hampir semuanya kemungkinan besar api yang sama, tapi dihitung terpisah.

Dampaknya ke produk:
- Angka "28–32% sel tidak biasa" di Kalender sebagian besar artefak jumlah satelit, bukan aktivitas yang benar-benar tidak biasa.
- Angka "17.803 deteksi" di About Data tetap benar sebagai jumlah deteksi. Tapi angka itu tidak bisa dibaca sebagai jumlah kejadian, dan tidak bisa dibandingkan langsung dengan arsip.

Satu catatan tambahan: Suomi-NPP berhenti mengirim data per 2 Nov 2026. Setelah tanggal itu, baseline S-NPP harus dibandingkan dengan satelit lain. NOAA-20 di sampel ini menghasilkan ±1,6× event S-NPP pada hari yang sama, dan sampelnya cuma satu hari.

### A2. Baris NRT di arsip (1 Jul – 24 Sep 2026) tidak disaring type==0

- **Penyebab:** kolom `type` tidak ada di NRT. Ini sudah tercatat di `build_historical_store.py`, tapi dampaknya belum dihitung.
- **Besar kontaminasinya:** di data archive 2023+, baris `type ≠ 0` (sumber statis/industri, offshore, gunung api) mencakup 13,1% baris MODIS dan 10,4% baris VIIRS. Proporsi sebesar itu ikut masuk ke 3 bulan NRT.
- **Contoh dampak:** Juli–September 2026 (NRT) mencatat 345.657 event, lebih tinggi dari 2019 (263.408). Dari tabel ini saja tidak bisa dipisahkan berapa yang memang musim kebakaran besar dan berapa yang efek filter.
- **Rekomendasi:** baris NRT jangan dipakai untuk melatih atau mengevaluasi apa pun. Bangun ulang arsip begitu NASA mengganti NRT dengan data archive standar.

### A3. Baseline produksi tidak memperhitungkan musim

Probe rolling-origin, tahun uji 2016–2025 (`results/seasonal_probe.txt`):
- **Pada metode produksi:** 73,8% flag "tidak biasa" jatuh di Agustus–Oktober, padahal porsi sel-hari aktifnya di bulan-bulan itu 56,9%. Tingkat flag per bulan berkisar 1,1% (Mei) sampai 4,7% (September). Artinya, flag itu sebagian ikut menandai "sedang musim kebakaran".
- **Pembandingnya:** baseline musiman per sel (bulan yang sama ±1 bulan, minimal 10 hari dan 3 tahun data latih). Dengan baseline ini, porsi flag Agustus–Oktober turun ke 57,9%, hampir sama dengan porsi datanya. Baseline ini tersedia untuk 96,1% sel-hari uji.
- **Kesepakatan kedua metode:**

  | Ukuran | Nilai |
  |---|---|
  | Kesepakatan mentah | 98,3% |
  | Kesepakatan karena kebetulan (dari laju flag masing-masing) | 93,3% |
  | Cohen's κ | 0,74 |

  Keduanya mirip tapi tidak sama, dan perbedaannya justru di luar musim.

### A4. Baseline harian produksi hanya butuh 2 hari sampel

- **Aturannya sekarang:** `dailyStdDetections` dianggap valid kalau `sampleDays ≥ 2` (`historical.py`).
- **Ukuran sampel di era VIIRS:** median 177 hari per sel, tapi 443 dari 3.231 sel punya <10 hari, dan 136 sel cuma 1 hari.
- **Kenapa ini masalah:** std dari 2–9 hari sangat tidak stabil, apalagi distribusinya berekor panjang (median 2 event per sel-hari, p99 48, maksimum 1.362).

### A5. Hari tanpa baris memang tidak bisa diartikan "nol api" (temuan lama masih benar), tapi bisa diberi label yang jujur

- **Bentuk tabel:** tabel hanya berisi sel-hari dengan ≥1 event. Tidak ada baris nol dan tidak ada duplikat (`data_audit`: 0 dan 0).
- **Ketersediaan sensor:** sejak 2012-01-20, hanya 3 hari yang benar-benar kosong secara nasional (2013-02-21, 2021-02-01, 2025-11-12). Ada 84 hari tanpa baris VIIRS dan 128 hari tanpa baris MODIS. Jadi di era VIIRS, hampir setiap hari ada satelit yang beroperasi.
- **Label yang bisa dipakai:** "nol deteksi tercatat saat sensor beroperasi". Label ini tidak sama dengan "tidak ada api", karena awan dan asap tebal tetap bisa menutupi api, dan FIRMS tidak menyediakan masker awan.
- **Aturannya untuk eksperimen ke depan:** setiap angka nol harus diberi label seperti itu, dan hari-hari yang kosong secara nasional dikeluarkan dari perhitungan.

### A6. Pencocokan MODIS–VIIRS masih belum pasti di musim padat

- **Dari audit matching yang ada:** `matching_audit/results/latest.txt`, sampel Kalimantan September 2019.
  - 25% deteksi MODIS yang punya ≥2 kandidat pasangan ternyata kandidatnya tersebar >10 km. Artinya, kandidat-kandidat itu bisa jadi api yang berbeda.
  - Audit itu dijalankan sebelum filter confidence diubah.
- **Dari arsip baru:** porsi MODIS yang mendapat pasangan VIIRS naik-turun mengikuti aktivitas, 42% (2022) sampai 83% (2015). Di tahun yang padat, radius 10 km lebih mudah memasangkan dua api berbeda.
- **Kesimpulan:** ini bukan alasan memakai ML untuk matching. Tapi audit matching perlu diulang dengan filter dan arsip yang sekarang.

### A7. Tanggal memakai UTC, bukan waktu lokal

- **Sumbernya:** `daily_grid_activity` memakai `acq_datetime` UTC.
- **Dampaknya:** lintasan malam (±18–19 UTC = 01–02 WIB) masuk ke tanggal UTC sebelumnya, padahal di waktu lokal itu sudah hari berikutnya.
- **Seberapa serius:** pengaruhnya kecil untuk total harian, tapi tetap perlu disebut kalau ada yang membandingkan dengan data harian SiPongi.

### Temuan di eksperimen anomali yang lama (`anomaly_detection/`)

Eksperimen dijalankan ulang di arsip baru: 339 detik, 22 test lolos.

1. **"Fallback 31,5%" bukan bukti datanya jarang.** Angka itu murni efek desain fold. Dari 13 fold era VIIRS, fold uji 2014–2017 memang hanya punya 1–4 tahun latih, jadi pasti di bawah batas 5 tahun. 4/13 = 30,8% (hasil run ulang). Dengan batas 3 tahun hasilnya 2/13 = 15,4%, dan batas 8 tahun memberi 7/13 = 53,8%. Ketiganya persis sama dengan tabel sensitivitas. Kesimpulan lama di README, bahwa era VIIRS belum punya 5 tahun per bulan, keliru. Di arsip sekarang, 58,8% kombinasi (sel, bulan) sudah punya ≥5 tahun era VIIRS.
2. **Kesepakatan 95–97% hampir sepenuhnya kebetulan.** Kedua metode memberi flag pada <5% data, jadi angka kesepakatan setinggi itu memang wajar terjadi tanpa makna apa pun. Laporan harus memakai κ atau tabel kontingensi.
3. **Hasil di README lama berasal dari arsip lama.** Waktu itu arsipnya 177.983 baris dengan filter high-only. Setelah dijalankan ulang di arsip 1.069.505 baris:
   - Era VIIRS: flag metode sel 3,8%, flag metode wilayah 1,9%, kesepakatan 96,6%.
   - Tahun aktif (2015, 2019) vs tahun sepi (2020–2022): flag metode sel 9,6% vs 0,9%, flag metode wilayah 5,5% vs 0,7%.
4. **Masih memakai 5 kotak wilayah perkiraan.** Produk sekarang sudah memakai batas provinsi BPS, sedangkan kotak-kotak di `shared/dataset.py` saling tumpang tindih.
5. **Metode wilayah membandingkan hal yang tidak sebanding.** Jumlah satu sel dibandingkan dengan distribusi gabungan semua sel di wilayah itu. Akibatnya, sel yang memang selalu ramai lebih sering diberi flag.
6. **Uji "tahun aktif vs tahun sepi" melingkar.** Tahun aktif dan sepi ditentukan dari total dataset yang sama. Uji ini hanya memeriksa kewajaran arah, bukan validasi.
7. **Sesuai klaimnya, tapi bukan ML.** Kode tidak bocor ke masa depan: fold hanya melatih dengan tahun sebelum tahun uji, dan ini sudah dites. Tapi kedua metodenya statistik deskriptif, bukan model ML.

## 3. Kualitas dataset (`results/measure_archive.txt`)

**Ukuran dan cakupan**

| Ukuran | Nilai |
|---|---|
| Baris | 1.069.505 (archive 1.016.235 sampai 2026-06-30, NRT 53.270 dari 2026-07-01 s.d. 2026-09-24) |
| Sel 0,25° | 3.250; lintang −11 s.d. 5,75; bujur 95 s.d. 140,75 |
| Granularitas | 1 baris = (tanggal UTC, sel) dengan ≥1 event terharmonisasi. Bukan titik individual |
| Hari kosong nasional | 164 dari 9.459 hari; 161 di antaranya sebelum 2012-01-20 |
| Era VIIRS (≥ 2012-01-20) | 832.208 sel-hari |

**Perubahan sensor**

| Ukuran | Nilai |
|---|---|
| Lonjakan saat VIIRS masuk | 2011: 56.213 event → 2012: 306.627 event |
| Porsi MODIS yang terpasang ke VIIRS | 42–83% per tahun |
| Porsi VIIRS yang terpasang ke MODIS | 8–18% per tahun |

**Ukuran sampel per sel (era VIIRS)**

| Ukuran | Nilai |
|---|---|
| Hari teramati per sel | median 177, p10 5, p90 616 |
| Sel dengan sedikit data | 443 sel <10 hari; 1.263 sel <100 hari |
| (sel, bulan) dengan ≥5 tahun data | 58,8% (median 6 tahun) |

**Distribusi nilai (era VIIRS)**

| Ukuran | Nilai |
|---|---|
| Event per sel-hari | median 2, p90 8, p99 48, maks 1.362; 46% bernilai tepat 1 |
| `frp_sum` per sel-hari | median 10,1 MW, p99 756 MW; 17 baris bernilai 0 |
| Musim (Agustus–Oktober) | 71,4% dari semua event |
| Persistensi | 41,6% sel-hari aktif juga aktif pada hari sebelumnya |

**Kelas confidence VIIRS di CSV mentah (archive):** `n` 90,5%, `l` 6,1%, `h` 3,4%.

**Fitur yang bisa diturunkan dengan benar:**
- jumlah event harian, jumlah hari aktif per jendela waktu, FRP sum/max, jumlah deteksi per sensor;
- jarak dari deteksi terakhir, klimatologi per sel-bulan, aktivitas sel tetangga.

**Fitur yang tidak bisa:**
- luas terbakar, tutupan awan;
- penyebab api, jenis lahan (belum ada lapisan gambut atau tutupan lahan);
- titik individual dalam arsip.

## 4. Mendefinisikan masalahnya dulu

| Masalah | Bisa dengan data ini? | Alasannya |
|---|---|---|
| Harmonisasi MODIS–VIIRS | Tetap deterministik | Aturannya bisa diaudit. Masalah nyatanya duplikasi VIIRS–VIIRS (A1), dan itu soal aturan, bukan model |
| Anomali statistik ("tidak biasa dibanding sejarah sel ini") | Ya, bisa diperbaiki | A1, A3, dan A4 bisa diselesaikan dengan statistik biasa |
| Skor anomali ML tanpa label (mis. Isolation Forest) | Bisa dijalankan, tapi tidak bisa divalidasi | Tidak ada label. Lihat bagian 5 |
| Klasifikasi "api sungguhan atau bukan" (supervised) | Tidak | Tidak ada label kebakaran yang terverifikasi |
| Prediksi risiko kebakaran | Tidak | Tidak ada data bahan bakar, cuaca historis, maupun label. Risiko tetap tidak dihitung di mana pun |
| **Prakiraan jangka pendek: apakah sel ini masih akan terdeteksi satelit dalam 7 hari?** | **Ya** | Labelnya datang dari data itu sendiri (deteksi pada hari-hari berikutnya), jadi bisa diukur jujur dengan pemisahan per tahun. Yang diprediksi adalah *deteksi satelit*, bukan api |
| Prioritas investigasi | Sudah ada (formula) | Prakiraan di atas bisa menjadi satu masukan tambahan, dengan label yang jelas |

## 5. Perbandingan pendekatan

Semua angka model di bawah dari `forecast_probe` (rolling-origin per tahun):
- **Populasi:** sel yang aktif dalam 7 hari terakhir, dicuplik tiap minggu.
- **Data:** archive saja, VIIRS S-NPP.
- **Uji:** tahun 2018–2025, 375.129 sampel pada 733 tanggal.
- **Label:** ≥1 event pada hari t+1 sampai t+7 (base rate 49,4%).

| Pendekatan | Jenis | AP | AUC | Presisi top-50 per minggu | Catatan |
|---|---|---|---|---|---|
| Rekensi (hari sejak deteksi terakhir) | Aturan | 0,677 | 0,668 | 0,615 | |
| Persistensi (hari aktif 7 hari terakhir) | Aturan | 0,696 | 0,702 | 0,657 | |
| Klimatologi sel-bulan (tahun sebelumnya saja) | Statistik | 0,738 | 0,749 | 0,656 | Aturan terbaik |
| **Regresi logistik, 13 fitur** | **ML** | **0,782** | **0,783** | **0,707** | Brier 0,185 |
| Gradient boosting (HistGB) | ML | 0,786 | 0,789 | 0,713 | Hampir sama dengan logistik |

Dengan label "≥5 event dalam 7 hari" (base rate 18,8%):

| Pendekatan | AP |
|---|---|
| Regresi logistik | 0,622 |
| Gradient boosting | 0,626 |
| Klimatologi | 0,533 |

**Logistik mengalahkan klimatologi di 8 dari 8 tahun uji, untuk kedua label.** Contohnya: AP 2022 0,652 vs 0,593, dan AP 2019 0,884 vs 0,863. Gradient boosting hampir tidak menambah apa-apa dibanding logistik, padahal jauh lebih sulit dijelaskan.

Untuk masalah anomali:

| Pendekatan | Data | Bisa divalidasi? | Interpretasi | Keputusan |
|---|---|---|---|---|
| Baseline per sel sekarang (mean+2σ semua bulan) | Ada | Hanya cek kewajaran | Mudah | Pertahankan, setelah A1, A2, A4 diperbaiki |
| Baseline musiman per sel (bulan ±1) | Ada (96% sel-hari) | Rolling-origin, κ, sebaran per bulan | Mudah | **Pakai** sebagai pengganti, dengan fallback berlabel |
| Baseline wilayah-musim (eksperimen lama) | Ada | Sama | Sedang | Tinggalkan: membandingkan sel dengan gabungan wilayah (lihat temuan 5) |
| Isolation Forest pada fitur sel | Ada | **Tidak** | Rendah | **Tolak.** Skornya hanya mengikuti besarnya angka: korelasi Spearman 0,45 dengan event 7 hari dan 0,33 dengan FRP 7 hari. Isolation Forest tidak tahu konteks musim atau sel. AUC sebagai prediktor cuma 0,586, dan memang bukan itu fungsinya |

## 6. Rencana implementasi (urut prioritas)

### P0. Perbaiki keterbandingan data dulu (bukan ML, paling berdampak)

1. **Event VIIRS lintas-satelit.** Gabungkan deteksi VIIRS dari satelit berbeda (S-NPP/NOAA-20/NOAA-21) yang berjarak ≤ ±0,5 km pada lintasan yang sama menjadi satu event, sebelum `match_modis_viirs`. Parameternya harus diukur dulu, sama seperti cara 720 menit dulu dipilih. Event per sensor tetap disimpan.
   - **File:** `fire_pipeline/harmonize_events.py` (fungsi baru), `fire_pipeline/live.py` (`build_live_result`), test baru `tests/test_viirs_cross_satellite.py`.
2. **Perbandingan "tidak biasa" yang sebanding.** Pindahkan perhitungannya dari browser ke backend. Jumlah live yang dibandingkan dengan baseline S-NPP dihitung dari **MODIS + satu satelit VIIRS acuan**: S-NPP, atau NOAA-20 setelah 2 Nov 2026 dengan catatan tersendiri. Setiap respons harus menyebut satelit yang dipakai.
   - **File:** `fire_pipeline/historical.py`, `main.py` (`/api/historical/calendar`), `src/app/calendar/page.tsx`, `src/types/index.ts`.
3. **Minimal 10 hari sampel** sebelum std harian dipakai (`historical.py`, test di `tests/test_historical_calendar_endpoint.py`).
4. **Tandai baris NRT** di respons kalender, dan keluarkan baris itu dari baseline sampai arsip dibangun ulang (`historical.py`).
5. **Arsip NOAA-20 (J1V-C2).** Unduh dari FIRMS Archive Download (gratis), lalu bangun baseline per satelit, supaya baseline tetap hidup setelah S-NPP berhenti.
   - **File:** `scripts/build_historical_store.py` (argumen `--viirs-noaa20-archive`), kolom `satellite` di tabel.

### P1. Baseline musiman (statistik, siap dipakai)

- **Aturan:** sel aktif "tidak biasa untuk waktu ini" kalau event > mean + 2σ dari hari-hari aktif sel itu pada bulan yang sama ±1 bulan, di tahun-tahun sebelumnya. Syaratnya ≥10 hari dan ≥3 tahun. Kalau syarat tidak terpenuhi, pakai fallback semua bulan, dan fallback itu harus diberi label.
- **Skema per sel di `/api/historical/calendar?month=M`:**
  ```json
  {"gridLat": -2.25, "gridLon": 113.75,
   "seasonal": {"mean": 4.1, "std": 6.3, "sampleDays": 212, "sampleYears": 11, "months": [9, 10, 11]},
   "baselineKind": "seasonal | all-months-fallback | insufficient"}
  ```
- **Evaluasi:** rolling-origin per tahun seperti `seasonal_probe.py`. Laporkan κ, sebaran flag per bulan, porsi fallback, dan laju flag per tahun. Klaim akurasi tidak boleh dibuat.
- **File:** `fire_pipeline/historical.py`, `main.py`, `src/app/calendar/page.tsx`, `tests/test_historical_calendar_endpoint.py`.

### P2. Prakiraan aktivitas 7 hari (ML, masih eksperimen)

- **Model:** regresi logistik dengan 13 fitur:
  - jumlah event 1/3/7/30 hari terakhir;
  - jumlah hari aktif 7/30 hari terakhir;
  - FRP 7 hari terakhir;
  - jumlah hari sejak deteksi terakhir;
  - klimatologi sel-bulan dari tahun-tahun sebelumnya;
  - aktivitas 8 sel tetangga;
  - total event nasional 7 hari;
  - musim dalam bentuk sin/cos hari-dalam-tahun.

  Koefisiennya disimpan sebagai JSON, jadi produksi cukup memakai numpy. scikit-learn hanya dibutuhkan saat melatih.
- **Output pada `areas[]` di `/api/hotspots`:**
  ```json
  "activityOutlook": {"probability": 0.71, "horizonDays": 7,
    "meaning": "peluang sel ini masih terdeteksi satelit ≥1 kali dalam 7 hari",
    "model": "logreg-v1", "trainedThrough": "2025-12-31", "featuresComplete": true}
  ```
  Tampilkan di Priority Areas sebagai info tambahan. Prakiraan ini tidak boleh dicampur ke `priority_score` sebelum ada masukan dari petugas.
- **Syarat sebelum masuk produksi:**
  1. P0 butir 1 dan 2 selesai. Model dilatih dengan S-NPP saja, sedangkan live sekarang memakai 3 satelit, jadi fitur live harus dihitung dari set satelit yang sama.
  2. Kalibrasi diperiksa per tahun (reliability plot).
  3. Fitur 30 hari diambil dari jendela live 30d. Sumbernya sudah ada.
  4. Validasi silang dengan referensi independen (lihat bagian 7).
- **File baru:**
  - `ml_experiments/activity_forecast/` (`dataset.py`, `train.py`, `evaluate.py`, `tests/`, `README.md`);
  - `fire_pipeline/activity_outlook.py` (inferensi numpy, dibuat hanya kalau hasil eksperimen lolos);
  - `data/activity_outlook_logreg_v1.json`;
  - `tests/test_activity_outlook.py`.
- **File yang diubah:** `fire_pipeline/live.py` (menempelkan `activityOutlook`), `src/app/priority-areas/page.tsx`, `src/types/index.ts`.

### P3. Rapikan eksperimen lama

- Perbarui README `anomaly_detection/` (sudah dilakukan bersama audit ini).
- Ganti 5 kotak wilayah dengan provinsi BPS (`shared/dataset.py`).
- Tambahkan κ dan tabel kontingensi ke `evaluate.py`.
- Ganti `iterrows` dengan operasi vektor (`evaluate.py`).
- Ulang `matching_audit` dengan filter nominal+high.

## 7. Risiko, asumsi, dan rekomendasi

**Risiko dan asumsi**
- **Label prakiraan = deteksi, bukan api.** Awan atau asap yang menutupi api tercatat sebagai "tidak aktif". Model bisa saja mempelajari pola tutupan awan.
- **Pergeseran distribusi.** Ini terjadi kalau set satelit berubah: S-NPP berhenti, NOAA-20/21 masuk. Hal yang sama berlaku kalau NRT tanpa type==0 ikut terpakai, atau filter confidence diganti lagi.
- **Sampel tidak independen.** Sampel dari minggu yang sama dan sel yang bertetangga saling berkorelasi. Angka AP rata-rata per tahun cukup stabil (8/8 tahun), tapi selang kepercayaannya belum dihitung.
- **Tidak ada ground truth kebakaran** di proyek ini. Tidak ada angka precision/recall/akurasi "kebakaran" di mana pun dalam laporan ini.

**Data tambahan yang paling berguna (semuanya gratis)**
1. **Arsip VIIRS NOAA-20** dari FIRMS.
2. **MODIS Burned Area MCD64A1** (NASA LP DAAC). Diagregasi per sel-bulan, data ini bisa dipakai menguji apakah flag "tidak biasa" atau prakiraan berkaitan dengan area yang benar-benar terbakar. Algoritmanya berbeda dari deteksi titik api, jadi bisa jadi pembanding yang cukup independen.
3. **Rekap luas karhutla per provinsi per tahun dari SiPongi/KLHK**, untuk uji peringkat provinsi-tahun.
4. **Jawaban 5 pertanyaan untuk petugas** (ada di Kit Submission), sebagai validasi manual.

**Rekomendasi**
- **Untuk deteksi anomali: pertahankan pendekatan statistik.** Perbaiki dulu A1–A4 (P0), lalu ganti baseline-nya dengan baseline musiman (P1). ML belum memberi manfaat yang bisa dibuktikan untuk masalah ini.
- **Untuk prakiraan aktivitas 7 hari: lanjutkan riset (P2).** Ini satu-satunya masalah yang sekarang bisa dievaluasi jujur, dan model sederhana mengalahkan aturan terbaik secara konsisten. Model ini baru boleh masuk produksi setelah P0 selesai dan kalibrasinya diperiksa.
- **Harmonisasi MODIS–VIIRS tetap deterministik.** Kekurangan yang terlihat (duplikasi VIIRS–VIIRS, kandidat ganda saat musim padat) adalah soal aturan dan parameter, bukan soal model.

---

## Status P0 (dikerjakan 21 Oktober 2026)

Semua angka di bawah diukur pada **satu snapshot live yang dibekukan** (`results/snapshot_2026-10-21T0239Z/`, FIRMS 21 Okt 02:39 UTC, jendela 24 jam). Arsipnya juga sama, jadi angka sebelum dan sesudah memakai data dan definisi yang persis sama. Reproduksi:

```bash
.venv/bin/python -m ml_experiments.audit_2026_10.p0_before_after results/snapshot_2026-10-21T0239Z 2026-10-21T02:39
.venv/bin/python -m ml_experiments.audit_2026_10.p0_monthly_flags data/historical.sqlite
.venv/bin/python -m ml_experiments.audit_2026_10.viirs_cross_satellite_probe results/snapshot_2026-10-21T0239Z 2026-10-21T02:39
```

### Yang diubah

1. **Duplikat VIIRS lintas-satelit** (`harmonize_events.collapse_viirs_cross_satellite`).
   - **Aturan:** dua deteksi dari satelit VIIRS yang berbeda, berjarak ≤0,375 km dan ≤120 menit.
   - **Cara memasangkan:** kandidat diambil greedy dari pasangan terdekat. Satu kelompok berisi maksimal satu deteksi per satelit, dan wakil kelompoknya S-NPP.
   - **Dasar ambangnya** (`results/viirs_cross_satellite_probe.txt`): median jarak tetangga lintas-satelit 0,23–0,26 km, sedangkan piksel bersebelahan pada satelit yang sama berjarak median 0,38–0,41 km.
   - **Yang tidak berubah:** matching MODIS–VIIRS, marker, `detections` per area, dan skor prioritas. Semuanya diverifikasi identik pada snapshot: 1.106 area, 0 field berbeda, urutan prioritas sama.
   - **Yang ditambahkan:** `dedupedEvents`, `viirsCrossSatelliteDuplicates`, `meta.processing.viirsCrossSatellite`, dan `viirsDuplicate` per marker.
   - **Biaya waktu:**
     - +0,2 detik untuk 22 ribu deteksi;
     - ±4,5 detik pada uji sintetis 671 ribu deteksi (snapshot diulang 30 hari). Jendela 30 hari live belum diukur langsung.
2. **Populasi sebanding.**
   - Live menghitung `referenceEvents` per sel dari MODIS + satu platform VIIRS (S-NPP atau NOAA-20), khusus jendela 24 jam. Pada versi pertama, hitungan ini dijalankan di setiap build, dan waktu proses 24 jam naik dari 3,8 detik ke 8,2 detik. Saat FIRMS lambat, tambahan ini cukup untuk membuat permintaan peta melewati timeout 60 detik.
   - Sekarang hitungannya sesuai permintaan: `ensure_reference_counts()` baru berjalan saat `/api/historical/unusual` dipanggil, sekali per snapshot (±2 detik). Build 24 jam kembali ke 3,83 detik di snapshot yang sama.
   - Cache 24 jam juga memakai stale-while-revalidate. Kalau cache sudah kedaluwarsa, data sebelumnya langsung dikirim sambil satu thread mengambil data baru, sehingga hanya permintaan pertama setelah start yang menunggu FIRMS.
   - "Tidak biasa" dihitung di backend: `historical.compare_live_to_baseline` lewat `GET /api/historical/unusual`. Endpoint memilih platform yang ada di live **dan** di arsip.
   - Kalau tidak ada platform yang memenuhi, endpoint menjawab `comparable: false` beserta alasannya. Satelit lain tidak dipakai diam-diam sebagai pengganti.
3. **Minimal 10 hari.** `MIN_BASELINE_SAMPLE_DAYS = 10`. Sel dengan riwayat lebih pendek mendapat `baselineStatus: "insufficient-history"` di `/api/historical/calendar`, dan status yang sama di perbandingan. Sel itu tidak dibuang dan tidak dianggap normal.
4. **NRT.**
   - Baseline membuang baris `source = "nrt"`.
   - Bulan diberi `dataStatus` (`archive`/`nrt`/`mixed`) dan `nrtDetections`, lalu respons membawa `baseline.excludedNrtRows` dan `nrtDateRange`.
   - Heatmap menandai bulan NRT dengan garis putus-putus dan label "NRT". Insight bulan terakhir memberi catatan kalau bulan itu masih NRT.
5. **NOAA-20.**
   - `build_historical_store.py --viirs-noaa20-archive/--viirs-noaa20-nrt` membuat tabel `daily_area_activity_noaa20` (MODIS + NOAA-20), dan tabel `store_info` mencatat isi setiap tabel.
   - Tidak ada data NOAA-20 yang dibuat. Arsipnya belum diunduh, jadi tabelnya belum ada dan `archiveReferences` hanya `["SNPP"]`.

### Sebelum vs sesudah (snapshot yang sama)

| Langkah | Sel live | Sel dibandingkan | Tidak biasa | Porsi |
|---|---|---|---|---|
| A. Sebelum P0 (semua satelit VIIRS, std dari ≥2 hari, NRT di baseline) | 1.106 | 1.058 | 334 | **31,6%** |
| B. + populasi acuan MODIS + S-NPP | 669 | 647 | 54 | 8,3% |
| C. + minimal 10 hari | 669 | 645 | 53 | 8,2% |
| D. + baseline tanpa NRT (= produksi sekarang) | 669 | 635 | 60 | **9,4%** |

Langkah D dihitung ulang lewat fungsi produksi dan hasilnya sama: 60 tidak biasa dari 635 sel. Dari 1.106 sel live:
- 437 sel hanya terlihat oleh NOAA-20/21, jadi tidak ada angka S-NPP untuk dibandingkan;
- 22 sel tidak punya riwayat;
- 12 sel riwayatnya kurang dari 10 hari.

Setiap kelompok dilaporkan sendiri. Langkah D sedikit lebih tinggi dari C karena Juli–September 2026 (NRT) sangat aktif: ikut dalam baseline, data itu menaikkan rata-rata.

Per provinsi (A → D): Kalimantan Tengah 29,0% → 8,7%, Kalimantan Selatan 45,9% → 9,4%, Kalimantan Timur 24,5% → 4,2%, Sumatera Selatan 27,6% → 7,0%, Papua 43,0% → 7,9%.

**Duplikat:** 5.543 dari 20.413 deteksi VIIRS adalah pengulangan, dalam 4.439 kelompok. Jumlah kejadian 20.493 → 14.950 setelah dedup.

**Flag historis per bulan** (rolling-origin 2016–2025, `results/p0_monthly_flags.txt`): batas 10 hari hampir tidak berpengaruh.
- Porsi sel-hari yang bisa dibandingkan: 99,93% → 99,56%.
- Laju flag: 3,19% → 3,17%.
- Flag di Agustus–Oktober: 73,8% → 74,1% (porsi datanya 56,9%).

Artinya, bias musim (A3) tidak tersentuh oleh P0. Itu tugas P1.

**Live saat dicek di server lokal** (21 Okt ±03:05 UTC, bukan snapshot): 60 dari 636 sel dibandingkan secara nasional, dan 9 dari 103 untuk Kalimantan Tengah.

### Yang masih tersisa
- Skor prioritas dan angka deteksi di peta/dashboard masih memakai semua satelit tanpa dedup. Ini disengaja (prioritas tidak diubah dalam tugas ini). Memakai `dedupedEvents` di skor prioritas adalah keputusan terpisah yang perlu dievaluasi sendiri.
- Ambang 0,375 km / 120 menit dipilih dari satu snapshot (satu hari, Oktober). Perlu dicek di beberapa hari dan di tepi swath, karena piksel VIIRS melebar di tepi swath sehingga ada pasangan yang lolos dari ambang.
- Pengurangan dari 31,6% ke 9,4% menunjukkan angka lama tidak sebanding. Ini bukan bukti bahwa 9,4% "benar". Tetap tidak ada ground truth.
- Setelah 2 Nov 2026 (S-NPP berhenti), perbandingan akan berstatus `comparable: false` sampai arsip NOAA-20 diunduh dan dibangun.
- Jendela live tetap 24 jam bergulir, sedangkan arsip memakai tanggal UTC. Pada snapshot ini semua deteksi jatuh di satu tanggal UTC, tapi itu tidak selalu begitu.

### Langkah berikutnya: P1
1. Unduh arsip VIIRS NOAA-20 (J1V-C2, 2018–sekarang), bangun ulang arsip, lalu ukur rasio jumlah NOAA-20/S-NPP per sel di periode yang tumpang tindih.
2. Baseline musiman per sel (bulan ±1, minimal 10 hari dan 3 tahun) di `compare_live_to_baseline`, dengan `baselineKind` dan fallback yang diberi label. Evaluasi dengan `seasonal_probe.py` memakai definisi yang sama dengan P0.
3. Uji ulang ambang lintas-satelit pada 5–7 snapshot dari hari berbeda.

---

## Status P1: baseline musiman (21 Oktober 2026)

**Aturannya** ada di `historical.compare_live_to_baseline(..., month=...)`:
- Sel live dibandingkan dengan hari-hari aktifnya pada bulan yang sama ±1 bulan di tahun-tahun archive sebelumnya, dengan syarat minimal 10 hari dari 3 tahun berbeda (`baselineKind: "seasonal"`).
- Kalau syarat itu tidak terpenuhi, dipakai baseline semua bulan dengan syarat minimal 10 hari (`"all-months-fallback"`, jumlahnya dilaporkan).
- Kalau baseline semua bulan pun tidak cukup, statusnya `insufficient-history`.
- Endpoint memakai bulan UTC saat jendela live berakhir.

**Pengukuran** (`p1_seasonal_measure.py`, hasil di `results/p1_seasonal_measure.txt`):

| | P0 (semua bulan) | P1 (musiman) |
|---|---|---|
| Snapshot live 21 Okt (sama dengan P0) | 60/635 = 9,4% | **46/635 = 7,2%**; 625 sel musiman, 10 fallback |
| Rolling-origin 2016–2025: sel-hari yang dibandingkan | 99,56% | 99,56% (96,13% musiman, 3,43% fallback) |
| Laju flag | 3,17% | 3,71% |
| Flag di Agustus–Oktober | 74,1% | **56,9%** (porsi datanya 56,9%) |
| Spearman (total kejadian tahunan, laju flag) | 0,95 | 0,88 |
| Kesepakatan / κ | 98,33% / 0,749 | |

**Artinya:**
- Bias musim (A3) hilang: tanda tersebar mengikuti porsi data, tidak lagi menumpuk di musim kebakaran.
- Konsekuensinya, hari ramai di luar musim lebih sering ditandai. Januari–Mei kini sekitar 4,6–5,2%, sebelumnya 1,1–2,5%. Ini memang maksud aturannya ("tidak biasa untuk waktu ini"), tapi pengguna perlu tahu.
- Laju flag tahunan masih mengikuti tahun-tahun besar (2019 tertinggi), meski korelasinya sedikit turun.
- Tetap tidak ada ground truth. Ini perbaikan keterbandingan, bukan bukti akurasi.
