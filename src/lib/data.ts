import type { FireActivity, HotspotMarker } from "@/types";

export const FIRE_ACTIVITIES: FireActivity[] = [
  { id: "FA-001", location: "Central Kalimantan", sector: "PALANGKA RAYA PEAT (CAL-04)", severity: "HIGH ACTIVITY", conf: 94, last: "05 OCT 2026 08:44Z", ago: "2 MIN AGO", sensors: "MODIS+VIIRS", status: "ACTIVE" },
  { id: "FA-002", location: "South Sumatra", sector: "OGAN KOMERING ILIR (SUM-12)", severity: "HIGH ACTIVITY", conf: 89, last: "05 OCT 2026 08:31Z", ago: "15 MIN AGO", sensors: "MODIS+VIIRS", status: "ACTIVE" },
  { id: "FA-003", location: "Riau (Kampar)", sector: "PELALAWAN BIO-ZONE (RIA-02)", severity: "MED ACTIVITY", conf: 86, last: "05 OCT 2026 07:55Z", ago: "51 MIN AGO", sensors: "VIIRS", status: "ACTIVE" },
  { id: "FA-004", location: "South Sumatra", sector: "MUSI BANYUASIN (SUM-09)", severity: "MED ACTIVITY", conf: 81, last: "05 OCT 2026 07:20Z", ago: "1 H AGO", sensors: "MODIS", status: "MONITORING" },
  { id: "FA-005", location: "Kalimantan Barat", sector: "KUBU RAYA SECTOR (KBR-03)", severity: "MED ACTIVITY", conf: 78, last: "05 OCT 2026 06:40Z", ago: "2 H AGO", sensors: "MODIS+VIIRS", status: "MONITORING" },
  { id: "FA-006", location: "Riau (Bengkalis)", sector: "BENGKALIS PEAT (RIA-05)", severity: "MED ACTIVITY", conf: 75, last: "05 OCT 2026 06:10Z", ago: "2.5 H AGO", sensors: "VIIRS", status: "CONTAINED" },
  { id: "FA-007", location: "Kalimantan Tengah", sector: "BARITO SELATAN (CAL-07)", severity: "MED ACTIVITY", conf: 73, last: "05 OCT 2026 05:50Z", ago: "3 H AGO", sensors: "MODIS", status: "CONTAINED" },
  { id: "FA-008", location: "South Sumatra", sector: "BANYUASIN (SUM-04)", severity: "MED ACTIVITY", conf: 71, last: "05 OCT 2026 05:30Z", ago: "3.5 H AGO", sensors: "VIIRS", status: "CONTAINED" },
  { id: "FA-009", location: "Riau (Kampar)", sector: "KAMPAR PEAT ZONE (RIA-01)", severity: "MED ACTIVITY", conf: 68, last: "05 OCT 2026 04:55Z", ago: "4 H AGO", sensors: "MODIS+VIIRS", status: "MONITORING" },
  { id: "FA-010", location: "Jambi", sector: "TANJUNG JABUNG (JAM-02)", severity: "MED ACTIVITY", conf: 65, last: "05 OCT 2026 04:00Z", ago: "5 H AGO", sensors: "MODIS", status: "CONTAINED" },
];

export const HOTSPOT_MARKERS: HotspotMarker[] = [
  { id: "FA-001", lat: -2.2104, lng: 113.9213, label: "Palangka Raya", frp: 312, severity: "HIGH" },
  { id: "FA-002", lat: -3.5167, lng: 104.9, label: "OKI South Sumatra", frp: 184, severity: "HIGH" },
  { id: "FA-003", lat: -0.3, lng: 101.7, label: "Kampar Riau", frp: 142, severity: "MEDIUM" },
  { id: "FA-004", lat: -2.2, lng: 103.7, label: "Musi Banyuasin", frp: 98, severity: "MEDIUM" },
  { id: "FA-005", lat: -0.1, lng: 109.4, label: "Kubu Raya", frp: 75, severity: "MEDIUM" },
  { id: "FA-009", lat: 0.3, lng: 101.4, label: "Kampar Peat", frp: 48, severity: "LOW" },
];
