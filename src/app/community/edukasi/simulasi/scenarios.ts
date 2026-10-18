/**
 * Authored "What should I do now?" scenarios for /community/edukasi/simulasi.
 * Each scenario has one safer option and distractor options with an
 * explanation of why they're riskier. Safety guidance is always visible via
 * the `safeAction` summary regardless of which option the user picks.
 */

export interface ScenarioOption {
  id: string;
  label: string;
  isSafe: boolean;
  feedback: string;
}

export interface Scenario {
  id: string;
  title: string;
  prompt: string;
  options: ScenarioOption[];
  safeAction: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "asap-masuk-rumah",
    title: "Asap mulai masuk ke rumah",
    prompt: "Anda mencium bau asap dan melihatnya mulai masuk dari sela pintu/jendela rumah. Apa yang Anda lakukan?",
    options: [
      {
        id: "a",
        label: "Tutup semua pintu dan jendela, sumbat celah dengan kain basah, pantau informasi resmi",
        isSafe: true,
        feedback: "Benar. Menutup celah mengurangi asap yang masuk sambil Anda memantau perkembangan situasi dari sumber resmi (BMKG/BNPB/aparat setempat).",
      },
      {
        id: "b",
        label: "Buka jendela agar udara di dalam rumah berganti",
        isSafe: false,
        feedback: "Berisiko — membuka jendela saat asap tebal justru menambah partikel asap yang masuk ke dalam rumah.",
      },
      {
        id: "c",
        label: "Abaikan karena biasanya hilang sendiri",
        isSafe: false,
        feedback: "Berisiko — paparan asap yang dianggap enteng bisa memburuk tanpa disadari, terutama untuk anggota keluarga rentan.",
      },
    ],
    safeAction: "Tutup pintu/jendela, kurangi aktivitas luar ruangan, dan pantau informasi resmi BMKG/BNPB.",
  },
  {
    id: "hotspot-dekat-permukiman",
    title: "Deteksi titik panas satelit dekat permukiman",
    prompt: "Aplikasi menunjukkan deteksi satelit (titik panas) dalam radius beberapa kilometer dari rumah Anda. Apa yang Anda lakukan?",
    options: [
      {
        id: "a",
        label: "Cek kondisi langsung di sekitar, siapkan tas siaga, dan pantau pembaruan — tanpa panik karena ini belum konfirmasi kebakaran aktif",
        isSafe: true,
        feedback: "Benar. Deteksi satelit (MODIS/VIIRS) menandakan anomali panas, bukan konfirmasi pasti ada kebakaran aktif — tapi tetap layak untuk mulai bersiap.",
      },
      {
        id: "b",
        label: "Langsung mengungsi tanpa mengecek apa pun",
        isSafe: false,
        feedback: "Berlebihan di tahap ini — deteksi satelit saja belum berarti kebakaran aktif/dekat; evakuasi penuh biasanya diputuskan berdasarkan instruksi resmi atau kondisi nyata di lapangan.",
      },
      {
        id: "c",
        label: "Mengabaikan karena anggap aplikasi tidak akurat",
        isSafe: false,
        feedback: "Berisiko — mengabaikan sepenuhnya berarti Anda kehilangan waktu untuk bersiap jika situasi memburuk.",
      },
    ],
    safeAction: "Anggap sebagai sinyal untuk mulai bersiap (bukan kepastian kebakaran): cek kondisi sekitar, siapkan tas siaga, pantau pembaruan.",
  },
  {
    id: "evakuasi-diumumkan",
    title: "Evakuasi resmi diumumkan",
    prompt: "Aparat desa/BNPB mengumumkan perintah evakuasi untuk wilayah Anda. Apa yang Anda lakukan?",
    options: [
      {
        id: "a",
        label: "Ikuti instruksi evakuasi, bawa tas siaga, menuju titik kumpul yang sudah disepakati keluarga",
        isSafe: true,
        feedback: "Benar. Instruksi evakuasi resmi didasarkan pada informasi lapangan yang lebih lengkap daripada yang bisa diketahui dari rumah — selalu ikuti.",
      },
      {
        id: "b",
        label: "Tetap di rumah karena merasa situasi belum terlalu parah di mata sendiri",
        isSafe: false,
        feedback: "Berisiko tinggi — kondisi di lapangan (arah angin, kecepatan rambat api) bisa berubah cepat dan tidak selalu terlihat dari dalam rumah.",
      },
      {
        id: "c",
        label: "Menunggu sampai asap benar-benar terlihat dari rumah sebelum bergerak",
        isSafe: false,
        feedback: "Berisiko — menunggu tanda yang terlihat dari rumah berarti kehilangan waktu evakuasi yang aman.",
      },
    ],
    safeAction: "Selalu ikuti perintah evakuasi resmi segera, bawa tas siaga, dan tuju titik kumpul keluarga.",
  },
  {
    id: "asma-sesak",
    title: "Anggota keluarga dengan asma mulai sesak napas",
    prompt: "Anggota keluarga dengan riwayat asma mulai terlihat sesak napas akibat asap. Apa yang Anda lakukan?",
    options: [
      {
        id: "a",
        label: "Segera pindahkan ke ruangan tertutup bebas asap, gunakan obat asma yang biasa dipakai jika ada, dan cari bantuan medis bila tidak mereda",
        isSafe: true,
        feedback: "Benar. Menjauhkan dari asap dan menggunakan pengobatan rutin adalah langkah pertama; sesak yang tidak mereda butuh bantuan medis segera.",
      },
      {
        id: "b",
        label: "Menunggu dan melihat apakah akan membaik sendiri",
        isSafe: false,
        feedback: "Berisiko tinggi — sesak napas pada penderita asma bisa memburuk cepat; menunggu tanpa tindakan berbahaya.",
      },
      {
        id: "c",
        label: "Memasangkan masker kain seadanya dan menyuruh beraktivitas seperti biasa",
        isSafe: false,
        feedback: "Berisiko — masker kain tidak menyaring partikel asap secara efektif, dan beraktivitas saat sesak memperberat kondisi.",
      },
    ],
    safeAction: "Jauhkan dari asap, gunakan obat asma yang biasa dipakai, dan segera cari bantuan medis jika sesak tidak mereda.",
  },
  {
    id: "anggota-hilang",
    title: "Anggota keluarga terpisah saat evakuasi",
    prompt: "Saat evakuasi berlangsung, Anda menyadari satu anggota keluarga tidak terlihat. Apa yang Anda lakukan?",
    options: [
      {
        id: "a",
        label: "Tetap menuju titik kumpul yang sudah disepakati, beri tahu petugas evakuasi/posko, dan hubungi kontak penghubung keluarga",
        isSafe: true,
        feedback: "Benar. Titik kumpul dan kontak penghubung yang sudah disiapkan sebelumnya adalah cara tercepat untuk saling menemukan; petugas posko juga bisa membantu pencarian secara terkoordinasi.",
      },
      {
        id: "b",
        label: "Berbalik sendiri ke arah sumber asap/api untuk mencari",
        isSafe: false,
        feedback: "Sangat berbahaya — kembali ke arah bahaya sendirian berisiko tinggi tanpa koordinasi dan tanpa mengetahui kondisi di sana.",
      },
      {
        id: "c",
        label: "Panik dan berhenti bergerak di lokasi yang sama",
        isSafe: false,
        feedback: "Berisiko — berhenti di jalur evakuasi bisa menghalangi orang lain dan tidak membantu menemukan anggota keluarga yang terpisah.",
      },
    ],
    safeAction: "Tuju titik kumpul yang disepakati, laporkan ke petugas/posko evakuasi, dan hubungi kontak penghubung keluarga — jangan mencari sendiri ke area berbahaya.",
  },
  {
    id: "kembali-setelah-reda",
    title: "Ingin kembali ke rumah setelah api terlihat reda",
    prompt: "Setelah mengungsi, api terlihat sudah reda dari jauh dan Anda ingin segera kembali ke rumah. Apa yang Anda lakukan?",
    options: [
      {
        id: "a",
        label: "Menunggu pengumuman resmi bahwa wilayah aman untuk dihuni kembali sebelum pulang",
        isSafe: true,
        feedback: "Benar. Kebakaran lahan gambut khususnya bisa membara di bawah permukaan dan menyala kembali meski terlihat padam — otoritas setempat yang memverifikasi kondisi aman sebelum warga kembali.",
      },
      {
        id: "b",
        label: "Langsung pulang karena api sudah tidak terlihat",
        isSafe: false,
        feedback: "Berisiko — api yang 'terlihat' padam di permukaan (terutama di lahan gambut) bisa menyala kembali, dan kualitas udara mungkin masih belum aman.",
      },
      {
        id: "c",
        label: "Mengirim anak-anak lebih dulu untuk mengecek kondisi rumah",
        isSafe: false,
        feedback: "Berisiko — tidak seharusnya anggota keluarga rentan ditempatkan sebagai pengecek pertama ke area yang belum dinyatakan aman.",
      },
    ],
    safeAction: "Tunggu pengumuman resmi bahwa wilayah sudah aman untuk dihuni kembali sebelum pulang — jangan menilai sendiri dari kejauhan.",
  },
];
