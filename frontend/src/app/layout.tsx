import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bashari Lab-Direct",
  description: "Lab logistics and ERP management system by Bashari",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
