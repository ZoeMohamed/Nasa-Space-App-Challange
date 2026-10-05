import WorkstationLayout from "@/components/layout/WorkstationLayout";

export const metadata = {
  title: "FireWatch — Overview",
};

export default function OverviewPage() {
  return (
    <WorkstationLayout activeTab="Overview">
      <div className="max-w-[1400px] mx-auto space-y-6">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 font-medium mb-1">
              <span>Good morning, Magnala Adi</span>
              <span role="img" aria-label="wave">👋</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Monitor. Understand. Take Action.
            </h1>
            <p className="text-sm text-gray-500 max-w-2xl">
              Explore burning activity, sensor data, and historical patterns to identify areas that need closer attention.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors">
              <span className="material-symbols-outlined text-[18px] text-gray-400">calendar_today</span>
              Jan 1, 2023 - Dec 31, 2024
            </button>
            <button className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors">
              Last 2 years
              <span className="material-symbols-outlined text-[18px] text-gray-400">expand_more</span>
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-start gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-[#f04438] shrink-0">
                <span className="material-symbols-outlined text-lg">local_fire_department</span>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">Total Hotspots</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-gray-900">2,482</span>
                  <span className="text-xs font-semibold text-green-600 flex items-center">
                    <span className="material-symbols-outlined text-[14px]">arrow_downward</span>
                    18%
                  </span>
                </div>
              </div>
            </div>
            <div className="text-[11px] text-gray-400 mt-2">vs. previous 2 years</div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-start gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                <span className="material-symbols-outlined text-lg">location_on</span>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">Areas Affected</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-gray-900">124</span>
                  <span className="text-xs font-semibold text-green-600 flex items-center">
                    <span className="material-symbols-outlined text-[14px]">arrow_downward</span>
                    12%
                  </span>
                </div>
              </div>
            </div>
            <div className="text-[11px] text-gray-400 mt-2">vs. previous 2 years</div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-start gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
                <span className="material-symbols-outlined text-lg">calendar_month</span>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">Peak Period</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-gray-900">Aug - Sep</span>
                </div>
              </div>
            </div>
            <div className="text-[11px] text-gray-400 mt-2">Highest activity in 2 years</div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-start gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-[#f04438] shrink-0">
                <span className="material-symbols-outlined text-lg">warning</span>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">Priority Areas</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-gray-900">8</span>
                </div>
              </div>
            </div>
            <div className="text-[11px] text-gray-400 mt-2">Require closer monitoring</div>
          </div>
        </div>

        {/* Map & Activity Status */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Map */}
          <div className="lg:col-span-8 bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-900">Fire Hotspot Map</h3>
                <p className="text-xs text-gray-500 mt-0.5">Active fire hotspots across the selected area.</p>
              </div>
              <div className="flex items-center gap-3 text-xs font-medium text-gray-600">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-600" /> High</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-400" /> Medium</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400" /> Low</span>
              </div>
            </div>
            {/* Map Placeholder */}
            <div className="flex-1 bg-[#a3c9e9] rounded-lg min-h-[360px] relative overflow-hidden">
              <img 
                src="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/export?bbox=95,-6,120,6&bboxSR=4326&layers=&size=900,380&imageSR=&format=jpg&transparent=false&dpi=96&f=image" 
                className="w-full h-full object-cover opacity-90"
                alt="Map View"
              />
              
              {/* Fake Map UI / Tooltip */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                <div className="bg-white rounded-lg shadow-xl p-3 w-64 mb-2 z-10">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-gray-900">Kalimantan Tengah</span>
                  </div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
                    <span className="text-[10px] font-semibold text-gray-600">High activity</span>
                  </div>
                  <div className="space-y-1 mb-3">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-gray-500">Lat / Long</span>
                      <span className="text-gray-900 font-medium">-2.1, 113.9</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-gray-500">Last detected</span>
                      <span className="text-gray-900 font-medium">Aug 14, 2024 · 14:32</span>
                    </div>
                  </div>
                  <button className="text-blue-600 text-xs font-semibold flex items-center gap-1 hover:underline">
                    View details <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </button>
                </div>
                <div className="relative flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-red-500/20 absolute animate-ping" />
                  <div className="w-4 h-4 rounded-full bg-red-600 border-2 border-white shadow-sm z-10" />
                </div>
              </div>
              
              {/* Map Controls */}
              <div className="absolute top-4 left-4 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col overflow-hidden">
                <button className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-50 border-b border-gray-200">
                  <span className="material-symbols-outlined text-sm">add</span>
                </button>
                <button className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-50 border-b border-gray-200">
                  <span className="material-symbols-outlined text-sm">remove</span>
                </button>
                <button className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-50">
                  <span className="material-symbols-outlined text-sm">my_location</span>
                </button>
              </div>
            </div>
          </div>

          {/* Fire Activity Status */}
          <div className="lg:col-span-4 bg-white border border-gray-200 rounded-xl shadow-sm p-5 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-gray-400">local_fire_department</span>
                Fire Activity Status
              </h3>
              <span className="px-2 py-0.5 bg-red-50 text-[#f04438] text-[10px] font-bold rounded flex items-center gap-1 border border-red-100">
                <span className="material-symbols-outlined text-[12px]">target</span>
                Critical
              </span>
            </div>

            <div className="flex items-center gap-4 mb-8">
              <div className="w-16 h-16 rounded-full border-[6px] border-red-100 flex items-center justify-center relative">
                <div className="absolute inset-0 border-[6px] border-red-500 rounded-full border-r-transparent border-b-transparent transform rotate-45" />
                <span className="material-symbols-outlined text-2xl text-[#f04438]">local_fire_department</span>
              </div>
              <p className="text-sm font-medium text-gray-900 flex-1 leading-snug">
                Activity is higher than the historical pattern for this area.
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between items-center text-sm">
                <span className="flex items-center gap-2 text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  Current Activity
                </span>
                <span className="font-semibold text-gray-900">High</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="flex items-center gap-2 text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-orange-400" />
                  Historical Pattern
                </span>
                <span className="font-semibold text-gray-900">High</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="flex items-center gap-2 text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-yellow-400" />
                  Trend (vs. last 2 weeks)
                </span>
                <span className="font-semibold text-[#f04438] flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
                  Increasing
                </span>
              </div>
            </div>

            <div className="mt-auto bg-red-50 rounded-lg p-4 border border-red-100">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[#f04438] text-lg shrink-0 mt-0.5">warning</span>
                <div>
                  <h4 className="text-xs font-semibold text-[#f04438] mb-1">Recommended Action</h4>
                  <p className="text-xs text-red-900/80 leading-relaxed">
                    Focus monitoring on high-priority areas, especially in Kalimantan Tengah and surrounding regions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Third Row: Sensor, Calendar, Priority */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Sensor Data */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <span className="material-symbols-outlined text-gray-400">sensors</span>
                  Sensor Data
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">Latest readings from nearby sensors.</p>
              </div>
              <button className="text-blue-600 text-xs font-semibold hover:underline flex items-center">
                View all <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <div className="flex items-center gap-1.5 text-gray-500 text-xs font-medium mb-2">
                  <span className="material-symbols-outlined text-sm text-blue-500">device_thermostat</span>
                  Temperature
                </div>
                <div className="text-xl font-bold text-gray-900 mb-1">34.2 <span className="text-sm font-medium text-gray-500">°C</span></div>
                <div className="text-[10px] font-semibold text-red-600 flex items-center">
                  <span className="material-symbols-outlined text-[12px]">arrow_upward</span> 2.1°C
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <div className="flex items-center gap-1.5 text-gray-500 text-xs font-medium mb-2">
                  <span className="material-symbols-outlined text-sm text-blue-500">water_drop</span>
                  Humidity
                </div>
                <div className="text-xl font-bold text-gray-900 mb-1">62<span className="text-sm font-medium text-gray-500">%</span></div>
                <div className="text-[10px] font-semibold text-green-600 flex items-center">
                  <span className="material-symbols-outlined text-[12px]">arrow_downward</span> 8%
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <div className="flex items-center gap-1.5 text-gray-500 text-xs font-medium mb-2">
                  <span className="material-symbols-outlined text-sm text-blue-500">air</span>
                  Wind Speed
                </div>
                <div className="text-xl font-bold text-gray-900 mb-1">3.6 <span className="text-sm font-medium text-gray-500">m/s</span></div>
                <div className="text-[10px] font-semibold text-red-600 flex items-center">
                  <span className="material-symbols-outlined text-[12px]">arrow_upward</span> 0.8 m/s
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <div className="flex items-center gap-1.5 text-gray-500 text-xs font-medium mb-2">
                  <span className="material-symbols-outlined text-sm text-green-500">eco</span>
                  Air Quality (PM2.5)
                </div>
                <div className="text-xl font-bold text-gray-900 mb-1">42 <span className="text-sm font-medium text-gray-500">μg/m³</span></div>
                <div className="text-[10px] font-semibold text-green-600 flex items-center">
                  <span className="material-symbols-outlined text-[12px]">arrow_downward</span> 12%
                </div>
              </div>
            </div>
          </div>

          {/* Burning Activity Calendar */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
            <div className="mb-4">
              <h3 className="font-bold text-gray-900">Burning Activity Calendar</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">Historical pattern of fire activity in this area.</p>
            </div>
            
            <div className="mb-4">
              <div className="flex text-[10px] text-gray-400 font-medium mb-1 ml-8 space-x-3">
                <span className="w-4">Jan</span><span className="w-4">Feb</span><span className="w-4">Mar</span>
                <span className="w-4">Apr</span><span className="w-4">May</span><span className="w-4">Jun</span>
                <span className="w-4">Jul</span><span className="w-4">Aug</span><span className="w-4">Sep</span>
                <span className="w-4">Oct</span><span className="w-4">Nov</span><span className="w-4">Dec</span>
              </div>
              
              {/* 2023 */}
              <div className="flex items-center mb-2">
                <span className="text-[10px] text-gray-500 w-8 font-medium">2023</span>
                <div className="flex gap-1 flex-1 ml-1">
                  {/* Fake heatmap blocks */}
                  <div className="flex-1 h-5 bg-gray-100 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-gray-100 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-yellow-100 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-yellow-100 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-orange-200 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-gray-100 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-gray-100 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-red-500 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-red-500 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-orange-300 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-gray-100 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-gray-100 rounded-sm"></div>
                </div>
              </div>
              
              {/* 2024 */}
              <div className="flex items-center">
                <span className="text-[10px] text-gray-500 w-8 font-medium">2024</span>
                <div className="flex gap-1 flex-1 ml-1">
                  <div className="flex-1 h-5 bg-gray-100 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-gray-100 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-gray-100 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-yellow-100 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-orange-300 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-orange-400 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-orange-200 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-red-600 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-red-500 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-orange-300 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-yellow-100 rounded-sm"></div>
                  <div className="flex-1 h-5 bg-yellow-100 rounded-sm"></div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4 text-[10px] font-medium text-gray-500 mb-6">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gray-100"></span> Low</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-300"></span> Moderate</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-600"></span> High</span>
            </div>

            <div className="bg-red-50 rounded-lg p-3 border border-red-100">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[#f04438] text-sm shrink-0 mt-0.5">warning</span>
                <div className="flex-1">
                  <h4 className="text-[11px] font-bold text-gray-900">Critical period: August - September</h4>
                  <p className="text-[11px] text-gray-600 mt-0.5 mb-1">
                    Historically, this period has the highest frequency of fire activity in this area.
                  </p>
                  <div className="flex justify-end">
                    <button className="text-blue-600 text-[11px] font-semibold flex items-center gap-0.5 hover:underline">
                      View details <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Priority Areas List */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">Priority Areas</h3>
              <button className="text-blue-600 text-xs font-semibold hover:underline flex items-center">
                View all <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            </div>
            
            <div className="space-y-4">
              {[
                { id: 1, name: "Kalimantan Tengah", desc: "High current activity + historical pattern", status: "Critical", statusColor: "text-[#f04438] bg-red-50 border-red-100" },
                { id: 2, name: "Riau", desc: "Increasing trend", status: "High", statusColor: "text-red-600 bg-red-50 border-red-100" },
                { id: 3, name: "Jambi", desc: "Above historical average", status: "High", statusColor: "text-red-600 bg-red-50 border-red-100" },
                { id: 4, name: "Sumatra Selatan", desc: "Recent hotspots detected", status: "Medium", statusColor: "text-orange-600 bg-orange-50 border-orange-100" },
                { id: 5, name: "Kalimantan Barat", desc: "Historical pattern (Aug-Sep)", status: "Medium", statusColor: "text-orange-600 bg-orange-50 border-orange-100" },
              ].map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <span className="font-bold text-gray-900 w-3">{item.id}</span>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{item.name}</div>
                      <div className="text-[11px] text-gray-500">{item.desc}</div>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${item.statusColor}`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Historical Fire Insights */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-blue-600 text-xl bg-blue-50 p-1.5 rounded-lg">analytics</span>
            <div>
              <h3 className="font-bold text-gray-900">Historical Fire Insights</h3>
              <p className="text-xs text-gray-500">Key patterns and unusual conditions from historical data.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            
            <div className="flex gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <span className="material-symbols-outlined text-blue-600 shrink-0 mt-0.5">calendar_month</span>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">August - September</div>
                <div className="text-sm font-bold text-gray-900 mb-1">Most active period</div>
                <div className="text-xs text-gray-600 leading-relaxed">
                  Fire activity is 2.4x higher than the annual average.
                </div>
              </div>
            </div>

            <div className="flex gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <span className="material-symbols-outlined text-blue-600 shrink-0 mt-0.5">location_on</span>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">Kalimantan Tengah</div>
                <div className="text-sm font-bold text-gray-900 mb-1">Highest frequency</div>
                <div className="text-xs text-gray-600 leading-relaxed">
                  Recorded 38% of total hotspots in the last 2 years.
                </div>
              </div>
            </div>

            <div className="flex gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <span className="material-symbols-outlined text-blue-600 shrink-0 mt-0.5">trending_up</span>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">2023 vs 2024</div>
                <div className="text-sm font-bold text-gray-900 mb-1">Increasing trend</div>
                <div className="text-xs text-gray-600 leading-relaxed">
                  Overall activity increased by 16% compared to the previous year.
                </div>
              </div>
            </div>

            <div className="flex gap-3 bg-red-50 p-4 rounded-xl border border-red-100">
              <span className="material-symbols-outlined text-[#f04438] shrink-0 mt-0.5">warning</span>
              <div>
                <div className="text-xs font-semibold text-red-600 mb-1">Unusual condition</div>
                <div className="text-sm font-bold text-red-900 mb-1">High temperature + low humidity</div>
                <div className="text-xs text-red-800/80 leading-relaxed">
                  Detected in 3 areas in the last 7 days, which is higher than usual.
                </div>
              </div>
            </div>

          </div>
        </div>
        
      </div>
    </WorkstationLayout>
  );
}
