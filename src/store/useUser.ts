import { create } from 'zustand';
import { User } from '@/types';

interface UserState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setBalance: (balance: number) => void;
  setNotifyEnabled: (enabled: boolean) => void;
  updateBalance: (amount: number) => void;
  logout: () => void;
}

export const useUser = create<UserState>((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: Boolean(user) }),
  setBalance: (balance) => set((state) => ({
    user: state.user ? { ...state.user, balance } : null,
  })),
  setNotifyEnabled: (enabled) => set((state) => ({
    user: state.user ? { ...state.user, notify_enabled: enabled } : null,
  })),
  updateBalance: (amount) => set((state) => ({
    user: state.user ? { ...state.user, balance: state.user.balance + amount } : null,
  })),
  logout: () => set({ user: null, isAuthenticated: false }),
}));
