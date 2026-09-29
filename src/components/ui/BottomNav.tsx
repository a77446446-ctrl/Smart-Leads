'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ListChecks, CreditCard, UserCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const userNavItems = [
  { icon: LayoutDashboard, label: 'Лента', href: '/dashboard' },
  { icon: ListChecks, label: 'Мои лиды', href: '/my-leads' },
  { icon: CreditCard, label: 'Подписки', href: '/subscriptions' },
];

const adminProfileItem = { icon: UserCircle, label: 'Профиль', href: '/profile' };

export const BottomNav = () => {
  const pathname = usePathname();
  const navItems = [...userNavItems, adminProfileItem];

  return (
    <div className="fixed bottom-0 left-0 right-0 h-20 bg-white border-t border-black flex justify-around items-center px-4 pb-4 z-50">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname === item.href ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center gap-1 transition-colors mt-2 min-w-14 rounded-md px-1 py-1 active:bg-accent',
              isActive ? 'bg-accent text-black' : 'text-black/50 hover:text-black/80',
            )}
          >
            <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
            <span className={cn('text-[9px] uppercase tracking-widest', isActive ? 'font-bold' : 'font-bold')}>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
};
