export default function TopBar({ activeTab }: { activeTab: string }) {
  return (
    <header className="h-8 bg-surface-container-low border-b border-outline-variant px-3 flex items-center justify-between text-on-surface-variant font-mono text-[10px]">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-outline-variant border border-outline inline-block" />
        <span className="w-2.5 h-2.5 rounded-full bg-outline-variant border border-outline inline-block" />
        <span className="w-2.5 h-2.5 rounded-full bg-outline-variant border border-outline inline-block" />
        <span className="ml-2 font-mono text-[11px] tracking-wider text-on-surface font-semibold">
          FIRESIGHT / {activeTab} — NASA FIRE INTELLIGENCE
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-on-surface font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-primary-container" />
          SYS LOG: NOMINAL
        </span>
        <span className="hidden sm:inline text-on-surface-variant">
          UTC 05 OCT 2026 | 08:44:12Z
        </span>
        <span className="px-1.5 py-0.5 bg-surface-container border border-outline-variant text-on-surface rounded font-mono">
          LAT: -0.7893° LNG: 113.9213°
        </span>
      </div>
    </header>
  );
}
