"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { articleText, getEduArticle } from "../articles";

export default function EduArticlePage() {
  const { tr, language } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const article = getEduArticle(slug);
  if (!article) notFound();
  const text = articleText(article, language);

  return (
    <div className="space-y-4">
      <Link href="/community/edukasi" className="text-xs font-semibold text-[var(--community-ink-muted)]">
        ← {tr("Kembali ke Edukasi", "Back to Learn")}
      </Link>

      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[var(--community-accent)] text-2xl">{article.icon}</span>
        <h1 className="text-lg font-extrabold">{text.title}</h1>
      </div>

      <div className="space-y-3">
        {text.body.map((paragraph, idx) => (
          <p key={idx} className="text-sm leading-relaxed text-[var(--community-ink)]">
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}
