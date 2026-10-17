import Link from "next/link";
import { EDU_ARTICLES } from "./articles";

/**
 * "08 Community — Edukasi & Kontribusi" (Figma node 186:3013). The 3 article
 * cards link to /community/edukasi/[slug] (folded in from the 186:31xx
 * sibling nodes, see articles.ts header comment). "Kontribusi" here is kept
 * to an honest, backend-backed action — reporting a fire — rather than
 * inventing a volunteering/contribution feature with no data behind it.
 */
export default function EdukasiPage() {
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-lg font-extrabold">Edukasi &amp; Kontribusi</h1>
        <p className="text-sm text-[var(--community-ink-muted)] mt-0.5">
          Pelajari cara kerja deteksi titik panas dan bagaimana laporan Anda membantu.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold">Artikel</h2>
        <ul className="space-y-2">
          {EDU_ARTICLES.map((article) => (
            <li key={article.slug}>
              <Link
                href={`/community/edukasi/${article.slug}`}
                className="block rounded-xl border border-[var(--community-border)] bg-white p-3 flex items-start gap-3"
              >
                <span className="material-symbols-outlined text-[var(--community-accent)] mt-0.5">
                  {article.icon}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{article.title}</span>
                  <span className="block text-[11px] text-[var(--community-ink-muted)] mt-0.5">
                    {article.summary}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold">Kontribusi</h2>
        <p className="text-sm text-[var(--community-ink-muted)]">
          Cara paling berguna untuk membantu adalah mengirim laporan langsung dari lokasi kejadian — laporan
          Anda dicocokkan otomatis dengan deteksi satelit dan membantu petugas memverifikasi lebih cepat.
        </p>
        <Link
          href="/community/report"
          className="block w-full text-center rounded-xl bg-[var(--community-accent)] py-3 text-sm font-bold text-white shadow-sm active:scale-[0.99] transition"
        >
          Lapor Kebakaran
        </Link>
      </section>
    </div>
  );
}
