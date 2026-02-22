import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GRS Global - Lab Logistics ERP",
  description: "Laboratory logistics and ERP management system for gemstone testing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
