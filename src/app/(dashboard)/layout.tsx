'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, Loader2, Wallet } from 'lucide-react';
import { BottomNav } from '@/components/ui/BottomNav';
import { LegalFooter } from '@/components/legal/LegalFooter';
import { PaymentReturnWatcher } from '@/components/payments/PaymentReturnWatcher';
import { useUser } from '@/store/useUser';
import type { User } from '@/types';
import { Logo } from '@/components/Logo';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, setUser, logout } = useUser();
  const [authLoading, setAuthLoading] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    let active = true;

    const loadUser = async () => {
      try {
        const profileResponse = await fetch('/api/profile', { cache: 'no-store' });
        if (!profileResponse.ok) throw new Error('UNAUTHORIZED');
        const profile = await profileResponse.json() as User;

        if (profile.role === 'user') {
          const acceptanceResponse = await fetch('/api/legal/acceptance', { cache: 'no-store' });
          if (!acceptanceResponse.ok) throw new Error('LEGAL_STATUS_UNAVAILABLE');
          const acceptance = await acceptanceResponse.json() as { accepted?: boolean };
          if (!acceptance.accepted) {
            if (active) setUser(null);
            const next = `${window.location.pathname}${window.location.search}`;
            router.replace(`/consent?next=${encodeURIComponent(next)}`);
            return;
          }
        }

        if (active) setUser(profile);
      } catch {
        if (!active) return;
        logout();
        router.replace('/login');
      } finally {
        if (active) setAuthLoading(false);
      }
    };

    void loadUser();
    return () => { active = false; };
  }, [logout, router, setUser]);
  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#efefef]">
        <Loader2 className="animate-spin text-black" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#efefef] text-black pb-24 relative">
      <header className="sticky top-0 z-40 bg-white border-b border-black px-6 py-4 flex justify-between items-center">
        <Logo size="md" className="max-w-[65%]" />
        {user.monetizationEnabled !== false && (
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <Wallet size={16} className="text-black" />
            <span className="text-sm font-black">{user.balance} ₽</span>
          </div>
        )}
      </header>

      <main className="px-6 py-6 max-w-2xl mx-auto">{children}</main>
      <LegalFooter />
      <PaymentReturnWatcher />

      {showScrollTop && (
        <button
          type="button"
          aria-label="Наверх"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-24 right-4 z-40 bg-accent text-black p-3 border border-black shadow-[4px_4px_0_0_#000] hover:brightness-95 hover:-translate-y-1 transition-all"
        >
          <ArrowUp size={24} className="stroke-[3]" />
        </button>
      )}
      <BottomNav />
    </div>
  );
}
