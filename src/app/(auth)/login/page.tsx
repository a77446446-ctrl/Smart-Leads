'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useUser } from '@/store/useUser';
import type { User } from '@/types';
import { Logo } from '@/components/Logo';
import { useBranding } from '@/components/BrandingProvider';
function startDestination(initData?: string): string {
  const startParam = initData ? new URLSearchParams(initData).get('start_param') : null;
  const fallbackParam = typeof window === 'undefined'
    ? null
    : new URLSearchParams(window.location.search).get('WebAppStartParam');
  const payload = startParam || fallbackParam || '';
  const match = /^(lead|purchase)_([0-9a-f]{8}-[0-9a-f-]{27,36})$/i.exec(payload);
  if (!match) return '/dashboard';
  const leadId = encodeURIComponent(match[2]);
  return match[1] === 'purchase' ? `/my-leads?lead=${leadId}` : `/dashboard?lead=${leadId}`;
}
async function destinationAfterLegal(user: User, destination: string): Promise<string> {
  if (user.role === 'admin') return destination;
  const response = await fetch('/api/legal/acceptance', { cache: 'no-store' });
  if (!response.ok) throw new Error('Не удалось проверить документы');
  const acceptance = await response.json() as { accepted?: boolean };
  return acceptance.accepted ? destination : `/consent?next=${encodeURIComponent(destination)}`;
}
export default function LoginPage() {
  const brand = useBranding();
  const router = useRouter();
  const setUser = useUser((state) => state.setUser);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState('');
  const [isInsideMax, setIsInsideMax] = useState<boolean | null>(null);
  const isLocalDevelopment = process.env.NODE_ENV !== 'production';

  useEffect(() => {
    window.WebApp?.ready?.();
    window.WebApp?.expand?.();
    
    // Simple check: if there is initData, we are definitely inside MAX.
    // If not, we might still be inside MAX but just opened it without initData? 
    // Usually WebApp.initData is always there in a mini app.
    setIsInsideMax(!!window.WebApp?.initData);
    const loginError = new URLSearchParams(window.location.search).get('error');
    if (loginError) {
      const messages: Record<string, string> = {
        max_not_configured: 'Не удалось войти через MAX: бот пока не настроен владельцем приложения.',
        telegram_not_configured: 'Не удалось войти через Telegram: нужны Client ID и Client Secret из BotFather.',
        telegram_cancelled: 'Вход через Telegram отменён.',
        telegram_blocked: 'Учётная запись Telegram заблокирована.',
        telegram_failed: 'Не удалось войти через Telegram. Повторите попытку.',
      };
      setError(messages[loginError] || 'Не удалось войти. Повторите попытку.');
    }

    fetch('/api/profile', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<User>;
      })
      .then(async (profile) => {
        if (!profile) return;
        const destination = startDestination(window.WebApp?.initData);
        const target = await destinationAfterLegal(profile, destination);
        setUser(profile);
        router.replace(target);
      })
      .catch(() => setError('Не удалось проверить текущую сессию'))
      .finally(() => setCheckingSession(false));
  }, [router, setUser]);

  const authenticate = async () => {
    setError('');
    const initData = window.WebApp?.initData;
    if (!initData) {
      setError('Откройте приложение кнопкой из официального бота MAX.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/max', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      });
      const data = await response.json() as { user?: User; error?: string };
      if (!response.ok || !data.user) throw new Error(data.error || 'Не удалось войти через MAX');
      const destination = startDestination(initData);
      const target = await destinationAfterLegal(data.user, destination);
      setUser(data.user);
      router.replace(target);
      router.refresh();
    } catch (authenticationError) {
      setError(authenticationError instanceof Error ? authenticationError.message : 'Не удалось войти через MAX');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-between p-4 sm:p-6 overflow-hidden relative font-sans">
      <div className="pt-2 flex items-center justify-center w-full">
        <Logo className="max-w-sm" />
      </div>

      <div className="flex-1 w-full max-w-sm flex items-center justify-center my-2">
        <div className="w-full border border-zinc-200 bg-zinc-50 p-8 my-8">
          <span className="inline-block bg-accent px-3 py-1 text-xs font-bold uppercase">Ваша лента</span>
          <p className="mt-5 text-2xl font-black leading-tight">{brand.tagline}</p>
          <p className="mt-4 text-sm leading-relaxed text-zinc-600">{brand.welcomeText}</p>
        </div>
      </div>

      <div className="w-full max-w-sm space-y-4 pb-6 relative z-10">
        <div className="bg-white border-2 border-black p-6 space-y-4">
          <h1 className="text-black font-black text-lg uppercase tracking-tight leading-tight">{brand.name}</h1>
          <p className="text-[#555] text-sm font-medium leading-relaxed">
            {brand.description}
          </p>
        </div>

        {error && (
          <div role="alert" className="bg-red-50 border-2 border-red-600 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        {isInsideMax === true && (
          <button
            type="button"
            onClick={authenticate}
            disabled={loading || checkingSession}
            className="w-full bg-gradient-to-r from-[#27b9f5] via-[#386af5] to-[#8648dd] text-white border-2 border-black py-4 px-2 text-xs sm:text-sm font-black uppercase tracking-wider hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-center"
          >
            {(loading || checkingSession) ? <Loader2 size={22} className="animate-spin shrink-0" /> : <Image src="/max-logo.png" alt="" width={24} height={24} className="shrink-0 rounded-[5px]" />}
            <span>{checkingSession ? 'ПРОВЕРЯЕМ СЕССИЮ' : loading ? 'ВХОДИМ ЧЕРЕЗ MAX' : 'Войти через MAX'}</span>
          </button>
        )}

        {isInsideMax === false && (
          <a
            href="/api/auth/max-link"
            className="w-full bg-gradient-to-r from-[#27b9f5] via-[#386af5] to-[#8648dd] text-white border-2 border-black py-4 px-2 text-xs sm:text-sm font-black uppercase tracking-wider hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-center"
          >
            <Image src="/max-logo.png" alt="" width={24} height={24} className="shrink-0 rounded-[5px]" />
            <span>Войти через MAX</span>
          </a>
        )}

        <a
          href="/api/auth/telegram/start"
          aria-disabled={checkingSession}
          className="w-full bg-[#229ED9] text-white border-2 border-black py-4 px-2 text-xs sm:text-sm font-black uppercase tracking-wider hover:brightness-95 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-center"
        >
          <Send size={18} className="shrink-0" />
          <span>Войти через Telegram</span>
        </a>

        {isLocalDevelopment && (
          <>
            <a
              href="/api/dev/login"
              className="w-full bg-black text-white border-2 border-black py-4 px-2 text-xs sm:text-sm font-bold uppercase tracking-wider hover:bg-zinc-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-center"
            >
              Войти в рабочее приложение
            </a>
            <button
              type="button"
              onClick={() => router.push('/demo')}
              className="w-full bg-white text-black border-2 border-black py-4 px-2 text-xs sm:text-sm font-bold uppercase tracking-wider hover:bg-zinc-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-center"
            >
              Открыть презентационное демо
            </button>
          </>
        )}

        <div className="pt-2 text-center text-[10px] font-black uppercase tracking-widest text-zinc-400">
          {brand.name} &copy; {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}
