"use client";

import { useEffect, useState, useMemo } from "react";

// --- TYPES ---
type Offer = {
  utility_id: number;
  utility_name: string;
  supplier: string;
  plan: string;
  rate_cents_per_kwh: number;
  unit: string;
  term_months: number;
  monthly_fee: number;
  early_termination_fee: number;
  day: string;
  is_intro: boolean;
  signup_url?: string;
};

// --- CORE COMPONENT ---

export default function RatesPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters & Inputs
  const [commodity, setCommodity] = useState<"electric" | "gas">("electric");
  const [selectedUtilityId, setSelectedUtilityId] = useState<string>("all");
  const [usage, setUsage] = useState<number>(1000); 

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/offers/latest");
        const json = await res.json();
        setOffers(json.offers || []);
      } catch (err) {
        console.error("Failed to fetch rates", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // --- CORE FILTER & SORT LOGIC ---
  const finalOffers = useMemo(() => {
    // 1. Filtering
    let currentOffers = offers.filter((o) => {
      const isElectric = o.unit === "¢/kWh";
      if (commodity === "electric" && !isElectric) return false;
      if (commodity === "gas" && isElectric) return false;
      if (selectedUtilityId !== "all" && String(o.utility_id) !== selectedUtilityId) return false;
      return true;
    });

    // 2. Sorting (Hardcoded to Lowest Rate First)
    currentOffers.sort((a, b) => {
      const rateA = Number(a.rate_cents_per_kwh) || 0;
      const rateB = Number(b.rate_cents_per_kwh) || 0;
      return rateA - rateB;
    });

    return currentOffers;
  }, [offers, commodity, selectedUtilityId]);

  // --- CALCULATION HELPERS ---
  const calculateMonthlyCost = (offer: Offer) => {
    const rate = Number(offer.rate_cents_per_kwh);
    const fees = Number(offer.monthly_fee) || 0;
    
    if (offer.unit === "¢/kWh") {
      return ((rate / 100) * usage) + fees;
    } else {
      return (rate * usage) + fees;
    }
  };

  const generateCalendarLink = (offer: Offer) => {
    const months = offer.term_months || 12;
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + months);
    
    const isoDate = targetDate.toISOString().replace(/-|:|\.\d+/g, "");
    const title = encodeURIComponent(`Renew Energy Contract (${offer.supplier})`);
    const details = encodeURIComponent(`Your ${months}-month contract with ${offer.supplier} is ending.`);
    
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${isoDate}/${isoDate}&details=${details}`;
  };

  // --- DYNAMIC UTILITY OPTIONS ---
  const utilityOptions = useMemo(() => {
    const uniqueMap = new Map();
    offers.forEach((o) => {
      const isElectric = o.unit === "¢/kWh";
      if (commodity === "electric" && !isElectric) return;
      if (commodity === "gas" && isElectric) return;
      if (!uniqueMap.has(o.utility_id)) uniqueMap.set(o.utility_id, o.utility_name);
    });
    return Array.from(uniqueMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [offers, commodity]);

  if (loading) return <div style={{ padding: 40 }}>Loading latest rates...</div>;

  return (
    <main>
      <div style={{ marginBottom: 30 }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#111" }}>Current Market Rates</h1>
        <p style={{ color: "#666" }}>Live offers scraped from Energy Choice Ohio.</p>
      </div>

      {/* TOOLBAR */}
      <div style={toolbarStyle}>
        {/* Left Group: Toggles */}
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
            <div style={groupStyle}>
            <span style={labelStyle}>Energy Type:</span>
            <div style={toggleGroupStyle}>
                <button onClick={() => handleCommodityChange("electric")} style={commodity === "electric" ? activeBtn : inactiveBtn}>⚡️ Electric</button>
                <button onClick={() => handleCommodityChange("gas")} style={commodity === "gas" ? activeBtn : inactiveBtn}>🔥 Gas</button>
            </div>
            </div>

            <div style={groupStyle}>
            <span style={labelStyle}>Filter by Utility:</span>
            <select value={selectedUtilityId} onChange={(e) => setSelectedUtilityId(e.target.value)} style={selectStyle}>
                <option value="all">View All Providers</option>
                {utilityOptions.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
            </select>
            </div>
        </div>

        {/* Right Group: Calculator */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#eff6ff", padding: "8px 12px", borderRadius: "8px", border: "1px solid #dbeafe" }}>
            <span style={{...labelStyle, color: "#1e40af"}}>
                Monthly Usage ({commodity === 'electric' ? 'kWh' : 'Units'}):
            </span>
            <input 
                type="number" 
                value={usage} 
                onChange={(e) => setUsage(Number(e.target.value))}
                style={inputStyle}
            />
        </div>
      </div>

      {/* TABLE */}
      <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 8, background: "white" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
              <th style={thStyle}>Utility</th>
              <th style={thStyle}>Supplier</th>
              <th style={thStyle}>Plan</th>
              <th style={thStyle}>Rate</th>
              <th style={thStyle}>Est. Monthly Bill</th>
              <th style={thStyle}>Term</th>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Action</th>
            </tr>
          </thead>
          <tbody>
            {finalOffers.map((offer, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ ...tdStyle, fontWeight: 500, color: "#111" }}>{offer.utility_name}</td>
                <td style={tdStyle}>{offer.supplier}</td>
                <td style={tdStyle}>{offer.plan}</td>
                
                {/* RATE COLUMN */}
                <td style={{ ...tdStyle, fontWeight: 700, color: "#10b981" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>
                      {offer.unit === "¢/kWh"
                        ? `${offer.rate_cents_per_kwh}¢`
                        : `$${Number(offer.rate_cents_per_kwh).toFixed(2)}`}
                    </span>
                    {offer.is_intro && (
                      <span style={badgeStyle}>INTRO</span>
                    )}
                  </div>
                </td>

                {/* ESTIMATED COST COLUMN */}
                <td style={{ ...tdStyle, fontWeight: 600, color: "#111" }}>
                    ${calculateMonthlyCost(offer).toFixed(2)}
                    {Number(offer.monthly_fee) > 0 && <span style={{fontSize: "10px", color: "#666", display: "block", fontWeight: 400}}>(incl. ${offer.monthly_fee} fee)</span>}
                </td>

                <td style={tdStyle}>
                  {offer.term_months > 0 ? `${offer.term_months} mo` : "Month-to-Month"}
                </td>

                {/* DATE COLUMN */}
                <td style={{ ...tdStyle, fontSize: "12px", color: "#9ca3af" }}>
                  {new Date(offer.day).toLocaleDateString()}
                </td>

                {/* ACTION COLUMN */}
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {offer.signup_url && (
                        <a href={offer.signup_url} target="_blank" rel="noopener noreferrer" style={signUpBtnStyle} title="Go to supplier website">Sign Up ↗</a>
                    )}
                    
                    {offer.term_months > 0 && (
                        <a href={generateCalendarLink(offer)} target="_blank" rel="noopener noreferrer" style={reminderBtnStyle} title="Set a calendar reminder">📅</a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {finalOffers.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>No offers found for this selection.</div>
        )}
      </div>
    </main>
  );
}

// --- STYLES ---
const toolbarStyle = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  background: "white", padding: "16px", borderRadius: "8px", marginBottom: "20px",
  border: "1px solid #e5e7eb", flexWrap: "wrap" as const, gap: "15px"
};
const groupStyle = {
  display: "flex", 
  alignItems: "center", 
  gap: "12px" 
}; 
const toggleGroupStyle = { 
  display: "flex", 
  background: "#e5e7eb", 
  padding: 4, 
  borderRadius: 6, 
  gap: 2 
};
const activeBtn = { padding: "6px 12px", borderRadius: 4, border: "none", background: "#3b82f6", color: "white", fontWeight: 600, cursor: "pointer" };
const inactiveBtn = { padding: "6px 12px", borderRadius: 4, border: "none", background: "transparent", color: "#4b5563", cursor: "pointer" };
const selectStyle = { padding: "8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: "14px", minWidth: 200, cursor: "pointer" };
const inputStyle = { padding: "8px", borderRadius: 6, border: "1px solid #93c5fd", fontSize: "14px", width: "100px", fontWeight: 600 };
const labelStyle = { fontWeight: 600, fontSize: "14px", color: "#374151" };
const thStyle = { padding: "12px 16px", fontSize: "12px", textTransform: 'uppercase' as const, color: "#6b7280", fontWeight: 600 };
const tdStyle = { padding: "14px 16px", fontSize: "14px", color: "#4b5563" };
const badgeStyle = { fontSize: "9px", background: "#dbeafe", color: "#1e40af", padding: "2px 4px", borderRadius: "4px", fontWeight: 700 };
const reminderBtnStyle = { 
    fontSize: "16px", 
    background: "transparent", 
    color: "#374151", 
    padding: "4px", 
    borderRadius: "4px", 
    textDecoration: "none", 
    display: "inline-block",
    cursor: "pointer"
};
const signUpBtnStyle = {
    fontSize: "12px", 
    background: "#10b981", 
    color: "white", 
    padding: "6px 12px", 
    borderRadius: "6px", 
    textDecoration: "none", 
    fontWeight: 600,
    display: "inline-block",
    whiteSpace: "nowrap" as const
};