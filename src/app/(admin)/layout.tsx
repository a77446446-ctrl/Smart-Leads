'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Database,
  Tags,
  Users,
  CreditCard,
  Settings,
  Search,
  ArrowLeft,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/Logo';

const adminNav = [
  { icon: LayoutDashboard, label: 'Обзор', href: '/admin' },
  { icon: Database, label: 'Лиды', href: '/admin/leads' },
  { icon: Tags, label: 'Категории', href: '/admin/categories' },
  { icon: Users, label: 'Пользователи', href: '/admin/users' },
  { icon: CreditCard, label: 'Платежи', href: '/admin/payments' },
  { icon: Search, label: 'Детектив', href: '/admin/discovery' },
  { icon: Settings, label: 'Настройки', href: '/admin/settings' },
  { icon: Settings, label: 'Интеграции', href: '/admin/instance' },
  { icon: Settings, label: 'Бренд', href: '/admin/branding' },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const navigation = (
    <>
      <nav className="flex flex-1 flex-col gap-2">
        {adminNav.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-h-11 sm:min-h-12 items-center gap-3 rounded-xl border border-transparent px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-xs sm:text-sm font-bold uppercase transition-all',
                isActive
                  ? 'border-accent bg-accent text-black shadow-accent-glow'
                  : 'text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800 hover:text-white',
              )}
            >
              <item.icon className="w-4 h-4 sm:w-[18px] sm:h-[18px]" strokeWidth={isActive ? 2.5 : 2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Link
        href="/dashboard"
        className="flex min-h-11 sm:min-h-12 items-center gap-3 rounded-xl border border-transparent px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-xs sm:text-sm font-bold uppercase text-zinc-400 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
        В приложение
      </Link>
    </>
  );

  return (
    <div className="flex min-h-screen min-w-0 bg-zinc-950 text-white">
      <aside className="hidden w-64 shrink-0 flex-col gap-8 rounded-br-2xl rounded-tr-2xl border-r border-zinc-800 bg-zinc-900 p-6 lg:flex">
        <div>
          <div className="flex items-center overflow-hidden rounded-none border border-zinc-700 w-fit font-bold mt-2">
            <Logo size="sm" className="p-2" />
          </div>
          <p className="mt-3 text-[9px] font-bold uppercase tracking-widest text-zinc-500">Управление</p>
        </div>

        {navigation}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-4 backdrop-blur lg:hidden">
          <div className="flex items-center overflow-hidden rounded-none border border-zinc-700 w-fit font-bold">
            <Logo size="sm" className="p-2" />
          </div>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Открыть меню администратора"
            aria-expanded={isMobileMenuOpen}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-white"
          >
            <Menu size={22} />
          </button>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10">
          {children}
        </main>
      </div>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Меню администратора">
          <button
            type="button"
            aria-label="Закрыть меню"
            onClick={() => setIsMobileMenuOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 right-0 flex w-[min(86vw,22rem)] flex-col gap-4 sm:p-6 overflow-y-auto border-l border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center overflow-hidden rounded-none border border-zinc-700 w-fit font-bold mt-2">
                  <Logo size="sm" className="p-2" />
                </div>
                <p className="mt-3 text-[9px] font-bold uppercase tracking-widest text-zinc-500">Управление</p>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Закрыть меню администратора"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950 text-white"
              >
                <X size={22} />
              </button>
            </div>
            {navigation}
          </aside>
        </div>
      )}
    </div>
  );
}
