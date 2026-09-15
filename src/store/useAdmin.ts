import { create } from 'zustand';

interface AdminStats {
  revenueToday: number;
  newLeads: number;
  activeMasters: number;
  activeSubscriptions: number;
}

interface AdminState {
  stats: AdminStats;
  isLoading: boolean;
  setStats: (stats: AdminStats) => void;
}

export const useAdmin = create<AdminState>((set) => ({
  stats: {
    revenueToday: 12400,
    newLeads: 142,
    activeMasters: 86,
    activeSubscriptions: 12,
  },
  isLoading: false,
  setStats: (stats) => set({ stats }),
}));
