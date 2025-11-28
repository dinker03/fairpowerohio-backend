import Link from "next/link";
import "./globals.css";

export const metadata = {
  title: "FairPower Ohio Admin",
  description: "Internal dashboard for monitoring energy rates",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f9fafb", minHeight: "100vh" }}>
        
        {/* SHARED NAVIGATION BAR */}
        <nav style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "20px" }}>⚡️</span>
            <span style={{ fontWeight: 700, fontSize: "18px", color: "#111827" }}>FairPower Ohio</span>
          </div>
          
          <div style={{ display: "flex", gap: "24px" }}>
            <Link href="/" style={navLinkStyle}>📋 Current Rates</Link>
            <Link href="/trends" style={navLinkStyle}>📊 Historical Trends</Link>
          </div>
        </nav>

        {/* PAGE CONTENT */}
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px" }}>
          {children}
        </div>
      </body>
    </html>
  );
}

const navLinkStyle = {
  textDecoration: "none",
  color: "#4b5563",
  fontWeight: 500,
  fontSize: "14px",
};