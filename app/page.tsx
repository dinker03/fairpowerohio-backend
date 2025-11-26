"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default function Page() {
  const [trends, setTrends] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // 1. Fetch Trends (History)
        const trendsRes = await fetch("/api/trends");
        const trendsJson = await trendsRes.json();
        
        // Transform the dictionary into an array for the chart
        // Assuming key 'aep-ohio:elec:res:term12' exists from your API logic
        const key = Object.keys(trendsJson.sampleTrends || {})[0];
        const chartData = trendsJson.sampleTrends[key] || [];
        setTrends(chartData);

        // 2. Fetch Latest Offers (Current Market)
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
  }, []);

  if (loading) return <div style={{ padding: 40 }}>Loading data...</div>;

  return (
    <main style={{ padding: 40, fontFamily: "system-ui, sans-serif", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 10 }}>⚡️ FairPower Ohio Admin</h1>
      <p style={{ color: "#666", marginBottom: 40 }}>
        Live view of your Neon Database.
      </p>

      {/* --- SECTION 1: TRENDS CHART --- */}
      <section style={{ marginBottom: 60 }}>
        <h2 style={{ borderBottom: "1px solid #eee", paddingBottom: 10 }}>
          📊 12-Month Rate Trends
        </h2>
        <div style={{ height: 400, marginTop: 20, backgroundColor: "#f9f9f9", padding: 20, borderRadius: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={['auto', 'auto']} unit="¢" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="bestFixed" stroke="#10b981" name="Best Fixed" strokeWidth={3} />
              <Line type="monotone" dataKey="medianFixed" stroke="#6366f1" name="Median" strokeWidth={2} />
              <Line type="monotone" dataKey="ptc" stroke="#ef4444" name="Price to Compare" strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* --- SECTION 2: LIVE OFFERS TABLE --- */}
      <section>
        <h2 style={{ borderBottom: "1px solid #eee", paddingBottom: 10 }}>
          📋 Live Offers (Scraped Today)
        </h2>
        <div style={{ overflowX: "auto", marginTop: 20 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ backgroundColor: "#f3f4f6" }}>
                <th style={thStyle}>Supplier</th>
                <th style={thStyle}>Plan Type</th>
                <th style={thStyle}>Rate (¢/kWh)</th>
                <th style={thStyle}>Term (Mo)</th>
                <th style={thStyle}>Monthly Fee</th>
                <th style={thStyle}>Date Scraped</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={tdStyle}>{offer.supplier}</td>
                  <td style={tdStyle}>{offer.plan}</td>
                  <td style={{ ...tdStyle, fontWeight: "bold", color: "#10b981" }}>
                    {offer.rate_cents_per_kwh}¢
                  </td>
                  <td style={tdStyle}>{offer.term_months}</td>
                  <td style={tdStyle}>
                    {offer.monthly_fee ? `$${offer.monthly_fee}` : "-"}
                  </td>
                  <td style={tdStyle}>
                    {new Date(offer.day).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {offers.length === 0 && <p>No offers found.</p>}
        </div>
      </section>
    </main>
  );
}

// Simple styles
const thStyle = { padding: "12px 16px", fontSize: "14px", fontWeight: "600", color: "#374151" };
const tdStyle = { padding: "12px 16px", fontSize: "14px", color: "#4b5563" };