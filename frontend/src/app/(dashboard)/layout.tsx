"use client";

import { useEffect, useState, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuthStore, useSidebarStore, useBranchFilterStore } from '@/lib/store';
import { branchesApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Package,
  Briefcase,
  Users,
  Settings,
  LogOut,
  Menu,
  ChevronLeft,
  LayoutDashboard,
  Diamond,
  Building,
  MoreHorizontal,
  X,
} from 'lucide-react';

const allNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['super_admin', 'branch_admin', 'customer'], mobileOrder: 1 },
  { name: 'Jobs', href: '/dashboard/jobs', icon: Briefcase, roles: ['super_admin', 'branch_admin', 'customer'], mobileOrder: 2 },
  { name: 'Stones', href: '/dashboard/stones', icon: Diamond, roles: ['super_admin', 'branch_admin', 'customer'], mobileOrder: 3 },
  { name: 'Clients', href: '/dashboard/clients', icon: Users, roles: ['super_admin', 'branch_admin'], mobileOrder: 4 },
  { name: 'Shipments', href: '/dashboard/shipments', icon: Package, roles: ['super_admin', 'branch_admin'], mobileOrder: 0 },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings, roles: ['super_admin', 'branch_admin'], mobileOrder: 0 },
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
  const { selectedBranchId, setSelectedBranch } = useBranchFilterStore();
  const [mounted, setMounted] = useState(false);
  const [branches, setBranches] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin';

  const navigation = useMemo(() => {
    const userRole = user?.role || 'customer';
    return allNavigation.filter(item => item.roles.includes(userRole));
  }, [user?.role]);

  // Items shown in mobile bottom bar (max 4 + more)
  const mobileNavItems = useMemo(() => {
    return navigation.filter(n => n.mobileOrder > 0).sort((a, b) => a.mobileOrder - b.mobileOrder).slice(0, 4);
  }, [navigation]);

  const mobileMoreItems = useMemo(() => {
    return navigation.filter(n => !mobileNavItems.includes(n));
  }, [navigation, mobileNavItems]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && isAuthenticated && isSuperAdmin) {
      branchesApi.getAll().then(setBranches).catch(console.error);
    }
  }, [mounted, isAuthenticated, isSuperAdmin]);

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
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-pulse text-navy-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-50 flex">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 hidden md:flex flex-col bg-navy-950 text-white transition-all duration-300 ease-in-out",
          isCollapsed ? "w-16" : "w-60"
        )}
        data-testid="sidebar"
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center h-16 px-4 border-b border-navy-800",
          isCollapsed ? "justify-center" : "justify-between"
        )}>
          <Link href="/dashboard" className="flex items-center gap-3">
            <Image
              src="/logos/bashari-icon.jpg"
              alt="Bashari"
              width={32}
              height={32}
              className="rounded flex-shrink-0"
            />
            {!isCollapsed && (
              <span className="font-serif text-base font-semibold tracking-wide whitespace-nowrap">Lab-Direct</span>
            )}
          </Link>
          {!isCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="text-navy-400 hover:text-white hover:bg-navy-800 h-8 w-8"
              data-testid="collapse-sidebar-button"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm",
                  isActive
                    ? "bg-brand-red text-white"
                    : "text-navy-300 hover:bg-navy-800 hover:text-white"
                )}
                data-testid={`nav-${item.name.toLowerCase()}`}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                {!isCollapsed && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User Info & Logout */}
        <div className="border-t border-navy-800 p-3">
          {!isCollapsed && (
            <div className="mb-2 text-xs">
              <p className="font-medium text-navy-200 truncate">{user?.full_name}</p>
              <p className="text-navy-500 truncate">{user?.email}</p>
            </div>
          )}
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start text-navy-400 hover:text-white hover:bg-navy-800 text-sm h-9",
              isCollapsed && "justify-center px-2"
            )}
            onClick={handleLogout}
            data-testid="logout-button"
          >
            <LogOut className="h-4 w-4" />
            {!isCollapsed && <span className="ml-2">Logout</span>}
          </Button>
        </div>

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
          "flex-1 transition-all duration-300 pb-16 md:pb-0",
          isCollapsed ? "md:ml-16" : "md:ml-60"
        )}
      >
        {/* Top Bar */}
        <header className="sticky top-0 z-40 h-14 bg-white border-b border-navy-100 flex items-center justify-between px-4 md:px-6 shadow-sm">
          <div className="flex items-center gap-3">
            {/* Mobile logo */}
            <div className="flex items-center gap-2 md:hidden">
              <Image
                src="/logos/bashari-icon.jpg"
                alt="Bashari"
                width={28}
                height={28}
                className="rounded"
              />
              <span className="font-serif text-sm font-semibold">Lab-Direct</span>
            </div>
            <h1 className="text-sm font-semibold text-navy-800 hidden md:block">
              {navigation
                .filter(n => pathname === n.href || pathname.startsWith(n.href + '/'))
                .sort((a, b) => b.href.length - a.href.length)[0]?.name || 'Dashboard'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {isSuperAdmin && branches.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Building className="h-3.5 w-3.5 text-navy-400 hidden sm:block" />
                <Select
                  value={selectedBranchId || "all"}
                  onValueChange={(v) => setSelectedBranch(v === "all" ? null : v)}
                >
                  <SelectTrigger className="w-36 h-8 text-xs border-navy-200" data-testid="branch-selector">
                    <SelectValue placeholder="All Branches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <span className="text-xs text-navy-500 hidden sm:block">
              {user?.full_name}
            </span>
            <div className="w-7 h-7 bg-navy-900 rounded-full flex items-center justify-center text-white text-xs font-medium">
              {user?.full_name?.charAt(0) || 'U'}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-navy-200 md:hidden" data-testid="mobile-nav">
        <div className="flex items-center justify-around h-14">
          {mobileNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-xs transition-colors",
                  isActive ? "text-brand-red" : "text-navy-400"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-[10px]">{item.name}</span>
              </Link>
            );
          })}
          {mobileMoreItems.length > 0 && (
            <button
              onClick={() => setMobileMoreOpen(!mobileMoreOpen)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-xs transition-colors",
                mobileMoreOpen ? "text-brand-red" : "text-navy-400"
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[10px]">More</span>
            </button>
          )}
        </div>
      </nav>

      {/* Mobile More Menu */}
      {mobileMoreOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMobileMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute bottom-14 left-0 right-0 bg-white border-t border-navy-200 rounded-t-xl shadow-xl p-4 space-y-1" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-serif text-sm font-semibold text-navy-800">More</span>
              <button onClick={() => setMobileMoreOpen(false)} className="text-navy-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            {mobileMoreItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileMoreOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-navy-700 hover:bg-navy-50"
              >
                <item.icon className="h-4 w-4" />
                <span>{item.name}</span>
              </Link>
            ))}
            <button
              onClick={() => { handleLogout(); setMobileMoreOpen(false); }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-red-600 hover:bg-red-50 w-full"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
