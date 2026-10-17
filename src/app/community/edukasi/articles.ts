/**
 * Static, authored reference content for the Education hub ("08 Community —
 * Edukasi & Kontribusi", Figma node 186:3013) and its 3 article detail
 * views (folded in from the 186:31xx sibling nodes — see community/README
 * note in the agent report). This is genuinely-authored reference text, not
 * a stand-in for an unbuilt data feed, so it is NOT marked "Contoh data".
 */

export interface EduArticle {
  slug: string;
  title: string;
  icon: string;
  summary: string;
  body: string[];
}

export const EDU_ARTICLES: EduArticle[] = [
  {
    slug: "modis-viirs",
    title: "Apa itu MODIS & VIIRS?",
    icon: "satellite_alt",
    summary: "Dua instrumen satelit NASA yang mendeteksi titik panas di permukaan bumi.",
    body: [
      "MODIS (Moderate Resolution Imaging Spectroradiometer) terbang di satelit Terra dan Aqua, mengamati permukaan bumi dua kali sehari dengan resolusi sekitar 1 km per piksel untuk deteksi kebakaran.",
      "VIIRS (Visible Infrared Imaging Radiometer Suite) terbang di satelit Suomi NPP dan NOAA-20, dengan resolusi lebih tinggi (sekitar 375 m) sehingga bisa mendeteksi titik api yang lebih kecil dibanding MODIS.",
      "Aplikasi ini menggunakan data near-real-time dari NASA FIRMS (Fire Information for Resource Management System) yang menggabungkan deteksi dari kedua instrumen tersebut.",
      "Penting: kedua sensor mendeteksi anomali panas (thermal anomaly), bukan secara otomatis mengonfirmasi adanya kebakaran aktif di lapangan. Awan tebal, asap, atau waktu lintasan satelit yang jarang bisa membuat kebakaran kecil tidak terdeteksi.",
    ],
  },
  {
    slug: "lahan-gambut",
    title: "Kenapa lahan gambut mudah terbakar?",
    icon: "grass",
    summary: "Gambut menyimpan karbon dalam jumlah besar dan terbakar secara berbeda dari hutan biasa.",
    body: [
      "Lahan gambut terbentuk dari bahan organik (sisa tumbuhan) yang terurai sangat lambat karena selalu tergenang air. Begitu dikeringkan — biasanya untuk pertanian atau perkebunan — gambut menjadi sangat mudah terbakar.",
      "Kebakaran gambut sering terjadi di bawah permukaan (smouldering/membara), menyebar perlahan dan sulit dipadamkan karena air sulit menembus lapisan gambut yang kering, serta bisa menyala kembali berhari-hari setelah terlihat padam di permukaan.",
      "Kebakaran gambut juga menghasilkan asap tebal (kabut asap) dalam jumlah besar karena pembakaran yang tidak sempurna (smouldering combustion), berbeda dari kebakaran hutan biasa yang membakar lebih cepat dan bersih.",
      "Wilayah gambut terluas di Indonesia terutama ada di Sumatera dan Kalimantan — dua wilayah yang juga tercakup dalam opsi filter wilayah aplikasi ini.",
    ],
  },
  {
    slug: "status-aman-awas",
    title: "Arti status Aman → Awas",
    icon: "warning",
    summary: "Bagaimana aplikasi ini menghitung ringkasan status di halaman Beranda.",
    body: [
      "Status Aman/Waspada/Siaga/Awas yang tampil di Beranda BUKAN status peringatan resmi dari BNPB atau BMKG — ini adalah ringkasan sederhana yang dihitung langsung di perangkat Anda dari jarak ke deteksi satelit terdekat dan tingkat keparahannya.",
      "Aman: tidak ada deteksi satelit di sekitar Anda, atau deteksi terdekat lebih dari 15 km.",
      "Waspada: ada deteksi satelit dalam radius 5–15 km dari lokasi Anda.",
      "Siaga: deteksi satelit dalam radius 5 km, atau deteksi tersebut sudah cocok lintas-sensor (MODIS dan VIIRS sama-sama mendeteksi di lokasi dan waktu yang berdekatan).",
      "Awas: deteksi satelit dalam radius 1 km dengan tingkat keparahan tinggi.",
      "Untuk informasi resmi dan tindakan darurat, selalu rujuk ke BNPB, BMKG, atau instansi pemadam kebakaran setempat — aplikasi ini adalah alat bantu pemantauan, bukan pengganti jalur resmi.",
    ],
  },
];

export function getEduArticle(slug: string): EduArticle | undefined {
  return EDU_ARTICLES.find((a) => a.slug === slug);
}
