import Link from "next/link";
import { notFound } from "next/navigation";
import { getEduArticle } from "../articles";

export default async function EduArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getEduArticle(slug);
  if (!article) notFound();

  return (
    <div className="space-y-4">
      <Link href="/community/edukasi" className="text-xs font-semibold text-[var(--community-ink-muted)]">
        ← Kembali ke Edukasi
      </Link>

      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[var(--community-accent)] text-2xl">{article.icon}</span>
        <h1 className="text-lg font-extrabold">{article.title}</h1>
      </div>

      <div className="space-y-3">
        {article.body.map((paragraph, idx) => (
          <p key={idx} className="text-sm leading-relaxed text-[var(--community-ink)]">
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}
