"use client";

import WorkstationLayout from "@/components/layout/WorkstationLayout";
import Card from "@/components/ui/Card";
import { useTranslation } from "@/lib/i18n/LanguageContext";

/**
 * About Data. Written for a first-time reader: a four-point summary first, then one short section
 * per question ("where does the data come from", "how is it processed", "how is the score made",
 * "what counts as unusual", "what can't it tell you"). Numbers, tables and the history of earlier
 * fixes sit in collapsed <details> blocks at the bottom so they don't get in the way.
 *
 * Every statement must match the code: python-service/fire_pipeline/ (clean.py, matching.py,
 * harmonize_events.py, features.py, model.py, historical.py) and the audit in
 * python-service/ml_experiments/audit_2026_10/README.md.
 */

/** [Indonesian, English] */
type Bi = readonly [string, string];

const SUMMARY: { icon: string; title: Bi; body: Bi }[] = [
  {
    icon: "local_fire_department",
    title: ["Titik panas = tanda panas, belum tentu api", "A hotspot is a heat signal, not proof of fire"],
    body: [
      "Satelit mencatat tempat yang jauh lebih panas dari sekitarnya. Itu bisa api di lahan, tapi bisa juga atap pabrik atau flare kilang. Selalu perlu dicek di lapangan.",
      "Satellites record places much hotter than their surroundings. That can be a land fire, but also a hot factory roof or a refinery flare. It always needs a field check.",
    ],
  },
  {
    icon: "satellite_alt",
    title: ["Dua generasi satelit NASA", "Two generations of NASA satellites"],
    body: [
      "MODIS (sejak 2000) dan VIIRS (sejak 2012), diambil dari NASA FIRMS. Data live diperbarui tiap beberapa menit.",
      "MODIS (since 2000) and VIIRS (since 2012), taken from NASA FIRMS. Live data refreshes every few minutes.",
    ],
  },
  {
    icon: "merge",
    title: ["Satu api dihitung sekali", "One fire is counted once"],
    body: [
      "Kalau MODIS dan VIIRS, atau dua satelit VIIRS, melihat api yang sama, kami menghitungnya sebagai satu kejadian.",
      "When MODIS and VIIRS, or two VIIRS satellites, see the same fire, we count it as one event.",
    ],
  },
  {
    icon: "rule",
    title: ["Semua angka dari aturan yang bisa dicek", "Every number comes from a rule you can check"],
    body: [
      "Tidak ada AI atau model prediksi di balik skor dan tanda di aplikasi ini. Aturannya ditulis di halaman ini.",
      "No AI or predictive model is behind the scores and flags in this app. The rules are written on this page.",
    ],
  },
];

const SENSORS: { name: string; tone: string; rows: [Bi, Bi][] }[] = [
  {
    name: "MODIS",
    tone: "border-blue-200 bg-blue-50/40",
    rows: [
      [["Satelit", "Satellites"], ["Terra & Aqua", "Terra & Aqua"]],
      [["Sejak", "Since"], ["2000", "2000"]],
      [["Ukuran piksel", "Pixel size"], ["±1 km", "±1 km"]],
      [["Tingkat keyakinan", "Confidence"], ["Persen (0–100%)", "Percent (0–100%)"]],
      [["Kekuatan", "Strength"], ["Riwayat paling panjang", "The longest record"]],
    ],
  },
  {
    name: "VIIRS",
    tone: "border-orange-200 bg-orange-50/40",
    rows: [
      [["Satelit", "Satellites"], ["Suomi-NPP, NOAA-20, NOAA-21", "Suomi-NPP, NOAA-20, NOAA-21"]],
      [["Sejak", "Since"], ["2012", "2012"]],
      [["Ukuran piksel", "Pixel size"], ["±375 m", "±375 m"]],
      [["Tingkat keyakinan", "Confidence"], ["Rendah / sedang / tinggi", "Low / nominal / high"]],
      [["Kekuatan", "Strength"], ["Bisa melihat api kecil", "Sees small fires"]],
    ],
  },
];

const STEPS: { title: Bi; body: Bi }[] = [
  {
    title: ["Ambil data", "Fetch"],
    body: [
      "Data titik panas Indonesia diambil dari 4 sumber NASA FIRMS: MODIS dan tiga satelit VIIRS.",
      "Indonesian hotspots are fetched from 4 NASA FIRMS feeds: MODIS and three VIIRS satellites.",
    ],
  },
  {
    title: ["Saring yang meragukan", "Drop doubtful ones"],
    body: [
      "Deteksi dengan keyakinan rendah disembunyikan (MODIS di bawah 30%, VIIRS kelas \"rendah\"). Bisa ditampilkan lagi lewat filter di Peta.",
      "Low-confidence detections are hidden (MODIS below 30%, VIIRS \"low\" class). They can be shown again with the Map filter.",
    ],
  },
  {
    title: ["Cocokkan MODIS dengan VIIRS", "Pair MODIS with VIIRS"],
    body: [
      "Setiap titik MODIS dipasangkan dengan titik VIIRS terdekat, kalau jaraknya maksimal 10 km dan selisih waktunya maksimal 12 jam. Pasangan itu dihitung sebagai satu kejadian (🔥 di peta).",
      "Each MODIS point is paired with the nearest VIIRS point if it is within 10 km and 12 hours. The pair counts as one event (🔥 on the map).",
    ],
  },
  {
    title: ["Buang VIIRS yang terhitung dua kali", "Remove VIIRS counted twice"],
    body: [
      "Tiga satelit VIIRS lewat berdekatan waktunya, jadi satu api sering tercatat 2–3 kali. Titik dari satelit berbeda yang berjarak maksimal 375 m dan 2 jam dianggap satu.",
      "The three VIIRS satellites pass close in time, so one fire is often recorded 2–3 times. Points from different satellites within 375 m and 2 hours are treated as one.",
    ],
  },
  {
    title: ["Kelompokkan per kotak 27 km", "Group into 27 km boxes"],
    body: [
      "Semua kejadian dikelompokkan ke kotak grid 0,25° (±27 km). Kotak inilah yang disebut \"area\" di halaman Prioritas dan Analitik.",
      "All events are grouped into 0.25° grid boxes (±27 km). These boxes are the \"areas\" on the Priority and Analytics pages.",
    ],
  },
  {
    title: ["Bandingkan dengan riwayat", "Compare with history"],
    body: [
      "Arsip 2000–2026 dipakai untuk kalender dan untuk menilai apakah hari ini tidak biasa di kotak itu. Hari-hari setelah arsip berakhir diisi dari data live dengan aturan yang sama.",
      "The 2000–2026 archive feeds the calendar and the check for whether today is unusual for that box. Days after the archive ends are filled from live data with the same rules.",
    ],
  },
  {
    title: ["Tandai bulan tidak biasa dan periode kritis", "Mark unusual months and critical periods"],
    body: [
      "Di kalender, bulan yang jauh di atas bulan yang sama di tahun-tahun lain (lebih dari rata-rata + 2 standar deviasi) diberi titik merah. Bulan yang rata-ratanya minimal 1,5× rata-rata bulan biasa ditandai sebagai periode kritis.",
      "In the calendar, months far above the same month in other years (more than the average + 2 standard deviations) get a red dot. Months whose average is at least 1.5× an average month are marked as the critical period.",
    ],
  },
];

const UNUSUAL_RULES: Bi[] = [
  [
    "Data hari ini hanya dihitung dari satelit yang sama dengan isi arsip (MODIS + Suomi-NPP). Kalau Suomi-NPP sedang tidak tersedia, Kalender menulis \"belum bisa dibandingkan\".",
    "Today's data is counted from the same satellites as the archive (MODIS + Suomi-NPP). If Suomi-NPP is unavailable, the Calendar says \"can't compare right now\".",
  ],
  ["Kotak yang riwayatnya kurang dari 10 hari tidak dinilai, dan jumlahnya ditampilkan terpisah.", "Boxes with fewer than 10 days of history are not judged, and are counted separately."],
  [
    "Kalau riwayat di musim yang sama terlalu sedikit (kurang dari 10 hari atau 3 tahun), kotak itu dibandingkan dengan seluruh riwayatnya, dan jumlahnya disebutkan.",
    "If the history for the same season is too thin (under 10 days or 3 years), the box is compared with its whole history instead, and those boxes are counted.",
  ],
  ["Riwayat yang dipakai mulai 2012, sejak VIIRS ikut menyumbang data.", "History starts in 2012, when VIIRS began contributing."],
  [
    "Data 3 bulan terakhir (NRT) masih sementara, jadi tidak dipakai sebagai riwayat. Bulan-bulan itu ditandai \"NRT\" di kalender.",
    "The last 3 months (NRT) are still provisional, so they aren't used as history. Those months are marked \"NRT\" in the calendar.",
  ],
];

const DISAGREE: Bi[] = [
  [
    "Jam lewatnya berbeda: Terra pagi, Aqua dan VIIRS siang. Dalam beberapa jam, api bisa membesar, padam, atau tertutup awan.",
    "They pass at different times: Terra in the morning, Aqua and VIIRS around midday. In a few hours a fire can grow, die down, or be covered by cloud.",
  ],
  [
    "Piksel VIIRS jauh lebih kecil, jadi api kecil yang terlewat oleh MODIS bisa terlihat oleh VIIRS.",
    "VIIRS pixels are much smaller, so small fires that MODIS misses can show up in VIIRS.",
  ],
  ["Awan dan asap tebal bisa menutupi api, sehingga satelit tidak melihatnya sama sekali.", "Thick cloud and smoke can hide a fire completely."],
  [
    "Di tepi lintasan satelit, piksel MODIS melebar sampai ±2 km, jadi lokasinya kurang tajam.",
    "At the edge of the satellite's path, MODIS pixels stretch to ±2 km, so the location is less precise.",
  ],
];

const CANNOT: Bi[] = [
  ["Apakah benar ada api di lapangan.", "Whether there really is a fire on the ground."],
  ["Api di bawah tajuk hutan lebat atau gambut yang membara di bawah tanah. Sering tidak terlihat.", "Fires under dense forest canopy or peat smouldering underground. Often not visible."],
  ["Luas lahan yang terbakar. Satu titik hanyalah pusat sebuah piksel.", "How much land burned. A point is just the centre of a pixel."],
  ["Berapa banyak api dalam satu titik. Satu titik bisa berupa satu api besar atau beberapa api kecil.", "How many fires are in one point. One point can be one big fire or several small ones."],
  ["Penyebab api: disengaja, lalai, atau alami.", "What caused it: deliberate, careless, or natural."],
  ["Ke mana api akan menjalar.", "Where the fire will spread."],
];

const NOT_YET: { field: Bi; source: Bi }[] = [
  { field: ["Jenis tutupan lahan", "Land cover type"], source: ["ESA WorldCover atau data tutupan lahan KLHK", "ESA WorldCover or KLHK land-cover data"] },
  { field: ["Batas lahan gambut", "Peatland boundaries"], source: ["Kementerian Pertanian, BRG, atau Global Forest Watch", "Ministry of Agriculture, BRG, or Global Forest Watch"] },
  {
    field: ["Angin & kelembapan untuk petugas", "Wind & humidity for officers"],
    source: ["BMKG atau NASA POWER (halaman Community sudah memakai Open-Meteo)", "BMKG or NASA POWER (the Community pages already use Open-Meteo)"],
  },
  { field: ["Indeks kekeringan bahan bakar (FFMC)", "Fuel dryness index (FFMC)"], source: ["Dihitung dari data cuaca dengan sistem FWI Kanada", "Computed from weather data with the Canadian FWI system"] },
  { field: ["Luas area terbakar", "Burned area"], source: ["NASA MODIS Burned Area (MCD64A1)", "NASA MODIS Burned Area (MCD64A1)"] },
];

const SOURCES: { name: string; desc: Bi; href: string }[] = [
  { name: "NASA FIRMS", desc: ["Data titik panas MODIS & VIIRS, live dan arsip", "MODIS & VIIRS hotspots, live and archive"], href: "https://firms.modaps.eosdis.nasa.gov/" },
  {
    name: "NASA Earthdata",
    desc: ["Penjelasan kolom data FIRMS", "FIRMS data attribute definitions"],
    href: "https://www.earthdata.nasa.gov/data/tools/firms/active-fire-data-attributes-modis-viirs",
  },
  { name: "OCHA / BPS", desc: ["Batas kecamatan, kabupaten, dan provinsi (2020)", "District, regency and province boundaries (2020)"], href: "https://data.humdata.org/dataset/cod-ab-idn" },
  { name: "Open-Meteo", desc: ["Angin dan kualitas udara di halaman Community", "Wind and air quality on the Community pages"], href: "https://open-meteo.com/" },
];

function SectionTitle({ id, number, children }: { id?: string; number: number; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 flex items-center gap-2.5 text-lg font-bold text-gray-900">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">{number}</span>
      {children}
    </h2>
  );
}

function Weight({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-40 shrink-0 text-gray-700">{label}</span>
      <div className="h-2.5 flex-1 rounded-full bg-gray-100">
        <div className={`h-2.5 rounded-full ${tone}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-10 text-right font-semibold text-gray-900">{value}%</span>
    </div>
  );
}

function Bullets({ items, mark, markClass }: { items: Bi[]; mark: string; markClass: string }) {
  const { tr } = useTranslation();
  return (
    <ul className="space-y-1.5 text-[13px] leading-relaxed text-gray-700">
      {items.map((item) => (
        <li key={item[0]} className="flex gap-2">
          <span className={`shrink-0 ${markClass}`}>{mark}</span>
          {tr(...item)}
        </li>
      ))}
    </ul>
  );
}

export default function DataModelPage() {
  const { tr } = useTranslation();
  return (
    <WorkstationLayout activeTab="DATA / MODEL">
      <div className="mx-auto max-w-4xl space-y-10 pb-10">
        <header>
          <h1 className="text-3xl font-bold text-gray-900">{tr("Tentang Data", "About the Data")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">
            {tr(
              "Dari mana angka di aplikasi ini berasal, bagaimana kami mengolahnya, dan apa yang tidak bisa disimpulkan darinya.",
              "Where the numbers in this app come from, how we process them, and what they can't tell you."
            )}
          </p>
        </header>

        {/* Summary */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SUMMARY.map((item) => (
            <Card key={item.icon} className="flex gap-3 p-4">
              <span className="material-symbols-outlined shrink-0 text-[22px] text-emerald-700">{item.icon}</span>
              <div>
                <h3 className="text-sm font-bold text-gray-900">{tr(...item.title)}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-gray-600">{tr(...item.body)}</p>
              </div>
            </Card>
          ))}
        </section>

        {/* 1. Sources */}
        <section className="space-y-3">
          <SectionTitle number={1}>{tr("Dari mana datanya", "Where the data comes from")}</SectionTitle>
          <p className="text-sm leading-relaxed text-gray-600">
            {tr(
              "Satelit mengukur panas dalam gelombang inframerah. Kalau satu piksel jauh lebih panas dari sekitarnya, piksel itu dicatat sebagai titik panas. Ada dua jenis sensor:",
              "Satellites measure heat in infrared light. When one pixel is much hotter than its surroundings, it is recorded as a hotspot. There are two kinds of sensors:"
            )}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SENSORS.map((sensor) => (
              <div key={sensor.name} className={`rounded-xl border p-4 ${sensor.tone}`}>
                <h3 className="mb-2 text-base font-bold text-gray-900">{sensor.name}</h3>
                <dl className="space-y-1.5 text-sm">
                  {sensor.rows.map(([label, value]) => (
                    <div key={label[0]} className="flex justify-between gap-3">
                      <dt className="text-gray-500">{tr(...label)}</dt>
                      <dd className="text-right font-medium text-gray-900">{tr(...value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-950">
            {tr(
              "Suomi-NPP berhenti mengirim data baru per 2 November 2026. Data live tetap jalan dengan NOAA-20 dan NOAA-21. Arsip kami masih berisi Suomi-NPP saja, jadi arsip NOAA-20 perlu ditambahkan supaya perbandingan dengan riwayat tetap adil.",
              "Suomi-NPP stops sending new data on 2 November 2026. Live data keeps running on NOAA-20 and NOAA-21. Our archive is still Suomi-NPP only, so a NOAA-20 archive needs to be added to keep comparisons with history fair."
            )}
          </p>
        </section>

        {/* 2. Processing */}
        <section className="space-y-3">
          <SectionTitle number={2}>{tr("Bagaimana kami mengolahnya", "How we process it")}</SectionTitle>
          <ol className="space-y-2">
            {STEPS.map((step, index) => (
              <li key={step.title[0]} className="flex gap-3 rounded-lg border border-gray-200 bg-white p-3.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{tr(...step.title)}</h3>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-gray-600">{tr(...step.body)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* 3. Priority score (moved here from the Priority Areas page; linked as #skor-prioritas) */}
        <section className="space-y-3">
          <SectionTitle id="skor-prioritas" number={3}>
            {tr("Cara skor prioritas dihitung", "How the priority score works")}
          </SectionTitle>
          <p className="text-sm leading-relaxed text-gray-600">
            {tr(
              "Skor prioritas membantu memilih area mana yang dicek lebih dulu. Skornya dihitung dari rumus tetap, bukan dari AI atau model prediksi.",
              "The priority score helps decide which areas to check first. It comes from a fixed formula, not from AI or a predictive model."
            )}
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Card className="space-y-2.5 p-4">
              <h3 className="text-sm font-bold text-gray-900">{tr("Skor prioritas", "Priority score")}</h3>
              <Weight label={tr("Skor perhatian", "Attention score")} value={50} tone="bg-emerald-600" />
              <Weight label={tr("Tren membesar", "Growing trend")} value={30} tone="bg-amber-500" />
              <Weight label={tr("Jumlah deteksi", "Detection count")} value={20} tone="bg-sky-500" />
            </Card>
            <Card className="space-y-2.5 p-4">
              <h3 className="text-sm font-bold text-gray-900">{tr("Skor perhatian", "Attention score")}</h3>
              <Weight label={tr("Kekuatan panas (FRP)", "Heat power (FRP)")} value={45} tone="bg-red-500" />
              <Weight label={tr("Seberapa sering aktif", "How often active")} value={30} tone="bg-orange-400" />
              <Weight label={tr("Jumlah deteksi", "Detection count")} value={25} tone="bg-sky-500" />
            </Card>
          </div>
          <p className="text-[13px] leading-relaxed text-gray-600">
            {tr(
              "Area dengan skor 0,66 ke atas masuk Tinggi, 0,33–0,66 Sedang, dan sisanya Rendah. Skor dihitung ulang setiap kali data berubah, dan nilainya relatif terhadap area lain pada saat itu.",
              "Areas scoring 0.66 or more are High, 0.33–0.66 Medium, the rest Low. Scores are recalculated whenever the data changes, and are relative to the other areas at that moment."
            )}
          </p>
          <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-[13px] leading-relaxed text-gray-700">
            {tr(
              "Bobot-bobot ini kami pilih sendiri supaya sebaran Tinggi/Sedang/Rendah masuk akal. Bobotnya belum diuji bersama instansi pemadam kebakaran. Anggap skor ini sebagai urutan pengecekan, bukan ukuran risiko.",
              "We chose these weights ourselves to give a sensible High/Medium/Low spread. They haven't been tested with any fire agency. Treat the score as a checking order, not a risk measure."
            )}
          </p>
        </section>

        {/* 4. Unusual */}
        <section className="space-y-3">
          <SectionTitle number={4}>{tr("Kapan sebuah area disebut \"tidak biasa\"", "When an area counts as \"unusual\"")}</SectionTitle>
          <p className="text-sm leading-relaxed text-gray-600">
            {tr(
              "Di Kalender, setiap kotak grid dibandingkan dengan riwayatnya sendiri pada waktu yang sama dalam setahun: hari-hari aktifnya di bulan ini dan sebulan sebelum/sesudahnya, di tahun-tahun sebelumnya. Kotak disebut tidak biasa kalau jumlah kejadian 24 jam terakhir jauh di atas itu (lebih dari rata-rata ditambah 2 standar deviasi). Jadi September yang ramai dibandingkan dengan September-September lain, bukan dengan seluruh tahun. Supaya perbandingannya adil:",
              "In the Calendar, each grid box is compared with its own history at the same time of year: its active days in this month and the months either side, in earlier years. A box counts as unusual when the last 24 hours have far more events than that (more than the average plus 2 standard deviations). So a busy September is compared with other Septembers, not the whole year. To keep the comparison fair:"
            )}
          </p>
          <Bullets items={UNUSUAL_RULES} mark="•" markClass="text-emerald-600" />
        </section>

        {/* 5. Why sensors disagree */}
        <section className="space-y-3">
          <SectionTitle number={5}>{tr("Kenapa MODIS dan VIIRS sering berbeda", "Why MODIS and VIIRS often disagree")}</SectionTitle>
          <Bullets items={DISAGREE} mark="•" markClass="text-blue-600" />
          <p className="text-[13px] leading-relaxed text-gray-600">
            {tr(
              "Jadi kalau satu titik hanya terlihat oleh satu sensor, itu wajar, bukan tanda datanya salah.",
              "So a point seen by only one sensor is normal, not a sign that the data is wrong."
            )}
          </p>
        </section>

        {/* 6. Limits */}
        <section className="space-y-3">
          <SectionTitle number={6}>{tr("Yang tidak bisa disimpulkan dari data ini", "What this data can't tell you")}</SectionTitle>
          <Bullets items={CANNOT} mark="✕" markClass="text-red-500" />
          <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-medium leading-relaxed text-red-900">
            {tr(
              "Sebelum ada tindakan apa pun, titik panas harus dicek dulu di lapangan oleh petugas (Manggala Agni, BPBD, atau patroli terpadu).",
              "Before any action is taken, a hotspot must be checked on the ground by officers (Manggala Agni, BPBD, or joint patrols)."
            )}
          </p>
        </section>

        {/* Technical details, collapsed */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">{tr("Detail teknis", "Technical details")}</h2>

          <details className="rounded-lg border border-gray-200 bg-white p-4 text-[13px] leading-relaxed text-gray-700">
            <summary className="cursor-pointer font-semibold text-gray-900">
              {tr("Filter keyakinan: kenapa diubah pada 20 Oktober 2026", "Confidence filter: why it changed on 20 October 2026")}
            </summary>
            <div className="mt-2 space-y-2">
              <p>
                {tr(
                  "Dulu peta hanya menampilkan deteksi \"keyakinan tinggi\" (MODIS di atas 80%, VIIRS kelas \"tinggi\"). Ternyata kelas \"tinggi\" VIIRS hanya berarti piksel jenuh karena api sangat panas. Deteksi VIIRS yang normal dan sah ada di kelas \"sedang\". Akibatnya, sekitar 94% deteksi VIIRS tersembunyi: pada 20 Oktober hanya 1.091 dari 19.130 deteksi yang tampil.",
                  "The map used to show only \"high confidence\" detections (MODIS above 80%, VIIRS \"high\" class). It turned out the VIIRS \"high\" class only means a pixel saturated by a very hot fire. Normal, valid VIIRS detections are in the \"nominal\" class. As a result, about 94% of VIIRS detections were hidden: on 20 October only 1,091 of 19,130 detections were shown."
                )}
              </p>
              <p>
                {tr(
                  "Sekarang kelas sedang dan tinggi ditampilkan, sama seperti hitungan harian SiPongi. Arsip 2000–2026 dibangun ulang dengan filter yang sama.",
                  "Now the nominal and high classes are shown, the same as SiPongi's daily counts. The 2000–2026 archive was rebuilt with the same filter."
                )}
              </p>
            </div>
          </details>

          <details className="rounded-lg border border-gray-200 bg-white p-4 text-[13px] leading-relaxed text-gray-700">
            <summary className="cursor-pointer font-semibold text-gray-900">{tr("Isi arsip historis", "What's in the historical archive")}</summary>
            <ul className="mt-2 space-y-1">
              <li>
                {tr(
                  "1.069.505 baris, masing-masing berisi jumlah kejadian pada satu tanggal (UTC) di satu kotak 0,25°.",
                  "1,069,505 rows, each holding the event count for one date (UTC) in one 0.25° box."
                )}
              </li>
              <li>
                {tr(
                  "MODIS C6.1 (Terra & Aqua) sejak November 2000, dan VIIRS Suomi-NPP sejak 20 Januari 2012.",
                  "MODIS C6.1 (Terra & Aqua) since November 2000, and VIIRS Suomi-NPP since 20 January 2012."
                )}
              </li>
              <li>
                {tr(
                  "Juli–September 2026 masih data NRT: belum disaring ke api vegetasi, jadi sumber panas industri ikut terhitung (biasanya 10–13% baris).",
                  "July–September 2026 is still NRT data: not yet filtered to vegetation fires, so industrial heat sources are included (usually 10–13% of rows)."
                )}
              </li>
              <li>
                {tr(
                  "Hari tanpa baris belum tentu hari tanpa api. Bisa jadi tertutup awan, atau tidak ada satelit yang lewat.",
                  "A day with no row isn't necessarily a day without fire. It may have been cloudy, or no satellite passed."
                )}
              </li>
            </ul>
          </details>

          <details className="rounded-lg border border-gray-200 bg-white p-4 text-[13px] leading-relaxed text-gray-700">
            <summary className="cursor-pointer font-semibold text-gray-900">{tr("Data yang belum kami punya", "Data we don't have yet")}</summary>
            <table className="mt-2 w-full text-left">
              <tbody>
                {NOT_YET.map((row) => (
                  <tr key={row.field[0]} className="border-t border-gray-100 align-top">
                    <td className="py-2 pr-3 font-medium text-gray-900">{tr(...row.field)}</td>
                    <td className="py-2 text-gray-600">{tr(...row.source)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-gray-500">
              {tr(
                "Data-data ini sengaja tidak ditampilkan di halaman mana pun, supaya tidak ada angka karangan yang terlihat nyata.",
                "These are deliberately not shown on any page, so no made-up numbers look real."
              )}
            </p>
          </details>
        </section>

        {/* Sources */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">{tr("Sumber", "Sources")}</h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SOURCES.map((source) => (
              <li key={source.name}>
                <a
                  href={source.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-gray-200 bg-white p-3 hover:border-emerald-300"
                >
                  <span className="text-sm font-semibold text-gray-900">{source.name}</span>
                  <span className="block text-[12px] text-gray-500">{tr(...source.desc)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </WorkstationLayout>
  );
}
