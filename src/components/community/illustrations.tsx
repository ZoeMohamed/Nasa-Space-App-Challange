/**
 * Small, flat-style inline SVG icon illustrations for the Community Edukasi
 * section. These are purely scannability aids (not decorative animation,
 * not photos) using the existing green/amber/red palette already used across
 * /community (see --community-accent, rose/amber/emerald utility classes in
 * src/app/community/page.tsx). Kept as plain React components with no
 * external image URLs and no new dependencies.
 */

type IconProps = { className?: string };

const base = "h-full w-full";

export function BagIllustration({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={`${base} ${className}`} fill="none" aria-hidden="true">
      <rect x="14" y="24" width="36" height="30" rx="6" fill="#075640" />
      <path d="M24 24v-6a8 8 0 0 1 16 0v6" stroke="#fde68a" strokeWidth="4" fill="none" />
      <rect x="27" y="34" width="10" height="4" rx="2" fill="#fde68a" />
      <circle cx="32" cy="18" r="2.5" fill="#fde68a" />
    </svg>
  );
}

export function DocumentsIllustration({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={`${base} ${className}`} fill="none" aria-hidden="true">
      <rect x="12" y="10" width="30" height="40" rx="4" fill="#ffffff" stroke="#075640" strokeWidth="3" />
      <rect x="18" y="18" width="18" height="3" rx="1.5" fill="#075640" />
      <rect x="18" y="26" width="18" height="3" rx="1.5" fill="#9ca3af" />
      <rect x="18" y="34" width="12" height="3" rx="1.5" fill="#9ca3af" />
      <rect x="24" y="36" width="28" height="18" rx="4" fill="#fbbf24" />
      <path d="M31 45l4 4 7-8" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function FamilyPlanIllustration({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={`${base} ${className}`} fill="none" aria-hidden="true">
      <circle cx="22" cy="20" r="6" fill="#075640" />
      <circle cx="42" cy="20" r="6" fill="#075640" />
      <circle cx="32" cy="34" r="5" fill="#34d399" />
      <path d="M12 46c0-7 6-12 10-12s10 5 10 12" stroke="#075640" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M32 50c0-6 5-10 10-10s10 4 10 10" stroke="#075640" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M22 46c0-5 4-9 10-9" stroke="#34d399" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function MaskIllustration({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={`${base} ${className}`} fill="none" aria-hidden="true">
      <path d="M14 30c0-8 8-14 18-14s18 6 18 14-8 14-18 14-18-6-18-14z" fill="#ffffff" stroke="#075640" strokeWidth="3" />
      <path d="M18 28c4-2 9-3 14-3s10 1 14 3" stroke="#075640" strokeWidth="2.5" fill="none" />
      <path d="M18 34c4 2 9 3 14 3s10-1 14-3" stroke="#9ca3af" strokeWidth="2" fill="none" />
      <circle cx="32" cy="30" r="3" fill="#fbbf24" />
    </svg>
  );
}

export function WindowsClosedIllustration({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={`${base} ${className}`} fill="none" aria-hidden="true">
      <rect x="10" y="10" width="44" height="44" rx="4" fill="#e6f4ef" stroke="#075640" strokeWidth="3" />
      <line x1="32" y1="10" x2="32" y2="54" stroke="#075640" strokeWidth="3" />
      <line x1="10" y1="32" x2="54" y2="32" stroke="#075640" strokeWidth="3" />
      <path d="M8 56l48-48" stroke="#f87171" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function MedicalHelpIllustration({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={`${base} ${className}`} fill="none" aria-hidden="true">
      <rect x="10" y="10" width="44" height="44" rx="10" fill="#fee2e2" />
      <rect x="27" y="18" width="10" height="28" rx="2" fill="#dc2626" />
      <rect x="18" y="27" width="28" height="10" rx="2" fill="#dc2626" />
    </svg>
  );
}

export function VulnerableGroupsIllustration({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={`${base} ${className}`} fill="none" aria-hidden="true">
      <circle cx="22" cy="18" r="6" fill="#fbbf24" />
      <path d="M12 38c0-6 5-10 10-10s10 4 10 10v6H12z" fill="#fbbf24" />
      <circle cx="44" cy="20" r="5" fill="#075640" />
      <path d="M36 42c0-5 4-9 8-9s8 4 8 9v4H36z" fill="#075640" />
    </svg>
  );
}

export function ChecklistEntryIllustration({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={`${base} ${className}`} fill="none" aria-hidden="true">
      <rect x="8" y="8" width="48" height="48" rx="10" fill="#e6f4ef" />
      <rect x="18" y="20" width="28" height="4" rx="2" fill="#075640" />
      <rect x="18" y="30" width="20" height="4" rx="2" fill="#075640" />
      <rect x="18" y="40" width="24" height="4" rx="2" fill="#9ca3af" />
      <circle cx="12" cy="22" r="3" fill="#34d399" />
      <circle cx="12" cy="32" r="3" fill="#34d399" />
      <circle cx="12" cy="42" r="3" fill="#d1d5db" />
    </svg>
  );
}

export function SmokeEntryIllustration({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={`${base} ${className}`} fill="none" aria-hidden="true">
      <rect x="8" y="8" width="48" height="48" rx="10" fill="#fff7ed" />
      <path
        d="M18 46c3-4 3-8 0-12s-3-8 0-12M30 46c3-4 3-8 0-12s-3-8 0-12M42 46c3-4 3-8 0-12s-3-8 0-12"
        stroke="#f97316"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function SimulationEntryIllustration({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={`${base} ${className}`} fill="none" aria-hidden="true">
      <rect x="8" y="8" width="48" height="48" rx="10" fill="#fef3c7" />
      <path d="M32 18v4M32 42v4M18 32h4M42 32h4" stroke="#b45309" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="32" r="10" fill="#f59e0b" />
      <path d="M32 27v6l4 3" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function LocalHelpEntryIllustration({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={`${base} ${className}`} fill="none" aria-hidden="true">
      <rect x="8" y="8" width="48" height="48" rx="10" fill="#e6f4ef" />
      <path d="M32 14c-8 0-14 6-14 14 0 10 14 22 14 22s14-12 14-22c0-8-6-14-14-14z" fill="#075640" />
      <circle cx="32" cy="28" r="5" fill="#ffffff" />
    </svg>
  );
}
