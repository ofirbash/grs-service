import type { Metadata } from "next";
import Script from "next/script";
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
        {/*
          Polyfills for older iOS / Safari (iOS 12 = iPad Mini 2 etc).
          Cloudflare's polyfill.io mirror only ships the APIs the
          requesting User-Agent is missing, so modern devices get an
          empty/near-empty response and pay no cost. Loaded with
          strategy="beforeInteractive" so Next.js injects it BEFORE
          our React bundle runs — without that ordering the bundle
          would already have thrown a ReferenceError on iOS 12 by the
          time the polyfill arrived.

          Why a polyfill instead of just lowering browserslist? Next.js
          compiles down JS syntax for older browsers, but it does NOT
          add runtime API polyfills (Object.hasOwn, Array.prototype.at,
          structuredClone, String.prototype.replaceAll, Promise.any,
          Promise.allSettled, BigInt, …). The polyfill bundle fills
          exactly those gaps. Feb 28 2026 report: iPad Mini 2 (Safari
          12) showed "Application error: a client side exception" on
          every page → this is the fix.
        */}
        <Script
          src="https://cdnjs.cloudflare.com/polyfill/v3/polyfill.min.js?features=es2017,es2018,es2019,es2020,es2021,es2022,Array.prototype.at,Object.hasOwn,String.prototype.replaceAll,structuredClone,Promise.any,Promise.allSettled"
          strategy="beforeInteractive"
        />
      </head>
      <body className="antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
