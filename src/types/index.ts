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
}

export interface HotspotSourceSummary {
  id: string;
  sensor: "MODIS" | "VIIRS";
  rawCount: number;
  highConfidenceCount: number;
  available: boolean;
  error?: string;
}

export interface HotspotApiResponse {
  markers: HotspotMarker[];
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
