"use client";

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store';

export default function Home() {
  const { isAuthenticated } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  // Wait for client-side mount + Zustand-persist hydration before redirecting.
  // Without this gate, the redirect fires on the server-rendered initial pass
  // (or before sessionStorage rehydrates), then again after hydration — which
  // looks like a refresh loop on static export.
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    // Use window.location.replace to do a clean hard navigation. router.push
    // from next/navigation is unreliable in static export when the source
    // route has a redirect-only useEffect — it can trigger soft-nav loops.
    window.location.replace(isAuthenticated ? '/dashboard' : '/login');
  }, [mounted, isAuthenticated]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-900">
      <div className="animate-pulse text-white text-xl">Loading...</div>
    </div>
  );
}
