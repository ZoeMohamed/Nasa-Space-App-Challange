/**
 * Sourced karhutla facts for the Edukasi hub and /community/edukasi/fakta. Every number cites an
 * entry in REFERENCES (researched 2026-10-20). Where only a secondary source could be verified, the
 * reference says so ("dikutip dari …") rather than pretending to cite the primary document.
 */

export interface Reference {
  id: number;
  citation: string;
  url: string;
  note?: string;
}

export interface Fact {
  value: string;
  title: string;
  body: string;
  refs: number[];
  icon: string;
  tone: "red" | "amber" | "sky" | "emerald" | "slate";
}

export const REFERENCES: Reference[] = [
  {
    id: 1,
    citation:
      "World Bank (2016). The Cost of Fire: An Economic Analysis of Indonesia's 2015 Fire Crisis. Indonesia Sustainable Landscapes Knowledge Note No. 1.",
    url: "https://documents.worldbank.org/en/publication/documents-reports/documentdetail/776101467990969768/The-cost-of-fire-an-economic-analysis-of-Indonesia-s-2015-fire-crisis",
  },
  {
    id: 2,
    citation:
      "Koplitz, S. N., Mickley, L. J., Marlier, M. E., dkk. (2016). Public health impacts of the severe haze in Equatorial Asia in September–October 2015. Environmental Research Letters, 11(9), 094023.",
    url: "https://doi.org/10.1088/1748-9326/11/9/094023",
  },
  {
    id: 3,
    citation:
      "Huijnen, V., Wooster, M. J., Kaiser, J. W., dkk. (2016). Fire carbon emissions over maritime southeast Asia in 2015 largest since 1997. Scientific Reports, 6, 26886.",
    url: "https://doi.org/10.1038/srep26886",
  },
  {
    id: 4,
    citation:
      "Balai Besar Sumber Daya Lahan Pertanian (BBSDLP), Kementerian Pertanian (2019). Peta Lahan Gambut Indonesia skala 1:50.000 (SNI 7925:2019).",
    url: "https://ukdn.geo.ugm.ac.id/product/service-provider-to-develop-and-deliver-capacity-development-on-geographic-information-systems-and-remote-sensing",
    note: "Dikutip dari halaman proyek GIZ / Universitas Gadjah Mada; dokumen peta BBSDLP belum diakses langsung.",
  },
  {
    id: 5,
    citation:
      "Bisnis.com (21 Agustus 2019). 99 Persen Kebakaran Hutan dan Lahan Akibat Ulah Manusia — pernyataan Kepala BNPB dalam rapat koordinasi karhutla di Kemenko Polhukam.",
    url: "https://ekonomi.bisnis.com/read/20190821/99/1139491/99-persen-kebakaran-hutan-dan-lahan-akibat-ulah-manusia",
    note: "Angka 99% adalah pernyataan pejabat, bukan hasil studi yang dipublikasikan.",
  },
  {
    id: 6,
    citation: "World Health Organization (2021). WHO Global Air Quality Guidelines: Particulate Matter (PM2.5 and PM10), Ozone, Nitrogen Dioxide, Sulfur Dioxide and Carbon Monoxide.",
    url: "https://www.airclim.org/who-air-quality-guidelines",
    note: "Nilai ambang dikutip dari ringkasan AirClim yang mereproduksi tabel WHO.",
  },
  {
    id: 7,
    citation:
      "Kementerian Lingkungan Hidup dan Kehutanan (2020). Peraturan Menteri LHK No. P.14/MENLHK/SETJEN/KUM.1/7/2020 tentang Indeks Standar Pencemar Udara.",
    url: "https://mail.ppkl.menlhk.go.id/website/filebox/988/210704011643PERMEN%20ISPU%20NO%2014%20TAHUN%202020.pdf",
    note: "Salinan dari situs Ditjen PPKL KLHK.",
  },
  {
    id: 8,
    citation: "CDC / NIOSH (2023). Protecting Workers and the Public from Wildfire Smoke. NIOSH Science Blog.",
    url: "https://www.cdc.gov/niosh/bulletin/2023/wildfire-smoke.html",
  },
];

/** Shown on the Edukasi hub as quick highlights. */
export const HIGHLIGHT_FACTS: Fact[] = [
  {
    value: "2,6 juta ha",
    title: "Lahan terbakar tahun 2015",
    body: "Lebih dari 4 kali luas Pulau Bali, dengan kerugian ekonomi ±US$16,1 miliar (sekitar 2% PDB Indonesia) — lebih dari dua kali biaya rekonstruksi pascatsunami Aceh 2004.",
    refs: [1],
    icon: "local_fire_department",
    tone: "red",
  },
  {
    value: "±100.300",
    title: "Perkiraan kematian dini akibat asap 2015",
    body: "Di Indonesia, Malaysia, dan Singapura. Ini perkiraan model paparan PM2.5, bukan hitungan kasus yang tercatat.",
    refs: [2],
    icon: "pulmonology",
    tone: "amber",
  },
  {
    value: "99%",
    title: "Karhutla disebabkan aktivitas manusia",
    body: "Menurut BNPB (2019) — baik disengaja (membuka lahan) maupun tidak (puntung rokok, api unggun).",
    refs: [5],
    icon: "person_alert",
    tone: "slate",
  },
  {
    value: "N95",
    title: "Masker yang menyaring asap",
    body: "Masker kain, masker bedah, atau kain basah tidak menyaring partikel asap halus. Respirator N95 yang pas di wajah bisa.",
    refs: [8],
    icon: "masks",
    tone: "sky",
  },
];

export const MORE_FACTS: Fact[] = [
  {
    value: "11,3 juta ton CO₂/hari",
    title: "Emisi saat puncak kebakaran 2015",
    body: "Rata-rata September–Oktober 2015 di Asia Tenggara maritim — melebihi emisi bahan bakar fosil harian seluruh Uni Eropa (8,9 juta ton CO₂/hari). Terbesar sejak El Niño 1997.",
    refs: [3],
    icon: "factory",
    tone: "slate",
  },
  {
    value: "±13,4 juta ha",
    title: "Luas lahan gambut Indonesia",
    body: "Tercatat sekitar 13,43 juta hektare dalam peta gambut nasional BBSDLP 2019 skala 1:50.000.",
    refs: [4],
    icon: "grass",
    tone: "emerald",
  },
  {
    value: "15 µg/m³",
    title: "Batas aman PM2.5 harian (WHO)",
    body: "Pedoman WHO 2021: rata-rata 24 jam sebaiknya tidak melebihi 15 µg/m³, dan rata-rata tahunan 5 µg/m³ — separuh dari pedoman 2005 (10 µg/m³).",
    refs: [6],
    icon: "air",
    tone: "sky",
  },
];

export const ISPU_CATEGORIES = [
  { range: "0–50", label: "Baik", color: "bg-emerald-500", meaning: "Kualitas udara baik." },
  { range: "51–100", label: "Sedang", color: "bg-sky-500", meaning: "Kualitas udara sedang." },
  { range: "101–200", label: "Tidak Sehat", color: "bg-amber-500", meaning: "Merugikan manusia, hewan, dan tumbuhan." },
  { range: "201–300", label: "Sangat Tidak Sehat", color: "bg-rose-500", meaning: "Meningkatkan risiko kesehatan pada kelompok sensitif." },
  { range: "> 300", label: "Berbahaya", color: "bg-purple-800", meaning: "Merugikan kesehatan secara serius dan perlu penanganan cepat." },
];

export const TONE_CLASSES: Record<Fact["tone"], string> = {
  red: "bg-red-50 text-red-700",
  amber: "bg-amber-50 text-amber-700",
  sky: "bg-sky-50 text-sky-700",
  emerald: "bg-emerald-50 text-emerald-700",
  slate: "bg-slate-100 text-slate-700",
};
