/**
 * Dual-language dictionary (Indonesian / English).
 *
 * Scope note: only the landing page ("/") and the two shared nav chromes (Operator's
 * Sidebar+TopBar, Community's header) are wired to this dictionary so far. Every other route
 * (map, analytics, calendar, priority-areas, citizen-reports, community sub-pages, etc.) still
 * renders Indonesian-only text hardcoded in its own file — not yet migrated to `t()`. See
 * LanguageContext.tsx for how the toggle is exposed; extending coverage means adding keys here
 * and swapping the hardcoded strings in each page for `t("...")`.
 */

export type Language = "id" | "en";

export const translations = {
  id: {
    "nav.aboutData": "Tentang data",
    "nav.loginOfficer": "Masuk sebagai petugas",
    "nav.operatorPortal": "Portal Operator",
    "nav.dashboard": "Dashboard",

    "hero.eyebrow": "NASA Space Apps 2026 · Harmonisasi MODIS & VIIRS",
    "hero.headline": "Satu kalender kebakaran dari dua generasi satelit.",
    "hero.body":
      "AGNIBHŪMI menyatukan deteksi titik panas MODIS (sejak 2000) dan VIIRS (sejak 2012) dari NASA FIRMS menjadi satu catatan yang bisa dibandingkan, supaya petugas, peneliti, dan warga di Indonesia bisa melihat kapan dan di mana kebakaran terjadi, kapan kondisinya tidak biasa, dan kapan periode kritisnya datang.",
    "challenge.title": "Menjawab tantangan NASA",
    "challenge.harmonize.title": "Harmonisasi MODIS + VIIRS",
    "challenge.harmonize.body": "Deteksi yang sama dari dua sensor dicocokkan (≤ 10 km, ≤ 12 jam) dan dihitung sekali, dengan filter confidence yang sama untuk keduanya.",
    "challenge.calendar.title": "Kalender aktivitas kebakaran",
    "challenge.calendar.body": "Arsip harian 2000–2026 per sel 0,25°, bisa dipersempit ke provinsi, kabupaten, atau kecamatan.",
    "challenge.unusual.title": "Kondisi tidak biasa & periode kritis",
    "challenge.unusual.body": "Area yang perlu diverifikasi lebih dulu diurutkan dari intensitas, persistensi, dan tren; di Kalender, aktivitas hari ini dibandingkan baseline harian tiap sel.",
    "challenge.open": "Buka",
    "hero.ctaCommunity": "Jelajahi sebagai Masyarakat",
    "hero.ctaOperator": "Lanjutkan sebagai Petugas",
    "hero.badgeFirms": "Data NASA FIRMS langsung",
    "hero.badgeCommunity": "Laporan komunitas",

    "stats.title": "Aktivitas titik panas hari ini",
    "stats.loading": "Memuat…",
    "stats.unavailable": "Data belum tersedia",
    "stats.totalDetections": "Total deteksi aktif",
    "stats.totalDetectionsCaption": "Titik panas dari MODIS & VIIRS, 24 jam terakhir",
    "stats.priorityArea": "Wilayah prioritas tertinggi",
    "stats.priorityAreaNone": "Belum ada area dengan skor prioritas",
    "stats.analyzedAreas": "Area teranalisis",
    "stats.analyzedAreasCaption": "Grid sel 0,25° yang dianalisis pipeline",
    "stats.unavailableNote":
      "Sumber data NASA FIRMS sedang tidak tersedia (kemungkinan kunci API belum dikonfigurasi). Angka di atas tidak ditampilkan sebagai gantinya, karena ini bukan data sungguhan.",

    "recentHotspots.title": "Titik panas terbaru",
    "recentHotspots.viewMap": "Lihat peta lengkap",
    "recentHotspots.loading": "Memuat titik panas…",
    "recentHotspots.unavailable": "Data belum tersedia. Sumber NASA FIRMS sedang tidak dapat diakses.",
    "recentHotspots.empty": "Tidak ada deteksi titik panas aktif saat ini.",
    "recentHotspots.source": "Sumber",
    "recentHotspots.acquired": "Diambil",
    "recentHotspots.severity": "Tingkat",
    "recentHotspots.unrecorded": "Tidak tercatat",
    "recentHotspots.liveSync": "Live NASA FIRMS",
    "recentHotspots.window24h": "24 jam",
    "recentHotspots.date": "Tanggal",
    "recentHotspots.district": "Kecamatan",
    "recentHotspots.regencyProvince": "Kab/Kota, Prov",
    "recentHotspots.coordinates": "Koordinat",
    "recentHotspots.badgeMatched": "MODIS + VIIRS",
    "recentHotspots.badgeModisOnly": "Hanya MODIS",
    "recentHotspots.badgeViirsOnly": "Hanya VIIRS",
    "recentHotspots.prev": "Titik panas sebelumnya",
    "recentHotspots.next": "Titik panas berikutnya",

    "recentReports.title": "Laporan warga terbaru",
    "recentReports.viewAll": "Lihat semua laporan",
    "recentReports.loading": "Memuat laporan warga…",
    "recentReports.empty": "Belum ada laporan warga yang masuk.",

    "disclaimer.strong": "Titik panas satelit adalah indikator anomali termal, bukan konfirmasi kebakaran.",
    "disclaimer.body":
      "Setiap deteksi, dari satelit maupun laporan warga, perlu dicek di lapangan sebelum ditindaklanjuti. Ini bukan konfirmasi kebakaran.",

    "footer.tagline": "AGNIBHŪMI · Intelijen satelit & komunitas untuk pemantauan kebakaran lahan dan hutan di Indonesia.",

    "community.subtitle": "Community View · Untuk Masyarakat",
    "community.nav.home": "Beranda",
    "community.nav.education": "Edukasi",
    "community.nav.notifications": "Notifikasi",
    "community.nav.me": "Saya",
    "community.reportFire": "Lapor Kebakaran",
    "community.backToOperator": "Kembali ke portal utama",

    "lang.toggleLabel": "Bahasa",
  },
  en: {
    "nav.aboutData": "About the data",
    "nav.loginOfficer": "Sign in as officer",
    "nav.operatorPortal": "Operator Portal",
    "nav.dashboard": "Dashboard",

    "hero.eyebrow": "NASA Space Apps 2026 · MODIS & VIIRS harmonization",
    "hero.headline": "One fire calendar from two generations of satellites.",
    "hero.body":
      "AGNIBHŪMI merges NASA FIRMS hotspot detections from MODIS (since 2000) and VIIRS (since 2012) into one comparable record, so officers, researchers, and communities in Indonesia can see when and where fires happen, when conditions are unusual, and when critical periods arrive.",
    "challenge.title": "Answering the NASA challenge",
    "challenge.harmonize.title": "MODIS + VIIRS harmonization",
    "challenge.harmonize.body": "The same fire seen by both sensors is matched (≤ 10 km, ≤ 12 h) and counted once, with one confidence filter for both.",
    "challenge.calendar.title": "Burning activity calendar",
    "challenge.calendar.body": "Daily archive 2000–2026 per 0.25° cell, narrowable to a province, regency, or district.",
    "challenge.unusual.title": "Unusual conditions & critical periods",
    "challenge.unusual.body": "Areas to verify first, ranked by intensity, persistence, and trend; in the Calendar, today's activity is compared with each cell's daily baseline.",
    "challenge.open": "Open",
    "hero.ctaCommunity": "Explore as Community",
    "hero.ctaOperator": "Continue as Officer",
    "hero.badgeFirms": "Live NASA FIRMS data",
    "hero.badgeCommunity": "Community reports",

    "stats.title": "Today's hotspot activity",
    "stats.loading": "Loading…",
    "stats.unavailable": "Data not available yet",
    "stats.totalDetections": "Total active detections",
    "stats.totalDetectionsCaption": "Hotspots from MODIS & VIIRS, last 24 hours",
    "stats.priorityArea": "Highest priority area",
    "stats.priorityAreaNone": "No area with a priority score yet",
    "stats.analyzedAreas": "Analyzed areas",
    "stats.analyzedAreasCaption": "0.25° grid cells analyzed by the pipeline",
    "stats.unavailableNote":
      "The NASA FIRMS data source is currently unavailable (an API key may not be configured). The numbers above are hidden instead of being shown, because this isn't real data.",

    "recentHotspots.title": "Latest hotspots",
    "recentHotspots.viewMap": "View full map",
    "recentHotspots.loading": "Loading hotspots…",
    "recentHotspots.unavailable": "Data not available. The NASA FIRMS source is currently unreachable.",
    "recentHotspots.empty": "No active hotspot detections right now.",
    "recentHotspots.source": "Source",
    "recentHotspots.acquired": "Acquired",
    "recentHotspots.severity": "Severity",
    "recentHotspots.unrecorded": "Not recorded",
    "recentHotspots.liveSync": "Live NASA FIRMS",
    "recentHotspots.window24h": "24h",
    "recentHotspots.date": "Date",
    "recentHotspots.district": "District",
    "recentHotspots.regencyProvince": "Regency, Prov.",
    "recentHotspots.coordinates": "Coordinates",
    "recentHotspots.badgeMatched": "MODIS + VIIRS",
    "recentHotspots.badgeModisOnly": "MODIS only",
    "recentHotspots.badgeViirsOnly": "VIIRS only",
    "recentHotspots.prev": "Previous hotspot",
    "recentHotspots.next": "Next hotspot",

    "recentReports.title": "Latest community reports",
    "recentReports.viewAll": "View all reports",
    "recentReports.loading": "Loading community reports…",
    "recentReports.empty": "No community reports submitted yet.",

    "disclaimer.strong": "Satellite hotspots are thermal anomaly indicators, not fire confirmations.",
    "disclaimer.body":
      "Every detection, from satellite or citizen report, needs a field check before action. It is not a fire confirmation.",

    "footer.tagline": "AGNIBHŪMI · Satellite & community intelligence for forest and land fire monitoring in Indonesia.",

    "community.subtitle": "Community View · For the Public",
    "community.nav.home": "Home",
    "community.nav.education": "Learn",
    "community.nav.notifications": "Notifications",
    "community.nav.me": "Me",
    "community.reportFire": "Report Fire",
    "community.backToOperator": "Back to main portal",

    "lang.toggleLabel": "Language",
  },
} satisfies Record<Language, Record<string, string>>;

export type TranslationKey = keyof typeof translations.id;
