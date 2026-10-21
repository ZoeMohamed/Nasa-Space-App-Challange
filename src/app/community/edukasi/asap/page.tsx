"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import {
  MaskIllustration,
  WindowsClosedIllustration,
  MedicalHelpIllustration,
  VulnerableGroupsIllustration,
} from "@/components/community/illustrations";

const WHO_URL = "https://www.who.int/news-room/fact-sheets/detail/wildfires-and-health";
const BMKG_URL = "https://www.bmkg.go.id/";

type Bi = readonly [string, string];

interface SmokeCard {
  icon: React.ComponentType<{ className?: string }>;
  title: Bi;
  body: Bi[];
  nowAction: Bi;
}

const CARDS: SmokeCard[] = [
  {
    icon: WindowsClosedIllustration,
    title: ["Kurangi aktivitas di luar ruangan", "Spend less time outdoors"],
    body: [
      [
        "Saat kabut asap tebal, paparan berulang di luar ruangan meningkatkan risiko gangguan pernapasan — terutama olahraga atau aktivitas fisik berat.",
        "In thick haze, repeated time outdoors raises the risk of breathing problems — especially exercise or heavy physical work.",
      ],
      [
        "Tutup pintu dan jendela rumah untuk mengurangi partikel asap yang masuk, terutama saat kualitas udara memburuk.",
        "Close doors and windows to keep smoke particles out, especially when air quality gets worse.",
      ],
    ],
    nowAction: [
      "Batasi aktivitas luar ruangan dan tutup pintu/jendela rumah Anda sekarang.",
      "Limit outdoor activity and close your doors/windows now.",
    ],
  },
  {
    icon: MaskIllustration,
    title: ["Gunakan respirator N95 yang terpasang rapat", "Wear a well-sealed N95 respirator"],
    body: [
      [
        "Masker berstandar N95 (atau setara) jauh lebih efektif menyaring partikel halus asap dibanding masker kain atau masker bedah biasa.",
        "An N95 (or equivalent) mask filters fine smoke particles far better than a cloth or ordinary surgical mask.",
      ],
      [
        "Masker hanya efektif jika terpasang rapat menutupi hidung dan mulut tanpa celah — masker yang longgar tidak banyak membantu.",
        "A mask only works if it seals over the nose and mouth with no gaps — a loose mask doesn't help much.",
      ],
    ],
    nowAction: [
      "Jika harus keluar rumah, pakai respirator N95 dan pastikan terpasang rapat di wajah.",
      "If you must go out, wear an N95 respirator and make sure it seals on your face.",
    ],
  },
  {
    icon: VulnerableGroupsIllustration,
    title: ["Perhatian ekstra untuk kelompok rentan", "Extra care for vulnerable people"],
    body: [
      [
        "Anak-anak, lansia, ibu hamil, dan orang dengan penyakit kronis (asma, jantung, paru-paru) lebih berisiko terdampak asap kebakaran.",
        "Children, older people, pregnant women and people with chronic illness (asthma, heart, lung disease) are more at risk from fire smoke.",
      ],
      [
        "Masker N95 sering tidak pas tertutup rapat pada wajah anak kecil — jangan memaksakan masker jika anak terlihat kesulitan bernapas atau menolaknya; prioritaskan menjauhkan mereka dari asap.",
        "N95 masks often don't seal on small children's faces — don't force a mask if the child seems to struggle to breathe or refuses it; focus on keeping them away from smoke.",
      ],
    ],
    nowAction: [
      "Jauhkan anggota keluarga rentan dari paparan asap langsung dan pantau kondisi mereka lebih sering.",
      "Keep vulnerable family members away from direct smoke and check on them more often.",
    ],
  },
  {
    icon: MedicalHelpIllustration,
    title: ["Cari bantuan medis untuk gejala berat", "Get medical help for severe symptoms"],
    body: [
      [
        "Gejala ringan seperti mata perih atau tenggorokan gatal biasanya mereda setelah menjauh dari asap.",
        "Mild symptoms such as stinging eyes or an itchy throat usually ease after getting away from the smoke.",
      ],
      [
        "Segera cari bantuan medis jika mengalami sesak napas berat, nyeri dada, bibir/wajah membiru, atau kebingungan — ini tanda darurat yang butuh penanganan segera.",
        "Get medical help immediately for severe shortness of breath, chest pain, bluish lips/face, or confusion — these are emergency signs that need prompt care.",
      ],
    ],
    nowAction: [
      "Jika mengalami sesak napas berat atau nyeri dada, segera ke fasilitas kesehatan terdekat atau hubungi layanan darurat.",
      "With severe breathlessness or chest pain, go to the nearest health facility or call emergency services right away.",
    ],
  },
];

export default function AsapPage() {
  const { tr } = useTranslation();
  return (
    <div className="space-y-6">
      <Link href="/community/edukasi" className="text-xs font-semibold text-[var(--community-ink-muted)]">
        ← {tr("Kembali ke Edukasi", "Back to Learn")}
      </Link>

      <section>
        <h1 className="text-lg font-extrabold text-[#123027]">{tr("Lindungi Keluarga dari Asap", "Protect Your Family from Smoke")}</h1>
        <p className="text-sm text-[var(--community-ink-muted)] mt-1 leading-relaxed">
          {tr(
            "Ringkasan praktis ini merujuk pada panduan kesehatan masyarakat dari WHO tentang asap kebakaran hutan. Ini bukan pengganti instruksi evakuasi resmi — jika otoritas setempat (BNPB/BMKG/aparat desa) memerintahkan evakuasi, segera mengungsi meskipun Anda sudah memakai masker.",
            "This practical summary follows WHO public-health guidance on wildfire smoke. It doesn't replace official evacuation orders — if local authorities (BNPB/BMKG/village officials) order an evacuation, leave right away even if you're wearing a mask."
          )}
        </p>
      </section>

      <div className="space-y-4">
        {CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title[0]} className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                  <Icon className="h-7 w-7" />
                </span>
                <h2 className="text-sm font-bold text-[#123027]">{tr(...card.title)}</h2>
              </div>
              <div className="space-y-2">
                {card.body.map((p, i) => (
                  <p key={i} className="text-xs text-[var(--community-ink-muted)] leading-relaxed">
                    {tr(...p)}
                  </p>
                ))}
              </div>
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5">
                <p className="text-[11px] font-semibold text-emerald-900">
                  {tr("Apa yang harus saya lakukan sekarang?", "What should I do now?")} {tr(...card.nowAction)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-1.5">
        <p className="text-xs font-bold text-amber-900">{tr("Penting", "Important")}</p>
        <p className="text-[11px] text-amber-900/90 leading-relaxed">
          {tr(
            "Masker tidak membuat suatu area aman untuk dimasuki — masker hanya mengurangi risiko saat berada di lingkungan berasap dalam waktu singkat. Jika suatu area berada dalam jalur kebakaran aktif atau otoritas setempat memerintahkan evakuasi, mengungsilah; jangan tetap di dalam rumah hanya karena memakai masker.",
            "A mask doesn't make an area safe to enter — it only lowers the risk during short time in smoke. If an area is in the path of an active fire or local authorities order an evacuation, leave; don't stay home just because you're wearing a mask."
          )}
        </p>
      </section>

      <section className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-2">
        <p className="text-xs font-bold text-[#123027]">{tr("Sumber", "Sources")}</p>
        <p className="text-[11px] text-[var(--community-ink-muted)] leading-relaxed">
          {tr("Ringkasan di atas mengacu pada lembar fakta WHO “Wildfires and health”:", "The summary above follows the WHO fact sheet “Wildfires and health”:")}{" "}
          <a href={WHO_URL} target="_blank" rel="noreferrer" className="text-[var(--community-accent)] underline">
            {WHO_URL}
          </a>
        </p>
        <p className="text-[11px] text-[var(--community-ink-muted)] leading-relaxed">
          {tr("Untuk informasi kualitas udara dan cuaca resmi di wilayah Anda, rujuk BMKG:", "For official air-quality and weather information in your area, see BMKG:")}{" "}
          <a href={BMKG_URL} target="_blank" rel="noreferrer" className="text-[var(--community-accent)] underline">
            {BMKG_URL}
          </a>
        </p>
      </section>
    </div>
  );
}
