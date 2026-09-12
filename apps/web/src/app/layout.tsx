import type { ReactNode } from "react";

export const metadata = {
  title: "StanceHub",
  description: "Organizational meeting memory",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: 24 }}>
        <header style={{ marginBottom: 24 }}>
          <strong>StanceHub</strong>
        </header>
        {children}
      </body>
    </html>
  );
}
