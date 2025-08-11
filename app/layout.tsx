export const metadata = {
  title: "FairPower Ohio – API",
  description: "Backend API for FairPowerOhio.com"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "ui-sans-serif, system-ui" }}>
        {children}
      </body>
    </html>
  );
}
