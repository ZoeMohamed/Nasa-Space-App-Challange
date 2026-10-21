# AGNIBHŪMĪ

Satu riwayat kebakaran hutan dan lahan dari dua generasi satelit NASA.

Dibuat untuk NASA Space Apps Challenge 2026, tantangan *Harmonization of MODIS and VIIRS Hot Spots*.

---

## Kenapa kami membuat ini

Satelit NASA sudah mencatat titik panas di Indonesia sejak tahun 2000. MODIS mulai merekam tahun 2000, VIIRS menyusul tahun 2012. Masalahnya, kedua sensor itu berbeda dalam banyak hal:
- ukuran piksel (1 km vs 375 m);
- jam lewat di atas Indonesia;
- cara menulis tingkat keyakinan (confidence).

Akibatnya, catatan keduanya tidak bisa langsung dijejerkan. Kalau angka 2010 dibandingkan begitu saja dengan 2020, yang terlihat bukan perubahan jumlah api, melainkan perubahan sensor.

Di Indonesia ini bukan soal teknis saja. Hampir tiap musim kemarau, Kalimantan dan Sumatra tertutup asap; 2015 dan 2019 yang paling parah. Petugas butuh jawaban yang sederhana: hari ini wajar atau tidak untuk wilayah ini, dan titik mana yang perlu dicek duluan. Warga butuh tahu apakah asap sedang mengarah ke rumah mereka.

AGNIBHŪMĪ mencoba menjawab itu. Kami menyatukan deteksi MODIS dan VIIRS, menyusunnya jadi kalender kebakaran 2000–2026, membandingkan kondisi hari ini dengan riwayat tiap sel grid, lalu menghubungkan laporan warga dengan deteksi satelit di dekatnya.

Ada dua tampilan, keduanya memakai backend yang sama:
- **Operator** (`/operator`) untuk petugas dan peneliti;
- **Community** (`/community`) untuk warga.

## Yang perlu diingat sebelum membaca angkanya

- **Titik panas belum tentu kebakaran.** Satelit menangkap anomali suhu. Itu bisa api di lahan, tapi bisa juga atap pabrik yang panas atau flare kilang. Semua halaman menyebut ini.
- **Skor prioritas itu formula, bukan AI.** Bobotnya kami pilih sendiri dan belum pernah diuji bersama instansi pemadam. Gunanya untuk mengurutkan mana yang dicek duluan, bukan untuk mengukur bahaya.
- **Kami tidak menghitung risiko kebakaran.** Untuk itu dibutuhkan data bahan bakar, kelembapan tanah, dan lain-lain yang tidak kami punya.
- **Semua angka penting dihitung di backend Python** (`python-service/fire_pipeline/`). Frontend hanya menampilkan.
- **Data contoh selalu diberi label "Contoh".** Data contoh hanya muncul kalau data asli gagal dimuat, dan tidak pernah dicampur diam-diam dengan data asli.

## Fitur

### 1. Harmonisasi MODIS + VIIRS

Backend mengambil data NRT dari 4 sumber NASA FIRMS sekaligus: MODIS, VIIRS Suomi-NPP, VIIRS NOAA-20, dan VIIRS NOAA-21. Datanya dibersihkan dulu: koordinat harus valid, FRP tidak boleh negatif, dan baris dobel dibuang.

Setelah itu, setiap deteksi MODIS dipasangkan dengan deteksi VIIRS terdekat yang jaraknya ≤10 km dan selisih waktunya ≤12 jam. Batas 12 jam kami pilih setelah mengukur data asli: pasangan yang jaraknya kurang dari 1 km ternyata sering berselisih 2–15 jam, karena jam lewat kedua satelit memang berbeda. Pasangan yang cocok dihitung sebagai satu kejadian dengan FRP terbesar dari keduanya, dan muncul di peta sebagai satu ikon 🔥.

Kode: `matching.py`, `harmonize_events.py`, `live.py`.

### 2. Kalender aktivitas kebakaran

Kalender (`/calendar`) adalah inti tantangannya, jadi ia menjadi menu pertama di sidebar. Datanya berasal dari arsip FIRMS 2000–2026 yang sudah dipadatkan menjadi 1.069.505 baris, ditambah data live sampai kemarin. Satu baris berisi jumlah kejadian pada satu tanggal di satu sel grid 0,25°. Isi halaman ini:
- heatmap bulan × tahun;
- ringkasan per tahun;
- beberapa insight yang dihitung langsung dari arsip, dan setiap angkanya bisa diklik untuk melihat data mentahnya.

Analisis bisa dipersempit sampai tingkat kabupaten atau kecamatan, atau ke **area yang digambar sendiri di peta**, misalnya batas konsesi, taman nasional, atau kubah gambut. Caranya: klik titik-titik sudutnya di peta. Semua angka di Kalender lalu dihitung untuk area itu: kedua seri, bulan tidak biasa, periode kritis, perbandingan hari ini, bulan berjalan, dan CSV. Areanya tersimpan di URL, jadi bisa dibagikan. Seperti kecamatan, yang dihitung adalah semua sel grid 0,25° yang tersentuh garis area.

Kalender punya dua seri:
- **Sebanding 2000–2026 (MODIS saja)**, pilihan bawaan. Seri ini memakai sensor yang sama sejak 2003, jadi tahun-tahun bisa dibandingkan langsung. Kalau VIIRS ikut dihitung, angka sejak 2012 melonjak sekitar 5 kali (rata-rata 5,39× selama 2012–2025) hanya karena ada sensor baru, bukan karena apinya bertambah. Tahun 2000–2002 hanya berisi Terra, karena Aqua baru mulai Juli 2002, jadi ditandai * dan tidak dipakai untuk perbandingan.
- **Detail 2012–2026 (MODIS + VIIRS)** memperlihatkan lebih banyak api kecil, tapi hanya mulai 2012.

Catatan: orbit Terra dan Aqua bergeser sejak 2021–2022, dan dampaknya ke jumlah deteksi masih diteliti NASA.

Kalender juga menjawab tiga bagian lain dari tantangan:
- **Bulan berjalan dari data live.** Arsip berakhir 24 September 2026, dan hari-hari sesudahnya diisi dari data live 30 hari dengan definisi yang sama:
  - seri sebanding memakai deteksi MODIS;
  - seri detail memakai kejadian MODIS + Suomi-NPP.

  Bulan yang belum selesai diberi label "1–N", dan dibandingkan dengan tanggal yang sama di tahun-tahun lain, bukan dengan satu bulan penuh. Kalau ada hari yang gagal diambil dari FIRMS, bulan itu dikosongkan dengan keterangan, supaya tidak terlihat seperti bulan yang sepi.
- **Bulan tidak biasa (*unusual conditions*).** Bulan yang lebih dari rata-rata + 2 standar deviasi dibanding bulan yang sama di tahun-tahun lain diberi titik merah. Data sementara tidak ikut dinilai.
- **Periode kritis (*critical periods*).** Bulan yang rata-ratanya minimal 1,5× rata-rata bulan biasa ditandai di header kalender, lengkap dengan perkiraan kapan periode berikutnya mulai. Secara nasional hasilnya Agustus–Oktober, yang memuat 69% kejadian setahun.
- **Unduh CSV.** Data bulanan wilayah yang dipilih bisa diunduh: kedua seri, status data, dan tanda-tandanya.

Ada juga kotak "area dengan aktivitas tidak biasa". Kotak ini menandai sel yang jumlah kejadian hari ini melebihi rata-rata hariannya ditambah 2 standar deviasi. Perbandingan ini dihitung di backend (`/api/historical/unusual`), dengan aturan berikut:
- **Sensor yang sama di kedua sisi.** Arsip hanya berisi MODIS + VIIRS Suomi-NPP, jadi angka live yang dibandingkan juga hanya dari MODIS + Suomi-NPP. Kalau Suomi-NPP sedang tidak tersedia di data live, kotak ini menulis "belum bisa dibandingkan". Angka dari satelit lain tidak dipakai sebagai pengganti.
- **Riwayat minimal 10 hari.** Sel dengan riwayat kurang dari 10 hari ditampilkan terpisah sebagai "riwayat kurang".
- **Data sejak 2012 saja.** VIIRS baru ikut menyumbang deteksi sejak 2012. Kalau data sebelum 2012 ikut dihitung, baseline jadi terlalu rendah dan hari biasa ikut ditandai.
- **Data NRT tidak dipakai.** Bulan Juli–September 2026 masih data NRT sementara, jadi tidak dipakai sebagai baseline dan ditandai "NRT" di heatmap.

### 3. Area prioritas

`/priority-areas` mengurutkan sel grid berdasarkan `priority_score`. Rumusnya ada di tabel di bawah. Halaman ini juga menjelaskan alasan setiap sel mendapat skornya: FRP-nya, berapa hari berturut-turut aktif, dan apakah terlihat oleh kedua sensor.

### 4. Laporan warga

Warga bisa melapor lewat `/community/report`: lokasi (cari nama kecamatan atau pakai GPS), jenis kejadian, dan satu foto. Laporan tersimpan di `reports.sqlite`. Sistem otomatis mencari deteksi satelit dalam radius 5 km dan 24 jam dari laporan itu.

Hasil pencocokan ini tidak mengubah status laporan. Yang memutuskan tetap petugas, di `/citizen-reports`.

### 5. Status wilayah untuk warga

Beranda Community menampilkan status Aman / Waspada / Siaga / Awas untuk lokasi warga. Statusnya diambil dari faktor yang tingkatnya paling tinggi:
- jarak ke titik panas terdekat;
- titik panas yang berada di arah datangnya angin;
- kualitas udara (US AQI dari Open-Meteo);
- laporan warga yang sudah diverifikasi petugas.

Faktor penentunya selalu ditulis di bawah status. Kami menambahkan faktor kualitas udara setelah menemukan kasus di Kec. Maliku: titik panas terdekat 14,9 km sehingga status menyatakan "Aman", padahal AQI di sana 525.

### 6. Edukasi

`/community/edukasi` berisi:
- checklist tas siaga;
- panduan melindungi keluarga dari asap (mengacu ke WHO);
- 6 skenario latihan "apa yang harus saya lakukan";
- halaman fakta dengan daftar pustaka.

### 7. Dua bahasa

Semua halaman bisa diganti ke bahasa Indonesia atau Inggris.

## Filter wilayah dan rentang waktu

Dua dropdown di header Operator menyimpan pilihan di URL (`?region=` dan `?range=`), jadi pilihannya tetap terbawa saat pindah halaman.

- **Wilayah:** 34 provinsi sesuai batas BPS 2020. Tujuh provinsi rawan karhutla ditaruh paling atas.
- **Rentang waktu:**

| Pilihan | Sumber | Catatan |
|---|---|---|
| 24 jam, 7 hari, 30 hari | FIRMS NRT live | API FIRMS hanya menerima 1–5 hari per permintaan, jadi 7 dan 30 hari diambil per potongan 5 hari lalu disimpan di cache. Pemuatan pertama 30 hari bisa sampai ±80 detik |
| Jan 2023 – Des 2024 | Arsip (`historical.sqlite`) | Hanya total harian per sel grid, tanpa titik individual dan tanpa skor prioritas |

Peta menampilkan paling banyak 3.000 titik dengan FRP tertinggi. Total, grafik, dan skor area tetap dihitung dari semua deteksi.

## Cara angka dihitung

| Perhitungan | Aturan | Kode |
|---|---|---|
| Filter confidence | Kelas FIRMS sedang + tinggi: MODIS ≥ 30%, VIIRS `n`/`h`. Hanya kelas "low" yang disembunyikan | `clean.py: usable_confidence_mask()` |
| Pasangan MODIS–VIIRS | Jarak ≤10 km dan selisih waktu ≤720 menit; greedy dan deterministik | `matching.py: match_modis_viirs()` |
| Kejadian terharmonisasi | Satu pasangan = satu kejadian, FRP = nilai terbesar dari pasangan itu | `harmonize_events.py` |
| Duplikat VIIRS lintas-satelit | Deteksi dari dua satelit VIIRS berbeda yang berjarak ≤0,375 km dan ≤120 menit dihitung satu kali (`dedupedEvents`). Satu kelompok berisi maksimal satu deteksi per satelit, jadi piksel bersebelahan dari satelit yang sama tidak pernah digabung. Skor prioritas belum memakai angka ini | `harmonize_events.py: collapse_viirs_cross_satellite()` |
| Attention score | 0,45 × peringkat FRP + 0,30 × persistensi + 0,25 × peringkat jumlah deteksi | `features.py: attention_features()` |
| Priority score | 0,5 × attention + 0,3 × peringkat tren + 0,2 × peringkat jumlah deteksi. Tier: High ≥0,66, Medium ≥0,33 | `model.py: deterministic_priority()` |
| Aktivitas tidak biasa | Kejadian MODIS + Suomi-NPP hari ini > rata-rata + 2 × standar deviasi hari-hari aktif sel itu pada bulan yang sama ±1 bulan di tahun-tahun sebelumnya (minimal 10 hari dan 3 tahun). Kalau riwayat musimnya kurang, dipakai semua bulan dan diberi label. Baseline hanya dari baris archive sejak 2012-01-20 | `historical.py: compare_live_to_baseline()` |
| Laporan ↔ satelit | Jarak ≤5 km dan selisih waktu ≤24 jam | `correlation.py` |

## Apakah ML membantu? (audit Oktober 2026)

Sebelum menambahkan ML, kami ingin tahu dulu apakah ML benar-benar menyelesaikan masalah yang ada. Hasil lengkap, skrip, dan cara menjalankan ulangnya ada di [`python-service/ml_experiments/audit_2026_10/`](python-service/ml_experiments/audit_2026_10/README.md). Ringkasannya:

- **Masalah terbesar justru ada di datanya, bukan di metodenya.** Arsip VIIRS kami hanya berisi satelit Suomi-NPP, sedangkan data live mengambil 3 satelit VIIRS. Api yang sama yang terlihat dua satelit VIIRS dihitung sebagai dua kejadian. Saat kami ukur (21 Okt), 31,6% sel live ditandai "tidak biasa". Kalau live hanya memakai Suomi-NPP seperti arsipnya, angkanya 8,3%. **Sudah diperbaiki (P0, 21 Okt):** di snapshot yang sama, angkanya sekarang 9,4% (60 dari 635 sel). Rincian langkahnya ada di laporan audit.
- **Baseline lama ikut menandai musim kebakaran.** 74% tanda "tidak biasa" jatuh di Agustus–Oktober, padahal porsi datanya di bulan-bulan itu 57%. **Sudah diperbaiki (P1, 21 Okt):** sekarang setiap sel dibandingkan dengan bulan yang sama ±1 bulan di tahun-tahun sebelumnya. Di arsip 2016–2025, porsi tanda di Agustus–Oktober turun menjadi 56,9%, sama dengan porsi datanya. Metode ini statistik biasa, bukan ML.
- **Eksperimen anomali yang lama perlu dikoreksi.** Angka fallback 31,5% ternyata cuma efek pembagian fold. Angka kesepakatan 95–97% juga sebagian besar kebetulan, karena kedua metode jarang sekali memberi tanda. Keduanya sudah dikoreksi di README eksperimennya.
- **Isolation Forest kami tolak.** Skornya hanya mengikuti besar kecilnya angka. Selain itu tidak ada label untuk mengujinya.
- **Satu masalah memang cocok untuk ML:** memperkirakan apakah sebuah sel masih akan terdeteksi satelit dalam 7 hari ke depan. Labelnya diambil dari data itu sendiri, jadi bisa diuji dengan jujur. Regresi logistik sederhana mengalahkan aturan terbaik (klimatologi per sel) di 8 dari 8 tahun uji: average precision 0,78 vs 0,74. Yang diperkirakan adalah deteksi satelit, bukan kebakaran, dan model ini belum masuk produksi.

Rencananya: perbaiki keterbandingan data dulu (sudah, P0), lalu pasang baseline musiman (sudah, P1). Model prakiraan 7 hari tetap di tahap riset sampai kedua hal itu selesai.

## Arsitektur

```text
NASA FIRMS (MODIS + VIIRS, NRT)      ──┐
Open-Meteo (angin + kualitas udara)  ──┤
Arsip FIRMS 2000–2026 (offline)      ──┼──► FastAPI (python-service/)  ──► Next.js (src/app/)
Batas wilayah BPS via OCHA (offline) ──┘     fire_pipeline/
                                              ├─ historical.sqlite  (arsip, read-only)
                                              ├─ admin_boundaries.sqlite (read-only)
                                              └─ reports.sqlite     (laporan warga, read-write)
```

- **Frontend:** Next.js App Router, React, TypeScript, Tailwind, Leaflet.
- **Backend:** Python 3.12, FastAPI, pandas, numpy, shapely.
- **Penyimpanan:** SQLite saja. Kami sengaja tidak menambah layanan berbayar.
- **Belum ada login** di sisi Operator maupun Community. Siapa pun yang punya link bisa mengubah status laporan, dan ini juga ditulis di halaman `/citizen-reports`.
- **Identitas pelapor:** token acak yang disimpan di browser, bukan akun.

## API backend

| Endpoint | Fungsi |
|---|---|
| `GET /api/health` | Cek backend hidup |
| `GET /api/hotspots` | Deteksi live terharmonisasi. Param: `window` (24h/7d/30d), `province`, `near_lat`/`near_lon`/`near_km`, `marker_id`, `limit`, `order=recent`, `include_all_confidence` |
| `GET /api/historical/calendar` | Data bulanan (dengan status `archive`/`nrt`/`mixed`) + baseline per sel (dengan `baselineStatus`). Param: `province`, `admin_code`, atau `polygon` (`lat,lon;lat,lon;...`, area gambar sendiri). Param area yang sama berlaku di `/unusual` dan `/live-months` |
| `GET /api/historical/live-months` | Bulan-bulan setelah arsip berakhir, dihitung dari data live dengan definisi arsip, plus pembanding "tanggal 1–N" untuk bulan yang belum selesai |
| `GET /api/historical/unusual` | Sel live 24 jam dibandingkan dengan baseline arsipnya, pada populasi sensor yang sama dan musim yang sama (bulan ini ±1 bulan). Setiap sel mendapat satu status: `unusual`, `within-baseline`, `insufficient-history`, `no-history`, atau `not-seen-by-reference`, plus `baselineKind` (`seasonal` atau `all-months-fallback`). Param: `province`, `admin_code`, atau `polygon` |
| `GET /api/historical/map` | Agregat grid arsip untuk peta |
| `GET /api/region`, `GET /api/region/search` | Titik → kecamatan/kab-kota/provinsi, dan pencarian nama wilayah |
| `GET /api/weather` | Angin dan kualitas udara untuk satu titik |
| `POST/GET /api/reports`, `GET/PATCH /api/reports/{id}`, `GET /api/reports/{id}/photo` | Laporan warga |

Dokumentasi Swagger tersedia di `http://127.0.0.1:8000/docs` saat backend berjalan.

## Menjalankan di komputer sendiri

Yang dibutuhkan: Node.js 20+, Python 3.12+, dan Map Key NASA FIRMS (gratis, daftar di [firms.modaps.eosdis.nasa.gov/api/area](https://firms.modaps.eosdis.nasa.gov/api/area/)).

```bash
npm install
python3.12 -m venv python-service/.venv
python-service/.venv/bin/pip install -r python-service/requirements.txt
cp .env.example .env.local     # isi NASA_FIRMS_MAP_KEY
```

Lalu jalankan dua terminal:

```bash
# backend
python-service/.venv/bin/python -m uvicorn main:app --app-dir python-service --host 127.0.0.1 --port 8000

# frontend
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Buka http://127.0.0.1:3000.

### Membangun ulang arsip (opsional)

Arsip dibangun dari CSV FIRMS Archive Download:

```bash
python-service/.venv/bin/python python-service/scripts/build_historical_store.py \
  --modis-archive fire_archive_M-C61_*.csv --modis-nrt fire_nrt_M-C61_*.csv \
  --viirs-archive fire_archive_SV-C2_*.csv --viirs-nrt fire_nrt_SV-C2_*.csv \
  --out python-service/data/historical.sqlite
```

Kalau arsip NOAA-20 (produk FIRMS `J1V-C2`) sudah diunduh, tambahkan `--viirs-noaa20-archive fire_archive_J1V-C2_*.csv` (dan `--viirs-noaa20-nrt`). Builder lalu membuat tabel kedua, `daily_area_activity_noaa20` (MODIS + NOAA-20). Setelah Suomi-NPP berhenti, Kalender otomatis memakai tabel itu sebagai acuan. Tanpa file itu, tabelnya tidak dibuat dan tidak diperkirakan dari apa pun.

Arsip selalu dibangun dari nol, jadi menjalankannya dua kali tidak menghasilkan data dobel. Prosesnya ±7,5 menit dan butuh RAM ±7 GB. Hasilnya 118 MB, lebih besar dari batas file GitHub (100 MB), jadi untuk dibagikan dan di-deploy arsip disiapkan dalam bentuk `.gz` (29 MB). Dockerfile yang mengekstraknya.

### Data batas wilayah (opsional tapi disarankan)

Supaya lokasi tampil sebagai "Kec. X, Kab. Y", bangun `admin_boundaries.sqlite` dari data OCHA COD-AB Indonesia ([data.humdata.org/dataset/cod-ab-idn](https://data.humdata.org/dataset/cod-ab-idn)):

```bash
python-service/.venv/bin/pip install pyogrio   # hanya untuk build
python-service/.venv/bin/python -I python-service/scripts/build_admin_boundaries.py \
  <path>/idn_admin_boundaries.gdb --out python-service/data/admin_boundaries.sqlite
```

Kalau file ini tidak ada, aplikasi tetap jalan dan lokasi ditampilkan sebagai koordinat.

### Test

```bash
cd python-service && .venv/bin/python -m pytest          # 122 test produksi
.venv/bin/python -m pytest ml_experiments                # 22 test riset (terpisah dari produksi)
cd .. && npm run lint && npm run build
```

Panduan deploy (Render + Vercel, Docker) ada di [DEPLOY.md](DEPLOY.md).

## Struktur folder

```text
src/app/                  halaman Operator (calendar, operator, map, analytics, priority-areas,
                          citizen-reports, data-model) dan Community (community/*)
src/components/map/       FireMap (★ MODIS, ⬡ VIIRS, 🔥 terharmonisasi, 👤 laporan warga),
                          AoiDrawMap (gambar area sendiri)
src/lib/                  filter wilayah & waktu, hook data live, i18n,
                          calendarSeries (bulan live, bulan tidak biasa, periode kritis, CSV),
                          aoiPolygon (area gambar sendiri)
python-service/
  fire_pipeline/          clean, matching, harmonize_events, features, model, live,
                          historical, live_calendar, reports, correlation, weather, admin_lookup
  scripts/                build_historical_store.py, build_admin_boundaries.py
  ml_experiments/         riset terpisah: anomaly_detection/, matching_audit/, audit_2026_10/
  tests/                  test produksi
  data/                   historical.sqlite(.gz), admin_boundaries.sqlite, reports.sqlite
```

## Keterbatasan

- **Angka deteksi di peta dan skor prioritas masih memakai semua satelit VIIRS, dan duplikatnya belum dibuang.** Kalender sudah memakai populasi yang sebanding. Jumlah kejadian setelah dedup (`dedupedEvents`) sudah dihitung, tapi belum dipakai di skor prioritas. Kami sengaja tidak mengubah skor prioritas di tahap ini.
- **Suomi-NPP berhenti mengirim data baru per 2 November 2026.** Live tetap berjalan dengan NOAA-20/21. Kalender butuh arsip NOAA-20; sampai arsip itu dibangun, kotak "tidak biasa" akan menulis "belum bisa dibandingkan".
- **Tiga bulan terakhir arsip (Juli–September 2026) adalah data NRT.** Data NRT belum disaring ke api vegetasi saja, jadi flare industri dan sumber panas statis ikut terhitung (di data archive, sumber seperti ini sekitar 10–13% baris). Bulan-bulan itu tetap tampil di heatmap dengan tanda "NRT", tapi tidak dipakai sebagai baseline.
- **Hari tanpa deteksi tidak sama dengan hari tanpa api.** Awan dan asap tebal bisa menutupi api.
- **Satuan terkecilnya sel grid 0,25° (±27 km).** Untuk kecamatan kecil atau area gambar sendiri, angkanya bisa ikut menghitung api dari luar area, karena semua sel yang tersentuh garis area ikut dihitung.
- **Ambang yang kami pilih sendiri:** periode kritis memakai 1,5× rata-rata bulan biasa, dan "tidak biasa" memakai rata-rata + 2 standar deviasi. Keduanya ditulis di halaman, tapi belum divalidasi bersama instansi.
- **Patokan musiman membuat hari ramai di luar musim lebih sering ditandai** (Januari–Mei sekitar 5%, sebelumnya 1–2,5%). Itu memang maksudnya ("tidak biasa untuk waktu ini"), tapi perlu diketahui pembaca.
- **Permintaan pertama setelah server dinyalakan lambat:** sekitar 50 detik untuk 24 jam dan sampai sekitar 2–3 menit untuk 30 hari. Setelah itu, data lama langsung ditampilkan sambil yang baru diambil di belakang.
- **Tanggal di arsip memakai UTC,** bukan WIB.
- **Skor prioritas belum divalidasi** bersama Manggala Agni atau BPBD.
- **Kualitas udara memakai US AQI, bukan ISPU Indonesia.** Ambang batas kedua skala berbeda.
- **Belum ada login,** dan `reports.sqlite` akan hilang kalau dijalankan di server tanpa disk tetap.

## Sumber data

- Teks tantangan: [NASA Space Apps 2026: Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/harmonization-of-modis-and-viirs-hot-spots/)
- [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/): data live dan arsip MODIS C6.1, VIIRS S-NPP/NOAA-20/NOAA-21
- [Active Fire Data Attributes](https://www.earthdata.nasa.gov/data/tools/firms/active-fire-data-attributes-modis-viirs) (NASA Earthdata): arti kolom confidence, FRP, type, dan pengumuman berhentinya Suomi-NPP
- [Open-Meteo](https://open-meteo.com/): angin dan kualitas udara, gratis tanpa API key
- [OCHA COD-AB Indonesia](https://data.humdata.org/dataset/cod-ab-idn): batas wilayah BPS 2020, lisensi CC BY-IGO
- [WHO: Wildfires and health](https://www.who.int/news-room/fact-sheets/detail/wildfires-and-health), dan sumber lain yang tercantum di halaman Fakta
