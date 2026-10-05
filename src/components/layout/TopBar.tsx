"use client";

export default function TopBar() {
  return (
    <header className="h-16 bg-white border-b border-gray-200 px-8 flex items-center justify-between shrink-0">
      {/* Search */}
      <div className="flex-1 max-w-2xl relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
          search
        </span>
        <input
          type="text"
          placeholder="Search location, region, or coordinates..."
          className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-6 ml-4">
        {/* Location Dropdown */}
        <button className="flex items-center gap-1.5 text-gray-700 hover:text-gray-900 text-sm font-medium">
          <span className="material-symbols-outlined text-gray-400 text-lg">location_on</span>
          Indonesia
          <span className="material-symbols-outlined text-gray-400 text-sm">expand_more</span>
        </button>

        {/* User Profile */}
        <div className="flex items-center gap-3 border-l border-gray-200 pl-6">
          <div className="w-8 h-8 rounded-full bg-[#475467] text-white flex items-center justify-center text-xs font-semibold shrink-0">
            MA
          </div>
          <div className="flex flex-col hidden sm:flex">
            <span className="text-sm font-semibold text-gray-900 leading-tight">Magnala Adi</span>
            <span className="text-xs text-gray-500 leading-tight">Authorized Officer</span>
          </div>
        </div>
      </div>
    </header>
  );
}
