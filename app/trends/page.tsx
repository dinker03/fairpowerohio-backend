"use client";

import { useEffect, useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, AreaChart, Area, LabelList
} from "recharts";

// --- COLORS ---
const PALETTE = [
  '#2563eb', '#db2777', '#ea580c', '#16a34a', '#9333ea', '#0891b2', '#ca8a04', '#dc2626',
  '#4f46e5', '#be185d', '#b45309', '#15803d', '#7e22ce', '#0e7490', '#a16207', '#b91c1c'
];

export default function TrendsPage() {
  const [rawData, setRawData] = useState<any[]>([]);
  const [historyData, setHistoryData] = useState<Record<string, any[]>>({});
  const [meta, setMeta] = useState<{ suppliers: string[], utilities: string[] }>({ suppliers: [], utilities: [] });
  const [loading, setLoading] = useState(true);

  // --- FILTERS ---
  const [commodity, setCommodity] = useState<"electric" | "gas">("electric");
  const [metric, setMetric] = useState<"min" | "avg" | "median" | "max">("min");
  
  // Chart type: keep UI simple with Line & Bar only
  const [chartType, setChartType] = useState<"line" | "bar">("bar");
  const [showFilters, setShowFilters] = useState(true);
  
  // Multi-select state
  const [selectedUtility, setSelectedUtility] = useState<string>(""); 
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(new Set());

  // --- HELPER: Check if supplier has data for current commodity ---
  const isSupplierValidForCommodity = (supplier: string, currentCommodity: string) => {
    if (!selectedUtility) return false;
    const keyCheck = `${selectedUtility}|${supplier}|min`;
    return rawData.some(r => r[keyCheck] !== undefined);
  };

  // --- HELPER: Select Top 5 Cheapest Suppliers (Corrected) ---
  const selectTop5Suppliers = (data: any[], utilitySlug: string, currentCommodity: string) => {
    if (!data || !Array.isArray(data) || data.length === 0) return new Set<string>();

    // FIX: Find the latest date specifically for THIS utility, not the global last date.
    // We reverse the array to find the most recent entry first.
    const latestUtilityRecord = [...data].reverse().find(d => {
        // Check if this row has ANY keys starting with the utility slug
        return Object.keys(d).some(k => k.startsWith(`${utilitySlug}|`));
    });

    if (!latestUtilityRecord) return new Set<string>();

    const suppliersWithRates: { name: string, rate: number }[] = [];
    
    // Use the record we found that actually has data
    Object.keys(latestUtilityRecord).forEach(key => {
        if (key.startsWith(`${utilitySlug}|`) && key.endsWith('|min')) {
            const supplierName = key.split('|')[1];
            const rate = latestUtilityRecord[key];
            
            const unitKey = `${utilitySlug}|${supplierName}|unit`;
            const unit = latestUtilityRecord[unitKey];
            
            // Logic check: Electric uses ¢/kWh, Gas usually uses $/Mcf or $/CCF
            const isElectric = unit === '¢/kWh';

            if ((currentCommodity === 'electric' && isElectric) || (currentCommodity === 'gas' && !isElectric)) {
                 suppliersWithRates.push({ name: supplierName, rate });
            }
        }
    });

    suppliersWithRates.sort((a, b) => a.rate - b.rate);
    const top5 = suppliersWithRates.slice(0, 5).map(s => s.name);
    
    return new Set(top5);
  };

  // --- 1. FETCH DATA ---
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/trends");
        const json = await res.json();
        
        const trendsData = Array.isArray(json.trends) ? json.trends : [];
        setRawData(trendsData);
        setHistoryData(json.history || {}); 
        
        const utilList = json.meta?.utilities || [];
        setMeta({ ...json.meta, utilities: utilList });

        const illuminating = utilList.find((u: string) => u.toLowerCase().includes('illuminating'));
        const defaultUtil = illuminating || utilList.find((u: string) => !u.includes('gas') && !u.includes('dominion'));
        
        if (defaultUtil) {
            setSelectedUtility(defaultUtil);
            const top5 = selectTop5Suppliers(trendsData, defaultUtil, "electric");
            setSelectedSuppliers(top5);
        }

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // --- 2. FILTER HELPERS ---
  const handleCommoditySwitch = (type: "electric" | "gas") => {
    setCommodity(type);
    const validUtilities = meta.utilities.filter(u => {
        const isGas = u.includes('gas') || u.includes('dominion') || u.includes('columbia') || u.includes('centerpoint');
        return (type === 'gas' && isGas) || (type === 'electric' && !isGas);
    });

    let newUtil = "";
    if (validUtilities.length > 0) {
        if (type === 'gas') {
             const dom = validUtilities.find(u => u.includes('dominion'));
             newUtil = dom || validUtilities[0];
        } else {
             newUtil = validUtilities[0];
        }
        setSelectedUtility(newUtil);
    } else {
        setSelectedUtility("");
    }
    
    if (newUtil && rawData.length > 0) {
        const top5 = selectTop5Suppliers(rawData, newUtil, type);
        setSelectedSuppliers(top5);
    } else {
        setSelectedSuppliers(new Set()); 
    }
  };

  const toggleSupplier = (val: string) => {
    const newSet = new Set(selectedSuppliers);
    if (newSet.has(val)) newSet.delete(val);
    else newSet.add(val);
    setSelectedSuppliers(newSet);
  };

  const handleSelectAllSuppliers = (select: boolean) => {
    if (!select) {
        setSelectedSuppliers(new Set());
        return;
    }
    const validSuppliers = meta.suppliers.filter(s => isSupplierValidForCommodity(s, commodity));
    setSelectedSuppliers(new Set(validSuppliers));
  };

  const handleResetTop5 = () => {
      if (!selectedUtility) return;
      const top5 = selectTop5Suppliers(rawData, selectedUtility, commodity);
      setSelectedSuppliers(top5);
  };

  // --- 3. PREPARE CHART LINES ---
  const chartLines = useMemo(() => {
    const lines: any[] = [];
    let colorIdx = 0;

    if (!selectedUtility) return [];

    selectedSuppliers.forEach(supplier => {
        const dataKey = `${selectedUtility}|${supplier}|${metric}`;
        const unitKey = `${selectedUtility}|${supplier}|unit`;
        
        const hasData = rawData.some(row => row[dataKey] !== undefined);
        
        if (hasData) {
            // FIX: Find the MOST RECENT row to check the unit, not the oldest.
            // Old historical data might be missing unit tags.
            const sampleRow = [...rawData].reverse().find(r => r[unitKey]);
            
            if (sampleRow) {
                 const unit = sampleRow[unitKey];
                 const isElectric = unit === '¢/kWh';

                 if ((commodity === 'electric' && isElectric) || (commodity === 'gas' && !isElectric)) {
                    lines.push({
                        dataKey,
                        name: supplier, 
                        color: PALETTE[colorIdx % PALETTE.length],
                        supplier: supplier
                    });
                    colorIdx++;
                 }
            }
        }
    });
    return lines;
  }, [rawData, selectedUtility, selectedSuppliers, metric, commodity]);

  // --- 4. PREPARE HISTORY CHART DATA ---
  const activeHistoryData = useMemo(() => {
      if (!selectedUtility || !historyData) return [];

      let history = historyData[selectedUtility];

      if (!history) {
          const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
          const target = normalize(selectedUtility);
          const matchingKey = Object.keys(historyData).find(k => {
              const normK = normalize(k);
              return normK.includes(target) || target.includes(normK);
          });
          if (matchingKey) history = historyData[matchingKey];
      }
      
      if (!history || history.length === 0) return [];
      
      return history
        .filter((d: any) => d.year >= 2022)
        .map((d: any) => ({
            date: d.date,
            price: d.price,
            year: d.year
        }))
        .sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [historyData, selectedUtility]);

  // --- 5. CUSTOM TOOLTIP (Home-page style) ---
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const sorted = [...payload].sort(
        (a: any, b: any) => Number(a.value) - Number(b.value)
      );
      return (
        <div
          style={{
            background: "white",
            padding: "10px 12px",
            border: "1px solid #e5e7eb",
            fontSize: "12px",
            borderRadius: "8px",
            boxShadow: "0 10px 20px rgba(15,23,42,0.12)",
            minWidth: 140,
          }}
        >
          <p
            style={{
              fontWeight: 600,
              marginBottom: 6,
              borderBottom: "1px solid #f3f4f6",
              paddingBottom: 4,
              color: "#111827",
            }}
          >
            {label}
          </p>
          {sorted.map((entry: any, index: number) => (
            <div
              key={index}
              style={{
                color: entry.color,
                marginBottom: 4,
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span style={{ fontWeight: 600 }}>{entry.name}</span>
              <span style={{ color: "#111827" }}>{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // --- 6. RENDER CHART COMPONENT (with gradients / polished styles) ---
  const renderChart = () => {
    const commonProps = {
        data: rawData,
        margin: { top: 10, right: 30, left: 0, bottom: 0 }
    };

    const gradientDefs = chartLines.map((line) => (
      <linearGradient
        key={line.dataKey}
        id={`grad-${line.dataKey}`}
        x1="0"
        y1="0"
        x2="0"
        y2="1"
      >
        <stop offset="5%" stopColor={line.color} stopOpacity={0.3} />
        <stop offset="95%" stopColor={line.color} stopOpacity={0} />
      </linearGradient>
    ));

    const axes = (
        <>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              stroke="#9ca3af"
              tickLine={false}
              axisLine={false}
              style={{ fontSize: "12px" }}
            />
            <YAxis
              domain={["auto", "auto"]}
              unit={commodity === "electric" ? "¢" : "$"}
              stroke="#9ca3af"
              tickLine={false}
              axisLine={false}
              style={{ fontSize: "12px" }}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: "#e5e7eb", strokeWidth: 1 }}
            />
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: "12px", paddingTop: 8 }}
            />
        </>
    );

    if (chartType === 'bar') {
        return (
            <BarChart {...commonProps}>
                {axes}
                {chartLines.map(line => (
                    <Bar
                      key={line.dataKey}
                      dataKey={line.dataKey}
                      fill={line.color}
                      name={line.name}
                      radius={[8, 8, 0, 0]}
                    />
                ))}
            </BarChart>
        );
    }
    
    // Default: line chart
    return (
      <LineChart {...commonProps}>
        {axes}
        {chartLines.map((line) => (
          <Line
            key={line.dataKey}
            type="monotone"
            dataKey={line.dataKey}
            stroke={line.color}
            name={line.name}
            strokeWidth={2.5}
            dot={false}
            connectNulls={true}
          />
        ))}
      </LineChart>
    );
  };


  if (loading) return <div style={{ padding: 40 }}>Loading market data...</div>;

  const validUtilities = meta.utilities.filter(u => {
      const isGas = u.includes('gas') || u.includes('dominion') || u.includes('columbia') || u.includes('centerpoint');
      return (commodity === 'gas' && isGas) || (commodity === 'electric' && !isGas);
  });

  const validSuppliers = meta.suppliers.filter(s => isSupplierValidForCommodity(s, commodity));

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 16px" }}>
      <div style={{ marginBottom: 30 }}>
        <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#111827", marginBottom: 6 }}>
          Market Analytics Explorer
        </h1>
        <p style={{ color: "#6b7280", fontSize: "15px" }}>
          Compare historical pricing by supplier, utility, and rate metric using interactive charts.
        </p>
      </div>

      {/* --- CONTROLS CONTAINER --- */}
      <div style={controlPanelStyle}>
        
        {/* ROW 1: Toggles */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', borderBottom: showFilters ? '1px solid #e5e7eb' : 'none', paddingBottom: showFilters ? 15 : 0, marginBottom: showFilters ? 15 : 0 }}>
            
            <div style={groupStyle}>
                <span style={labelStyle}>Market:</span>
                <div style={toggleGroupStyle}>
                    <button onClick={() => handleCommoditySwitch("electric")} style={commodity === "electric" ? activeBtn : inactiveBtn}>⚡️ Electric</button>
                    <button onClick={() => handleCommoditySwitch("gas")} style={commodity === "gas" ? activeBtn : inactiveBtn}>🔥 Gas</button>
                </div>
            </div>

            <div style={groupStyle}>
                <span style={labelStyle}>Metric:</span>
                <div style={toggleGroupStyle}>
                    <button onClick={() => setMetric("min")} style={metric === "min" ? activeBtn : inactiveBtn}>Lowest</button>
                    <button onClick={() => setMetric("avg")} style={metric === "avg" ? activeBtn : inactiveBtn}>Average</button>
                    <button onClick={() => setMetric("median")} style={metric === "median" ? activeBtn : inactiveBtn}>Median</button>
                    <button onClick={() => setMetric("max")} style={metric === "max" ? activeBtn : inactiveBtn}>Highest</button>
                </div>
            </div>

             <div style={groupStyle}>
                <span style={labelStyle}>Chart Type:</span>
                <select 
                    value={chartType} 
                    onChange={(e) => setChartType(e.target.value as "line" | "bar")}
                    style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', cursor: 'pointer' }}
                >
                    <option value="line">Line Chart</option>
                    <option value="bar">Bar Chart</option>
                </select>
            </div>

            <button onClick={() => setShowFilters(!showFilters)} style={{ marginLeft: 'auto', ...textBtnStyle }}>
                {showFilters ? "Hide Filters ▲" : "Show Filters ▼"}
            </button>
        </div>

        {showFilters && (
            <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap' }}>
                
                {/* Utility Dropdown */}
                <div style={{ flex: 1, minWidth: '250px' }}>
                    <p style={sectionHeaderStyle}>1. Select Utility</p>
                    <select 
                        value={selectedUtility} 
                        onChange={(e) => {
                            setSelectedUtility(e.target.value);
                            const top5 = selectTop5Suppliers(rawData, e.target.value, commodity);
                            setSelectedSuppliers(top5);
                        }}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                    >
                        {validUtilities.map(u => (
                            <option key={u} value={u}>{u.replace(/-/g, ' ').toUpperCase()}</option>
                        ))}
                    </select>
                </div>

                {/* Supplier List */}
                <div style={{ flex: 2, minWidth: '300px' }}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
                        <p style={sectionHeaderStyle}>2. Select Suppliers ({selectedSuppliers.size})</p>
                        <div style={{display: 'flex', gap: '8px'}}>
                            <button onClick={() => handleSelectAllSuppliers(true)} style={textBtnStyle}>All</button>
                            <button onClick={handleResetTop5} style={textBtnStyle}>Top 5</button> 
                            <button onClick={() => handleSelectAllSuppliers(false)} style={textBtnStyle}>None</button>
                        </div>
                    </div>
                    <div style={scrollListStyle}>
                        {validSuppliers.map(s => (
                            <label key={s} style={checkboxLabelStyle}>
                                <input type="checkbox" checked={selectedSuppliers.has(s)} onChange={() => toggleSupplier(s)} />
                                <span style={{fontSize: '12px'}}>{s}</span>
                            </label>
                        ))}
                        {validSuppliers.length === 0 && <p style={{fontSize: '12px', color: '#888', padding: '5px'}}>Select a utility to view suppliers.</p>}
                    </div>
                </div>

            </div>
        )}
      </div>

      {/* --- MAIN CHART --- */}
      <div
        style={{
          height: 450,
          background: "white",
          padding: 20,
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          marginBottom: 40,
          boxShadow: "0 18px 45px rgba(15,23,42,0.08)",
        }}
      >
        <h3 style={{fontSize: '16px', fontWeight: 600, marginBottom: 10}}>Current Market Trends (Daily)</h3>
        <ResponsiveContainer width="100%" height="100%">
           {renderChart()}
        </ResponsiveContainer>
      </div>

      {/* --- HISTORY CHART SECTION --- */}
      {activeHistoryData.length > 0 && (
          <div style={{ marginTop: 40 }}>
            <div
              style={{
                height: 350,
                background: "white",
                padding: 20,
                borderRadius: 16,
                border: "1px solid #e5e7eb",
                boxShadow: "0 18px 45px rgba(15,23,42,0.08)",
              }}
            >
                <h3 style={{fontSize: '16px', fontWeight: 600, marginBottom: 10}}>
                    Official Price to Compare History (2022 - Present)
                </h3>
                <p style={{ color: "#666", fontSize: "13px", marginBottom: "10px" }}>
                    Historical benchmark rates for <strong>{selectedUtility.replace(/-/g, ' ').toUpperCase()}</strong>
                </p>
                <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activeHistoryData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                        dataKey="date" 
                        tickFormatter={(d) => {
                            const date = new Date(d);
                            return `${date.toLocaleString('default', { month: 'short' })} '${date.getFullYear().toString().substr(2)}`;
                        }} 
                        interval="preserveStartEnd"
                    />
                    <YAxis domain={[0, "auto"]} unit={commodity === "electric" ? "¢" : "$"} />
                    <Tooltip 
                        formatter={(value: any) => [`${value}${commodity === "electric" ? "¢" : "$"}`, "PTC Rate"]}
                        labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
                    />
                    <Legend />
                    
                    <Bar 
                        dataKey="price" 
                        fill="#10b981" 
                        name="Official PTC" 
                        radius={[4, 4, 0, 0]}
                    >
                        {/* TYPE-SAFE LABEL FORMATTER */}
                        <LabelList 
                            dataKey="price" 
                            position="insideBottom" 
                            fill="white" 
                            style={{ fontWeight: 'bold', fontSize: '10px', textShadow: '0px 1px 2px rgba(0,0,0,0.5)' }}
                            formatter={(val: any) => {
                                if (typeof val !== 'number') return '';
                                const rounded = Number(val).toFixed(2);
                                return `${rounded}${commodity === 'electric' ? '¢' : '$'}`;
                            }}
                        />
                    </Bar>
                </BarChart>
                </ResponsiveContainer>
            </div>
          </div>
      )}

    </main>
  );
}

// --- STYLES ---
const controlPanelStyle = {
  background: "white",
  padding: "20px",
  borderRadius: 16,
  border: "1px solid #e5e7eb",
  marginBottom: 30,
  boxShadow: "0 14px 35px rgba(15,23,42,0.06)",
};
const groupStyle = { display: "flex", alignItems: "center", gap: "10px" };
const toggleGroupStyle = {
  display: "flex",
  background: "#f3e8ff",
  padding: "4px",
  borderRadius: 999,
  gap: "4px",
};
const labelStyle = {
  fontSize: "13px",
  fontWeight: 600,
  color: "#6b7280",
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
};
const sectionHeaderStyle = { fontSize: "14px", fontWeight: 600, marginBottom: "10px", color: "#111" };
const scrollListStyle = { maxHeight: "200px", overflowY: "auto" as const, border: "1px solid #e5e7eb", borderRadius: "6px", padding: "10px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px" };
const checkboxLabelStyle = { display: "flex", gap: "8px", alignItems: "center", cursor: "pointer", userSelect: "none" as const };
const activeBtn = {
  padding: "6px 14px",
  borderRadius: 999,
  border: "none",
  background:
    "linear-gradient(135deg, rgba(139,92,246,1), rgba(236,72,153,1))",
  color: "white",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "13px",
};
const inactiveBtn = {
  padding: "6px 14px",
  borderRadius: 999,
  border: "none",
  background: "transparent",
  color: "#4b5563",
  cursor: "pointer",
  fontSize: "13px",
};
const textBtnStyle = {
  background: "none",
  border: "none",
  color: "#4f46e5",
  fontSize: "12px",
  cursor: "pointer",
  fontWeight: 500,
  padding: 0,
};