import type { HistoricalMonth, LiveMonthsResponse } from "@/types";

/**
 * Pure helpers behind the burning-activity calendar (src/app/calendar/page.tsx): merging live
 * months onto the archive, "unusual" months, the critical period, and the CSV export. Kept out of
 * the page so the rules are in one readable place.
 */

export interface CalendarMonth extends HistoricalMonth {
  /** Last observed day when this month isn't complete yet (live data still coming in). */
  partialThroughDay?: number;
  /** The live part couldn't be counted for the MODIS + VIIRS series (a feed missed some days). */
  detailMissing?: boolean;
  /** Same for the MODIS-only series. */
  modisMissing?: boolean;
}

/** "modisDetections" = comparable MODIS-only series; "detections" = MODIS + VIIRS events. */
export type SeriesKey = "modisDetections" | "detections";

const monthKey = (year: number, month: number) => `${year}-${month}`;

/**
 * Add live months (days after the archive's end) to the archive months. Both series are summed
 * on the same definitions as the archive; a month that ends in live data is marked "live" (or
 * "mixed" with archive days) and, if not finished, `partialThroughDay`.
 */
export function mergeLiveMonths(archive: HistoricalMonth[], live: LiveMonthsResponse | null): CalendarMonth[] {
  const merged = new Map<string, CalendarMonth>(archive.map((m) => [monthKey(m.year, m.month), { ...m }]));
  if (live?.available) {
    for (const lm of live.months) {
      const key = monthKey(lm.year, lm.month);
      const base: CalendarMonth = merged.get(key) ?? {
        year: lm.year,
        month: lm.month,
        detections: 0,
        modisDetections: 0,
        viirsDetections: 0,
        frpSum: 0,
        nrtDetections: 0,
        dataStatus: "live",
      };
      merged.set(key, {
        ...base,
        modisDetections: base.modisDetections + (lm.modisDetections ?? 0),
        detections: base.detections + (lm.detections ?? 0),
        detailMissing: base.detailMissing || lm.detections === null,
        modisMissing: base.modisMissing || lm.modisDetections === null,
        dataStatus: merged.has(key) ? "mixed" : "live",
        partialThroughDay: lm.monthComplete ? undefined : Number(lm.lastDate.slice(8, 10)),
      });
    }
  }
  return [...merged.values()].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
}

/** null when the month has days a feed failed to deliver: a partial sum would look like low activity. */
export function seriesValue(month: CalendarMonth, key: SeriesKey): number | null {
  if (key === "detections" && month.detailMissing) return null;
  if (key === "modisDetections" && month.modisMissing) return null;
  return month[key];
}

/** NRT/live rows, or a month that isn't finished: shown, but never used as history or flagged. */
export function isProvisional(month: CalendarMonth): boolean {
  return month.dataStatus === "nrt" || month.dataStatus === "mixed" || month.dataStatus === "live" || month.partialThroughDay !== undefined;
}

export interface UnusualMonth {
  year: number;
  month: number;
  value: number;
  /** Mean / std of the same calendar month in the OTHER comparable years. */
  mean: number;
  std: number;
  otherYears: number;
}

/**
 * A month is unusual when its count is more than `z` standard deviations above the same calendar
 * month in the other comparable years (leave-one-out, so a record year doesn't raise its own bar).
 * This describes history ("unusual compared with other years"); it is not a forecast. Provisional
 * months and years before `startYear` are left out, and at least `minYears` other years are needed.
 */
export function findUnusualMonths(months: CalendarMonth[], key: SeriesKey, startYear: number, minYears = 5, z = 2): Map<string, UnusualMonth> {
  const eligible = months.filter((m) => m.year >= startYear && !isProvisional(m) && seriesValue(m, key) !== null);
  const result = new Map<string, UnusualMonth>();
  for (let month = 1; month <= 12; month++) {
    const same = eligible.filter((m) => m.month === month);
    for (const entry of same) {
      const others = same.filter((m) => m !== entry).map((m) => seriesValue(m, key) as number);
      if (others.length < minYears) continue;
      const mean = others.reduce((s, v) => s + v, 0) / others.length;
      const std = Math.sqrt(others.reduce((s, v) => s + (v - mean) ** 2, 0) / (others.length - 1));
      const value = seriesValue(entry, key) as number;
      if (std > 0 && value > mean + z * std) {
        result.set(monthKey(entry.year, entry.month), { year: entry.year, month: entry.month, value, mean, std, otherYears: others.length });
      }
    }
  }
  return result;
}

export interface CriticalPeriod {
  /** Calendar months (1-12) in the critical period. */
  months: number[];
  /** The same months grouped into consecutive runs, December wrapping to January. */
  ranges: number[][];
  /** Share of an average year's activity that falls in those months (0-1). */
  share: number;
  firstYear: number;
  lastYear: number;
}

/** A month is "critical" when its long-term average is at least this many times an average month. */
export const CRITICAL_MONTH_FACTOR = 1.5;

/**
 * Typical critical period of an area: the calendar months whose average over complete years
 * (startYear .. last complete year) is at least CRITICAL_MONTH_FACTOR x an average month. A month
 * with no rows in a complete year counts as 0 detections recorded that month. Needs 5+ years.
 */
export function criticalPeriod(months: CalendarMonth[], key: SeriesKey, startYear: number): CriticalPeriod | null {
  const byYear = new Map<number, CalendarMonth[]>();
  for (const m of months) {
    if (m.year < startYear) continue;
    byYear.set(m.year, [...(byYear.get(m.year) ?? []), m]);
  }
  // A year is complete when December exists and nothing in it is provisional or missing for this series.
  const years = [...byYear.entries()]
    .filter(([, ms]) => ms.some((m) => m.month === 12) && ms.every((m) => !isProvisional(m) && seriesValue(m, key) !== null))
    .map(([year]) => year)
    .sort((a, b) => a - b);
  if (years.length < 5) return null;
  const totals = Array(12).fill(0);
  for (const year of years) for (const m of byYear.get(year)!) totals[m.month - 1] += seriesValue(m, key) as number;
  const average = totals.map((t) => t / years.length);
  const yearly = average.reduce((s, v) => s + v, 0);
  if (yearly <= 0) return null;
  const critical = average.map((v, i) => (v >= (CRITICAL_MONTH_FACTOR * yearly) / 12 ? i + 1 : 0)).filter(Boolean);
  if (critical.length === 0) return null;
  const ranges: number[][] = [];
  for (const m of critical) {
    const last = ranges[ranges.length - 1];
    if (last && last[last.length - 1] === m - 1) last.push(m);
    else ranges.push([m]);
  }
  if (ranges.length > 1 && ranges[0][0] === 1 && ranges[ranges.length - 1].at(-1) === 12) {
    ranges[0] = [...ranges.pop()!, ...ranges[0]];
  }
  return {
    months: critical,
    ranges,
    share: critical.reduce((s, m) => s + average[m - 1], 0) / yearly,
    firstYear: years[0],
    lastYear: years[years.length - 1],
  };
}

/** Months from `currentMonth` (1-12) until `targetMonth`, counting forward and wrapping the year. */
export function monthsUntil(currentMonth: number, targetMonth: number): number {
  return (targetMonth - currentMonth + 12) % 12;
}

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One row per month with both series, the data status and the flags shown in the calendar. */
export function calendarCsv(
  months: CalendarMonth[],
  area: string,
  unusualModis: Map<string, UnusualMonth>,
  unusualDetail: Map<string, UnusualMonth>,
  critical: CriticalPeriod | null
): string {
  const header = [
    "area",
    "year",
    "month",
    "modis_detections",
    "modis_viirs_events",
    "data_status",
    "partial_through_day",
    "unusual_modis_only",
    "unusual_modis_viirs",
    "critical_month_modis_only",
  ];
  const rows = months.map((m) => {
    const key = monthKey(m.year, m.month);
    const detail = m.year >= 2012 ? seriesValue(m, "detections") : null;
    return [
      area,
      m.year,
      m.month,
      seriesValue(m, "modisDetections"),
      detail,
      m.dataStatus ?? "archive",
      m.partialThroughDay ?? null,
      unusualModis.has(key),
      unusualDetail.has(key),
      critical ? critical.months.includes(m.month) : null,
    ]
      .map(csvCell)
      .join(",");
  });
  return [header.join(","), ...rows].join("\n") + "\n";
}
