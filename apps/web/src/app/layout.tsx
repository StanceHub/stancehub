import type { ReactNode } from "react";

export const metadata = {
  title: "StanceHub",
  description: "Organizational meeting memory (MVP)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: 24 }}>
        <header style={{ marginBottom: 24 }}>
          <strong>StanceHub</strong>
          <span style={{ marginLeft: 12, color: "#666" }}>MVP · stub UI</span>
        </header>
        {children}
      </body>
    </html>
  );
}
