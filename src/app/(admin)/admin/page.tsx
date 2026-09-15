'use client';

import React, { useEffect, useState } from 'react';
import { 
  TrendingUp, 
  LayoutDashboard,
  BarChart3,
  Users as UsersIcon, 
  Database, 
  CreditCard,
  Zap,
  Loader2
} from 'lucide-react';

import { LeadIngestMock } from '@/components/ui/LeadIngestMock';
import { DashboardChart } from '@/components/ui/DashboardChart';

export default function AdminDashboardPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0,0,0,0);
    return d;
  });
  const [loading, setLoading] = useState(true);
  const [statsData, setStatsData] = useState<any>(null);

  const fetchStats = async (silent = false, date: Date = selectedDate) => {
    try {
      if (!silent) setLoading(true);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const localIsoDate = `${year}-${month}-${day}`;
      const res = await fetch(`/api/admin/stats?date=${localIsoDate}`);
      const data = await res.json();
      setStatsData(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats(false, selectedDate);
    
    const interval = setInterval(() => {
      fetchStats(true, selectedDate);
    }, 10000);
    
    return () => clearInterval(interval);
  }, [selectedDate]);

  const stats = [
    { label: 'Доход сегодня', value: loading ? '...' : `${statsData?.revenueToday || 0}₽`, trend: '', icon: CreditCard, color: '#E6F000' },
    { label: 'Новые лиды', value: loading ? '...' : `${statsData?.newLeads || 0}`, trend: '', icon: Database, color: '#00F0FF' },
    { label: 'Активные мастера', value: loading ? '...' : `${statsData?.activeMasters || 0}`, trend: '', icon: UsersIcon, color: '#FF00E5' },
    { label: 'PRO Подписки', value: loading ? '...' : `${statsData?.activeSubscriptions || 0}`, trend: '', icon: Zap, color: '#FF8A00' },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-0 pb-20 font-sans sm:px-6">
      <div className="flex flex-col gap-4 border-b border-zinc-700 py-4 sm:py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="bg-accent border border-zinc-700 p-2 text-black rounded-lg sm:p-2.5">
            <LayoutDashboard className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <h1 className="text-xs sm:text-xs sm:text-sm font-bold tracking-widest text-white uppercase leading-none">ОБЗОР СИСТЕМЫ</h1>
        </div>
        <div className="flex w-full sm:w-auto items-center justify-between bg-zinc-900 border border-zinc-700 rounded-lg shadow-sm overflow-hidden">
          <button 
            onClick={() => {
              const d = new Date(selectedDate);
              d.setDate(d.getDate() - 1);
              setSelectedDate(d);
            }}
            className="p-3 text-zinc-400 hover:text-white transition-colors hover:bg-zinc-800 rounded-l-lg border-r border-zinc-700"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <div className="relative flex items-center">
            <input 
              type="date" 
              value={`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`}
              onChange={(e) => {
                if (e.target.value) {
                  const [y, m, d] = e.target.value.split('-');
                  const newDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
                  newDate.setHours(0,0,0,0);
                  setSelectedDate(newDate);
                }
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="px-4 py-2 text-xs font-bold text-white uppercase cursor-pointer">
              {selectedDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
          <button 
            onClick={() => {
              const d = new Date(selectedDate);
              d.setDate(d.getDate() + 1);
              setSelectedDate(d);
            }}
            className="p-3 text-zinc-400 hover:text-white transition-colors hover:bg-zinc-800 rounded-r-lg border-l border-zinc-700"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:p-6 xl:grid-cols-4 items-stretch">
        {stats.map((stat, i) => (
          <div key={i} className="flex h-full flex-col rounded-xl border border-zinc-700 bg-zinc-900 p-3 sm:p-6 shadow-sm">
            <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
              <div 
                className="w-6 h-6 sm:w-8 sm:h-8 border border-zinc-700 bg-zinc-950 flex items-center justify-center shrink-0"
                style={{ color: stat.color === '#E6F000' || stat.color === '#E4FF00' ? 'var(--accent)' : stat.color }}
              >
                <stat.icon className="w-3 h-3 sm:w-4 sm:h-4" />
              </div>
              <h3 className="font-bold text-[8px] sm:text-[10px] uppercase tracking-[0.1em] sm:tracking-[0.2em] text-zinc-400 break-words">{stat.label}</h3>
            </div>
            <div className="mt-auto">
              <div className="text-xl sm:text-3xl font-normal tracking-tight text-white">{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-4 sm:p-6 xl:grid-cols-3">
        <div className="flex flex-col min-h-[400px] rounded-xl border border-zinc-700 bg-zinc-900 p-4 sm:p-6 xl:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 border border-zinc-700 bg-zinc-950 flex items-center justify-center text-zinc-400">
              <BarChart3 size={14} />
            </div>
            <h3 className="font-bold text-[10px] uppercase tracking-[0.2em] text-zinc-400">ГРАФИК ДОХОДНОСТИ</h3>
          </div>
          <div className="flex-1 flex w-full h-full">
            <DashboardChart />
          </div>
        </div>
        
        <div className="xl:col-span-1">
          <LeadIngestMock />
        </div>
      </div>
    </div>
  );
}
