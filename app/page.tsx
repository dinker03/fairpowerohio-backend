"use client";

import { useEffect, useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function Page() {
  const [trends, setTrends] = useState<Record<string, any[]>>({});
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [commodity, setCommodity] = useState("electric");
  const [selectedUtilityId, setSelectedUtilityId] = useState<string>("all");

  useEffect(() => {
    async function fetchData() {
      try {
        const trendsRes = await fetch("/api/trends");
        const trendsJson = await trendsRes.json();
        setTrends(trendsJson.trends || {});

        const offersRes = await fetch("/api/offers/latest");
        const offersJson = await offersRes.json();
        setOffers(offersJson.offers || []);
      } catch (err) { console.error(err); } 
      finally { setLoading(false); }
    }
    fetchData();
  }, []);

  // --- DYNAMIC FILTERS ---
  const utilityOptions = useMemo(() => {
    const uniqueMap = new Map();
    offers.forEach(o => {
      const isElectric = o.unit === '¢/kWh';
      if (commodity === 'electric' && !isElectric) return;
      if (commodity === 'gas' && isElectric) return;
      if (!uniqueMap.has(o.utility_id)) uniqueMap.set(o.utility_id, o.utility_name);
    });
    return Array.from(uniqueMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [offers, commodity]);

  const filteredOffers = useMemo(() => {
    return offers.filter(o => {
      const isElectric = o.unit === '¢/kWh';
      if (commodity === 'electric' && !isElectric) return false;
      if (commodity === 'gas' && isElectric) return false;
      if (selectedUtilityId !== "all" && String(o.utility_id) !== selectedUtilityId) return false;
      return true;
    });
  }, [offers, commodity, selectedUtilityId]);

  // --- CHART LOGIC ---
  // Pick a utility to show trends for. If "All" selected, pick the first one in the list.
  const chartUtilitySlug = useMemo(() => {
    if (selectedUtilityId !== "all") {
      // Find the slug from the offers
      const match = offers.find(o => String(o.utility_id) === selectedUtilityId);
      // We need the slug (e.g. 'dominion-energy') not the name. 
      // NOTE: For now, the API keys trends by SLUG. The Frontend has ID.
      // We might need to guess the key or update API to return ID keys.
      // Let's rely on the first available key for the commodity:
      return null; 
    }
    return null;
  }, [selectedUtilityId, offers]);

  // Fallback: Just grab the first trend key that matches our commodity
  const activeTrendData = useMemo(() => {
    const targetKeys = Object.keys(trends);
    // Simple heuristic: Electric keys usually 'aep', 'edison'. Gas keys 'dominion', 'columbia'.
    // Better: Check the unit of the utility in the offers?
    // Let's hardcode defaults for the main chart:
    const defaultElec = 'aep-ohio';
    const defaultGas = 'dominion-energy';
    
    // If user selected a specific provider, try to match it (fuzzy match logic)
    // For V1, let's just show the Benchmark.
    return commodity === 'electric' ? trends[defaultElec] : trends[defaultGas];
  }, [trends, commodity]);

  if (loading) return <div style={{ padding: 40 }}>Loading data...</div>;

  return (
    <main style={{ padding: 40, fontFamily: "system-ui, sans-serif", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ marginBottom: 10 }}>⚡️ Fair Energy Ohio Admin</h1>
        <p style={{ color: "#666" }}>Live view of your Neon Database.</p>
      </div>

      {/* --- CHART --- */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ borderBottom: "1px solid #eee", paddingBottom: 10 }}>
          📊 Rate Trends ({commodity === 'electric' ? 'AEP Ohio' : 'Dominion Energy'} Benchmark)
        </h2>
        <div style={{ height: 350, marginTop: 20, backgroundColor: "#f9f9f9", padding: 20, borderRadius: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={activeTrendData || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={['auto', 'auto']} unit={commodity === 'electric' ? '¢' : '$'} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="bestFixed" stroke="#10b981" name="Best Fixed" strokeWidth={3} />
              <Line type="monotone" dataKey="medianFixed" stroke="#6366f1" name="Median" strokeWidth={2} />
              <Line type="monotone" dataKey="ptc" stroke="#ef4444" name="Price to Compare" strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* --- TOOLBAR --- */}
      <section style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#f3f4f6", padding: "16px", borderRadius: "8px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{fontWeight: 600, fontSize: "14px", marginRight: 8, color: "#4b5563"}}>Energy Type:</span>
            <div style={{ background: "#fff", padding: 4, borderRadius: 6, display: "flex", border: "1px solid #d1d5db" }}>
              <button onClick={() => { setCommodity("electric"); setSelectedUtilityId("all"); }} style={commodity === "electric" ? activeBtn : inactiveBtn}>⚡️ Electric</button>
              <button onClick={() => { setCommodity("gas"); setSelectedUtilityId("all"); }} style={commodity === "gas" ? activeBtn : inactiveBtn}>🔥 Natural Gas</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{fontWeight: 600, fontSize: "14px", color: "#4b5563"}}>Filter by Provider:</span>
            <select value={selectedUtilityId} onChange={(e) => setSelectedUtilityId(e.target.value)} style={selectStyle}>
              <option value="all">View All Providers</option>
              {utilityOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* --- TABLE --- */}
      <section>
        <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={thStyle}>Utility</th>
                <th style={thStyle}>Supplier</th>
                <th style={thStyle}>Plan</th>
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
                        <span style={{ fontSize: "9px", background: "#dbeafe", color: "#1e40af", padding: "2px 4px", borderRadius: "4px", textTransform: "uppercase", fontWeight: 700 }}>
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
        </div>
      </section>
    </main>
  );
}

const activeBtn = { padding: "6px 12px", borderRadius: 4, border: "none", background: "#3b82f6", color: "white", fontWeight: "600", cursor: "pointer" };
const inactiveBtn = { padding: "6px 12px", borderRadius: 4, border: "none", background: "transparent", color: "#4b5563", cursor: "pointer" };
const selectStyle = { padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", fontSize: "14px", cursor: "pointer", minWidth: "200px" };
const thStyle = { padding: "12px 16px", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#6b7280" };
const tdStyle = { padding: "14px 16px", fontSize: "14px", color: "#4b5563" };