# Audit Matching MODIS-VIIRS (radius_km / time_minutes)

**Status: eksperimen/audit, terisolasi dari produksi.** Tidak ada yang mengimpor dari direktori ini ke `fire_pipeline/`, `main.py`, atau frontend. Semua fungsi di `audit_matching.py` memanggil `fire_pipeline.clean`/`fire_pipeline.matching` lewat import saja (dipanggil, tidak pernah diedit).

Audit ini dipicu oleh satu pertanyaan: **apakah `radius_km=10` dan `time_minutes=720` di `match_modis_viirs()` (`fire_pipeline/matching.py`) didukung bukti, atau cuma asumsi rekayasa?**

## A. Asal-usul parameter (dari `git log -p`, bukan dugaan)

| Commit | Tanggal | Perubahan |
|---|---|---|
| `40eab62` | 2026-10-13 | `radius_km=10, time_minutes=60` muncul pertama kali **tanpa justifikasi apa pun** di docstring — bagian dari kode awal yang diwarisi. |
| `59fb49b` | 2026-10-17 | Tidak berubah. |
| `d872c6c` | 2026-10-18 | `time_minutes` 60→720, dengan alasan terukur (gap waktu nyata 128-891 menit pada pasangan berjarak <1km, lihat docstring `match_modis_viirs`). **`radius_km=10` tidak pernah diubah atau diaudit sampai audit ini.** |

## Metodologi

Data mentah FIRMS asli (bukan live, bukan agregat `historical.sqlite`) — MODIS + VIIRS archive, difilter lewat pipeline produksi yang sama persis (`high_confidence_mask`, `type==0`, `harmonize`, `add_quality_flags`, `deduplicate_detections`, dipakai ulang lewat import). Sampel: **Kalimantan Tengah + Kalimantan Selatan, September 2019** (bulan/tahun aktivitas tinggi yang terdokumentasi di audit sebelumnya) — bukan dipilih untuk hasil tertentu, tapi tetap satu sampel, bukan seluruh arsip (lihat Keterbatasan).

Hasil setelah filter: **7.054 deteksi MODIS, 3.812 deteksi VIIRS.**

## Hasil

### B. Distribusi tetangga lintas-sensor terdekat (cap generous 50km/48jam)

| | MODIS → VIIRS terdekat | VIIRS → MODIS terdekat |
|---|---|---|
| Median jarak | 0,95 km | 0,54 km |
| P75 jarak | 4,16 km | 2,72 km |
| P90 jarak | 15,02 km | 11,11 km |
| Median selisih waktu | 874 menit (14,6 jam) | 765 menit (12,75 jam) |
| P75 selisih waktu | 1.642 menit (27,4 jam) | 1.484 menit (24,7 jam) |

**Separuh deteksi MODIS punya tetangga VIIRS terdekat dalam <1km — tapi median selisih waktunya 14,6 jam, melebihi 720 menit.** Konsisten dengan fakta orbital nyata: Terra (~10:30/22:30 waktu lokal), Aqua (~13:30/01:30), Suomi-NPP VIIRS (~13:50/01:30) — Aqua-VIIRS bisa berdekatan waktu (~20 menit), tapi Terra-VIIRS bisa berselisih berjam-jam di hari yang sama.

### C. Tabel sensitivitas jarak × waktu (algoritma produksi, dijalankan apa adanya)

| Jarak (km) | Waktu (menit) | Pasangan matched | % MODIS matched | MODIS dgn ≥2 kandidat |
|---|---|---|---|---|
| 1 | 60 | 870 | 12,3% | 466 |
| 1 | 720 | 1.587 | 22,5% | 1.285 |
| 5 | 720 | 2.083 | 29,5% | 2.982 |
| **10** | **720 (produksi)** | **2.285** | **32,4%** | **3.578** |
| 20 | 720 | 2.589 | 36,7% | 4.468 |

(Tabel lengkap 16 kombinasi ada di `results/latest.txt`.) **Waktu adalah pengungkit utama, bukan jarak** — memperlebar jarak 1km→20km (waktu tetap 720) hanya menambah ~14 poin %, sementara memperlebar waktu sudah terbukti jauh lebih efektif per temuan sebelumnya.

### Tugas 2 — 12 jam vs 24 jam (dibandingkan, BUKAN diklaim salah satu lebih baik)

Pada radius produksi (10km):

| Jendela waktu | Pasangan | % MODIS matched | MODIS ambigu | Pasangan dgn rasio FRP >10x |
|---|---|---|---|---|
| **720 menit (12h, produksi saat ini)** | 2.285 | 32,4% | 3.578 | 248/2.283 (10,9%) |
| 1.440 menit (24h) | 2.581 | 36,6% | 4.531 | 256/2.579 (9,9%) |

**Baca hati-hati — ini bukan bukti 24 jam lebih baik:**
- 24h menambah +296 pasangan (+4,2 poin %), tapi menambah +953 kasus ambigu (+26,6% relatif) — **ambiguitas tumbuh jauh lebih cepat daripada jumlah pasangan**.
- Fraksi pasangan dengan rasio FRP ekstrem (>10x) sedikit lebih rendah di 24h (9,9% vs 10,9%) — jadi metrik ini sendiri *tidak* menunjukkan kualitas pasangan memburuk di 24h, tapi ambiguitas yang melonjak tetap biaya nyata yang harus ditimbang.
- **Kesimpulan**: P75 selisih waktu tetangga terdekat (27,4 jam, dari bagian B) memang alasan sah untuk menguji jendela lebih panjang — hasil di atas menunjukkan 24h *mungkin* bisa dipertimbangkan, tapi dengan ongkos ambiguitas yang harus diterima sadar, bukan keputusan otomatis.

### Tugas 3 — Evaluasi ambiguitas: kandidat yang bersaing masuk akal secara geografis/temporal?

Pada pengaturan produksi (10km/720min), dari **3.578 deteksi MODIS dengan ≥2 kandidat VIIRS**, diukur seberapa jauh kandidat-kandidat itu **satu sama lain** (bukan jarak ke MODIS, tapi jarak antar-kandidat VIIRS):

| Metrik | Nilai |
|---|---|
| Median sebaran jarak maksimum antar-kandidat | 6,16 km |
| P75 sebaran jarak maksimum | 10,01 km |
| P90 sebaran jarak maksimum | 13,72 km |
| Set kandidat yang SEMUANYA dalam 2km satu sama lain (kemungkinan besar kebakaran sama, ambiguitas rendah-risiko) | **887/3.578 (24,8%)** |
| Set kandidat dengan sebaran >10km (kandidat bisa jadi kebakaran berbeda, ambiguitas berisiko lebih tinggi) | **896/3.578 (25,0%)** |

**Baca jujur**: sekitar seperempat dari semua kasus ambigu (896 dari 3.578) punya kandidat yang tersebar >10km — cukup jauh untuk masuk akal sebagai kebakaran fisik yang berbeda, bukan satu kebakaran yang sama dilihat dua sensor. Ini **bukan bukti kesalahan nyata** (tidak ada ground truth untuk memastikan), tapi mengonfirmasi risiko di temuan D audit sebelumnya bukan sekadar teoretis — seperempat dari total ambiguitas benar-benar berada di zona berisiko.

## D-F (risiko, referensi, rekomendasi)

Lihat laporan audit lengkap tanggal 2026-10-19 (chat/Obsidian) untuk bagian D (risiko false/missed match), E (referensi ilmiah — overpass time NASA/NOAA, tingkat unmatched 45-80% dari studi GOFC-GOLD), dan F (rekomendasi: uji lanjut, jangan ubah produksi tanpa keputusan sadar). Ringkasan F: **time_minutes=720 punya dasar terukur dan tetap masuk akal untuk saat ini; radius_km=10 tidak pernah divalidasi tapi data menunjukkan bukan pengungkit utama — kenaikan jarak di atas 10km menambah ambiguitas lebih cepat daripada menambah pasangan valid, jadi tidak disarankan dinaikkan tanpa alasan baru.**

## Reproduksi

**Membutuhkan file CSV arsip FIRMS mentah (MODIS + VIIRS, dengan kolom `type`) — TIDAK disertakan di repo ini** (besar, dan merupakan unduhan pengguna). Unduh sendiri dari [firms.modaps.eosdis.nasa.gov/download](https://firms.modaps.eosdis.nasa.gov/download/).

```bash
cd python-service
.venv/bin/python -I ml_experiments/matching_audit/audit_matching.py \
  <path_ke_fire_archive_MODIS.csv> <path_ke_fire_archive_VIIRS.csv>
# -I dipakai karena file CSV adalah unduhan yang tidak tepercaya (lihat kebijakan sandbox)
# Menulis laporan ke ml_experiments/matching_audit/results/latest.txt (hasil run 2026-10-19 sudah ada di sana)

# Test (sintetis, tidak butuh file CSV mentah):
.venv/bin/python -m pytest ml_experiments/matching_audit/tests -v   # 5 test
```

## Keterbatasan & bias sampling (diakui eksplisit)

- Hasil B/C/Tugas-2/Tugas-3 hanya dari **satu jendela wilayah+bulan** (Kalimantan Tengah+Selatan, September 2019) — wilayah/bulan lain bisa punya pola berbeda (kepadatan kebakaran, tutupan awan, dll). Volume data mentah (5,1 juta baris gabungan MODIS+VIIRS) tidak praktis diproses penuh untuk audit ad hoc.
- Data mentah ini hanya VIIRS S-NPP (sesuai temuan audit dataset sebelumnya) — NOAA-20/21 tidak ada di arsip offline yang dipakai.
- "Rasio FRP >10x" dan "sebaran >10km = berisiko" adalah heuristik audit ini sendiri, **bukan ambang yang divalidasi secara ilmiah** — disajikan sebagai sinyal kasar untuk diskusi, bukan kriteria pasti benar/salah.
- Tidak ada ground truth kebakaran independen di proyek ini — semua angka di atas adalah statistik tentang kandidat pasangan (berapa banyak, seberapa ambigu), **bukan precision/recall yang benar-benar tervalidasi**. Jangan mengutip hasil ini sebagai "X% akurat."
- Tidak ada kode produksi (`fire_pipeline/matching.py` atau lainnya) yang diubah oleh audit ini.
