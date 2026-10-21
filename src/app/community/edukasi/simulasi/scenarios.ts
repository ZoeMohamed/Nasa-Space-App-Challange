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
        feedback: "Berisiko. Membuka jendela saat asap tebal justru menambah partikel asap yang masuk ke dalam rumah.",
      },
      {
        id: "c",
        label: "Abaikan karena biasanya hilang sendiri",
        isSafe: false,
        feedback: "Berisiko. Paparan asap yang dianggap enteng bisa memburuk tanpa disadari, terutama untuk anggota keluarga rentan.",
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
        label: "Cek kondisi langsung di sekitar, siapkan tas siaga, dan pantau pembaruan. Tanpa panik karena ini belum konfirmasi kebakaran aktif",
        isSafe: true,
        feedback: "Benar. Deteksi satelit (MODIS/VIIRS) menandakan anomali panas, bukan konfirmasi pasti ada kebakaran aktif. Tapi tetap layak untuk mulai bersiap.",
      },
      {
        id: "b",
        label: "Langsung mengungsi tanpa mengecek apa pun",
        isSafe: false,
        feedback: "Berlebihan di tahap ini. Deteksi satelit saja belum berarti kebakaran aktif/dekat; evakuasi penuh biasanya diputuskan berdasarkan instruksi resmi atau kondisi nyata di lapangan.",
      },
      {
        id: "c",
        label: "Mengabaikan karena anggap aplikasi tidak akurat",
        isSafe: false,
        feedback: "Berisiko. Mengabaikan sepenuhnya berarti Anda kehilangan waktu untuk bersiap jika situasi memburuk.",
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
        feedback: "Benar. Instruksi evakuasi resmi didasarkan pada informasi lapangan yang lebih lengkap daripada yang bisa diketahui dari rumah. Selalu ikuti.",
      },
      {
        id: "b",
        label: "Tetap di rumah karena merasa situasi belum terlalu parah di mata sendiri",
        isSafe: false,
        feedback: "Berisiko tinggi. Kondisi di lapangan (arah angin, kecepatan rambat api) bisa berubah cepat dan tidak selalu terlihat dari dalam rumah.",
      },
      {
        id: "c",
        label: "Menunggu sampai asap benar-benar terlihat dari rumah sebelum bergerak",
        isSafe: false,
        feedback: "Berisiko. Menunggu tanda yang terlihat dari rumah berarti kehilangan waktu evakuasi yang aman.",
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
        feedback: "Berisiko tinggi. Sesak napas pada penderita asma bisa memburuk cepat; menunggu tanpa tindakan berbahaya.",
      },
      {
        id: "c",
        label: "Memasangkan masker kain seadanya dan menyuruh beraktivitas seperti biasa",
        isSafe: false,
        feedback: "Berisiko. Masker kain tidak menyaring partikel asap secara efektif, dan beraktivitas saat sesak memperberat kondisi.",
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
        feedback: "Sangat berbahaya. Kembali ke arah bahaya sendirian berisiko tinggi tanpa koordinasi dan tanpa mengetahui kondisi di sana.",
      },
      {
        id: "c",
        label: "Panik dan berhenti bergerak di lokasi yang sama",
        isSafe: false,
        feedback: "Berisiko. Berhenti di jalur evakuasi bisa menghalangi orang lain dan tidak membantu menemukan anggota keluarga yang terpisah.",
      },
    ],
    safeAction: "Tuju titik kumpul yang disepakati, laporkan ke petugas/posko evakuasi, dan hubungi kontak penghubung keluarga. Jangan mencari sendiri ke area berbahaya.",
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
        feedback: "Benar. Kebakaran lahan gambut khususnya bisa membara di bawah permukaan dan menyala kembali meski terlihat padam. Otoritas setempat yang memverifikasi kondisi aman sebelum warga kembali.",
      },
      {
        id: "b",
        label: "Langsung pulang karena api sudah tidak terlihat",
        isSafe: false,
        feedback: "Berisiko. Api yang 'terlihat' padam di permukaan (terutama di lahan gambut) bisa menyala kembali, dan kualitas udara mungkin masih belum aman.",
      },
      {
        id: "c",
        label: "Mengirim anak-anak lebih dulu untuk mengecek kondisi rumah",
        isSafe: false,
        feedback: "Berisiko. Tidak seharusnya anggota keluarga rentan ditempatkan sebagai pengecek pertama ke area yang belum dinyatakan aman.",
      },
    ],
    safeAction: "Tunggu pengumuman resmi bahwa wilayah sudah aman untuk dihuni kembali sebelum pulang. Jangan menilai sendiri dari kejauhan.",
  },
];

interface ScenarioTextEn {
  title: string;
  prompt: string;
  safeAction: string;
  options: Record<string, { label: string; feedback: string }>;
}

/** English text for each scenario, keyed by scenario id then option id (Indonesian above is the original). */
const SCENARIOS_EN: Record<string, ScenarioTextEn> = {
  "asap-masuk-rumah": {
    title: "Smoke starts coming into the house",
    prompt: "You smell smoke and see it starting to come in through gaps around doors/windows. What do you do?",
    options: {
      a: {
        label: "Close all doors and windows, plug gaps with a wet cloth, and follow official information",
        feedback: "Right. Sealing gaps cuts the smoke coming in while you follow updates from official sources (BMKG/BNPB/local officials).",
      },
      b: {
        label: "Open the windows to refresh the air inside",
        feedback: "Risky. Opening windows in thick smoke lets even more smoke particles into the house.",
      },
      c: {
        label: "Ignore it because it usually goes away by itself",
        feedback: "Risky. Smoke exposure taken lightly can quietly get worse, especially for vulnerable family members.",
      },
    },
    safeAction: "Close doors/windows, cut outdoor activity, and follow official BMKG/BNPB information.",
  },
  "hotspot-dekat-permukiman": {
    title: "Satellite hotspot detected near homes",
    prompt: "The app shows a satellite detection (hotspot) within a few kilometres of your home. What do you do?",
    options: {
      a: {
        label: "Check the surroundings yourself, prepare the go-bag, and follow updates. Without panic, since this isn't yet a confirmed active fire",
        feedback: "Right. A satellite detection (MODIS/VIIRS) signals a heat anomaly, not a confirmed active fire. But it's still worth starting to prepare.",
      },
      b: {
        label: "Evacuate immediately without checking anything",
        feedback: "Too much at this stage. A satellite detection alone doesn't mean an active or nearby fire; full evacuation is usually decided by official instructions or real conditions on the ground.",
      },
      c: {
        label: "Ignore it because you think the app is inaccurate",
        feedback: "Risky. Ignoring it completely means losing time to prepare if things get worse.",
      },
    },
    safeAction: "Treat it as a signal to start preparing (not proof of a fire): check your surroundings, prepare the go-bag, follow updates.",
  },
  "evakuasi-diumumkan": {
    title: "An official evacuation is announced",
    prompt: "Village officials/BNPB announce an evacuation order for your area. What do you do?",
    options: {
      a: {
        label: "Follow the evacuation instructions, take the go-bag, and head to the family's agreed meeting point",
        feedback: "Right. Official evacuation orders are based on fuller field information than you can see from home. Always follow them.",
      },
      b: {
        label: "Stay home because it doesn't look that bad to you",
        feedback: "High risk. Conditions on the ground (wind direction, how fast the fire spreads) can change quickly and aren't always visible from inside the house.",
      },
      c: {
        label: "Wait until you can actually see the smoke from home before moving",
        feedback: "Risky. Waiting for signs you can see from home means losing safe evacuation time.",
      },
    },
    safeAction: "Always follow official evacuation orders right away, take the go-bag, and head to the family meeting point.",
  },
  "asma-sesak": {
    title: "A family member with asthma becomes short of breath",
    prompt: "A family member with a history of asthma starts struggling to breathe because of the smoke. What do you do?",
    options: {
      a: {
        label: "Move them at once to a closed, smoke-free room, use their usual asthma medicine if available, and get medical help if it doesn't ease",
        feedback: "Right. Getting away from the smoke and using their regular treatment is the first step; breathlessness that doesn't ease needs medical help right away.",
      },
      b: {
        label: "Wait and see whether it gets better by itself",
        feedback: "High risk. Breathlessness in people with asthma can worsen quickly; waiting without acting is dangerous.",
      },
      c: {
        label: "Put any cloth mask on them and tell them to carry on as usual",
        feedback: "Risky. Cloth masks don't filter smoke particles effectively, and activity while breathless makes it worse.",
      },
    },
    safeAction: "Get them away from the smoke, use their usual asthma medicine, and seek medical help quickly if the breathlessness doesn't ease.",
  },
  "anggota-hilang": {
    title: "A family member gets separated during evacuation",
    prompt: "During the evacuation you realise one family member is missing. What do you do?",
    options: {
      a: {
        label: "Keep going to the agreed meeting point, tell the evacuation officers/post, and call the family contact person",
        feedback: "Right. A meeting point and contact person agreed in advance are the fastest way to find each other; post officers can also help search in a coordinated way.",
      },
      b: {
        label: "Turn back alone towards the smoke/fire to look for them",
        feedback: "Very dangerous. Going back towards danger alone is high-risk, uncoordinated, and you don't know the conditions there.",
      },
      c: {
        label: "Panic and stop moving where you are",
        feedback: "Risky. Stopping on the evacuation route can block others and doesn't help find the separated family member.",
      },
    },
    safeAction: "Head to the agreed meeting point, report to the evacuation officers/post, and call the family contact person. Don't search alone in dangerous areas.",
  },
  "kembali-setelah-reda": {
    title: "Wanting to go home once the fire looks out",
    prompt: "After evacuating, the fire looks out from a distance and you want to go home right away. What do you do?",
    options: {
      a: {
        label: "Wait for an official announcement that the area is safe to live in again before going home",
        feedback: "Right. Peat fires in particular can smoulder below the surface and reignite even when they look out. Local authorities check that it's safe before residents return.",
      },
      b: {
        label: "Go home straight away because the fire can't be seen any more",
        feedback: "Risky. A fire that 'looks' out on the surface (especially on peat) can reignite, and the air may still be unsafe.",
      },
      c: {
        label: "Send the children ahead to check on the house",
        feedback: "Risky. Vulnerable family members should never be the first to check an area that hasn't been declared safe.",
      },
    },
    safeAction: "Wait for an official announcement that the area is safe to live in again before going home. Don't judge it yourself from a distance.",
  },
};

export function scenarioText(scenario: Scenario, language: "id" | "en"): Scenario {
  const en = language === "en" ? SCENARIOS_EN[scenario.id] : undefined;
  if (!en) return scenario;
  return {
    ...scenario,
    title: en.title,
    prompt: en.prompt,
    safeAction: en.safeAction,
    options: scenario.options.map((option) => ({ ...option, ...(en.options[option.id] ?? {}) })),
  };
}
