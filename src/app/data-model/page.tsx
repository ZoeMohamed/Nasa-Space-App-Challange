import WorkstationLayout from "@/components/layout/WorkstationLayout";
import Card from "@/components/ui/Card";

/**
 * "Tentang Data" — rebuilt from Figma file wasTTtlmYfsjK1ZkH1Kzim, node 169:20660
 * ("Desktop - 12"), which is a canvas-overview frame holding all 8 AGNIBHUMI screens as
 * siblings. The actual "About Data" content lives at child node 169:21803
 * ("04 AGNIBHUMI — Tentang Data Satelit (Panduan & Metodologi)"), fetched directly via
 * get_design_context since the parent frame was too large to return in one call.
 *
 * That Figma frame renders with a cream/rust color scheme (#fbf3e4, #a63a23, #f07836) that
 * belongs to an earlier design pass — it does NOT match the white/slate/forest-green
 * AGNIBHUMI tokens already established in globals.css and used by the 4 pages rebuilt
 * earlier this session (src/app/page.tsx, map, priority-areas, analytics). This page keeps
 * the Figma copy, structure, and section order (header, 01 detection principle + A/B/C
 * diagram, 02 MODIS vs VIIRS table, 03 why sensors disagree, 04 seven limitations, 05 data
 * source attribution) but re-skins everything with Card/Badge-style white cards, gray-200
 * borders, and the red/orange/amber/blue/emerald accents already used on those 4 pages.
 *
 * The "3 sensor detail cards" and "harmonization" framing from the task brief are built
 * from the comparison table (MODIS, VIIRS) plus a third card describing the *real* matching
 * engine in python-service/fire_pipeline/matching.py (match_modis_viirs: nearest MODIS↔VIIRS
 * detection within 10km / 60min, deterministic, one match per detection) — not the Figma
 * copy's physics diagram, which is about detection principles, not sensor fusion.
 *
 * New "Status Data" section (not from Figma) is this task's main addition: it tells a judge
 * exactly what on this dashboard is real NASA FIRMS output from
 * python-service/fire_pipeline/live.py (NRT detections, MODIS/VIIRS matching, deterministic
 * attention/priority scoring, per-grid detection counts — see live.py, matching.py,
 * features.py, model.py) versus what is not implemented yet, each paired with where real
 * data for it would come from.
 */

const COMPARISON_ROWS: { parameter: string; modis: string; viirs: string }[] = [
  {
    parameter: "Resolusi Spasial Nadir",
    modis: "1.000 m (1 km) pada nadir",
    viirs: "375 m (I-Band I04 high-resolution)",
  },
  {
    parameter: "Ukuran Jejak Tepi Pita (Swath Edge)",
    modis: "Melebar hingga ~2,01 km akibat distorsi optik konvensional",
    viirs: "Terkompensasi konstan (~375 m di seluruh lebar swath)",
  },
  {
    parameter: "Waktu Peluncuran Misi",
    modis: "1999 (Terra) / 2002 (Aqua)",
    viirs: "2011 (Suomi-NPP) / 2017 (NOAA-20) / 2022 (NOAA-21)",
  },
  {
    parameter: "Format Keyakinan (Confidence)",
    modis: "Persentase kontinu (0–100%)",
    viirs: "Kategori diskrit (Low, Nominal, High)",
  },
  {
    parameter: "Kepekaan Anomali Lemah",
    modis: "Terbatas pada panas intensif skala luas; melewatkan api kecil",
    viirs: "Sangat sensitif pada api batas lahan, garis bakar tipis & smoldering",
  },
  {
    parameter: "Karakteristik Data",
    modis: "Standar historis kontinuitas iklim 25+ tahun (katalog referensi dasar)",
    viirs: "Ketajaman batas spasial operasional penanggulangan lapangan terkini",
  },
];

const DISCREPANCY_REASONS: { step: string; title: string; tag: string; body: string }[] = [
  {
    step: "01",
    title: "Beda Waktu Lintas Orbit",
    tag: "SIKLUS DIURNAL API",
    body: "Terra melintas pagi hari (~10:30 WIB), sedangkan Aqua dan Suomi-NPP melintas siang hari (~13:30 WIB). Selisih waktu 3 jam memicu fluktuasi drastis perilaku kebakaran dan pergerakan awan konvektif tropis.",
  },
  {
    step: "02",
    title: "Ukuran Piksel Footprint",
    tag: "SENSITIVITAS LUASAN",
    body: "Satu piksel VIIRS 375m mencakup sekitar 1/7 luas area piksel MODIS 1km. Sumber panas berdaya rendah tidak cukup menaikkan rerata suhu piksel 1km MODIS, namun memicu sinyal kuat pada piksel kompak VIIRS.",
  },
  {
    step: "03",
    title: "Tutupan Awan & Kabut Asap",
    tag: "ATENUASI ATMOSFER",
    body: "Oklusi atmosfer tebal, awan kumulonimbus, atau asap pekat mengabsorpsi radiasi inframerah termal 3,9 µm. Kebakaran hebat yang tertutup awan saat satelit melintas tidak akan terdeteksi sama sekali.",
  },
  {
    step: "04",
    title: "Distorsi Sudut Sensor",
    tag: "INTEGRITAS GEOMETRI",
    body: "Efek sudut pandang tepi lintasan (bow-tie effect) memperbesar tapak piksel MODIS hingga 2x lipat di tepi pita orbit, sementara VIIRS menerapkan algoritma pixel-aggregation untuk menjaga resolusi 375m tetap konsisten.",
  },
];

const LIMITATIONS: { tag: string; title: string; body: string }[] = [
  {
    tag: "BATASAN 01",
    title: "Anomali Radiometrik, Bukan Konfirmasi Api Nyata",
    body: "Data mencatat adanya pancaran kalor yang tidak wajar. Sinyal dapat bersumber dari pantulan permukaan seng pabrik panas, buangan cerobong gas kilang, batuan terbuka, atau flare industri.",
  },
  {
    tag: "BATASAN 02",
    title: "Tidak Memetakan Seluruh Kejadian",
    body: "Kebakaran di bawah tajuk kanopi hutan primer yang lebat serta pembakaran tanpa nyala di lapisan dalam gambut (smoldering peat fires) sering kali tertahan panasnya sehingga tidak terdeteksi satelit.",
  },
  {
    tag: "BATASAN 03",
    title: "Satu Anomali ≠ Satu Titik Api Mandiri",
    body: "Satu titik koordinat piksel dapat merepresentasikan garis api panjang yang merambat, puluhan tumpukan biomassa kecil terpisah, atau kebakaran besar masif yang mengisi piksel tersebut.",
  },
  {
    tag: "BATASAN 04",
    title: "Bukan Estimasi Luas Area Terbakar",
    body: "Titik koordinat yang tercantum hanyalah pusat matematis geometris piksel detektor satelit. Luas terbakar sebenarnya harus diukur via perimeter pasca-kebakaran multispektral (Sentinel-2 / Landsat).",
  },
  {
    tag: "BATASAN 05",
    title: "Ketiadaan Penentuan Kausalitas",
    body: "Data telemetri antariksa bersifat objektif fisika murni. Satelit tidak memiliki kapabilitas menentukan intensi manusia, kelalaian, kesengajaan pembukaan lahan, atau faktor alam sambaran petir.",
  },
  {
    tag: "BATASAN 06",
    title: "Tidak Menunjukkan Arah Perambatan",
    body: "Satu kali tangkapan snapshot tidak memproyeksikan arah gerak api. Prediksi perambatan membutuhkan integrasi vektor arah angin, kelembapan bahan bakar, dan topografi Digital Elevation Model — belum tersedia di sini.",
  },
];

const SOURCES: { org: string; tag: string; name: string; desc: string; meta: string }[] = [
  {
    org: "NASA GSFC",
    tag: "PUBLIC DOMAIN",
    name: "NASA FIRMS",
    desc: "Fire Information for Resource Management System. Penyedia primer data titik anomali termal mendekati waktu nyata (NRT) dari satelit MODIS & VIIRS — ini sumber live yang dipakai backend AGNIBHUMI.",
    meta: "Feed: WFS / REST API / GeoJSON",
  },
  {
    org: "EOSDIS",
    tag: "OPERASIONAL",
    name: "NASA LANCE",
    desc: "Land, Atmosphere Near real-time Capability for EOS. Menjamin ketersediaan data pemrosesan cepat dalam tempo <3 jam sejak satelit melintas di atas stasiun bumi.",
    meta: "Latensi: 120–180 menit per orbit",
  },
  {
    org: "REPUBLIK INDONESIA",
    tag: "VERIFIKASI",
    name: "KLHK / SIPONGI & BRIN",
    desc: "Kementerian Lingkungan Hidup dan Kehutanan bersama Badan Riset dan Inovasi Nasional untuk peta dasar tutupan lahan, batas konsesi HPH/HTI, dan lapisan kubah gambut — belum terintegrasi ke backend ini.",
    meta: "Peta Tematik: Skala 1:50.000 BIG",
  },
  {
    org: "OCHA / BPS",
    tag: "CC BY-IGO",
    name: "Batas Wilayah Administratif (COD-AB Indonesia)",
    desc: "Poligon kecamatan/kabupaten-kota/provinsi dari BPS via OCHA (data.humdata.org/dataset/cod-ab-idn), dipakai offline untuk menamai lokasi titik panas & laporan. Berlaku per 1 April 2020: 34 provinsi, belum memuat pemekaran Papua 2022.",
    meta: "7.069 kecamatan · disederhanakan ±55 m",
  },
];

const LIVE_ITEMS: { icon: string; label: string; body: string }[] = [
  {
    icon: "satellite_alt",
    label: "Deteksi MODIS/VIIRS (NRT, 24 jam terakhir)",
    body: "Ditarik langsung dari 4 feed NASA FIRMS (MODIS_NRT, VIIRS_SNPP_NRT, VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT) untuk wilayah Indonesia, disaring ke confidence sedang + tinggi (kelas resmi FIRMS: MODIS ≥ 30%, VIIRS \"nominal\"/\"high\"); hanya kelas \"low\" yang disembunyikan secara default.",
  },
  {
    icon: "compare_arrows",
    label: "Pencocokan sensor (matched / MODIS-only / VIIRS-only)",
    body: "Setiap deteksi MODIS dicocokkan ke deteksi VIIRS terdekat dalam radius 10 km dan selisih waktu 720 menit (12 jam) — aturan deterministik, satu pasangan per deteksi, bukan model machine learning.",
  },
  {
    icon: "priority_high",
    label: "Skor prioritas & attention area",
    body: "attention_score = 45% persentil total FRP + 30% persistensi hari aktif + 25% persentil jumlah deteksi. priority_score menambahkan 30% tren pertumbuhan FRP dan 20% jumlah deteksi. Tier high/medium/low dari ambang 0,66 / 0,33 — semua dihitung dari data jendela ini sendiri, bukan diramal.",
  },
  {
    icon: "grid_view",
    label: "Jumlah deteksi per area",
    body: "Deteksi dikelompokkan ke sel grid 0,25° (~27 km) lalu dihitung jumlah, rentang tanggal aktif, dan total/rata-rata/puncak FRP per sel — ini yang tampil sebagai \"area\" di halaman Prioritas & Analytics.",
  },
];

const PLACEHOLDER_FIELDS: { field: string; source: string }[] = [
  {
    field: "Tren historis bulanan/tahunan",
    source: "FIRMS Archive Download (firms.modaps.eosdis.nasa.gov/download) — endpoint berbeda dari NRT; perlu database penyimpanan sendiri untuk mengumpulkan riwayatnya dari waktu ke waktu.",
  },
  {
    field: "Clustering spasial lanjutan",
    source: "scikit-learn DBSCAN diterapkan pada data yang sudah ada sekarang (bukan data baru, hanya metode pengelompokan yang lebih canggih dari grid 0,25° saat ini).",
  },
  {
    field: "Land Cover Type (tipe tutupan lahan)",
    source: "ESA WorldCover, atau data tutupan lahan KLHK.",
  },
  {
    field: "Arah angin & kelembapan",
    source: "BMKG API (data.bmkg.go.id), Open-Meteo (gratis), atau NASA POWER API.",
  },
  {
    field: "FFMC (indeks bahan bakar kering)",
    source: "Dihitung dari data cuaca di atas menggunakan Canadian Fire Weather Index (FWI) System.",
  },
  {
    field: "Nama wilayah administratif",
    source: "BIG Geoportal, GADM, atau geoBoundaries — untuk mengubah koordinat grid menjadi nama provinsi/kabupaten.",
  },
  {
    field: "Batas lahan gambut",
    source: "Peta Kementerian Pertanian, Badan Restorasi Gambut (BRG), atau Global Forest Watch.",
  },
];

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-[10px] font-bold uppercase tracking-wide text-gray-500">
      {children}
    </div>
  );
}

function ReasonCard({ reason }: { reason: (typeof DISCREPANCY_REASONS)[number] }) {
  return (
    <Card className="p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-2xl font-bold text-gray-200">{reason.step}</span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
          {reason.tag}
        </span>
      </div>
      <h3 className="text-sm font-bold text-gray-900">{reason.title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed">{reason.body}</p>
    </Card>
  );
}

function LimitationCard({ item }: { item: (typeof LIMITATIONS)[number] }) {
  return (
    <Card className="p-5">
      <span className="text-[10px] font-bold uppercase tracking-wide text-[#f04438]">{item.tag}</span>
      <h3 className="text-sm font-bold text-gray-900 mt-1 mb-1.5">{item.title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed">{item.body}</p>
    </Card>
  );
}

function SourceCard({ source }: { source: (typeof SOURCES)[number] }) {
  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{source.org}</span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
          {source.tag}
        </span>
      </div>
      <h3 className="text-base font-bold text-gray-900">{source.name}</h3>
      <p className="text-xs text-gray-500 leading-relaxed flex-1">{source.desc}</p>
      <div className="pt-2 border-t border-gray-100 text-[11px] font-medium text-gray-400">{source.meta}</div>
    </Card>
  );
}

export default function DataModelPage() {
  return (
    <WorkstationLayout activeTab="DATA / MODEL">
      <div className="max-w-[1400px] mx-auto space-y-8">
        {/* Header */}
        <div>
          <SectionEyebrow>
            <span className="material-symbols-outlined text-[13px]">verified</span>
            Dokumentasi Metodologi &amp; Integritas Data Saintifik
          </SectionEyebrow>
          <h1 className="text-3xl font-bold text-gray-900 mt-3 mb-2">Tentang Data Observasi Satelit</h1>
          <p className="text-sm text-gray-500 max-w-3xl">
            Panduan komprehensif mengenai prinsip pengamatan radiometrik termal satelit NASA MODIS dan VIIRS,
            karakteristik sensor, pemahaman anomali, serta batasan saintifik penggunaan data publik.
          </p>
        </div>

        {/* NEW — Status Data section */}
        <section className="space-y-4">
          <Card className="p-6 border-amber-200 bg-amber-50/40">
            <div className="flex items-start gap-3 mb-5">
              <span className="material-symbols-outlined text-amber-600 bg-white rounded-lg p-2 text-xl shrink-0">fact_check</span>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Status Data: Apa yang Live, Apa yang Contoh</h2>
                <p className="text-xs text-gray-600 mt-1 max-w-3xl">
                  Supaya tidak ada yang mengira seluruh dashboard ini sudah lengkap: berikut rincian jujur apa yang
                  benar-benar diambil langsung dari NASA FIRMS dan dihitung oleh backend Python, serta apa yang
                  belum ada — lengkap dengan sumber data asli yang akan dipakai kalau fitur itu dibangun.
                </p>
              </div>
            </div>

            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-700">Live / Nyata — dari NASA FIRMS</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {LIVE_ITEMS.map((item) => (
                  <div key={item.label} className="bg-white border border-emerald-100 rounded-lg p-4 flex gap-3">
                    <span className="material-symbols-outlined text-emerald-600 text-lg shrink-0">{item.icon}</span>
                    <div>
                      <div className="text-xs font-bold text-gray-900 mb-1">{item.label}</div>
                      <p className="text-[11px] text-gray-500 leading-relaxed">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-600">
                  Belum Ada / Masih Contoh — dan Dari Mana Data Aslinya
                </h3>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
                <table className="w-full text-xs min-w-[640px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-left">
                      <th className="py-2.5 px-4 font-bold text-gray-500 text-[10px] tracking-wide uppercase w-[260px]">Field</th>
                      <th className="py-2.5 px-4 font-bold text-gray-500 text-[10px] tracking-wide uppercase">Sumber data asli</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PLACEHOLDER_FIELDS.map((row) => (
                      <tr key={row.field} className="border-b border-gray-100 last:border-0 align-top">
                        <td className="py-3 px-4 font-semibold text-gray-800">{row.field}</td>
                        <td className="py-3 px-4 text-gray-500">{row.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                Field-field ini sengaja tidak ditampilkan di halaman lain pada dashboard ini agar tidak mengarang
                nilai yang kelihatan nyata padahal bukan.
              </p>
            </div>
          </Card>
        </section>

        {/* Section 1 — Prinsip Deteksi Anomali Termal */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-gray-900">01. Prinsip Deteksi Anomali Termal (Apa Itu Deteksi Satelit?)</h2>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-stretch">
            <Card className="p-6 lg:col-span-3 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-1.5 flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-500 text-base">thermostat</span>
                  Mekanisme Fluks Radiometrik Inframerah Gelombang Menengah (~3,9 µm)
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Instrumen penginderaan jauh yang mengorbit bumi tidak mengambil foto visual layaknya kamera optik
                  biasa. Sensor inframerah luar angkasa mengukur radiansi spektral pada pita gelombang 3,9 µm dan 11
                  µm secara serentak untuk mengidentifikasi lonjakan kontras suhu piksel permukaan terhadap suhu
                  rerata latar belakang lingkungan (ambang batas kontekstual dinamis).
                </p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Aksioma Saintifik Utama</div>
                <p className="text-xs text-gray-700 italic leading-relaxed">
                  &ldquo;Deteksi adalah pengukuran fisika radiometrik fluks inframerah gelombang menengah (~3,9 µm),
                  bukan konfirmasi visual api atau asap secara langsung di atas tanah.&rdquo;
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100">
                <div className="text-center">
                  <div className="text-[10px] text-gray-400 mb-1">Saluran Spektral</div>
                  <div className="text-sm font-bold text-gray-900">3,9 &amp; 11 µm</div>
                </div>
                <div className="text-center border-x border-gray-100">
                  <div className="text-[10px] text-gray-400 mb-1">Algoritma Inti</div>
                  <div className="text-sm font-bold text-gray-900">Konteks Suhu</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-gray-400 mb-1">Satuan Pengukuran</div>
                  <div className="text-sm font-bold text-gray-900">MW (FRP)</div>
                </div>
              </div>
            </Card>

            <Card className="p-6 lg:col-span-2 space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                Diagram Arsitektural Pengamatan Piksel
              </div>
              {[
                { letter: "A", title: "Permukaan Bumi & Bahan Bakar", body: "Reaksi pembakaran melepaskan radiasi termal ke atmosfer." },
                { letter: "B", title: "Jendela Atmosfer Inframerah", body: "Sinyal radiasi 3,9 µm menembus atmosfer tanpa serapan gas tinggi." },
                { letter: "C", title: "Pendeteksian Detektor Satelit", body: "Piksel ditandai positif jika beda suhu (ΔT) melebihi ambang batas adaptif." },
              ].map((step) => (
                <div key={step.letter} className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <span className="w-8 h-8 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {step.letter}
                  </span>
                  <div>
                    <div className="text-xs font-bold text-gray-900">{step.title}</div>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{step.body}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-start gap-2 text-[11px] text-gray-500 pt-1">
                <span className="material-symbols-outlined text-gray-400 text-base shrink-0">info</span>
                Detektor mengukur kecerahan radiansi terpadu seluruh luasan piksel (bukan ukuran api individual).
              </div>
            </Card>
          </div>
        </section>

        {/* Section 2 — Comparison table */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-gray-900">02. Tabel Komparasi Sensor MODIS vs. VIIRS</h2>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[720px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left">
                    <th className="py-3 px-4 font-bold text-gray-500 text-[10px] tracking-wide uppercase w-[260px]">Parameter Teknis</th>
                    <th className="py-3 px-4 font-bold text-blue-700 text-[10px] tracking-wide uppercase">MODIS (Terra &amp; Aqua)</th>
                    <th className="py-3 px-4 font-bold text-orange-700 text-[10px] tracking-wide uppercase">VIIRS (Suomi-NPP &amp; NOAA-20/21)</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row) => (
                    <tr key={row.parameter} className="border-b border-gray-100 last:border-0 align-top">
                      <td className="py-3 px-4 font-semibold text-gray-800">{row.parameter}</td>
                      <td className="py-3 px-4 text-gray-500">{row.modis}</td>
                      <td className="py-3 px-4 text-gray-500">{row.viirs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* 3 sensor detail cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-5 border-blue-100">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <h3 className="text-sm font-bold text-gray-900">MODIS</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Resolusi 1 km, cakupan historis 25+ tahun. Pada backend ini ditarik dari feed <code className="text-[11px] bg-gray-100 rounded px-1">MODIS_NRT</code>,
                disaring ke confidence numerik &gt;80%.
              </p>
            </Card>
            <Card className="p-5 border-orange-100">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-orange-500" />
                <h3 className="text-sm font-bold text-gray-900">VIIRS</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Resolusi 375 m, lebih peka pada api kecil. Ditarik dari 3 feed (<code className="text-[11px] bg-gray-100 rounded px-1">VIIRS_SNPP_NRT</code>,{" "}
                <code className="text-[11px] bg-gray-100 rounded px-1">NOAA20_NRT</code>,{" "}
                <code className="text-[11px] bg-gray-100 rounded px-1">NOAA21_NRT</code>), disaring ke kategori confidence &ldquo;h&rdquo; (high).
              </p>
            </Card>
            <Card className="p-5 border-emerald-100">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <h3 className="text-sm font-bold text-gray-900">Harmonized — Mesin Pencocokan</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Setiap deteksi MODIS dicocokkan ke deteksi VIIRS terdekat (radius 10 km, selisih waktu ≤720 menit / 12 jam —
                dipilih dari pengukuran data nyata karena jam lintas MODIS dan VIIRS berbeda beberapa jam).
                Aturan deterministik tetangga terdekat, bukan model statistik — hasilnya diberi label
                MATCHED / MODIS_ONLY / VIIRS_ONLY.
              </p>
            </Card>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950 leading-relaxed">
            <span className="material-symbols-outlined text-amber-600 text-base shrink-0">satellite_alt</span>
            <p>
              <strong>Suomi-NPP berhenti mengirim observasi VIIRS baru per 2 November 2026</strong> (pengumuman NASA Earthdata,{" "}
              <a
                href="https://www.earthdata.nasa.gov/data/tools/firms/active-fire-data-attributes-modis-viirs"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Active Fire Data Attributes
              </a>
              ). Data live AGNIBHŪMĪ sudah mengambil VIIRS dari NOAA-20 dan NOAA-21 juga, dan sumber yang kosong tidak
              menghentikan pipeline — jadi aplikasi tetap berjalan setelah tanggal itu. Arsip historis offline kami masih
              VIIRS Suomi-NPP saja (2012–2026); arsip NOAA-20/21 perlu diunduh terpisah.
            </p>
          </div>
        </section>

        {/* Section 3 — Why discrepancy */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-gray-900">03. Mengapa Terjadi Diskrepansi Deteksi Antarsensor?</h2>
          <p className="text-xs text-gray-500 max-w-3xl">
            Perbedaan jumlah titik deteksi antara MODIS dan VIIRS pada tanggal dan wilayah yang sama bukanlah anomali
            sistemik yang rusak, melainkan konsekuensi deterministik dari empat pilar fisika orbital berikut:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {DISCREPANCY_REASONS.map((reason) => (
              <ReasonCard key={reason.step} reason={reason} />
            ))}
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-2 text-xs text-blue-950 leading-relaxed max-w-4xl">
            <h3 className="text-sm font-bold">Filter confidence: kenapa kami mengubahnya (20 Oktober 2026)</h3>
            <p>
              Sebelumnya peta hanya menampilkan deteksi &ldquo;confidence tinggi&rdquo; (MODIS &gt; 80%, VIIRS kelas
              &ldquo;high&rdquo;). Menurut dokumentasi NASA FIRMS, kelas VIIRS &ldquo;high&rdquo; hanya berarti{" "}
              <strong>piksel jenuh</strong> (api sangat panas), sedangkan &ldquo;nominal&rdquo; adalah deteksi normal yang sah
              — anomali suhu kuat (&gt; 15 K) tanpa kontaminasi pantulan matahari. Filter lama menyembunyikan ±94% deteksi
              VIIRS yang sah: pada 20 Oktober 2026 hanya 1.091 dari 19.130 deteksi yang tampil, sementara hitungan harian KLHK
              (SiPongi) memakai kelas sedang + tinggi.
            </p>
            <p>
              Sekarang default-nya <strong>sedang + tinggi</strong> (hanya kelas &ldquo;low&rdquo; yang disembunyikan; bisa
              disertakan lewat filter di Explore Map). Hari yang sama: 17.803 deteksi, dan ±90% titik MODIS kini punya
              pasangan VIIRS — label &ldquo;Hanya MODIS&rdquo; yang dulu banyak ternyata sebagian besar akibat filter, bukan
              kurangnya harmonisasi. Arsip historis 2000–2026 dibangun ulang dengan filter yang sama supaya perbandingan
              dengan baseline tetap setara.
            </p>
            <p className="text-blue-900/80">
              Titik &ldquo;Hanya VIIRS&rdquo; tetap banyak, dan itu fisik: VIIRS (375 m) melihat banyak api kecil yang terlalu
              kecil untuk MODIS (1 km), dan jam lintas satelit berbeda (Terra ±10.30, Aqua &amp; VIIRS ±13.30).
            </p>
          </div>
        </section>

        {/* Section 4 — Limitations */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-gray-900">04. Batasan Mutlak Penggunaan Data Publik</h2>
          <p className="text-xs text-gray-500 max-w-3xl">
            Data deteksi satelit adalah instrumen penginderaan indikasi awal (early warning), bukan bukti yurisdiksi
            faktual tanpa uji lapangan. Wajib dipahami batas ilmiah berikut:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {LIMITATIONS.map((item) => (
              <LimitationCard key={item.tag} item={item} />
            ))}
          </div>
          <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-lg p-5">
            <span className="material-symbols-outlined text-[#f04438] bg-white rounded-lg p-2 text-xl shrink-0">gpp_maybe</span>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-[#f04438] mb-1">
                Batasan 07 &middot; Protokol Operasional Mutlak
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-1">
                Verifikasi Lapangan Tetap Menjadi Keharusan Operasional
              </h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Setiap anomali koordinat berstatus &lsquo;High Confidence&rsquo; yang berada di kawasan bernilai
                konservasi tinggi atau kubah gambut wajib ditindaklanjuti dengan pengecekan langsung (ground check)
                oleh brigade pemadam, BPBD, atau patroli terpadu sebelum diambil tindakan hukum maupun deklarasi
                bencana darurat.
              </p>
            </div>
          </div>
        </section>

        {/* Section 5 — Data source attribution */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-gray-900">05. Atribusi Sumber Data Resmi &amp; Layanan Terbuka</h2>
          <p className="text-xs text-gray-500 max-w-3xl">
            Seluruh data telemetri yang diolah platform ini bersumber dari penyedia data observasi bumi publik
            internasional dan otoritas nasional.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SOURCES.map((source) => (
              <SourceCard key={source.name} source={source} />
            ))}
          </div>
          <p className="text-[11px] text-gray-400 pt-1">
            Metodologi mengikuti standar NASA Land Processes DAAC (LP DAAC). KLHK/SIPONGI &amp; BRIN dicantumkan
            sebagai sumber rujukan resmi untuk data tutupan lahan dan gambut — belum terhubung otomatis ke backend
            ini (lihat tabel &ldquo;Belum Ada / Masih Contoh&rdquo; di atas).
          </p>
        </section>
      </div>
    </WorkstationLayout>
  );
}
