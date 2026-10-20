# Deploy AGNIBHŪMĪ (demo publik untuk juri)

Arsitektur: **Next.js di Vercel** (frontend + route `/api/*` sebagai proxy) → **FastAPI di Render** (Docker, `python-service/`).
Kunci NASA FIRMS hanya disimpan di server, tidak pernah dikirim ke browser.

## 0. Yang perlu disiapkan pemilik repo
- Akun Vercel dan Render (keduanya bisa login dengan GitHub).
- `NASA_FIRMS_MAP_KEY` — kunci yang sama dengan di `.env.local`.
- **Keputusan soal file data** (lihat langkah 1). Repo ini sengaja belum di-push; semua langkah di bawah menunggu izin pemilik.

## 1. File data (wajib ada di image backend)

Dua file hasil olahan offline di-gitignore:

| File | Ukuran | Dibuat oleh |
|---|---|---|
| `python-service/data/historical.sqlite.gz` | ±29 MB (±118 MB setelah dibuka) | `scripts/build_historical_store.py`, lalu `gzip -9 -k data/historical.sqlite` |
| `python-service/data/admin_boundaries.sqlite` | ±19 MB | `scripts/build_admin_boundaries.py` (batas wilayah BPS/OCHA) |

Arsip dikirim dalam bentuk `.gz` karena versi mentahnya (118 MB) melewati batas 100 MB per file GitHub; Dockerfile membukanya saat build.

Render membangun image dari Git, jadi kedua file harus ikut ter-commit. Pilihan:
- **A (paling sederhana):** keluarkan dua file ini dari `.gitignore` lalu commit.
  ```bash
  printf '!python-service/data/historical.sqlite.gz\n!python-service/data/admin_boundaries.sqlite\n' >> .gitignore
  git add -f python-service/data/historical.sqlite.gz python-service/data/admin_boundaries.sqlite
  ```
- **B:** deploy image Docker dari laptop (`docker build` + push ke registry), lalu Render menarik image itu. File tidak masuk Git.

`reports.sqlite`, `report_photos/`, dan `historical_high_only_backup_*.sqlite` **jangan** di-commit.

## 2. Backend di Render
1. Dashboard Render → **New → Blueprint** → pilih repo ini. `render.yaml` di root membuat service `agnibhumi-api`.
2. Isi `NASA_FIRMS_MAP_KEY` di tab Environment.
3. Plan: **Standard (2 GB RAM)** kalau rentang 30 hari mau dipakai. Kalau memakai instance lebih kecil, set `LIVE_WINDOWS=24h,7d`.
   - Terukur 20 Okt 2026: dengan 24 jam + 7 hari + 30 hari ter-cache, proses memakai ±1,5 GB RAM, ditambah ±0,2 GB untuk cache arsip historis.
4. `WARM_CACHE=1` sudah diset: setelah start, backend memproses 24 jam → 7 hari → 30 hari di latar belakang (±2 menit) dan memperbaruinya tiap 4 menit, jadi pengunjung tidak menunggu pemuatan dingin.
5. Setelah live, cek: `https://<service>.onrender.com/api/health` → `{"status":"ok"}`.

## 3. Frontend di Vercel
1. **Add New → Project** → import repo ini (root = folder repo, framework Next.js terdeteksi otomatis).
2. Environment variables:
   - `PYTHON_PROCESSING_API_URL` = URL Render dari langkah 2 (tanpa `/` di akhir)
   - `NASA_FIRMS_MAP_KEY` = kunci FIRMS
3. Deploy. Route `/api/hotspots` memakai `maxDuration = 60`; berkat cache warmer, permintaan biasanya selesai < 1 detik.

## 4. Cek setelah deploy
- `/` → angka "Total deteksi aktif" muncul, carousel titik terbaru bergerak.
- `/operator` → pilih Region = Kalimantan Tengah, Time Range = 7 Hari → pindah ke `/map`, filter tetap.
- `/calendar` → persempit area ke satu kabupaten lewat kotak "Area analisis".
- `/community` → atur lokasi dengan mencari nama kecamatan → status, titik terdekat, filter searah angin.
- `/community/report` → kirim laporan uji → muncul di `/citizen-reports`.

## Keterbatasan yang harus disebut ke juri
- **Laporan warga tidak permanen di Render** tanpa persistent disk (filesystem container di-reset saat redeploy). Untuk produksi: Postgres hosted atau Render Disk.
- **Endpoint ubah status laporan belum ber-autentikasi** (prototipe).
- **Suomi-NPP berhenti mengirim data VIIRS baru per 2 Nov 2026**; pipeline live tetap jalan dengan NOAA-20/21.

## Uji image Docker secara lokal
```bash
cd python-service
docker build -t agnibhumi-api .
docker run --rm -p 8000:8000 -e NASA_FIRMS_MAP_KEY=... -e WARM_CACHE=1 -e LIVE_WINDOWS=24h,7d agnibhumi-api
curl http://127.0.0.1:8000/api/health
```
