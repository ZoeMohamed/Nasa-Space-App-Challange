/**
 * Authored reference content for the Emergency Preparedness Checklist
 * (/community/edukasi/siaga). Genuinely-authored guidance text, not a
 * stand-in for an unbuilt data feed.
 */

export interface ChecklistItem {
  id: string;
  what: string;
  why: string;
  how: string;
  caveat?: string;
}

export interface ChecklistCategory {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export const CHECKLIST_CATEGORIES: ChecklistCategory[] = [
  {
    id: "dokumen",
    title: "Dokumen penting",
    items: [
      {
        id: "dok-identitas",
        what: "Kartu identitas (KTP, KK, akta kelahiran)",
        why: "Dibutuhkan untuk pendataan di posko pengungsian dan mengurus bantuan setelah evakuasi.",
        how: "Fotokopi dan simpan asli dalam plastik kedap air, satu set per anggota keluarga.",
      },
      {
        id: "dok-kesehatan",
        what: "Kartu BPJS / asuransi kesehatan dan catatan obat rutin",
        why: "Memudahkan petugas medis menangani anggota keluarga dengan kondisi khusus secara cepat.",
        how: "Simpan salinan kartu dan daftar obat (nama, dosis) dalam satu map kecil.",
      },
      {
        id: "dok-properti",
        what: "Dokumen rumah/lahan dan polis asuransi (jika ada)",
        why: "Berguna untuk klaim atau pendataan kerugian pascakebakaran.",
        how: "Simpan fotokopi, bukan dokumen asli yang sulit diganti.",
        caveat: "Jika tidak memiliki dokumen ini, lewati — bukan syarat wajib untuk evakuasi aman.",
      },
      {
        id: "dok-kontak",
        what: "Daftar kontak darurat (keluarga, tetangga, puskesmas terdekat)",
        why: "Saat sinyal atau ingatan terganggu di situasi darurat, daftar tertulis tetap bisa diandalkan.",
        how: "Tulis di kertas dan simpan di tas siaga, jangan hanya di ponsel.",
      },
    ],
  },
  {
    id: "tas",
    title: "Tas siaga darurat",
    items: [
      {
        id: "tas-air-makanan",
        what: "Air minum dan makanan tahan lama untuk 3 hari",
        why: "Jalur bantuan dan toko mungkin tidak bisa diakses segera setelah evakuasi.",
        how: "Gunakan botol tertutup rapat dan makanan kemasan yang tidak mudah rusak (biskuit, abon, mi instan).",
      },
      {
        id: "tas-masker",
        what: "Masker respirator (N95 atau setara)",
        why: "Melindungi saluran napas dari partikel asap kebakaran, lebih efektif dibanding masker kain/bedah.",
        how: "Siapkan beberapa buah per anggota keluarga, cek ukuran yang pas untuk dewasa dan anak.",
        caveat: "Masker untuk anak kecil sering tidak pas tertutup rapat — perhatikan reaksi anak dan jangan paksakan jika terlihat sesak.",
      },
      {
        id: "tas-p3k",
        what: "Kotak P3K sederhana",
        why: "Untuk penanganan awal luka ringan atau iritasi akibat asap sebelum mendapat bantuan medis.",
        how: "Isi perban, antiseptik, obat tetes mata, dan obat pribadi yang rutin dikonsumsi.",
      },
      {
        id: "tas-senter",
        what: "Senter dan baterai cadangan / power bank",
        why: "Evakuasi bisa terjadi malam hari atau saat listrik padam.",
        how: "Cek baterai setiap beberapa bulan agar selalu siap pakai.",
      },
      {
        id: "tas-pakaian",
        what: "Pakaian ganti dan selimut ringan",
        why: "Kondisi di posko pengungsian bisa berlangsung lebih dari satu hari.",
        how: "Siapkan 1–2 set pakaian per orang dalam kantong kedap air.",
      },
    ],
  },
  {
    id: "rencana",
    title: "Rencana keluarga",
    items: [
      {
        id: "rencana-titik-temu",
        what: "Titik kumpul keluarga yang disepakati",
        why: "Jika anggota keluarga terpisah saat evakuasi, titik kumpul mencegah kepanikan mencari satu sama lain.",
        how: "Pilih lokasi yang semua anggota keluarga (termasuk anak) tahu dan mudah dijangkau, misalnya rumah ibadah atau balai desa.",
      },
      {
        id: "rencana-jalur",
        what: "Jalur evakuasi dari rumah menuju titik aman",
        why: "Mengetahui jalur sebelumnya mempercepat evakuasi saat jarak pandang terganggu asap.",
        how: "Jalani jalur tersebut sekali bersama keluarga saat kondisi normal agar semua familiar.",
      },
      {
        id: "rencana-kontak-pic",
        what: "Satu orang penghubung di luar wilayah terdampak",
        why: "Jika jaringan lokal padat/terganggu, anggota keluarga bisa saling mengabari lewat satu kontak di luar wilayah.",
        how: "Sepakati nama dan nomor kontak ini, beri tahu seluruh anggota keluarga.",
      },
      {
        id: "rencana-anggota-khusus",
        what: "Rencana khusus untuk anggota keluarga rentan (lansia, anak, penyandang disabilitas, ibu hamil)",
        why: "Anggota ini mungkin butuh waktu lebih lama atau bantuan tambahan saat evakuasi.",
        how: "Tentukan siapa yang bertanggung jawab mendampingi mereka, dan siapkan alat bantu (kursi roda, obat) di dekat pintu keluar.",
        caveat: "Rencana ini membantu kesiapan, tapi tetap ikuti instruksi evakuasi resmi di lapangan — petugas setempat lebih tahu kondisi terkini.",
      },
    ],
  },
];

export const TOTAL_CHECKLIST_ITEMS = CHECKLIST_CATEGORIES.reduce(
  (sum, cat) => sum + cat.items.length,
  0
);
