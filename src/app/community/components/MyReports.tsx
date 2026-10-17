"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getOrCreateSubmitterToken } from "../lib/submitterToken";
import { REPORT_STATUS_LABEL, REPORT_STATUS_TONE, REPORT_STATUS_TONE_CLASSES } from "../lib/reportStatus";
import type { CommunityReport, ReportsListResponse } from "@/types";

type FetchState = "idle" | "loading" | "loaded" | "error";

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Part C — "Laporan Saya": the current device's own report submission
 * history, looked up by the localStorage submitter token (see
 * lib/submitterToken.ts). Read-only here; status changes happen on the
 * Operator side (PATCH, out of scope for this view).
 */
export default function MyReports() {
  // Initialized to "loading" rather than set synchronously inside the effect below
  // (this component always fetches on mount) — only "loaded"/"error" are ever set
  // from within the fetch's own then/catch callbacks.
  const [state, setState] = useState<FetchState>("loading");
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const token = getOrCreateSubmitterToken();
    if (!token) return;

    let cancelled = false;

    fetch(`/api/reports?submitterToken=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as ReportsListResponse & { error?: string; detail?: string };
        if (!response.ok) {
          throw new Error(body.detail ?? body.error ?? "Gagal memuat riwayat laporan Anda.");
        }
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setReports(body.reports);
        setState("loaded");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "Gagal memuat riwayat laporan Anda.");
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section id="laporan-saya" className="space-y-2">
      <h2 className="text-sm font-bold">Laporan Saya</h2>

      {state === "loading" && (
        <p className="text-sm text-[var(--community-ink-muted)]">Memuat riwayat laporan…</p>
      )}

      {state === "error" && (
        <p className="text-sm rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700">{errorMessage}</p>
      )}

      {state === "loaded" && reports.length === 0 && (
        <p className="text-sm text-[var(--community-ink-muted)] rounded-xl border border-dashed border-[var(--community-border)] p-4">
          Anda belum pernah mengirim laporan dari perangkat ini.
        </p>
      )}

      {state === "loaded" && reports.length > 0 && (
        <ul className="space-y-2.5">
          {reports.map((report) => {
            const tone = REPORT_STATUS_TONE[report.status];
            return (
              <li key={report.id}>
                <Link
                  href={`/community/reports/${report.id}`}
                  className="block rounded-2xl border border-[var(--community-border)] bg-white p-3.5 hover:border-emerald-300 transition shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#123027] truncate pr-2">{report.description}</span>
                    <span
                      className={`shrink-0 inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase ${REPORT_STATUS_TONE_CLASSES[tone]}`}
                    >
                      {REPORT_STATUS_LABEL[report.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--community-ink-muted)]">
                    Dikirim {formatCreatedAt(report.createdAt)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
