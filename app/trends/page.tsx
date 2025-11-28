"use client";

import { useEffect, useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar
} from "recharts";

// --- HELPERS ---
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#f87171', '#fb923c'];

export default function TrendsPage() {
  const [trends, setTrends] = useState<Record<string, any[]>>({});
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [commodity, setCommodity] = useState<"electric" | "gas">("electric");
  const [visibleTrends, setVisibleTrends] = useState<Record<string, boolean>>({});

  // Helper to select all utilities for a specific commodity
  const selectAllForCommodity = (type: "electric" | "gas", currentTrends: Record<string, any[]>) => {
    const newVisibility: Record<string, boolean> = {};
    Object.keys(currentTrends).forEach((slug) => {
      const isGas = slug.includes("gas") || slug.includes("dominion") || slug.includes("columbia") || slug.includes("centerpoint");
      
      if (type === "gas" && isGas) {
        newVisibility[slug] = true;
      } else if (type === "electric" && !isGas) {
        newVisibility[slug] = true;
      }
    });
    setVisibleTrends(newVisibility);
  };

  // Handle switching commodity
  const handleCommodityChange = (newCommodity: "electric" | "gas") => {
    setCommodity(newCommodity);
    selectAllForCommodity(newCommodity, trends);
  };

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch Trends
        const trendsRes = await fetch("/api/trends");
        const trendsJson = await trendsRes.json();
        const fetchedTrends = trendsJson.trends || {};
        setTrends(fetchedTrends);

        // Default: Select ALL electric utilities
        selectAllForCommodity("electric", fetchedTrends);

        // Fetch Latest Offers (For the Bar Chart)
        const offersRes = await fetch("/api/offers/latest");
        const offersJson = await offersRes.json();
        setOffers(offersJson.offers || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // --- TREND DATA PREP ---
  const mergedTrendData = useMemo(() => {
    const activeSlugs = Object.keys(visibleTrends).filter(
      (slug) => visibleTrends[slug] && trends[slug]
    );
    if (activeSlugs.length === 0) return [];

    const dateMap = new Map<string, any>();

    activeSlugs.forEach((slug) => {
      trends[slug].forEach((dayData) => {
        const date = dayData.date;
        const currentEntry = dateMap.get(date) || { date };

        // Plot Local Median (Main Line)
        currentEntry[`${slug}_median`] = dayData.utilityMedian;
        // Plot Local Best (Dotted Line)
        currentEntry[`${slug}_best`] = dayData.localBestFixed;

        dateMap.set(date, currentEntry);
      });
    });

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [trends, visibleTrends]);

  // --- BAR CHART DATA PREP ---
  const barChartData = useMemo(() => {
    return offers
      .filter((o) => {
        const isElectric = o.unit === "¢/kWh";
        if (commodity === "electric" && !isElectric) return false;
        if (commodity === "gas" && isElectric) return false;
        if (o.is_intro || o.term_months < 6) return false; 
        return true;
      })
      .sort((a, b) => a.rate_cents_per_kwh - b.rate_cents_per_kwh)
      .slice(0, 10)
      .map((o) => ({
        supplier: o.supplier,
        rate: Number(o.rate_cents_per_kwh),
        utility: o.utility_name,
      }));
  }, [offers, commodity]);

  const trendKeys = Object.keys(trends).filter((key) =>
    commodity === "electric"
      ? !key.includes("gas") && !key.includes("dominion") && !key.includes("columbia") && !key.includes("centerpoint")
      : key.includes("gas") || key.includes("dominion") || key.includes("columbia") || key.includes("centerpoint")
  );

  if (loading) return <div style={{ padding: 40 }}>Loading visualization data...</div>;

  return (
    <main>
      <div style={{ marginBottom: 30, display: 'flex', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#111" }}>Historical Trends</h1>
        <div style={{ background: "#e5e7eb", padding: 4, borderRadius: 6, display: "flex", height: 'fit-content' }}>
            <button onClick={() => handleCommodityChange("electric")} style={commodity === "electric" ? activeBtn : inactiveBtn}>⚡️ Electric</button>
            <button onClick={() => handleCommodityChange("gas")} style={commodity === "gas" ? activeBtn : inactiveBtn}>🔥 Gas</button>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "15px", marginBottom: "20px", padding: "15px", background: "white", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
        {trendKeys.map((slug, index) => (
          <label key={slug} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={visibleTrends[slug] || false}
              onChange={() => setVisibleTrends((prev) => ({ ...prev, [slug]: !prev[slug] }))}
            />
            <span style={{ color: COLORS[index % COLORS.length], fontWeight: 600, textTransform: "uppercase", fontSize: "12px" }}>
              {slug.replace(/-/g, " ")}
            </span>
          </label>
        ))}
      </div>

      <div style={{ height: 500, background: "white", padding: 20, borderRadius: 8, border: "1px solid #e5e7eb" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={mergedTrendData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis domain={["auto", "auto"]} unit={commodity === "electric" ? "¢" : "$"} />
            <Tooltip />
            <Legend />
            
            {/* Local Median Lines */}
            {Object.keys(visibleTrends).filter(slug => visibleTrends[slug]).map((slug, index) => (
              <Line
                key={slug}
                type="monotone"
                dataKey={`${slug}_median`}
                stroke={COLORS[index % COLORS.length]}
                name={`${slug.toUpperCase()} Median`}
                strokeWidth={2}
                dot={false}
              />
            ))}

            {/* Local Best Lines (Dotted) */}
            {Object.keys(visibleTrends).filter(slug => visibleTrends[slug]).map((slug, index) => (
              <Line
                key={`${slug}_best`}
                type="monotone"
                dataKey={`${slug}_best`}
                stroke={COLORS[index % COLORS.length]}
                name={`${slug.toUpperCase()} Best`}
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
                legendType="none"
              />
            ))}

          </LineChart>
        </ResponsiveContainer>
      </div>
      
      {/* BAR CHART SECTION */}
      <div style={{ marginTop: 60 }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: 10 }}>Top 10 Cheapest Fixed Plans (Current)</h2>
        <div style={{ height: 400, background: "white", padding: 20, borderRadius: 8, border: "1px solid #e5e7eb" }}>
            <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barChartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" unit={commodity === "electric" ? "¢" : "$"} />
                <YAxis dataKey="supplier" type="category" width={140} style={{fontSize: '12px'}} />
                <Tooltip />
                <Bar dataKey="rate" fill="#10b981" name="Rate" />
            </BarChart>
            </ResponsiveContainer>
        </div>
      </div>
    </main>
  );
}

const activeBtn = { padding: "6px 12px", borderRadius: 4, border: "none", background: "#3b82f6", color: "white", fontWeight: 600, cursor: "pointer" };
const inactiveBtn = { padding: "6px 12px", borderRadius: 4, border: "none", background: "transparent", color: "#4b5563", cursor: "pointer" };