'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { LegalAcceptanceCard } from '@/components/legal/LegalAcceptanceCard';
import { useUser } from '@/store/useUser';

const ALLOWED_DESTINATIONS = ['/dashboard', '/my-leads', '/subscriptions'];

function nextDestination(): string {
  const raw = new URLSearchParams(window.location.search).get('next') || '/dashboard';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/dashboard';
  const pathname = raw.split('?')[0];
  return ALLOWED_DESTINATIONS.some((allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`))
    ? raw
    : '/dashboard';
}

export default function ConsentPage() {
  const router = useRouter();
  const logout = useUser((state) => state.logout);
  const continueToApplication = useCallback(() => {
    router.replace(nextDestination());
    router.refresh();
  }, [router]);

  const declineAndExit = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      logout();
      window.location.assign('/login');
    }
  };

  return (
    <main className="min-h-screen bg-[#efefef] px-5 py-8 text-black">
      <div className="mx-auto max-w-md space-y-6">
        <div className="flex items-center justify-center">
          <div className="bg-black px-3 py-1.5 text-2xl font-black leading-none text-white">ПО</div>
          <div className="bg-accent px-3 py-1.5 text-2xl font-black leading-none text-black">ДЕЛАМ</div>
        </div>
        <section className="border-2 border-black bg-white p-5 shadow-[5px_5px_0_0_#000]">
          <h1 className="text-xl font-black uppercase">Перед началом работы</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">Ознакомьтесь с документами сервиса. После подтверждения откроются лента, ваши лиды и подписки.</p>
        </section>
        <LegalAcceptanceCard onAccepted={continueToApplication} />
        <button type="button" onClick={() => void declineAndExit()} className="w-full px-4 py-3 text-sm font-bold underline">
          Не принимать и выйти
        </button>
      </div>
    </main>
  );
}
