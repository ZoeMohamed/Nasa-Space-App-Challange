export default function StatusBar() {
  return (
    <footer className="flex justify-between items-center w-full px-5 h-7 border-t border-outline-variant bg-surface-container-lowest font-mono text-[10px] text-on-surface-variant select-none">
      <div className="truncate text-on-surface-variant">
        © 2026 MANGGALA AGNI / SATELLITE INTELLIGENCE DIRECTED BY KLHK. SYSTEM
        ONLINE (UTC+7)
      </div>
      <div className="hidden md:flex items-center gap-4">
        <span className="text-secondary-container font-medium hover:text-on-surface cursor-pointer">
          SYS LOG: NOMINAL
        </span>
        <span>•</span>
        <span className="hover:text-on-surface cursor-pointer">
          API: CONNECTED
        </span>
        <span>•</span>
        <span className="hover:text-on-surface cursor-pointer">MODEL: v1.0</span>
        <span>•</span>
        <span className="hover:text-on-surface cursor-pointer">
          LAST SYNC: 02 MIN AGO
        </span>
        <span>•</span>
        <span className="text-on-surface font-semibold">
          LAT: -0.7893° LNG: 113.9213°
        </span>
      </div>
    </footer>
  );
}
