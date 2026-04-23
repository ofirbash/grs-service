import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { setToken, clearToken } from './tokenStorage';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  branch_id?: string;
  phone?: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      setAuth: (token, user) => {
        setToken(token);
        set({ token, user, isAuthenticated: true });
      },
      logout: () => {
        clearToken();
        set({ token: null, user: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth-storage',
      // Auth state lives only for the duration of the browser tab — tokens
      // are wiped when the user closes the tab, reducing XSS blast radius.
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);

interface SidebarState {
  isCollapsed: boolean;
  toggleSidebar: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      isCollapsed: false,
      toggleSidebar: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
      setCollapsed: (collapsed) => set({ isCollapsed: collapsed }),
    }),
    {
      name: 'sidebar-storage',
    }
  )
);

interface BranchFilterState {
  selectedBranchId: string | null; // null = all branches
  setSelectedBranch: (branchId: string | null) => void;
}

export const useBranchFilterStore = create<BranchFilterState>()(
  persist(
    (set) => ({
      selectedBranchId: null,
      setSelectedBranch: (branchId) => set({ selectedBranchId: branchId }),
    }),
    {
      name: 'branch-filter-storage',
    }
  )
);
