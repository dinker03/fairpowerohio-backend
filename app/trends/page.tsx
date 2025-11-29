"use client";

import { useEffect, useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, AreaChart, Area
} from "recharts";

// --- COLORS ---
const PALETTE = [
  '#2563eb', '#db2777', '#ea580c', '#16a34a', '#9333ea', '#0891b2', '#ca8a04', '#dc2626',
  '#4f46e5', '#be185d', '#b45309', '#15803d', '#7e22ce', '#0e7490', '#a16207', '#b91c1c'
];

export default function TrendsPage() {
  const [rawData, setRawData] = useState<any[]>([]);
  const [meta, setMeta] = useState<{ suppliers: string[], utilities: string[] }>({ suppliers: [], utilities: [] });
  const [loading, setLoading] = useState(true);

  // --- FILTERS ---
  const [commodity, setCommodity] = useState<"electric" | "gas">("electric");
  const [metric, setMetric] = useState<"min" | "avg" | "median" | "max">("min");
  
  // Set default chart type to 'bar' as requested (Line 25)
  const [chartType, setChartType] = useState<"line" | "bar" | "area" | "stacked">("bar");
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

  // --- HELPER: Select Top 5 Cheapest Suppliers ---
  const selectTop5Suppliers = (data: any[], utilitySlug: string, currentCommodity: string) => {
    if (!data || data.length === 0) return new Set<string>();

    // 1. Find the most recent date in the dataset
    const lastDate = data[data.length - 1].date;
    const recentData = data.filter((d: any) => d.date === lastDate);

    // 2. Find all suppliers for this utility on that date
    const suppliersWithRates: { name: string, rate: number }[] = [];
    
    // Scan keys to find rates for the selected utility
    if (recentData.length > 0) {
        const dayRecord = recentData[0];
        Object.keys(dayRecord).forEach(key => {
            // Key format: "utility|supplier|metric"
            // We specifically look for the 'min' metric to find the lowest price
            if (key.startsWith(`${utilitySlug}|`) && key.endsWith('|min')) {
                const supplierName = key.split('|')[1];
                const rate = dayRecord[key];
                
                // Check unit to ensure we don't mix gas/electric
                const unitKey = `${utilitySlug}|${supplierName}|unit`;
                const unit = dayRecord[unitKey];
                const isElectric = unit === '¢/kWh';

                if ((currentCommodity === 'electric' && isElectric) || (currentCommodity === 'gas' && !isElectric)) {
                     suppliersWithRates.push({ name: supplierName, rate });
                }
            }
        });
    }

    // 3. Sort by rate (lowest first) and take top 5
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
        const trendsData = json.trends || [];
        setRawData(trendsData);
        setMeta(json.meta || { suppliers: [], utilities: [] });

        // Initial Defaults logic
        // 1. Try to find "Illuminating Company", otherwise fallback to first electric utility
        const illuminating = json.meta.utilities.find((u: string) => u.includes('illuminating'));
        const defaultUtil = illuminating || json.meta.utilities.find((u: string) => !u.includes('gas') && !u.includes('dominion'));
        
        if (defaultUtil) {
            setSelectedUtility(defaultUtil);
            
            // 2. Set Suppliers to Top 5 Cheapest for that utility
            const topSuppliers = selectTop5Suppliers(trendsData, defaultUtil, "electric");
            setSelectedSuppliers(topSuppliers);
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
    
    // Find the first valid utility for this new commodity
    const validUtilities = meta.utilities.filter(u => {
        const isGas = u.includes('gas') || u.includes('dominion') || u.includes('columbia') || u.includes('centerpoint');
        return (type === 'gas' && isGas) || (type === 'electric' && !isGas);
    });

    let newUtil = "";
    if (validUtilities.length > 0) {
        // Prefer Dominion for gas if available, otherwise take first
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
    
    // Auto-select Top 5 for the new utility
    if (newUtil) {
        const topSuppliers = selectTop5Suppliers(rawData, newUtil, type);
        setSelectedSuppliers(topSuppliers);
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
            const sampleRow = rawData.find(r => r[unitKey]);
            
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

  // --- 4. CUSTOM TOOLTIP ---
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: 'white', padding: '10px', border: '1px solid #ccc', fontSize: '12px' }}>
          <p style={{ fontWeight: 'bold', marginBottom: '5px' }}>{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} style={{ color: entry.color, marginBottom: '3px' }}>
              {entry.name}: <strong>{entry.value}</strong>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // --- 5. RENDER CHART COMPONENT ---
  const renderChart = () => {
    const commonProps = {
        data: rawData,
        margin: { top: 10, right: 30, left: 0, bottom: 0 }
    };

    const axes = (
        <>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis domain={["auto", "auto"]} unit={commodity === "electric" ? "¢" : "$"} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
        </>
    );

    if (chartType === 'bar') {
        return (
            <BarChart {...commonProps}>
                {axes}
                {chartLines.map(line => (
                    <Bar key={line.dataKey} dataKey={line.dataKey} fill={line.color} name={line.name} />
                ))}
            </BarChart>
        );
    }
    
    if (chartType === 'area') {
        return (
            <AreaChart {...commonProps}>
                {axes}
                {chartLines.map(line => (
                    <Area key={line.dataKey} type="monotone" dataKey={line.dataKey} stroke={line.color} fill={line.color} fillOpacity={0.3} name={line.name} />
                ))}
            </AreaChart>
        );
    }

    if (chartType === 'stacked') {
        return (
             <BarChart {...commonProps}>
                {axes}
                {chartLines.map(line => (
                    <Bar key={line.dataKey} dataKey={line.dataKey} stackId="a" fill={line.color} name={line.name} />
                ))}
            </BarChart>
        );
    }

    // Default Line Chart
    return (
        <LineChart {...commonProps}>
            {axes}
            {chartLines.map(line => (
                <Line key={line.dataKey} type="monotone" dataKey={line.dataKey} stroke={line.color} name={line.name} strokeWidth={2} dot={false} connectNulls={true} />
            ))}
        </LineChart>
    );
  };


  if (loading) return <div style={{ padding: 40 }}>Loading market data...</div>;

  // Calculate filtered options for rendering
  const validUtilities = meta.utilities.filter(u => {
      const isGas = u.includes('gas') || u.includes('dominion') || u.includes('columbia') || u.includes('centerpoint');
      return (commodity === 'gas' && isGas) || (commodity === 'electric' && !isGas);
  });

  // Now we can safely use the helper function
  const validSuppliers = meta.suppliers.filter(s => isSupplierValidForCommodity(s, commodity));

  return (
    <main>
      <div style={{ marginBottom: 30 }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#111" }}>Market Analytics Explorer</h1>
        <p style={{ color: "#666" }}>Compare historical pricing by supplier, utility, and rate metric.</p>
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
                    onChange={(e) => setChartType(e.target.value as any)}
                    style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', cursor: 'pointer' }}
                >
                    <option value="line">Line Chart</option>
                    <option value="bar">Bar Chart</option>
                    <option value="area">Area Chart</option>
                    <option value="stacked">Stacked Bar</option>
                </select>
            </div>

            {/* Show/Hide Filters Toggle */}
            <button onClick={() => setShowFilters(!showFilters)} style={{ marginLeft: 'auto', ...textBtnStyle }}>
                {showFilters ? "Hide Filters ▲" : "Show Filters ▼"}
            </button>
        </div>

        {/* ROW 2: Filters (Collapsible) */}
        {showFilters && (
            <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap' }}>
                
                {/* Utility Dropdown (Single Select) */}
                <div style={{ flex: 1, minWidth: '250px' }}>
                    <p style={sectionHeaderStyle}>1. Select Utility</p>
                    <select 
                        value={selectedUtility} 
                        onChange={(e) => {
                            setSelectedUtility(e.target.value);
                            // Auto-select top 5 for the new utility
                            const topSuppliers = selectTop5Suppliers(rawData, e.target.value, commodity);
                            setSelectedSuppliers(topSuppliers);
                        }}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                    >
                        {validUtilities.map(u => (
                            <option key={u} value={u}>{u.replace(/-/g, ' ').toUpperCase()}</option>
                        ))}
                    </select>
                </div>

                {/* Supplier List (Multi Select) */}
                <div style={{ flex: 2, minWidth: '300px' }}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
                        <p style={sectionHeaderStyle}>2. Select Suppliers ({validSuppliers.length})</p>
                        <div style={{display: 'flex', gap: '8px'}}>
                            <button onClick={() => handleSelectAllSuppliers(true)} style={textBtnStyle}>All</button>
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

      {/* --- CHART --- */}
      <div style={{ height: 500, background: "white", padding: 20, borderRadius: 8, border: "1px solid #e5e7eb" }}>
        <ResponsiveContainer width="100%" height="100%">
           {renderChart()}
        </ResponsiveContainer>
      </div>

    </main>
  );
}

// --- STYLES ---
const controlPanelStyle = { background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #e5e7eb", marginBottom: "30px" };
const groupStyle = { display: "flex", alignItems: "center", gap: "10px" };
const toggleGroupStyle = { display: "flex", background: "#f3f4f6", padding: "4px", borderRadius: "6px", gap: "2px" };
const labelStyle = { fontSize: "13px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" as const };
const sectionHeaderStyle = { fontSize: "14px", fontWeight: 600, marginBottom: "10px", color: "#111" };
const scrollListStyle = { maxHeight: "200px", overflowY: "auto" as const, border: "1px solid #e5e7eb", borderRadius: "6px", padding: "10px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px" };
const checkboxLabelStyle = { display: "flex", gap: "8px", alignItems: "center", cursor: "pointer", userSelect: "none" as const };
const activeBtn = { padding: "6px 12px", borderRadius: 4, border: "none", background: "#3b82f6", color: "white", fontWeight: 600, cursor: "pointer", fontSize: "13px" };
const inactiveBtn = { padding: "6px 12px", borderRadius: 4, border: "none", background: "transparent", color: "#4b5563", cursor: "pointer", fontSize: "13px" };
const textBtnStyle = { background: 'none', border: 'none', color: '#3b82f6', fontSize: '12px', cursor: 'pointer', fontWeight: 500, padding: '0' };