export type NavTab =
  | "OVERVIEW"
  | "ACTIVITIES"
  | "MAP"
  | "ANALYTICS"
  | "DATA / MODEL";

export interface ModalState {
  open: boolean;
  title: string;
  message: string;
  type: "hazard" | "danger";
}

export interface FireActivity {
  id: string;
  location: string;
  sector: string;
  severity: string;
  conf: number;
  last: string;
  ago: string;
  sensors: string;
  status: string;
}

/** Offline point-in-polygon result (python-service/fire_pipeline/admin_lookup.py), OCHA COD-AB
 * Indonesia / BPS boundaries valid 2020-04-01 — 34 provinces, predates the 2022 Papua split.
 * `approximate` = point fell outside every polygon and was snapped to the nearest one (≤ ~2 km). */
export interface AdminRegion {
  kecamatan: string;
  kecamatanCode: string;
  kabupatenKota: string;
  kabupatenKotaCode: string;
  provinsi: string;
  provinsiCode: string;
  approximate: boolean;
  /** Areas only: the kecamatan holding most of the cell's detections. */
  adminBasis?: "dominant-detections";
  dominantShare?: number;
  kecamatanCount?: number;
}

export interface HotspotMarker {
  id: string;
  lat: number;
  lng: number;
  admin?: AdminRegion | null;
  label: string;
  frp: number;
  severity: "HIGH" | "MEDIUM" | "LOW";
  sensor?: "MODIS" | "VIIRS";
  source?: string;
  satellite?: string;
  confidence?: number;
  confidenceLabel?: string;
  acquiredAt?: string;
  areaId?: string;
  matchStatus?: "MATCHED" | "MODIS_ONLY" | "VIIRS_ONLY" | "UNMATCHED";
  attentionScore?: number;
  priorityScore?: number;
  priorityTier?: "HIGH" | "MEDIUM" | "LOW";
  /** Links this live marker to a historical archive detection row, when the pipeline matched one. */
  matchedDetectionId?: number | null;
  /** False only when the request opted into `includeAllConfidence=true` and this
   * detection is low/nominal confidence — the default request never returns these. */
  highConfidence?: boolean;
  /** NASA FIRMS class: MODIS 0–29 / 30–79 / 80–100 %, VIIRS l / n / h (h = saturated pixels only). */
  confidenceTier?: "low" | "nominal" | "high";
}

export interface HotspotSourceSummary {
  id: string;
  sensor: "MODIS" | "VIIRS";
  rawCount: number;
  highConfidenceCount: number;
  /** Nominal + high — the default filter since 2026-10-20. */
  usableConfidenceCount?: number;
  available: boolean;
  error?: string;
}

/**
 * Per-grid-cell (0.25°) summary from the Python pipeline's attention/priority
 * scoring. Deliberately has no confidence/baseline/anomaly fields — those
 * aren't valid yet (see python-service/fire_pipeline/live.py:summarize_areas).
 */
export interface AreaSummary {
  areaId: string;
  gridLat: number;
  gridLon: number;
  admin?: AdminRegion | null;
  detections: number | null;
  modisDetections: number | null;
  viirsDetections: number | null;
  activeDays: number | null;
  consecutiveActiveDays: number | null;
  firstDate: string;
  lastDate: string;
  peakDate: string;
  frpSum: number | null;
  frpMax: number | null;
  frpMean: number | null;
  growth: number | null;
  attentionScore: number | null;
  attentionCriteria: string;
  priorityScore: number | null;
  priorityRank: number | null;
  priorityTier: "high" | "medium" | "low";
  /** Events after collapsing VIIRS repeats of the same pixel by different satellites. */
  dedupedEvents?: number;
  viirsCrossSatelliteDuplicates?: number;
  /** 24 h only: events from MODIS + one VIIRS platform, the population of that platform's archive table. */
  referenceEvents?: Record<string, number> | null;
}

export interface DailyActivity {
  date: string;
  provinsi: string | null;
  modis: number;
  viirs: number;
  /** Markers in a MATCHED pair (both partners counted). */
  matched: number;
  modisOnly: number;
  viirsOnly: number;
  high: number;
  medium: number;
  low: number;
}

export interface HotspotApiResponse {
  markers: HotspotMarker[];
  areas: AreaSummary[];
  /** Exact per-(UTC date, provinsi) counts over every detection — unaffected by the marker cap. */
  daily?: DailyActivity[];
  meta: {
    provider: "NASA FIRMS";
    area: "Indonesia";
    /** 24, 168 (7d) or 720 (30d) — see `window` on /api/hotspots. */
    windowHours: number;
    generatedAt: string;
    sources: HotspotSourceSummary[];
    degraded: boolean;
    /** Every response keeps all areas/daily rows but caps markers (default 3000, highest FRP). */
    markers?: {
      total: number;
      shown: number;
      truncated: boolean;
      selection: "all" | "highest-frp" | "recent";
    };
    confidenceFilter?: "nominal+high" | "all";
    processing: {
      engine: "Python fire_pipeline";
      qualityRows: number;
      matchedDetections: number;
      areasAnalyzed: number;
      steps: string[];
    };
  };
}

/**
 * One calendar month's aggregate across the whole real NASA FIRMS archive store (not a single
 * grid cell) — from the Python `/api/historical/calendar` endpoint, backed by a real multi-year
 * ingest (2000-2026) of NASA FIRMS archive + NRT files. See src/app/api/historical/route.ts.
 */
export interface HistoricalMonth {
  year: number;
  month: number;
  detections: number;
  modisDetections: number;
  viirsDetections: number;
  frpSum: number;
  /** Events from provisional NRT rows (no vegetation-fire filter, replaced later by the archive). */
  nrtDetections?: number;
  /** "live": includes days after the archive's end, added from the live NRT feed. */
  dataStatus?: "archive" | "nrt" | "mixed" | "live";
}

/** /api/historical/live-months -- calendar months after the archive ends (fire_pipeline/live_calendar.py). */
export interface LiveMonthsResponse {
  available: boolean;
  reason?: string;
  windowHours?: number;
  archiveEndDate?: string;
  liveStartDate?: string | null;
  liveEndDate?: string | null;
  gapDays?: number;
  modisComplete?: boolean;
  /** False when the Suomi-NPP feed was incomplete: the MODIS + VIIRS series then has no live counts. */
  referenceComplete?: boolean;
  months: {
    year: number;
    month: number;
    firstDate: string;
    lastDate: string;
    daysCovered: number;
    daysInMonth: number;
    monthComplete: boolean;
    /** null when some of the month's days couldn't be fetched for that series (see missingDays). */
    modisDetections: number | null;
    detections: number | null;
    missingDays?: { modisDetections: string[]; detections: string[] };
  }[];
  monthToDate: {
    year: number;
    month: number;
    throughDay: number;
    prior: { year: number; modisDetections: number; detections: number }[];
  } | null;
}

/** What the per-cell baselines are built from (historical.py _baseline_meta). */
export interface HistoricalBaselineMeta {
  reference: string;
  population: string;
  startDate: string;
  excludedSources: string[];
  minSampleDays: number;
  excludedNrtRows: number;
  nrtDateRange: [string, string] | null;
  /** Present when cells are compared with the same month +-1 of earlier years (P1). */
  seasonal?: { month: number; months: number[]; minSampleDays: number; minYears: number };
}

export type UnusualCellStatus = "unusual" | "within-baseline" | "insufficient-history" | "no-history" | "not-seen-by-reference";

/** /api/historical/unusual -- live 24 h cells vs their archive baseline on a comparable population. */
export interface UnusualComparisonResponse {
  comparable: boolean;
  reason?: string;
  reference?: string;
  baseline?: HistoricalBaselineMeta;
  windowHours: number;
  generatedAt?: string;
  archiveReferences: string[];
  summary: {
    liveCells: number;
    comparedCells: number;
    unusualCells: number;
    withinBaselineCells: number;
    insufficientHistoryCells: number;
    noHistoryCells: number;
    notSeenByReferenceCells: number;
    seasonalBaselineCells?: number;
    fallbackBaselineCells?: number;
  } | null;
  cells: {
    gridLat: number;
    gridLon: number;
    referenceEvents: number;
    allSatelliteEvents: number;
    dailyMean: number | null;
    dailyStd: number | null;
    sampleDays: number | null;
    threshold: number | null;
    baselineKind?: "seasonal" | "all-months-fallback" | "all-months" | null;
    status: UnusualCellStatus;
  }[];
}

/**
 * Per-0.25°-grid-cell historical baseline, at two granularities: monthly (mean/std of monthly
 * SUMS) and daily (mean/std of single-day counts). When comparing against a live snapshot's
 * count (itself a single-day quantity, see /api/hotspots meta.windowHours=24), use the DAILY
 * fields — comparing a day's count against the monthly fields mixes units and was a real bug
 * (see historical.py's load_calendar_summary docstring). Each `*StdDetections` is `null` when
 * fewer than 2 samples exist at that granularity (std of 0/1 values is undefined, not zero).
 */
export interface HistoricalCell {
  gridLat: number;
  gridLon: number;
  monthlyMeanDetections: number;
  monthlyStdDetections: number | null;
  sampleMonths: number;
  dailyMeanDetections: number;
  dailyStdDetections: number | null;
  sampleDays: number;
  /** "insufficient-history" below historical.MIN_BASELINE_SAMPLE_DAYS observed days. */
  baselineStatus?: "ok" | "insufficient-history";
}

export interface HistoricalCalendarResponse {
  months: HistoricalMonth[];
  cells: HistoricalCell[];
  baseline?: HistoricalBaselineMeta;
  /** Distinct 0.25° cells with any archive activity inside the selected area. */
  areaCells?: number;
}

/**
 * Community-submitted fire report, from the Python `/api/reports` store
 * (see python-service/fire_pipeline/reports.py). `status` is one of the
 * backend's ALLOWED_STATUSES. `satelliteLinks` is only populated on the
 * single-report detail fetch (`GET /api/reports/{id}`) — the list endpoint
 * (`GET /api/reports`) omits it entirely, so it's optional here.
 */
export type ReportStatus =
  | "submitted"
  | "under_review"
  | "satellite_matched"
  | "verified"
  | "rejected";

export interface SatelliteLink {
  markerId: string;
  distanceKm: number | null;
  timeDiffMin: number | null;
  createdAt: string;
}

export interface CommunityReport {
  id: string;
  createdAt: string;
  observedAt: string;
  lat: number;
  lon: number;
  description: string;
  status: ReportStatus;
  submitterToken: string;
  photoFilename: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  admin?: AdminRegion | null;
  satelliteLinks?: SatelliteLink[];
}

export interface ReportsListResponse {
  reports: CommunityReport[];
}

/** Response body from POST /api/reports — a full report detail, plus an
 * optional warning if satellite correlation couldn't run (submission still
 * succeeds in that case; see main.py submit_report docstring). */
export interface ReportCreateResponse extends CommunityReport {
  correlationWarning?: string;
}

/** Response body from GET /api/weather — real current conditions from
 * Open-Meteo (no API key). `wind`/`airQuality` are null, with a matching
 * entry in `errors`, when that specific upstream call failed — never
 * fabricated to fill the gap. `airQuality.usAqiCategory` is the US EPA AQI
 * scale, not Indonesia's ISPU (different breakpoints), so it must not be
 * labeled as ISPU in the UI. */
export interface WeatherResponse {
  lat: number;
  lon: number;
  fetchedAt: string;
  wind: {
    windSpeedKmh: number | null;
    windDirectionDeg: number | null;
    temperatureC: number | null;
    relativeHumidityPct: number | null;
    observedAt: string | null;
  } | null;
  airQuality: {
    pm2_5: number | null;
    pm10: number | null;
    usAqi: number | null;
    usAqiCategory: string | null;
    observedAt: string | null;
  } | null;
  source: string;
  errors: string[];
}
