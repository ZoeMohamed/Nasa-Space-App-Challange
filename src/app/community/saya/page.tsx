"use client";

import Link from "next/link";
import MyReports from "../components/MyReports";

/**
 * "Saya" tab (bottom nav). Hosts the "Status Laporan" area (Figma node
 * 183:3013's list view migrated here from Beranda) plus a link to area
 * alert settings and the education hub — this is the account/profile-ish
 * home for anything about *this device's* activity. No login system exists
 * in this app, so there's no real "profile" beyond the local submitter
 * token + its report history.
 */
export default function SayaPage() {
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-lg font-extrabold">Saya</h1>
        <p className="text-sm text-[var(--community-ink-muted)] mt-0.5">
          Riwayat laporan dan pengaturan dari perangkat ini.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/community/pengaturan"
          className="rounded-xl border border-[var(--community-border)] bg-white p-3 flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[var(--community-accent)]">tune</span>
          <span className="text-sm font-semibold">Atur Area Peringatan</span>
        </Link>
        <Link
          href="/community/edukasi"
          className="rounded-xl border border-[var(--community-border)] bg-white p-3 flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[var(--community-accent)]">menu_book</span>
          <span className="text-sm font-semibold">Edukasi &amp; Kontribusi</span>
        </Link>
      </div>

      <MyReports />
    </div>
  );
}
