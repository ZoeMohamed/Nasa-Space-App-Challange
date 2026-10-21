/**
 * Static, authored reference content for the Education hub ("08 Community —
 * Edukasi & Kontribusi", Figma node 186:3013) and its 3 article detail
 * views (folded in from the 186:31xx sibling nodes — see community/README
 * note in the agent report). This is genuinely-authored reference text, not
 * a stand-in for an unbuilt data feed, so it is NOT marked "Contoh data".
 */

interface EduArticleText {
  title: string;
  summary: string;
  body: string[];
}

export interface EduArticle extends EduArticleText {
  slug: string;
  icon: string;
  /** English version of the same text (the Indonesian fields above are the original). */
  en: EduArticleText;
}

export const EDU_ARTICLES: EduArticle[] = [
  {
    slug: "modis-viirs",
    title: "Apa itu MODIS & VIIRS?",
    icon: "satellite_alt",
    summary: "Dua instrumen satelit NASA yang mendeteksi titik panas di permukaan bumi.",
    body: [
      "MODIS (Moderate Resolution Imaging Spectroradiometer) terbang di satelit Terra dan Aqua, mengamati permukaan bumi dua kali sehari dengan resolusi sekitar 1 km per piksel untuk deteksi kebakaran.",
      "VIIRS (Visible Infrared Imaging Radiometer Suite) terbang di satelit Suomi NPP, NOAA-20, dan NOAA-21, dengan resolusi lebih tinggi (sekitar 375 m) sehingga bisa mendeteksi titik api yang lebih kecil dibanding MODIS.",
      "Aplikasi ini menggunakan data near-real-time dari NASA FIRMS (Fire Information for Resource Management System) yang menggabungkan deteksi dari kedua instrumen tersebut.",
      "Penting: kedua sensor mendeteksi anomali panas (thermal anomaly), bukan secara otomatis mengonfirmasi adanya kebakaran aktif di lapangan. Awan tebal, asap, atau waktu lintasan satelit yang jarang bisa membuat kebakaran kecil tidak terdeteksi.",
    ],
    en: {
      title: "What are MODIS & VIIRS?",
      summary: "Two NASA satellite instruments that detect hotspots on the Earth's surface.",
      body: [
        "MODIS (Moderate Resolution Imaging Spectroradiometer) flies on the Terra and Aqua satellites, observing the Earth's surface twice a day at about 1 km per pixel for fire detection.",
        "VIIRS (Visible Infrared Imaging Radiometer Suite) flies on Suomi NPP, NOAA-20 and NOAA-21, with a higher resolution (about 375 m), so it can detect smaller fires than MODIS.",
        "This app uses near-real-time data from NASA FIRMS (Fire Information for Resource Management System), which combines detections from both instruments.",
        "Important: both sensors detect heat anomalies (thermal anomalies); they don't automatically confirm an active fire on the ground. Thick cloud, smoke, or infrequent satellite passes can leave small fires undetected.",
      ],
    },
  },
  {
    slug: "lahan-gambut",
    title: "Kenapa lahan gambut mudah terbakar?",
    icon: "grass",
    summary: "Gambut menyimpan karbon dalam jumlah besar dan terbakar secara berbeda dari hutan biasa.",
    body: [
      "Lahan gambut terbentuk dari bahan organik (sisa tumbuhan) yang terurai sangat lambat karena selalu tergenang air. Begitu dikeringkan, misalnya untuk pertanian atau perkebunan, gambut jadi sangat mudah terbakar.",
      "Kebakaran gambut sering terjadi di bawah permukaan (smouldering/membara), menyebar perlahan dan sulit dipadamkan karena air sulit menembus lapisan gambut yang kering, serta bisa menyala kembali berhari-hari setelah terlihat padam di permukaan.",
      "Kebakaran gambut juga menghasilkan asap tebal (kabut asap) dalam jumlah besar karena pembakaran yang tidak sempurna (smouldering combustion), berbeda dari kebakaran hutan biasa yang membakar lebih cepat dan bersih.",
      "Wilayah gambut terluas di Indonesia terutama ada di Sumatera dan Kalimantan. Dua wilayah yang juga tercakup dalam opsi filter wilayah aplikasi ini.",
    ],
    en: {
      title: "Why does peatland burn so easily?",
      summary: "Peat stores huge amounts of carbon and burns differently from ordinary forest.",
      body: [
        "Peatland forms from organic matter (plant remains) that decomposes very slowly because it is always waterlogged. Once drained, for example for farming or plantations, peat becomes highly flammable.",
        "Peat fires often burn below the surface (smouldering), spreading slowly and staying hard to put out because water struggles to soak into dry peat; they can reignite days after looking extinguished on the surface.",
        "Peat fires also produce large amounts of thick smoke (haze) because combustion is incomplete (smouldering combustion), unlike ordinary forest fires that burn faster and cleaner.",
        "Indonesia's largest peat areas are mainly in Sumatra and Kalimantan. Two regions also covered by this app's region filter.",
      ],
    },
  },
  {
    slug: "status-aman-awas",
    title: "Arti status Aman → Awas",
    icon: "warning",
    summary: "Bagaimana aplikasi ini menghitung ringkasan status di halaman Beranda.",
    body: [
      "Status Aman/Waspada/Siaga/Awas yang tampil di Beranda BUKAN status peringatan resmi dari BNPB atau BMKG. Ini adalah ringkasan sederhana yang dihitung langsung di perangkat Anda. Status yang tampil adalah tingkat TERTINGGI dari empat faktor di bawah, dan faktor penentunya selalu ditampilkan di bawah status.",
      "Titik panas satelit (24 jam terakhir): dalam radius 5 km = Siaga; 5–10 km = Waspada.",
      "Arah angin: ada titik panas dalam 25 km di arah datangnya angin = Waspada, karena asapnya bisa terbawa ke lokasi Anda.",
      "Kualitas udara (skala US AQI, perkiraan model Open-Meteo): 151–200 (Tidak sehat) = Waspada; 201–300 (Sangat tidak sehat) = Siaga; di atas 300 (Berbahaya) = Awas. Asap bisa sampai ke lokasi Anda walaupun apinya jauh.",
      "Laporan warga yang sudah diverifikasi petugas dalam radius 5 km = Awas.",
      "Aman berarti tidak satu pun faktor di atas terpenuhi. Bukan jaminan tidak ada kebakaran.",
      "Status hanya dihitung setelah Anda mengatur lokasi (GPS atau cari nama kecamatan/kota). Aplikasi tidak menampilkan status untuk lokasi contoh.",
      "Untuk informasi resmi dan tindakan darurat, selalu rujuk ke BNPB, BMKG, atau instansi pemadam kebakaran setempat. Aplikasi ini adalah alat bantu pemantauan, bukan pengganti jalur resmi.",
    ],
    en: {
      title: "What Safe → Danger means",
      summary: "How this app calculates the status summary on the Home page.",
      body: [
        "The Safe/Watch/Alert/Danger status (Aman/Waspada/Siaga/Awas) on the Home page is NOT an official BNPB or BMKG warning level. It is a simple summary calculated on your device. The status shown is the HIGHEST level reached by the four factors below, and the deciding factor is always shown under the status.",
        "Satellite hotspots (last 24 hours): within 5 km = Alert; 5–10 km = Watch.",
        "Wind direction: a hotspot within 25 km on the side the wind is coming from = Watch, because its smoke may drift to you.",
        "Air quality (US AQI scale, Open-Meteo model estimate): 151–200 (Unhealthy) = Watch; 201–300 (Very unhealthy) = Alert; above 300 (Hazardous) = Danger. Smoke can reach you even when the fire is far away.",
        "A citizen report verified by an officer within 5 km = Danger.",
        "Safe means none of the factors above is met. It is not a guarantee that there is no fire.",
        "The status is only calculated after you set your location (GPS, or search a district/city name). The app doesn't show a status for an example location.",
        "For official information and emergency action, always refer to BNPB, BMKG, or your local fire service. This app is a monitoring aid, not a replacement for official channels.",
      ],
    },
  },
];

export function getEduArticle(slug: string): EduArticle | undefined {
  return EDU_ARTICLES.find((a) => a.slug === slug);
}

export function articleText(article: EduArticle, language: "id" | "en"): EduArticleText {
  return language === "en" ? article.en : article;
}
