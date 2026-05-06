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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
