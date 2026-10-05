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
}
