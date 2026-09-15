'use client';
import { useBranding } from '@/components/BrandingProvider';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@/store/useUser';


import { Settings, LogOut, Award, History, TrendingUp } from 'lucide-react';

export default function ProfilePage() {
  const brand = useBranding();
  const router = useRouter();
  const { user, logout, setNotifyEnabled } = useUser();
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [categoryPreferences, setCategoryPreferences] = useState<any[]>([]);
  const [editingCategories, setEditingCategories] = useState(false);

  const [userStats, setUserStats] = useState({ purchasedLeads: 0, totalSpent: 0 });

  useEffect(() => {
    fetch('/api/preferences/categories', { cache: 'no-store' })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setCategoryPreferences(Array.isArray(data) ? data : []))
      .catch(() => setCategoryPreferences([]));

    fetch('/api/profile/stats', { cache: 'no-store' })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data && !data.error) {
          setUserStats({ purchasedLeads: data.purchasedLeads || 0, totalSpent: data.totalSpent || 0 });
        }
      })
      .catch(() => {});
  }, []);

  if (!user) return null;

  const toggleCategoryNotifications = async (category: any) => {
    const enabled = !category.notifyEnabled;
    const response = await fetch('/api/preferences/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: category.id, enabled }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (data.code === 'BOT_NOT_STARTED' && data.botUrl) window.WebApp?.openMaxLink?.(data.botUrl);
      alert(data.error || 'Не удалось изменить подписку');
      return;
    }
    setCategoryPreferences((items) => items.map((item) => item.id === category.id ? { ...item, notifyEnabled: enabled } : item));
    if (enabled) setNotifyEnabled(true);
  };

  const changeNotifications = async (enabled: boolean) => {
    const previousValue = user.notify_enabled;
    setNotifyEnabled(enabled);
    setSavingNotifications(true);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifyEnabled: enabled }),
      });
      const data = await response.json() as { notify_enabled?: boolean; error?: string; code?: string; botUrl?: string };
      if (!response.ok) {
        if (data.code === 'BOT_NOT_STARTED' && data.botUrl) window.WebApp?.openMaxLink?.(data.botUrl);
        throw new Error(data.error || 'Не удалось изменить уведомления');
      }
      if (typeof data.notify_enabled !== 'boolean') {
        throw new Error('Сервер не подтвердил состояние уведомлений');
      }
      setNotifyEnabled(data.notify_enabled);
    } catch (error) {
      setNotifyEnabled(previousValue);
      alert(error instanceof Error ? error.message : 'Не удалось изменить уведомления');
    } finally {
      setSavingNotifications(false);
    }
  };

  const stats = [
    { label: 'Куплено лидов', value: String(userStats.purchasedLeads), icon: History },
    { label: 'Потрачено (всего)', value: `${userStats.totalSpent}₽`, icon: TrendingUp },
  ];

  return (
    <div className="space-y-8">
      {/* Profile Header */}
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 border border-black bg-accent flex items-center justify-center text-black text-3xl font-black">
          {user.name.charAt(0)}
        </div>
        <div>
          <h2 className="text-2xl font-black text-black uppercase">{user.name}</h2>
          <p className="text-[#666] text-sm font-bold">
            {user.max_id ? `MAX: ${user.max_id}` : `Telegram: ${user.telegram_id}`}
          </p>
          <div className="mt-1 bg-black text-white border border-black px-2 py-0.5 text-[10px] font-black inline-block uppercase">
            {user.role}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat, i) => (
          <div key={i} className="glass-panel p-3 text-center border-black">
            <div className="flex justify-center mb-2">
              <stat.icon size={16} className="text-black" />
            </div>
            <div className="text-lg font-black text-black">{stat.value}</div>
            <div className="text-[9px] text-[#666] uppercase font-bold">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Category Subscriptions */}
      {user.max_id && categoryPreferences.length > 0 && (
        <div className="bg-white border border-black p-4 space-y-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-black uppercase">Уведомления от бота</div>
              <div className="text-[10px] text-[#666] font-medium mt-1">Категории, по которым вы получаете новые лиды.</div>
            </div>
            <button 
              onClick={() => setEditingCategories(!editingCategories)}
              className="text-accent text-[10px] font-black uppercase border-b-2 border-black hover:brightness-95 transition-colors pb-0.5"
              style={{ textShadow: '1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000, 0px 1px 0 #000, 0px -1px 0 #000, 1px 0px 0 #000, -1px 0px 0 #000' }}
            >
              {editingCategories ? 'Скрыть' : 'Настроить'}
            </button>
          </div>

          {!editingCategories ? (
            <div className="flex flex-wrap gap-2 pt-2">
              {categoryPreferences.filter(c => c.notifyEnabled).length > 0 ? (
                categoryPreferences.filter(c => c.notifyEnabled).map((category) => (
                  <div 
                    key={category.id} 
                    className="px-3 py-2 text-[10px] font-black uppercase border border-black bg-accent text-black flex items-center gap-1"
                  >
                     🔔 {category.name}
                  </div>
                ))
              ) : (
                <div className="text-[10px] text-[#999] uppercase font-bold py-2">Категории не выбраны</div>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-200">
              <div className="w-full text-[10px] font-bold text-[#666] uppercase mb-1">Выберите нужные категории:</div>
              {categoryPreferences.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => toggleCategoryNotifications(category)}
                  className={`px-3 py-2 text-[10px] font-black uppercase border border-black transition-colors ${category.notifyEnabled ? 'bg-accent text-black shadow-[2px_2px_0_0_#000] translate-y-[-2px]' : 'bg-white text-[#999] hover:bg-gray-50'}`}
                >
                  {category.notifyEnabled ? '🔔 ' : '🔕 '}{category.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Menu */}
      <div className="space-y-2">
        {user.max_id ? <div className="w-full flex items-center justify-between p-4 glass-panel transition-colors border-black">
          <div className="flex items-center gap-3 font-bold text-black uppercase text-sm">
            <div className="border border-black bg-white text-black p-2"><Settings size={18} /></div>
            Уведомления
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={user.notify_enabled}
            aria-label="Уведомления"
            disabled={savingNotifications}
            onClick={() => void changeNotifications(!user.notify_enabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-black p-px transition-colors ${user.notify_enabled ? 'bg-accent' : 'bg-[#ddd]'} ${savingNotifications ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
          >
            <span
              aria-hidden="true"
              className={`h-5 w-5 rounded-full border border-black bg-white transition-transform ${user.notify_enabled ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </button>
        </div> : (
          <div className="w-full p-4 glass-panel border-black text-xs font-bold text-[#666]">
            Уведомления MAX станут доступны после входа через MAX.
          </div>
        )}

        {user.role === 'admin' && (
        <Link 
          href="/admin/settings"
          className="w-full flex items-center justify-between p-4 glass-panel hover:bg-gray-100 transition-colors border-black"
        >
          <div className="flex items-center gap-3 font-bold text-black uppercase text-sm">
            <div className="border border-black bg-white text-black p-2"><Settings size={18} /></div>
            Настройки
          </div>
          <div className="text-black font-black">→</div>
        </Link>
        )}

        
        <button 
          onClick={async () => {
            try {
              await fetch('/api/auth/logout', { method: 'POST' });
            } finally {
              logout();
              window.location.assign('/login');
            }
          }}
          className="w-full flex items-center justify-between p-4 glass-panel border-black hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-3 font-bold text-red-600 uppercase text-sm">
            <div className="border border-black bg-white text-red-600 p-2"><LogOut size={18} /></div>
            Выйти из аккаунта
          </div>
        </button>
      </div>



      <div className="text-center text-[10px] text-[#999] uppercase font-bold tracking-widest pt-10">
        {brand.name}
      </div>
    </div>
  );
}
