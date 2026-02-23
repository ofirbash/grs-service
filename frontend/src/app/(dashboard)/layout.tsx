"use client";

import { useEffect, useState, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore, useSidebarStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Gem,
  Package,
  Briefcase,
  Users,
  Settings,
  LogOut,
  Menu,
  ChevronLeft,
  LayoutDashboard,
  Diamond,
} from 'lucide-react';

// Base navigation - filtered based on role
const allNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['super_admin', 'branch_admin', 'customer'] },
  { name: 'Shipments', href: '/dashboard/shipments', icon: Package, roles: ['super_admin', 'branch_admin'] },
  { name: 'Jobs', href: '/dashboard/jobs', icon: Briefcase, roles: ['super_admin', 'branch_admin', 'customer'] },
  { name: 'Stones', href: '/dashboard/stones', icon: Diamond, roles: ['super_admin', 'branch_admin'] },
  { name: 'Clients', href: '/dashboard/clients', icon: Users, roles: ['super_admin', 'branch_admin'] },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings, roles: ['super_admin', 'branch_admin'] },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, logout } = useAuthStore();
  const { isCollapsed, toggleSidebar } = useSidebarStore();
  const [mounted, setMounted] = useState(false);

  // Filter navigation based on user role
  const navigation = useMemo(() => {
    const userRole = user?.role || 'customer';
    return allNavigation.filter(item => item.roles.includes(userRole));
  }, [user?.role]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isAuthenticated) {
      router.push('/login');
    }
  }, [mounted, isAuthenticated, router]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (!mounted || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-50">
        <div className="animate-pulse text-navy-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-50 flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-navy-900 text-white transition-all duration-300 ease-in-out",
          isCollapsed ? "w-16" : "w-64"
        )}
        data-testid="sidebar"
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center h-16 px-4 border-b border-navy-700",
          isCollapsed ? "justify-center" : "justify-between"
        )}>
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gold-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Gem className="w-6 h-6 text-navy-900" />
            </div>
            {!isCollapsed && (
              <span className="font-bold text-lg whitespace-nowrap">GRS Global</span>
            )}
          </Link>
          {!isCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="text-navy-300 hover:text-white hover:bg-navy-800"
              data-testid="collapse-sidebar-button"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group",
                  isActive
                    ? "bg-navy-700 text-white"
                    : "text-navy-300 hover:bg-navy-800 hover:text-white"
                )}
                data-testid={`nav-${item.name.toLowerCase()}`}
              >
                <item.icon className={cn(
                  "h-5 w-5 flex-shrink-0",
                  isActive ? "text-gold-400" : "text-navy-400 group-hover:text-gold-400"
                )} />
                {!isCollapsed && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User Info & Logout */}
        <div className="border-t border-navy-700 p-4">
          {!isCollapsed && (
            <div className="mb-3 text-sm">
              <p className="font-medium text-white truncate">{user?.full_name}</p>
              <p className="text-navy-400 truncate">{user?.email}</p>
            </div>
          )}
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start text-navy-300 hover:text-white hover:bg-navy-800",
              isCollapsed && "justify-center px-2"
            )}
            onClick={handleLogout}
            data-testid="logout-button"
          >
            <LogOut className="h-5 w-5" />
            {!isCollapsed && <span className="ml-3">Logout</span>}
          </Button>
        </div>

        {/* Expand button when collapsed */}
        {isCollapsed && (
          <div className="absolute top-4 -right-3">
            <Button
              variant="secondary"
              size="icon"
              onClick={toggleSidebar}
              className="h-6 w-6 rounded-full shadow-lg"
              data-testid="expand-sidebar-button"
            >
              <Menu className="h-3 w-3" />
            </Button>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main
        className={cn(
          "flex-1 transition-all duration-300",
          isCollapsed ? "ml-16" : "ml-64"
        )}
      >
        {/* Top Bar */}
        <header className="sticky top-0 z-40 h-16 bg-white border-b border-navy-100 flex items-center justify-between px-6 shadow-sm">
          <div className="flex items-center gap-4">
            {isCollapsed && (
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <h1 className="text-lg font-semibold text-navy-800">
              {navigation
                .filter(n => pathname === n.href || pathname.startsWith(n.href + '/'))
                .sort((a, b) => b.href.length - a.href.length)[0]?.name || 'Dashboard'}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-navy-600 hidden sm:block">
              Welcome, {user?.full_name}
            </span>
            <div className="w-8 h-8 bg-navy-800 rounded-full flex items-center justify-center text-white text-sm font-medium">
              {user?.full_name?.charAt(0) || 'U'}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
