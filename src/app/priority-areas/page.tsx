import WorkstationLayout from "@/components/layout/WorkstationLayout";

export const metadata = {
  title: "FireWatch — Priority Areas",
};

export default function PriorityAreasPage() {
  return (
    <WorkstationLayout activeTab="Priority Areas">
      <div className="max-w-[1400px] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 font-medium mb-1">
              <span>Risk Assessment & Dispatch</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Priority Areas
            </h1>
            <p className="text-sm text-gray-500 max-w-2xl">
              Regions requiring immediate monitoring or physical intervention based on harmonized fire intelligence and severity rankings.
            </p>
          </div>
        </div>

        {/* Areas List */}
        <div className="space-y-4">
          
          {/* Critical Area */}
          <div className="bg-white border border-red-200 rounded-xl shadow-sm p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-[#f04438]"></div>
            <div className="flex flex-col lg:flex-row justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-2.5 py-0.5 bg-red-100 text-[#f04438] text-xs font-bold rounded border border-red-200 uppercase">
                    Critical Severity
                  </span>
                  <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">timer</span> 
                    Active for 72 hours
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">Kalimantan Tengah</h3>
                <p className="text-sm text-gray-600 mb-4">Palangka Raya Peat Basin (Cluster #FA-001)</p>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Active Hotspots</div>
                    <div className="font-bold text-gray-900">128 detected</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Radiative Power</div>
                    <div className="font-bold text-gray-900">312 MW</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Trend</div>
                    <div className="font-bold text-[#f04438] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">trending_up</span> Increasing
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Confidence</div>
                    <div className="font-bold text-gray-900">94% (Harmonized)</div>
                  </div>
                </div>
              </div>
              
              <div className="bg-red-50 rounded-lg p-4 border border-red-100 w-full lg:w-72 flex flex-col justify-between shrink-0">
                <div>
                  <h4 className="text-xs font-bold text-[#f04438] mb-1 uppercase">Recommended Action</h4>
                  <p className="text-xs text-red-900/80 mb-4">
                    Deploy ground unit to contain peatland smoldering before high-wind conditions start at 14:00 UTC.
                  </p>
                </div>
                <button className="w-full bg-[#f04438] text-white py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-red-600 transition-colors">
                  Dispatch Ground Team
                </button>
              </div>
            </div>
          </div>

          {/* High Area 1 */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-orange-500"></div>
            <div className="flex flex-col lg:flex-row justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-2.5 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded border border-orange-200 uppercase">
                    High Severity
                  </span>
                  <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">timer</span> 
                    Active for 24 hours
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">Riau</h3>
                <p className="text-sm text-gray-600 mb-4">Kampar Peatland / Pelalawan Bio-zone</p>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Active Hotspots</div>
                    <div className="font-bold text-gray-900">64 detected</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Radiative Power</div>
                    <div className="font-bold text-gray-900">184 MW</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Trend</div>
                    <div className="font-bold text-orange-600 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">trending_up</span> Increasing
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Confidence</div>
                    <div className="font-bold text-gray-900">89% (VIIRS Primary)</div>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 w-full lg:w-72 flex flex-col justify-between shrink-0">
                <div>
                  <h4 className="text-xs font-bold text-gray-700 mb-1 uppercase">Recommended Action</h4>
                  <p className="text-xs text-gray-600 mb-4">
                    Evaluate trajectory using predictive models. Prepare local communities for potential smoke hazards.
                  </p>
                </div>
                <button className="w-full bg-white border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-gray-50 transition-colors">
                  Run Prediction Model
                </button>
              </div>
            </div>
          </div>

          {/* High Area 2 */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-orange-500"></div>
            <div className="flex flex-col lg:flex-row justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-2.5 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded border border-orange-200 uppercase">
                    High Severity
                  </span>
                  <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">timer</span> 
                    Active for 12 hours
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">Jambi</h3>
                <p className="text-sm text-gray-600 mb-4">Muaro Jambi District</p>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Active Hotspots</div>
                    <div className="font-bold text-gray-900">42 detected</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Radiative Power</div>
                    <div className="font-bold text-gray-900">142 MW</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Trend</div>
                    <div className="font-bold text-gray-500 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">trending_flat</span> Stable
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Confidence</div>
                    <div className="font-bold text-gray-900">86% (MODIS Primary)</div>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 w-full lg:w-72 flex flex-col justify-between shrink-0">
                <div>
                  <h4 className="text-xs font-bold text-gray-700 mb-1 uppercase">Recommended Action</h4>
                  <p className="text-xs text-gray-600 mb-4">
                    Monitor closely via satellite imagery. Ground sensor network shows decreasing humidity.
                  </p>
                </div>
                <button className="w-full bg-white border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-gray-50 transition-colors">
                  View Sensor Data
                </button>
              </div>
            </div>
          </div>

        </div>

      </div>
    </WorkstationLayout>
  );
}
