// src/App.tsx
import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Activity, Thermometer, Gauge, AlertCircle } from 'lucide-react';
import type { MetricsData, WorkLogData } from './Dashboard_Structure';
import { fetchMetricsData, fetchWorkLogsData, formatKST } from './Dashboard_Logic';

function App() {
  const [metrics, setMetrics] = useState<MetricsData[]>([]);
  const [logs, setLogs] = useState<WorkLogData[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const [metricsData, logsData] = await Promise.all([
      fetchMetricsData(),
      fetchWorkLogsData()
    ]);
    
    // Reverse metrics for chronological charting (oldest to newest left-to-right)
    setMetrics(metricsData.reverse().map(m => ({ ...m, displayTime: formatKST(m.timestamp) })));
    setLogs(logsData);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // Auto refresh every 5 seconds for real-time vibe
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading && metrics.length === 0) {
    return <div className="min-h-screen flex items-center justify-center bg-dark-bg text-dark-text">Loading Factory Data...</div>;
  }

  const latestMetric = metrics[metrics.length - 1] || {} as MetricsData;

  return (
    <div className="min-h-screen bg-dark-bg text-dark-text p-6">
      <header className="mb-8 flex justify-between items-end border-b border-dark-border pb-4">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
            MES Extrusion Dashboard
          </h1>
          <p className="text-dark-muted mt-1">Real-time Smart Factory Monitoring</p>
        </div>
        <div className="text-sm px-3 py-1 bg-dark-card rounded-full flex items-center gap-2 border border-dark-border">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Live Sync Active
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-dark-card p-5 rounded-xl border border-dark-border flex items-center gap-4 hover:shadow-lg hover:shadow-primary/10 transition-shadow">
          <div className="p-3 bg-blue-500/10 rounded-lg text-blue-400">
            <Gauge size={24} />
          </div>
          <div>
            <p className="text-dark-muted text-sm font-medium">Main Pressure</p>
            <p className="text-2xl font-bold">{latestMetric.main_pressure?.toFixed(1) || 0} <span className="text-sm font-normal text-dark-muted">bar</span></p>
          </div>
        </div>

        <div className="bg-dark-card p-5 rounded-xl border border-dark-border flex items-center gap-4 hover:shadow-lg hover:shadow-orange-500/10 transition-shadow">
          <div className="p-3 bg-orange-500/10 rounded-lg text-orange-400">
            <Thermometer size={24} />
          </div>
          <div>
            <p className="text-dark-muted text-sm font-medium">Container Temp (Front)</p>
            <p className="text-2xl font-bold">{latestMetric.container_temp_front?.toFixed(1) || 0} <span className="text-sm font-normal text-dark-muted">°C</span></p>
          </div>
        </div>

        <div className="bg-dark-card p-5 rounded-xl border border-dark-border flex items-center gap-4 hover:shadow-lg hover:shadow-emerald-500/10 transition-shadow">
          <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-400">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-dark-muted text-sm font-medium">Current Speed</p>
            <p className="text-2xl font-bold">{latestMetric.current_speed?.toFixed(1) || 0} <span className="text-sm font-normal text-dark-muted">m/s</span></p>
          </div>
        </div>

        <div className="bg-dark-card p-5 rounded-xl border border-dark-border flex items-center gap-4 hover:shadow-lg hover:shadow-rose-500/10 transition-shadow">
          <div className="p-3 bg-rose-500/10 rounded-lg text-rose-400">
            <AlertCircle size={24} />
          </div>
          <div>
            <p className="text-dark-muted text-sm font-medium">Recent Defects</p>
            <p className="text-2xl font-bold">
              {logs.length > 0 ? (logs[0].defect_bubble + logs[0].defect_tearing) : 0} 
              <span className="text-sm font-normal text-dark-muted"> items</span>
            </p>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-dark-card p-5 rounded-xl border border-dark-border">
          <h2 className="text-lg font-semibold mb-4 text-dark-text flex items-center gap-2">
            Pressure Trend
          </h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="displayTime" stroke="#94A3B8" fontSize={12} tickCount={5} />
                <YAxis stroke="#94A3B8" fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', borderRadius: '8px' }}
                  itemStyle={{ color: '#F8FAFC' }}
                />
                <Legend />
                <Line type="monotone" dataKey="main_pressure" name="Main Pressure" stroke="#3B82F6" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-dark-card p-5 rounded-xl border border-dark-border">
          <h2 className="text-lg font-semibold mb-4 text-dark-text">Temperature Monitoring</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="displayTime" stroke="#94A3B8" fontSize={12} />
                <YAxis stroke="#94A3B8" fontSize={12} domain={['auto', 'auto']} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', borderRadius: '8px' }}
                />
                <Legend />
                <Line type="monotone" dataKey="container_temp_front" name="Front Temp" stroke="#F97316" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="container_temp_rear" name="Rear Temp" stroke="#8B5CF6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Work Logs Table */}
      <div className="bg-dark-card rounded-xl border border-dark-border overflow-hidden">
        <div className="p-5 border-b border-dark-border flex justify-between items-center">
          <h2 className="text-lg font-semibold text-dark-text">Recent Work Logs</h2>
          <button className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors">
            + New Entry
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-dark-bg/50">
                <th className="py-3 px-5 text-dark-muted font-medium text-sm">Lot Number</th>
                <th className="py-3 px-5 text-dark-muted font-medium text-sm">Machine ID</th>
                <th className="py-3 px-5 text-dark-muted font-medium text-sm">Start Time</th>
                <th className="py-3 px-5 text-dark-muted font-medium text-sm">Quantity</th>
                <th className="py-3 px-5 text-dark-muted font-medium text-sm text-right">Defects</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-white/5 transition-colors">
                  <td className="py-3 px-5 font-medium">{log.lot || 'N/A'}</td>
                  <td className="py-3 px-5"><span className="px-2 py-1 bg-dark-bg rounded text-xs border border-dark-border">{log.machine_id}</span></td>
                  <td className="py-3 px-5 text-dark-muted text-sm">{formatKST(log.start_time)}</td>
                  <td className="py-3 px-5">{log.production_qty}</td>
                  <td className="py-3 px-5 text-right">
                    {log.defect_bubble + log.defect_etc > 0 ? (
                      <span className="text-rose-400 font-medium">{log.defect_bubble + log.defect_etc}</span>
                    ) : (
                      <span className="text-dark-muted">0</span>
                    )}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-dark-muted">No recent work logs found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;
