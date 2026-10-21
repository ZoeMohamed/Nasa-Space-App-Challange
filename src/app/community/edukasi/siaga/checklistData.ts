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
        caveat: "Jika tidak memiliki dokumen ini, lewati. Bukan syarat wajib untuk evakuasi aman.",
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
        caveat: "Masker untuk anak kecil sering tidak pas tertutup rapat. Perhatikan reaksi anak dan jangan paksakan jika terlihat sesak.",
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
        caveat: "Rencana ini membantu kesiapan, tapi tetap ikuti instruksi evakuasi resmi di lapangan. Petugas setempat lebih tahu kondisi terkini.",
      },
    ],
  },
];

export const TOTAL_CHECKLIST_ITEMS = CHECKLIST_CATEGORIES.reduce(
  (sum, cat) => sum + cat.items.length,
  0
);

type ItemText = Pick<ChecklistItem, "what" | "why" | "how" | "caveat">;

/** English text for each item/category, keyed by id (the Indonesian above is the original). */
const CATEGORY_TITLE_EN: Record<string, string> = {
  dokumen: "Important documents",
  tas: "Emergency go-bag",
  rencana: "Family plan",
};

const ITEM_EN: Record<string, ItemText> = {
  "dok-identitas": {
    what: "Identity cards (KTP, family card, birth certificates)",
    why: "Needed to register at evacuation shelters and to arrange aid after evacuating.",
    how: "Make photocopies and keep the originals in a waterproof bag, one set per family member.",
  },
  "dok-kesehatan": {
    what: "BPJS / health insurance cards and a list of regular medicines",
    why: "Helps medical staff quickly treat family members with special conditions.",
    how: "Keep copies of the cards and a medicine list (name, dose) in one small folder.",
  },
  "dok-properti": {
    what: "House/land documents and insurance policies (if any)",
    why: "Useful for claims or recording losses after a fire.",
    how: "Keep photocopies, not originals that are hard to replace.",
    caveat: "If you don't have these documents, skip this. They're not required for a safe evacuation.",
  },
  "dok-kontak": {
    what: "Emergency contact list (family, neighbours, nearest health centre)",
    why: "When signal or memory fails in an emergency, a written list still works.",
    how: "Write it on paper and keep it in the go-bag, not only on your phone.",
  },
  "tas-air-makanan": {
    what: "Drinking water and long-lasting food for 3 days",
    why: "Aid routes and shops may not be reachable right after evacuating.",
    how: "Use tightly sealed bottles and packaged food that keeps well (biscuits, shredded dried meat, instant noodles).",
  },
  "tas-masker": {
    what: "Respirator masks (N95 or equivalent)",
    why: "Protects your airways from fire-smoke particles, far better than cloth/surgical masks.",
    how: "Keep several per family member, and check the right fit for adults and children.",
    caveat: "Masks for small children often don't seal well. Watch how the child reacts and don't force it if they seem short of breath.",
  },
  "tas-p3k": {
    what: "A simple first-aid kit",
    why: "For first treatment of minor wounds or smoke irritation before medical help arrives.",
    how: "Include bandages, antiseptic, eye drops, and any personal medicines taken regularly.",
  },
  "tas-senter": {
    what: "Torch and spare batteries / power bank",
    why: "Evacuation may happen at night or during a power cut.",
    how: "Check the batteries every few months so they're always ready.",
  },
  "tas-pakaian": {
    what: "Change of clothes and a light blanket",
    why: "A stay at an evacuation shelter can last more than a day.",
    how: "Pack 1–2 sets of clothes per person in a waterproof bag.",
  },
  "rencana-titik-temu": {
    what: "An agreed family meeting point",
    why: "If family members are separated while evacuating, a meeting point stops panicked searching.",
    how: "Choose a place every family member (children too) knows and can reach easily, such as a place of worship or the village hall.",
  },
  "rencana-jalur": {
    what: "An evacuation route from home to a safe place",
    why: "Knowing the route beforehand speeds up evacuation when smoke limits visibility.",
    how: "Walk the route once with your family in normal conditions so everyone knows it.",
  },
  "rencana-kontak-pic": {
    what: "One contact person outside the affected area",
    why: "If local networks are jammed or down, family members can update each other through one contact elsewhere.",
    how: "Agree on this person's name and number and tell the whole family.",
  },
  "rencana-anggota-khusus": {
    what: "A special plan for vulnerable family members (elderly, children, people with disabilities, pregnant women)",
    why: "They may need more time or extra help during evacuation.",
    how: "Decide who is responsible for accompanying them, and keep aids (wheelchair, medicines) near the exit.",
    caveat: "This plan helps you prepare, but always follow official evacuation instructions on the ground. Local officers know the current conditions best.",
  },
};

export function categoryTitle(category: ChecklistCategory, language: "id" | "en"): string {
  return language === "en" ? (CATEGORY_TITLE_EN[category.id] ?? category.title) : category.title;
}

export function itemText(item: ChecklistItem, language: "id" | "en"): ItemText {
  return language === "en" ? (ITEM_EN[item.id] ?? item) : item;
}
