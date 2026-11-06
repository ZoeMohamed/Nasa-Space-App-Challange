import {
  Backpack,
  Baby,
  CloudFog,
  Compass,
  DoorClosed,
  FileText,
  LifeBuoy,
  ListChecks,
  ShieldCheck,
  Stethoscope,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Edukasi tile icons. These used to be hand-drawn inline SVGs; they are now Lucide icons
 * (open source, ISC) on a tinted tile so the set stays consistent with the rest of the citizen UI.
 * The export names are unchanged so the Edukasi pages keep working as before.
 */
type IconProps = { className?: string };

function tile(Icon: LucideIcon, tint: string) {
  function Tile({ className = "" }: IconProps) {
    return (
      <span className={`flex h-full w-full items-center justify-center rounded-2xl ${tint} ${className}`} aria-hidden="true">
        <Icon className="h-[55%] w-[55%]" strokeWidth={1.75} />
      </span>
    );
  }
  return Tile;
}

export const BagIllustration = tile(Backpack, "bg-emerald-50 text-emerald-800");
export const DocumentsIllustration = tile(FileText, "bg-amber-50 text-amber-700");
export const FamilyPlanIllustration = tile(Users, "bg-sky-50 text-sky-700");
export const MaskIllustration = tile(ShieldCheck, "bg-emerald-50 text-emerald-800");
export const WindowsClosedIllustration = tile(DoorClosed, "bg-slate-100 text-slate-700");
export const MedicalHelpIllustration = tile(Stethoscope, "bg-red-50 text-red-700");
export const VulnerableGroupsIllustration = tile(Baby, "bg-amber-50 text-amber-700");
export const ChecklistEntryIllustration = tile(ListChecks, "bg-emerald-50 text-emerald-800");
export const SmokeEntryIllustration = tile(CloudFog, "bg-slate-100 text-slate-700");
export const SimulationEntryIllustration = tile(Compass, "bg-sky-50 text-sky-700");
export const LocalHelpEntryIllustration = tile(LifeBuoy, "bg-red-50 text-red-700");
