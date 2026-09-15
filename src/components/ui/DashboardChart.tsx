'use client';

import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, ComposedChart, Line
} from 'recharts';
import { Loader2 } from 'lucide-react';

type TabType = 'overview' | 'categories' | 'cities';

export function DashboardChart() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    overview: any[];
    categories: any[];
    cities: any[];
  } | null>(null);

  useEffect(() => {
    const fetchChartData = async () => {
      try {
        const res = await fetch('/api/admin/chart');
        const json = await res.json();
        if (json && !json.error) {
          setData(json);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchChartData();
  }, []);

  if (loading) {
    return (
      <div className="flex w-full h-full min-h-[300px] items-center justify-center">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  const currentOverview = data?.overview || [];
  const currentCategories = data?.categories || [];
  const currentCities = data?.cities || [];

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center gap-2 mb-4 border-b border-zinc-800 pb-4">
        <button 
          onClick={() => setActiveTab('overview')}
          className={`px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-md transition-colors ${activeTab === 'overview' ? 'bg-accent text-black' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}
        >
          Общий рост
        </button>
        <button 
          onClick={() => setActiveTab('categories')}
          className={`px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-md transition-colors ${activeTab === 'categories' ? 'bg-accent text-black' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}
        >
          Категории
        </button>
        <button 
          onClick={() => setActiveTab('cities')}
          className={`px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-md transition-colors ${activeTab === 'cities' ? 'bg-accent text-black' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}
        >
          Города
        </button>
      </div>

      <div className="flex-1 w-full min-h-[300px]">
        {activeTab === 'overview' && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={currentOverview} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="name" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis yAxisId="left" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => val + '₽'} />
              <YAxis yAxisId="right" orientation="right" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px' }}
                itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                labelStyle={{ color: '#a1a1aa', fontSize: '10px', marginBottom: '4px' }}
              />
              <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
              <Area yAxisId="left" type="monotone" name="Доход (₽)" dataKey="revenue" stroke="var(--accent)" fillOpacity={1} fill="url(#colorRevenue)" />
              <Bar yAxisId="right" name="Новые Лиды" dataKey="leads" fill="#00F0FF" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Line yAxisId="right" type="monotone" name="Пользователи" dataKey="users" stroke="#FF00E5" strokeWidth={2} dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'categories' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={currentCategories} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
              <XAxis type="number" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} width={80} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px' }}
              />
              <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
              <Bar name="Лиды (шт)" dataKey="leads" fill="#00F0FF" radius={[0, 4, 4, 0]} />
              <Bar name="Доход (₽)" dataKey="revenue" fill="var(--accent)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'cities' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={currentCities} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="name" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px' }}
                cursor={{ fill: '#27272a', opacity: 0.4 }}
              />
              <Bar name="Кол-во лидов" dataKey="value" fill="#FF8A00" radius={[4, 4, 0, 0]} maxBarSize={60} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
