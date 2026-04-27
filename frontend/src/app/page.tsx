"use client";

/**
 * SPA-fallback router (deploy-environment workaround).
 *
 * Production's static-file server serves THIS root `index.html` for every
 * non-asset URL. That means hitting /login, /dashboard, /dashboard/jobs etc.
 * all load the same HTML and same root chunk. Without the routing logic
 * below, the home page would just blindly redirect to /login on every load,
 * the server would respond with this same HTML again, and the browser would
 * be stuck in a hard-reload loop.
 *
 * This component reads the actual URL the user is on and dynamically loads
 * the right route component for it. Once the user is authenticated and
 * inside the dashboard layout, Next.js's own router handles in-app
 * navigation normally (it doesn't need to round-trip to the server).
 */

import { useEffect, useState, lazy, Suspense, ComponentType } from 'react';
import { useAuthStore } from '@/lib/store';

const LoginPage = lazy(() => import('./login/page'));
const SetupPasswordPage = lazy(() => import('./setup-password/page'));
const PayPage = lazy(() => import('./pay/page'));
const DashboardLayout = lazy(() => import('./dashboard/layout'));
const DashboardHome = lazy(() => import('./dashboard/page'));
const JobsPage = lazy(() => import('./dashboard/jobs/page'));
const StonesPage = lazy(() => import('./dashboard/stones/page'));
const ClientsPage = lazy(() => import('./dashboard/clients/page'));
const ShipmentsPage = lazy(() => import('./dashboard/shipments/page'));
const SettingsPage = lazy(() => import('./dashboard/settings/page'));

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-navy-900">
    <div className="animate-pulse text-white text-xl">Loading...</div>
  </div>
);

/** Resolve which dashboard page to show for the given pathname. */
function pickDashboardPage(pathname: string): ComponentType {
  if (pathname.startsWith('/dashboard/jobs')) return JobsPage;
  if (pathname.startsWith('/dashboard/stones')) return StonesPage;
  if (pathname.startsWith('/dashboard/clients')) return ClientsPage;
  if (pathname.startsWith('/dashboard/shipments')) return ShipmentsPage;
  if (pathname.startsWith('/dashboard/settings')) return SettingsPage;
  return DashboardHome;
}

export default function Home() {
  const { isAuthenticated } = useAuthStore();
  const [pathname, setPathname] = useState<string | null>(null);

  // Read the URL on the client and re-render whenever it changes.
  // Includes a monkey-patch on history.pushState/replaceState so we re-sync
  // when Next.js's router does a soft navigation (e.g. router.push after a
  // successful login). popstate covers back/forward buttons.
  useEffect(() => {
    const sync = () => setPathname(window.location.pathname);
    sync();
    window.addEventListener('popstate', sync);
    const origPush = window.history.pushState.bind(window.history);
    const origReplace = window.history.replaceState.bind(window.history);
    window.history.pushState = (...args: Parameters<typeof origPush>) => {
      origPush(...args);
      sync();
    };
    window.history.replaceState = (...args: Parameters<typeof origReplace>) => {
      origReplace(...args);
      sync();
    };
    return () => {
      window.removeEventListener('popstate', sync);
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
    };
  }, []);

  if (pathname === null) return <LoadingScreen />;

  // Public-only routes: render regardless of auth state.
  if (pathname.startsWith('/setup-password')) {
    return <Suspense fallback={<LoadingScreen />}><SetupPasswordPage /></Suspense>;
  }
  if (pathname.startsWith('/pay')) {
    return <Suspense fallback={<LoadingScreen />}><PayPage /></Suspense>;
  }

  // Anyone not signed in lands on the login page (regardless of URL).
  // No redirect — server keeps returning this same HTML, so a redirect would
  // just bounce us back to here on next paint.
  if (!isAuthenticated) {
    return <Suspense fallback={<LoadingScreen />}><LoginPage /></Suspense>;
  }

  // Authenticated dashboard routes are wrapped in the dashboard layout.
  const DashboardPage = pickDashboardPage(pathname);
  return (
    <Suspense fallback={<LoadingScreen />}>
      <DashboardLayout>
        <DashboardPage />
      </DashboardLayout>
    </Suspense>
  );
}
