import Link from "next/link";
import {
  MaskIllustration,
  WindowsClosedIllustration,
  MedicalHelpIllustration,
  VulnerableGroupsIllustration,
} from "@/components/community/illustrations";

const WHO_URL = "https://www.who.int/news-room/fact-sheets/detail/wildfires-and-health";
const BMKG_URL = "https://www.bmkg.go.id/";

interface SmokeCard {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string[];
  nowAction: string;
}

const CARDS: SmokeCard[] = [
  {
    icon: WindowsClosedIllustration,
    title: "Kurangi aktivitas di luar ruangan",
    body: [
      "Saat kabut asap tebal, paparan berulang di luar ruangan meningkatkan risiko gangguan pernapasan — terutama olahraga atau aktivitas fisik berat.",
      "Tutup pintu dan jendela rumah untuk mengurangi partikel asap yang masuk, terutama saat kualitas udara memburuk.",
    ],
    nowAction: "Batasi aktivitas luar ruangan dan tutup pintu/jendela rumah Anda sekarang.",
  },
  {
    icon: MaskIllustration,
    title: "Gunakan respirator N95 yang terpasang rapat",
    body: [
      "Masker berstandar N95 (atau setara) jauh lebih efektif menyaring partikel halus asap dibanding masker kain atau masker bedah biasa.",
      "Masker hanya efektif jika terpasang rapat menutupi hidung dan mulut tanpa celah — masker yang longgar tidak banyak membantu.",
    ],
    nowAction: "Jika harus keluar rumah, pakai respirator N95 dan pastikan terpasang rapat di wajah.",
  },
  {
    icon: VulnerableGroupsIllustration,
    title: "Perhatian ekstra untuk kelompok rentan",
    body: [
      "Anak-anak, lansia, ibu hamil, dan orang dengan penyakit kronis (asma, jantung, paru-paru) lebih berisiko terdampak asap kebakaran.",
      "Masker N95 sering tidak pas tertutup rapat pada wajah anak kecil — jangan memaksakan masker jika anak terlihat kesulitan bernapas atau menolaknya; prioritaskan menjauhkan mereka dari asap.",
    ],
    nowAction: "Jauhkan anggota keluarga rentan dari paparan asap langsung dan pantau kondisi mereka lebih sering.",
  },
  {
    icon: MedicalHelpIllustration,
    title: "Cari bantuan medis untuk gejala berat",
    body: [
      "Gejala ringan seperti mata perih atau tenggorokan gatal biasanya mereda setelah menjauh dari asap.",
      "Segera cari bantuan medis jika mengalami sesak napas berat, nyeri dada, bibir/wajah membiru, atau kebingungan — ini tanda darurat yang butuh penanganan segera.",
    ],
    nowAction: "Jika mengalami sesak napas berat atau nyeri dada, segera ke fasilitas kesehatan terdekat atau hubungi layanan darurat.",
  },
];

export default function AsapPage() {
  return (
    <div className="space-y-6">
      <Link href="/community/edukasi" className="text-xs font-semibold text-[var(--community-ink-muted)]">
        ← Kembali ke Edukasi
      </Link>

      <section>
        <h1 className="text-lg font-extrabold text-[#123027]">Lindungi Keluarga dari Asap</h1>
        <p className="text-sm text-[var(--community-ink-muted)] mt-1 leading-relaxed">
          Ringkasan praktis ini merujuk pada panduan kesehatan masyarakat dari WHO tentang asap kebakaran
          hutan. Ini bukan pengganti instruksi evakuasi resmi — jika otoritas setempat (BNPB/BMKG/aparat
          desa) memerintahkan evakuasi, segera mengungsi meskipun Anda sudah memakai masker.
        </p>
      </section>

      <div className="space-y-4">
        {CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                  <Icon className="h-7 w-7" />
                </span>
                <h2 className="text-sm font-bold text-[#123027]">{card.title}</h2>
              </div>
              <div className="space-y-2">
                {card.body.map((p, i) => (
                  <p key={i} className="text-xs text-[var(--community-ink-muted)] leading-relaxed">
                    {p}
                  </p>
                ))}
              </div>
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5">
                <p className="text-[11px] font-semibold text-emerald-900">
                  Apa yang harus saya lakukan sekarang? {card.nowAction}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-1.5">
        <p className="text-xs font-bold text-amber-900">Penting</p>
        <p className="text-[11px] text-amber-900/90 leading-relaxed">
          Masker tidak membuat suatu area aman untuk dimasuki — masker hanya mengurangi risiko saat berada
          di lingkungan berasap dalam waktu singkat. Jika suatu area berada dalam jalur kebakaran aktif atau
          otoritas setempat memerintahkan evakuasi, mengungsilah; jangan tetap di dalam rumah hanya karena
          memakai masker.
        </p>
      </section>

      <section className="rounded-2xl border border-[var(--community-border)] bg-white p-4 space-y-2">
        <p className="text-xs font-bold text-[#123027]">Sumber</p>
        <p className="text-[11px] text-[var(--community-ink-muted)] leading-relaxed">
          Ringkasan di atas mengacu pada lembar fakta WHO &ldquo;Wildfires and health&rdquo;:{" "}
          <a href={WHO_URL} target="_blank" rel="noreferrer" className="text-[var(--community-accent)] underline">
            {WHO_URL}
          </a>
        </p>
        <p className="text-[11px] text-[var(--community-ink-muted)] leading-relaxed">
          Untuk informasi kualitas udara dan cuaca resmi di wilayah Anda, rujuk BMKG:{" "}
          <a href={BMKG_URL} target="_blank" rel="noreferrer" className="text-[var(--community-accent)] underline">
            {BMKG_URL}
          </a>
        </p>
      </section>
    </div>
  );
}
