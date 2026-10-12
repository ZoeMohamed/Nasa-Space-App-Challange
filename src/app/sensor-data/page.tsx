import WorkstationLayout from "@/components/layout/WorkstationLayout";

const STATIONS = [
  { id: "ST-KAL-01", loc: "Palangka Raya Peat", temp: 35.1, hum: 55, pm: 120, sync: "2 mins ago", status: "online" },
  { id: "ST-RIA-02", loc: "Pelalawan Forest", temp: 33.8, hum: 68, pm: 45, sync: "5 mins ago", status: "online" },
  { id: "ST-SUM-12", loc: "Ogan Komering Ilir", temp: 34.0, hum: 61, pm: 38, sync: "1 min ago", status: "online" },
  { id: "ST-KAL-04", loc: "Sampit Sector", temp: 36.2, hum: 50, pm: 180, sync: "12 mins ago", status: "online" },
  { id: "ST-JAM-01", loc: "Muaro Jambi", temp: null, hum: null, pm: null, sync: "Offline", status: "offline" },
];

export const metadata = {
  title: "FireWatch — Sensor Data",
};

export default function SensorDataPage() {
  return (
    <WorkstationLayout activeTab="Sensor Data">
      <div className="max-w-[1400px] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 font-medium mb-1">
              <span>Telemetry & Environmental Monitoring</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Sensor Data
            </h1>
            <p className="text-sm text-gray-500 max-w-2xl">
              Real-time readings from ground stations and satellite telemetry to measure environmental conditions fueling fire risks.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm font-semibold shadow-sm hover:bg-blue-100 transition-colors">
              <span className="material-symbols-outlined text-[18px]">sync</span>
              Sync Devices
            </button>
          </div>
        </div>

        {/* Sensor Aggregates */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-600">
                <span className="material-symbols-outlined text-orange-500">device_thermostat</span>
                Avg Temperature
              </div>
              <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100">+2.1°C</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">34.2 <span className="text-sm font-medium text-gray-500">°C</span></div>
            <div className="text-xs text-gray-400">Higher than 30-day average</div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-600">
                <span className="material-symbols-outlined text-blue-500">water_drop</span>
                Avg Humidity
              </div>
              <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100">-8%</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">62 <span className="text-sm font-medium text-gray-500">%</span></div>
            <div className="text-xs text-gray-400">Critical dryness threshold</div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-600">
                <span className="material-symbols-outlined text-gray-500">air</span>
                Wind Speed
              </div>
              <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">+0.8 m/s</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">3.6 <span className="text-sm font-medium text-gray-500">m/s</span></div>
            <div className="text-xs text-gray-400">Moderate spread risk</div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-600">
                <span className="material-symbols-outlined text-green-500">eco</span>
                Air Quality (PM2.5)
              </div>
              <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-100">-12%</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">42 <span className="text-sm font-medium text-gray-500">μg/m³</span></div>
            <div className="text-xs text-gray-400">Good condition overall</div>
          </div>
        </div>

        {/* Station List Table */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Ground Stations Status</h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1 text-gray-500"><span className="w-2 h-2 rounded-full bg-green-500"></span> Online</span>
              <span className="flex items-center gap-1 text-gray-500"><span className="w-2 h-2 rounded-full bg-red-500"></span> Offline</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-semibold">
                <tr>
                  <th className="px-6 py-3">Station ID</th>
                  <th className="px-6 py-3">Location</th>
                  <th className="px-6 py-3">Temp (°C)</th>
                  <th className="px-6 py-3">Humidity (%)</th>
                  <th className="px-6 py-3">PM2.5</th>
                  <th className="px-6 py-3">Last Sync</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {STATIONS.map(station => (
                  <tr key={station.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${station.status === 'online' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                      {station.id}
                    </td>
                    <td className="px-6 py-4">{station.loc}</td>
                    <td className={`px-6 py-4 font-medium ${station.temp !== null && station.temp > 35 ? 'text-red-600' : ''}`}>{station.temp ?? "—"}</td>
                    <td className={`px-6 py-4 font-medium ${station.hum !== null && station.hum < 60 ? 'text-red-600' : ''}`}>{station.hum ?? "—"}</td>
                    <td className={`px-6 py-4 font-medium ${station.pm !== null && station.pm > 100 ? 'text-orange-600' : ''}`}>{station.pm ?? "—"}</td>
                    <td className="px-6 py-4 text-xs">{station.sync}</td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-blue-600 font-semibold hover:underline text-xs">Details</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </WorkstationLayout>
  );
}
