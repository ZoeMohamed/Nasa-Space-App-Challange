import WorkstationLayout from "@/components/layout/WorkstationLayout";

export const metadata = {
  title: "FireWatch — Calendar",
};

export default function CalendarPage() {
  return (
    <WorkstationLayout activeTab="Calendar">
      <div className="max-w-[1400px] mx-auto space-y-6">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 font-medium mb-1">
              <span>Historical Patterns & Forecast</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Burning Activity Calendar
            </h1>
            <p className="text-sm text-gray-500 max-w-2xl">
              Analyze historical fire frequencies across different months and predict upcoming critical periods based on past data.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors">
              <span className="material-symbols-outlined text-[18px] text-gray-400">calendar_today</span>
              2020 - 2024
            </button>
          </div>
        </div>

        {/* Large Calendar Heatmap */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="font-bold text-gray-900 text-lg">Yearly Fire Activity Heatmap</h3>
              <p className="text-sm text-gray-500 mt-1">Aggregated hotspots across all monitored regions by month.</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-100"></span> Low</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-200"></span> Moderate</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-400"></span> High</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-600"></span> Critical</span>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Header Row (Months) */}
              <div className="flex text-sm text-gray-500 font-medium mb-3 ml-16 space-x-2">
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(m => (
                  <span key={m} className="flex-1 text-center">{m}</span>
                ))}
              </div>
              
              {/* Years Data */}
              {[
                { year: 2024, data: ['gray-100', 'gray-100', 'gray-100', 'yellow-200', 'orange-400', 'orange-400', 'orange-400', 'red-600', 'red-600', 'orange-400', 'yellow-200', 'gray-100'] },
                { year: 2023, data: ['gray-100', 'gray-100', 'yellow-200', 'yellow-200', 'orange-400', 'gray-100', 'gray-100', 'red-600', 'red-600', 'orange-400', 'gray-100', 'gray-100'] },
                { year: 2022, data: ['gray-100', 'gray-100', 'gray-100', 'gray-100', 'yellow-200', 'yellow-200', 'orange-400', 'orange-400', 'red-600', 'yellow-200', 'gray-100', 'gray-100'] },
                { year: 2021, data: ['gray-100', 'yellow-200', 'yellow-200', 'gray-100', 'gray-100', 'yellow-200', 'orange-400', 'red-600', 'orange-400', 'yellow-200', 'gray-100', 'gray-100'] },
                { year: 2020, data: ['gray-100', 'gray-100', 'gray-100', 'yellow-200', 'yellow-200', 'orange-400', 'orange-400', 'orange-400', 'red-600', 'orange-400', 'yellow-200', 'gray-100'] },
              ].map((row) => (
                <div key={row.year} className="flex items-center mb-2">
                  <span className="text-sm text-gray-700 w-16 font-semibold">{row.year}</span>
                  <div className="flex gap-2 flex-1">
                    {row.data.map((color, i) => (
                      <div key={i} className={`flex-1 h-12 bg-${color} rounded-md hover:ring-2 hover:ring-offset-2 hover:ring-gray-300 transition-all cursor-pointer`} title={`${row.year} Month ${i+1}`}></div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Detailed Insights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-600">insights</span>
              Seasonal Trends
            </h3>
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                <h4 className="font-semibold text-gray-900 text-sm mb-1">Dry Season Peak (August - October)</h4>
                <p className="text-sm text-gray-600">Historically, 75% of all fire incidents occur during this window due to the El Niño effect reducing rainfall significantly across the archipelago.</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                <h4 className="font-semibold text-gray-900 text-sm mb-1">Transitional Months (May - July)</h4>
                <p className="text-sm text-gray-600">Moderate activity begins as land preparation practices usually commence before the peak dry season.</p>
              </div>
            </div>
          </div>

          <div className="bg-red-50 border border-red-100 rounded-xl shadow-sm p-6">
            <h3 className="font-bold text-[#f04438] mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined">warning</span>
              Upcoming Critical Period
            </h3>
            <p className="text-sm text-red-900/80 mb-4">
              Based on the 5-year moving average and current meteorological data, the next 60 days are classified as a <strong>High Risk</strong> period for Kalimantan Tengah and Riau.
            </p>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-sm text-red-900/80">
                <span className="material-symbols-outlined text-red-600 text-sm">check_circle</span>
                Prepare rapid response teams in peatland areas.
              </li>
              <li className="flex items-center gap-3 text-sm text-red-900/80">
                <span className="material-symbols-outlined text-red-600 text-sm">check_circle</span>
                Increase sensor polling frequency to 15-minute intervals.
              </li>
              <li className="flex items-center gap-3 text-sm text-red-900/80">
                <span className="material-symbols-outlined text-red-600 text-sm">check_circle</span>
                Notify local authorities for preventive patrols.
              </li>
            </ul>
          </div>
        </div>

      </div>
    </WorkstationLayout>
  );
}
