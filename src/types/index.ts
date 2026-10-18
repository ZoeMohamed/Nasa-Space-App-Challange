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

export interface HotspotMarker {
  id: string;
  lat: number;
  lng: number;
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
}

export interface HotspotSourceSummary {
  id: string;
  sensor: "MODIS" | "VIIRS";
  rawCount: number;
  highConfidenceCount: number;
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
}

export interface HotspotApiResponse {
  markers: HotspotMarker[];
  areas: AreaSummary[];
  meta: {
    provider: "NASA FIRMS";
    area: "Indonesia";
    windowHours: 24;
    generatedAt: string;
    sources: HotspotSourceSummary[];
    degraded: boolean;
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
}

/**
 * Per-0.25°-grid-cell historical baseline: mean/std of monthly detection counts for that cell
 * across however many months of the archive actually had data for it (`sampleMonths`).
 * `monthlyStdDetections` is `null` when the cell only has a single sampled month (std of one
 * value is undefined, not zero).
 */
export interface HistoricalCell {
  gridLat: number;
  gridLon: number;
  monthlyMeanDetections: number;
  monthlyStdDetections: number | null;
  sampleMonths: number;
}

export interface HistoricalCalendarResponse {
  months: HistoricalMonth[];
  cells: HistoricalCell[];
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
