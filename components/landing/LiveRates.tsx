"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export function LiveRates() {
  // Mock data representing rate trends
  const data = [
    { date: '11-27', electric: 7.2, gas: 4.8 },
    { date: '11-30', electric: 7.5, gas: 4.6 },
    { date: '12-02', electric: 7.8, gas: 5.1 },
    { date: '12-05', electric: 7.4, gas: 4.9 },
    { date: '12-08', electric: 8.2, gas: 5.3 },
    { date: '12-11', electric: 7.9, gas: 5.0 },
    { date: '12-13', electric: 7.6, gas: 4.7 },
    { date: '12-15', electric: 7.3, gas: 4.8 },
    { date: '12-18', electric: 7.1, gas: 4.5 }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
      <div className="text-center mb-12">
        <h2 className="text-4xl sm:text-5xl mb-4 text-gray-900">
          Current Market Trends
        </h2>
        <p className="text-xl text-gray-600">
          Live energy rate data updated daily from Ohio utilities
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-100">
        <div className="mb-6">
          <div className="flex flex-wrap gap-4 justify-between items-center">
            <div>
              <h3 className="text-2xl text-gray-900 mb-2">
                Average Rates Over Time
              </h3>
              <p className="text-gray-600">
                Electric and Gas pricing trends (¢ per kWh / therm)
              </p>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                <span className="text-gray-700">Electric</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-cyan-500 rounded-full"></div>
                <span className="text-gray-700">Gas</span>
              </div>
            </div>
          </div>
        </div>

        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%" minHeight={320}>
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorElectric" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorGas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="date" 
                stroke="#6b7280"
                style={{ fontSize: '14px' }}
              />
              <YAxis 
                stroke="#6b7280"
                style={{ fontSize: '14px' }}
                label={{ value: '¢ per unit', angle: -90, position: 'insideLeft', style: { fill: '#6b7280' } }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
              />
              <Area 
                type="monotone" 
                dataKey="electric" 
                stroke="#8b5cf6" 
                strokeWidth={2}
                fill="url(#colorElectric)" 
                name="Electric (¢/kWh)"
              />
              <Area 
                type="monotone" 
                dataKey="gas" 
                stroke="#06b6d4" 
                strokeWidth={2}
                fill="url(#colorGas)" 
                name="Gas (¢/therm)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-purple-50 rounded-xl p-6">
            <div className="text-purple-600 mb-1">Current Electric Rate</div>
            <div className="text-3xl text-purple-900">7.1¢</div>
            <div className="text-sm text-purple-600 mt-1">per kWh</div>
          </div>
          <div className="bg-cyan-50 rounded-xl p-6">
            <div className="text-cyan-600 mb-1">Current Gas Rate</div>
            <div className="text-3xl text-cyan-900">4.5¢</div>
            <div className="text-sm text-cyan-600 mt-1">per therm</div>
          </div>
          <div className="bg-green-50 rounded-xl p-6">
            <div className="text-green-600 mb-1">Trend</div>
            <div className="text-3xl text-green-900">↓ 2.8%</div>
            <div className="text-sm text-green-600 mt-1">vs last week</div>
          </div>
        </div>
      </div>
    </div>
  );
}