"use client";

import { useEffect, useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar
} from "recharts";

// Utility Slugs for setting initial state
const UTILITY_SLUGS = [
  'aep-ohio', 'toledo-edison', 'duke-energy-electric', 
  'illuminating-company', 'ohio-edison', 'aes-ohio', 
  'dominion-energy', 'columbia-gas', 'duke-energy-gas', 'centerpoint-energy'
];

const ELECTRIC_SLUGS = UTILITY_SLUGS.filter(s => s.includes('ohio') || s.includes('edison') || s.includes('company'));
const GAS_SLUGS = UTILITY_SLUGS.filter(s => s.includes('gas') || s.includes('dominion') || s.includes('columbia') || s.includes('centerpoint'));

// Helper to assign a stable color to each trend line
const COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d',
  '#f87171', '#fb923c', '#a855f7', '#ec4899',
];

// ------------------- Components -------------------

// --- 1. Trends Filter Component ---
const TrendsFilter = ({ trends, visibleTrends, setVisibleTrends, commodity }: {
  trends: Record<string, any[]>,
  visibleTrends: Record<string, boolean>,
  setVisibleTrends: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
  commodity: string
}) => {
  const handleToggle = (slug: string) => {
    setVisibleTrends(prev => ({
      ...prev,
      [slug]: !prev[slug],
    }));
  };

  const trendKeys = Object.keys(trends).filter(key => 
    commodity === 'electric' 
      ? ELECTRIC_SLUGS.includes(key)
      : GAS_SLUGS.includes(key)
  );

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px 25px', marginTop: '15px', padding: '10px 0' }}>
      <p style={{ margin: 0, fontWeight: 600, color: '#4b5563', width: '100%', fontSize: '14px' }}>
        Visible Trend Lines (Best Fixed Rate):
      </p>
      {trendKeys.map((slug, index) => (
        <label key={slug} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={visibleTrends[slug] || false}
            onChange={() => handleToggle(slug)}
            style={{ marginRight: '5px', accentColor: COLORS[index % COLORS.length] }}
          />
          <span style={{ color: COLORS[index % COLORS.length], fontWeight: 500, fontSize: '14px' }}>
            {slug.replace(/-/g, ' ').toUpperCase()}
          </span>
        </label>
      ))}
    </div>
  );
};


// --- 2. Bar Chart Component for Current Offers (with Custom Tooltip) ---
const OffersBarChart = ({ offers, commodity, utilityOptions }: { 
    offers: any[], 
    commodity: string, 
    utilityOptions: { id: number, name: string }[] 
}) => {
    
    // Defensive utility mapping for the tooltip
    const utilityMap = useMemo(() => {
        return (utilityOptions || []).reduce((map, u) => { 
            map[u.id] = u.name;
            return map;
        }, {} as Record<number, string>);
    }, [utilityOptions]);
    
    // Only take the top 10 cheapest non-intro offers for readability
    const chartData = offers
      .filter(o => !o.is_intro && o.term_months >= 6) // Filter out intro and month-to-month
      .sort((a, b) => a.rate_cents_per_kwh - b.rate_cents_per_kwh)
      .slice(0, 10)
      .map(o => ({
        supplier: o.supplier,
        utility_id: o.utility_id, 
        plan: o.plan,
        term: o.term_months,
        rate: Number(o.rate_cents_per_kwh),
      }));

    if (chartData.length === 0) return <p style={{ padding: 20, textAlign: 'center' }}>No long-term fixed offers found for this filter.</p>;

    const unit = commodity === 'electric' ? '¢' : '$';

    // Custom Tooltip component for detailed information
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            const utilityName = utilityMap[data.utility_id] || 'N/A';
            
            return (
                <div style={{ backgroundColor: '#fff', border: '1px solid #ccc', padding: '10px', fontSize: '13px', borderRadius: '4px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                    <p style={{ fontWeight: 'bold', margin: '0 0 5px 0', color: '#333' }}>{data.supplier}</p>
                    <p style={{ margin: 0, color: '#666' }}>Provider: {utilityName}</p>
                    <p style={{ margin: 0, color: '#666' }}>Plan: {data.plan}</p>
                    <p style={{ margin: 0, color: '#666' }}>Term: {data.term} months</p>
                    <p style={{ margin: 0, color: '#10b981', fontWeight: 'bold' }}>Rate: {data.rate}{unit}</p>
                </div>
            );
        }
        return null;
    };


    return (
        <div style={{ height: 350, marginTop: 20, padding: '20px 0' }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ left: 5, right: 30, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    
                    {/* AXIS FLIP: Amount on Y, Supplier on X */}
                    <XAxis dataKey="supplier" type="category" interval={0} angle={-25} textAnchor="end" height={65} />
                    <YAxis type="number" unit={unit} domain={[0, 'auto']} width={40} />
                    
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="rate" fill="#10b981" name="Rate" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};
// ------------------- End Components -------------------


export default function Page() {
  const [trends, setTrends] = useState<Record<string, any[]>>({});
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [commodity, setCommodity] = useState("electric");
  const [selectedUtilityId, setSelectedUtilityId] = useState<string>("all");
  const [visibleTrends, setVisibleTrends] = useState<Record<string, boolean>>({});

  // Utility to map all electric slugs to true on initial load
  const initialElectricTrends = useMemo(() => {
    return ELECTRIC_SLUGS.reduce((acc, slug) => ({ ...acc, [slug]: true }), {});
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const trendsRes = await fetch("/api/trends");
        const trendsJson = await trendsRes.json();
        const fetchedTrends = trendsJson.trends || {};
        setTrends(fetchedTrends);

        // --- FIX: Set ALL ELECTRIC trends visible by DEFAULT ---
        if (Object.keys(fetchedTrends).length > 0) {
            setVisibleTrends(initialElectricTrends);
        }

        const offersRes = await fetch("/api/offers/latest");
        const offersJson = await offersRes.json();
        setOffers(offersJson.offers || []);
        
      } catch (err) {
        console.error("Failed to fetch data", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [initialElectricTrends]);

  // --- MERGE TREND DATA FOR CHART ---
  const mergedTrendData = useMemo(() => {
    const activeSlugs = Object.keys(visibleTrends).filter(slug => visibleTrends[slug] && trends[slug]);
    if (activeSlugs.length === 0) return [];
    
    const dateMap = new Map<string, any>();

    activeSlugs.forEach(slug => {
        trends[slug].forEach(dayData => {
            const date = dayData.date;
            const currentEntry = dateMap.get(date) || { date };

            // We use Best Fixed for comparison
            currentEntry[`${slug}_bestFixed`] = dayData.bestFixed;
            
            dateMap.set(date, currentEntry);
        });
    });

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [trends, visibleTrends]);


  // --- TABLE FILTER LOGIC ---
  const filteredOffers = useMemo(() => {
    return offers.filter(o => {
      const isElectric = o.unit === '¢/kWh';
      if (commodity === 'electric' && !isElectric) return false;
      if (commodity === 'gas' && isElectric) return false;
      if (selectedUtilityId !== "all" && String(o.utility_id) !== selectedUtilityId) return false;
      return true;
    });
  }, [offers, commodity, selectedUtilityId]);


  // --- DROPDOWN OPTIONS ---
  const utilityOptions = useMemo(() => {
    const uniqueMap = new Map();
    offers.forEach(o => {
      const isElectric = o.unit === '¢/kWh';
      if (commodity === 'electric' && !isElectric) return;
      if (commodity === 'gas' && isElectric) return;
      if (!uniqueMap.has(o.utility_id)) uniqueMap.set(o.utility_id, o.utility_name);
    });

    return Array.from(uniqueMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [offers, commodity]);


  // --- HANDLER TO RESET TREND VISIBILITY ON COMMODITY TOGGLE ---
  const handleCommodityToggle = (newCommodity: 'electric' | 'gas') => {
    setCommodity(newCommodity);
    setSelectedUtilityId("all"); 

    if (newCommodity === 'electric') {
        // Select all electric trends by default
        setVisibleTrends(initialElectricTrends);
    } else {
        // Select all gas trends by default
        const initialGasTrends = GAS_SLUGS.reduce((acc, slug) => ({ ...acc, [slug]: true }), {});
        setVisibleTrends(initialGasTrends);
    }
  };


  if (loading) return <div style={{ padding: 40 }}>Loading data...</div>;

  return (
    <main style={{ padding: 40, fontFamily: "system-ui, sans-serif", maxWidth: 1200, margin: "0 auto" }}>
      
      {/* --- HEADER --- */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ marginBottom: 10 }}>⚡️ FairPower Ohio Admin</h1>
        <p style={{ color: "#666" }}>Live view of your Neon Database.</p>
      </div>

      {/* --- TRENDS CHART SECTION --- */}
      <section style={{ marginBottom: 40 }}>
          <h2 style={{ borderBottom: "1px solid #eee", paddingBottom: 10 }}>
            📊 Comparative Rate Trends
          </h2>

          {/* New Checkbox Filter Component */}
          <TrendsFilter 
              trends={trends} 
              visibleTrends={visibleTrends} 
              setVisibleTrends={setVisibleTrends} 
              commodity={commodity} 
          />

          <div style={{ height: 350, marginTop: 20, backgroundColor: "#f9f9f9", padding: 20, borderRadius: 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mergedTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={['auto', 'auto']} unit={commodity === 'electric' ? '¢' : '$'} />
                <Tooltip />
                <Legend />
                
                {/* Dynamically render lines for each visible trend */}
                {Object.keys(visibleTrends).filter(slug => visibleTrends[slug]).map((slug, index) => (
                    <Line 
                        key={slug}
                        type="monotone" 
                        dataKey={`${slug}_bestFixed`} 
                        stroke={COLORS[index % COLORS.length]} 
                        name={`${slug.replace(/-/g, ' ').toUpperCase()} (Best Fixed)`}
                        strokeWidth={2}
                        dot={true}
                    />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
      </section>

      {/* --- INDIVIDUAL SUPPLIER COMPARISON BAR CHART --- */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ borderBottom: "1px solid #eee", paddingBottom: 10 }}>
            📉 Top 10 Cheapest Offers ({commodity === 'electric' ? 'Electric' : 'Gas'})
        </h2>
        <OffersBarChart offers={filteredOffers} commodity={commodity} utilityOptions={utilityOptions} />
      </section>


      {/* --- TOOLBAR --- */}
      <section style={{ marginBottom: 20 }}>
        <div style={{ 
          display: "flex", justifyContent: "space-between", alignItems: "center", 
          backgroundColor: "#f3f4f6", padding: "16px", borderRadius: "8px",
          border: "1px solid #e5e7eb"
        }}>
          
          {/* Left: Commodity Toggle */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{fontWeight: 600, fontSize: "14px", marginRight: 8, color: "#4b5563"}}>Energy Type:</span>
            <div style={{ background: "#fff", padding: 4, borderRadius: 6, display: "flex", border: "1px solid #d1d5db" }}>
              <button onClick={() => handleCommodityToggle("electric")} style={commodity === "electric" ? activeBtn : inactiveBtn}>⚡️ Electric</button>
              <button onClick={() => handleCommodityToggle("gas")} style={commodity === "gas" ? activeBtn : inactiveBtn}>🔥 Natural Gas</button>
            </div>
          </div>

          {/* Right: Utility Filter */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{fontWeight: 600, fontSize: "14px", color: "#4b5563"}}>Filter by Provider:</span>
            <select value={selectedUtilityId} onChange={(e) => setSelectedUtilityId(e.target.value)} style={selectStyle}>
              <option value="all">View All Providers</option>
              {utilityOptions.map(u => (<option key={u.id} value={u.id}>{u.name}</option>))}
            </select>
          </div>
        </div>
      </section>

      {/* --- LIVE OFFERS TABLE --- */}
      <section>
        <h2 style={{ paddingBottom: 10, fontSize: "18px" }}>
          📋 Live Offers <span style={{color: "#6b7280", fontWeight: "normal"}}>({filteredOffers.length} rows)</span>
        </h2>
        <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={thStyle}>Utility (Provider)</th>
                <th style={thStyle}>Supplier</th>
                <th style={thStyle}>Plan Type</th>
                <th style={thStyle}>Rate</th>
                <th style={thStyle}>Term</th>
                <th style={thStyle}>Fees</th>
                <th style={thStyle}>Scraped</th>
              </tr>
            </thead>
            <tbody>
              {filteredOffers.map((offer, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #eee", backgroundColor: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ ...tdStyle, fontWeight: 500, color: "#111" }}>{offer.utility_name}</td>
                  <td style={tdStyle}>{offer.supplier}</td>
                  <td style={tdStyle}>{offer.plan}</td>
                  <td style={{ ...tdStyle, fontWeight: "bold", color: "#10b981" }}>
                     <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span>
                        {offer.unit === '¢/kWh' 
                          ? `${offer.rate_cents_per_kwh}¢` 
                          : `$${Number(offer.rate_cents_per_kwh).toFixed(2)} / ${offer.unit.split('/')[1]}`
                        }
                      </span>
                      {offer.is_intro && (
                        <span style={{ fontSize: "9px", background: "#dbeafe", color: "#1e40af", padding: "2px 4px", borderRadius: "4px", textTransform: "uppercase" as const, fontWeight: 700 }}>
                          INTRO
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={tdStyle}>{offer.term_months > 0 ? `${offer.term_months} mo` : "Month-to-Month"}</td>
                  <td style={tdStyle}>
                    {Number(offer.monthly_fee) > 0 ? <span style={{color: "#d97706"}}>${offer.monthly_fee}/mo</span> : 
                     Number(offer.early_termination_fee) > 0 ? <span style={{color: "#6b7280"}}>${offer.early_termination_fee} ETF</span> : 
                     <span style={{color: "#d1d5db"}}>-</span>}
                  </td>
                  <td style={{...tdStyle, fontSize: "12px", color: "#9ca3af"}}>{new Date(offer.day).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredOffers.length === 0 && (
            <p style={{ padding: 40, textAlign: "center", color: "#888", fontStyle: "italic" }}>
              No offers found for this selection.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

// Styles
const activeBtn = { padding: "6px 12px", borderRadius: 4, border: "none", background: "#3b82f6", color: "white", fontWeight: "600", cursor: "pointer" };
const inactiveBtn = { padding: "6px 12px", borderRadius: 4, border: "none", background: "transparent", color: "#4b5563", cursor: "pointer" };
const selectStyle = { padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", fontSize: "14px", cursor: "pointer", minWidth: "200px" };
const thStyle = { padding: "12px 16px", fontSize: "12px", textTransform: "uppercase" as const, letterSpacing: "0.05em", color: "#6b7280" };
const tdStyle = { padding: "14px 16px", fontSize: "14px", color: "#4b5563" };