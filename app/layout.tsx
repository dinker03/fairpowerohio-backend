import Link from "next/link";
import "./globals.css";

export const metadata = {
  title: "Fair Energy Ohio",
  description: "Track Ohio energy rates, compare suppliers, and explore market trends.",
  icons: {
    icon: "/icon.svg",
  },
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
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "12px", textDecoration: "none" }}>
            <span style={{ fontSize: "20px" }}>⚡️</span>
            <span style={{ fontWeight: 700, fontSize: "18px", color: "#111827" }}>Fair Energy Ohio</span>
          </Link>
          
          <div style={{ display: "flex", gap: "24px" }}>
            <Link href="/" style={navLinkStyle}>🏠 Home</Link>
            <Link href="/current-rates" style={navLinkStyle}>📋 Current Rates</Link>
            <Link href="/trends" style={navLinkStyle}>📊 Historical Trends</Link>
          </div>
        </nav>

        {/* PAGE CONTENT */}
        {children}
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