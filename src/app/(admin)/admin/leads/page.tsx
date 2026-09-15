'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Database, Filter, MoreVertical, Search, CheckCircle, Clock, Archive, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ALL' | 'NEW' | 'SOLD' | 'ARCHIVED' | 'SPAM'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<any>(null);
  
  // For actions dropdown
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    fetchLeads();
    
    // Auto-refresh every 10 seconds
    const interval = setInterval(() => {
      fetchLeads(true);
    }, 10000);
    
    // Close menu on outside click
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      clearInterval(interval);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchLeads = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch('/api/admin/leads?take=500');
      const data = await res.json();
      setLeads(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch leads', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить этот лид навсегда?')) return;
    try {
      const res = await fetch(`/api/admin/leads?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        alert('Лид успешно удален');
        await fetchLeads();
        setOpenMenuId(null);
        if (selectedLead?.id === id) setSelectedLead(null);
      } else {
        const data = await res.json();
        alert(`Ошибка при удалении: ${data.error || 'Неизвестная ошибка'}`);
      }
    } catch (e) {
      alert('Ошибка сети при удалении лида');
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await fetch('/api/admin/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status })
      });
      setLeads(leads.map(l => l.id === id ? { ...l, status } : l));
    } catch (e) {
      console.error('Failed to update status', e);
    }
    setOpenMenuId(null);
  };

  const formatTime = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  };

  const filteredLeads = leads
    .filter(l => activeTab === 'ALL' ? true : l.status === activeTab)
    .filter(l => l.title.toLowerCase().includes(searchQuery.toLowerCase()) || l.city.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-0 pb-20 font-sans sm:px-6">
      <div className="flex flex-col gap-4 border-b border-zinc-700 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="bg-accent border border-zinc-700 p-2.5 text-black rounded-lg">
            <Database size={20} />
          </div>
          <h1 className="text-xs sm:text-sm font-bold tracking-widest text-white uppercase leading-none">ЛИДЫ</h1>
        </div>
        <div className="flex w-full gap-2 md:w-auto">
          <div className="relative min-w-0 flex-1 md:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input 
              type="text" 
              placeholder="Поиск лидов..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-10 pr-4 text-[10px] font-bold uppercase tracking-wider text-white transition-colors placeholder:text-zinc-500 focus:border-accent focus:outline-none"
            />
          </div>
          <button onClick={() => fetchLeads()} className="bg-zinc-900 p-2 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors rounded-lg"><Filter size={18} /></button>
        </div>
      </div>

      <div className="flex flex-col rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden shadow-lg">
        <div className="flex items-center gap-3 p-4 sm:p-6 border-b border-zinc-800">
           <div className="w-8 h-8 border border-zinc-700 bg-zinc-950 flex items-center justify-center text-zinc-400">
              <Database size={14} />
           </div>
           <h3 className="font-bold text-[10px] uppercase tracking-[0.2em] text-zinc-400">СПИСОК ЛИДОВ</h3>
        </div>
        <div className="relative z-10 overflow-x-auto p-0">
          <div className="flex min-w-max gap-4 border-b border-zinc-700 bg-zinc-800/30 p-4 sm:gap-4 sm:p-6 sm:px-8">
            <button onClick={() => setActiveTab('ALL')} className={cn("text-xs font-bold pb-2 border-b-4 transition-all uppercase tracking-wider", activeTab === 'ALL' ? "text-white border-accent" : "text-zinc-500 border-transparent hover:text-white")}>ВСЕ</button>
            <button onClick={() => setActiveTab('NEW')} className={cn("text-xs font-bold pb-2 border-b-4 transition-all uppercase tracking-wider", activeTab === 'NEW' ? "text-white border-accent" : "text-zinc-500 border-transparent hover:text-white")}>НОВЫЕ</button>
            <button onClick={() => setActiveTab('SOLD')} className={cn("text-xs font-bold pb-2 border-b-4 transition-all uppercase tracking-wider", activeTab === 'SOLD' ? "text-white border-accent" : "text-zinc-500 border-transparent hover:text-white")}>ПРОДАННЫЕ</button>
            <button onClick={() => setActiveTab('ARCHIVED')} className={cn("text-xs font-bold pb-2 border-b-4 transition-all uppercase tracking-wider", activeTab === 'ARCHIVED' ? "text-white border-accent" : "text-zinc-500 border-transparent hover:text-white")}>АРХИВ</button>
            <button onClick={() => setActiveTab('SPAM')} className={cn("text-xs font-bold pb-2 border-b-4 transition-all uppercase tracking-wider", activeTab === 'SPAM' ? "text-red-500 border-red-500" : "text-zinc-500 border-transparent hover:text-red-400")}>СПАМ</button>
          </div>

          <div className="overflow-x-auto overflow-y-auto max-h-[400px] p-0 custom-scrollbar relative">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-white">
                <Loader2 className="animate-spin" size={32} />
              </div>
            ) : (
              <>
                <div className="sm:hidden flex flex-col divide-y divide-zinc-800/50 min-h-[300px]">
                  {filteredLeads.length === 0 ? (
                    <div className="text-center py-12 text-zinc-500 font-bold text-xs uppercase tracking-widest">Лидов не найдено</div>
                  ) : filteredLeads.map((lead) => (
                    <div key={lead.id} className="py-4 px-4 flex flex-col gap-3 cursor-pointer hover:bg-zinc-800/30 transition-colors relative" onClick={() => setSelectedLead(lead)}>
                      <div className="flex justify-between items-start gap-4">
                        <div className="font-bold text-xs text-white leading-snug">{lead.title}</div>
                        <div className="relative shrink-0">
                          <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === lead.id ? null : lead.id)}} className="p-2 text-zinc-400 hover:text-white transition-all bg-zinc-800 rounded-lg"><MoreVertical size={14} /></button>
                          {openMenuId === lead.id && (
                            <div className="absolute right-0 top-10 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden z-50 min-w-[140px] flex flex-col text-left" onClick={e => e.stopPropagation()}>
                              {lead.status !== 'ARCHIVED' && (
                                <button onClick={() => handleUpdateStatus(lead.id, 'ARCHIVED')} className="px-4 py-3 text-[10px] font-bold text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-2.5 transition-colors uppercase tracking-widest border-b border-zinc-800">
                                  <Archive size={12} /> В архив
                                </button>
                              )}
                              {lead.status === 'ARCHIVED' && (
                                <button onClick={() => handleUpdateStatus(lead.id, 'NEW')} className="px-4 py-3 text-[10px] font-bold text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-2.5 transition-colors uppercase tracking-widest border-b border-zinc-800">
                                  <Clock size={12} /> Вернуть
                                </button>
                              )}
                              <button onClick={() => handleDelete(lead.id)} className="px-4 py-3 text-[10px] font-bold text-red-500 hover:bg-red-950 flex items-center gap-2.5 transition-colors uppercase tracking-widest">
                                <Trash2 size={12} /> Удалить
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-[10px]">
                        <div className="text-zinc-400 font-bold">{lead.city}</div>
                        <div className="font-bold text-white text-sm bg-zinc-800 px-2 py-1 rounded">{lead.price}₽</div>
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        <div className="flex items-center gap-2">
                          {lead.status === 'NEW' && <span className="bg-blue-900/30 text-blue-400 text-[9px] font-bold px-1.5 py-0.5 border border-blue-800 rounded uppercase flex items-center gap-1 w-fit"><Clock size={10}/> Новый</span>}
                          {lead.status === 'SOLD' && <span className="bg-green-900/30 text-green-400 text-[9px] font-bold px-1.5 py-0.5 border border-green-800 rounded uppercase flex items-center gap-1 w-fit"><CheckCircle size={10}/> Продан</span>}
                          {lead.status === 'SPAM' && <span className="bg-red-900/30 text-red-400 text-[9px] font-bold px-1.5 py-0.5 border border-red-800 rounded uppercase flex items-center gap-1 w-fit"><AlertCircle size={10}/> Спам</span>}
                          {lead.status === 'ARCHIVED' && <span className="bg-zinc-800 text-zinc-400 text-[9px] font-bold px-1.5 py-0.5 border border-zinc-700 rounded uppercase flex items-center gap-1 w-fit"><Archive size={10}/> Архив</span>}
                        </div>
                        <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">{formatTime(lead.createdAt)}</div>
                      </div>
                    </div>
                  ))}
                </div>
                
                <table className="hidden sm:table w-full min-w-[900px] text-left" ref={menuRef}>
                  <thead className="bg-zinc-900/95 backdrop-blur sticky top-0 z-10 text-[9px] uppercase font-bold text-zinc-400 tracking-[0.2em] border-b border-zinc-800 shadow-sm">
                    <tr>
                      <th className="px-8 py-5">Лид</th>
                      <th className="px-6 py-5">Город</th>
                      <th className="px-6 py-5">Цена</th>
                      <th className="px-6 py-5">Статус</th>
                      <th className="px-6 py-5">Время</th>
                      <th className="px-8 py-5 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50 bg-transparent">
                  {filteredLeads.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-zinc-500 font-bold text-xs uppercase tracking-widest">Лидов не найдено</td></tr>
                  ) : filteredLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-zinc-800/50 transition-colors group cursor-pointer" onClick={() => setSelectedLead(lead)}>
                      <td className="px-8 py-5">
                        <div className="font-bold text-sm text-white group-hover:text-accent transition-colors leading-tight">{lead.title}</div>
                        <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-1 flex gap-2 items-center font-bold">
                          <span>ID: {lead.id.substring(0, 8)}</span>
                          {lead.sourceChat && (
                            <span className="text-zinc-600 truncate max-w-[150px]" title={lead.sourceChat}>
                              • {lead.sourceChat.replace('https://web.max.ru/', '')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-xs text-zinc-400 font-bold">{lead.city}</td>
                      <td className="px-6 py-5 text-sm font-bold text-white">{lead.price}₽</td>
                      <td className="px-6 py-5">
                        {lead.status === 'NEW' && <span className="bg-blue-900/30 text-blue-400 text-[9px] font-bold px-2 py-0.5 border border-blue-800 rounded uppercase flex items-center gap-1 w-fit"><Clock size={10}/> Новый</span>}
                        {lead.status === 'SOLD' && <span className="bg-green-900/30 text-green-400 text-[9px] font-bold px-2 py-0.5 border border-green-800 rounded uppercase flex items-center gap-1 w-fit"><CheckCircle size={10}/> Продан</span>}
                        {lead.status === 'SPAM' && <span className="bg-red-900/30 text-red-400 text-[9px] font-bold px-2 py-0.5 border border-red-800 rounded uppercase flex items-center gap-1 w-fit"><AlertCircle size={10}/> Спам</span>}
                        {lead.status === 'ARCHIVED' && <span className="bg-zinc-800 text-zinc-400 text-[9px] font-bold px-2 py-0.5 border border-zinc-700 rounded uppercase flex items-center gap-1 w-fit"><Archive size={10}/> Архив</span>}
                      </td>
                      <td className="px-6 py-5 text-[10px] text-zinc-500 font-bold">{formatTime(lead.createdAt)}</td>
                      <td className="px-8 py-5 text-right relative">
                        <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === lead.id ? null : lead.id)}} className="p-2.5 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all border border-transparent hover:border-zinc-600 bg-zinc-800 rounded-lg"><MoreVertical size={14} /></button>
                        
                        {openMenuId === lead.id && (
                          <div className="absolute right-8 top-12 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden z-50 min-w-[160px] flex flex-col text-left" onClick={e => e.stopPropagation()}>
                            {lead.status !== 'ARCHIVED' && (
                              <button onClick={() => handleUpdateStatus(lead.id, 'ARCHIVED')} className="px-4 py-3 text-[10px] font-bold text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-2.5 transition-colors uppercase tracking-widest border-b border-zinc-800">
                                <Archive size={12} /> В архив
                              </button>
                            )}
                            {lead.status === 'ARCHIVED' && (
                              <button onClick={() => handleUpdateStatus(lead.id, 'NEW')} className="px-4 py-3 text-[10px] font-bold text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-2.5 transition-colors uppercase tracking-widest border-b border-zinc-800">
                                <Clock size={12} /> Вернуть
                              </button>
                            )}
                            <button onClick={() => handleDelete(lead.id)} className="px-4 py-3 text-[10px] font-bold text-red-500 hover:bg-red-950 flex items-center gap-2.5 transition-colors uppercase tracking-widest">
                              <Trash2 size={12} /> Удалить
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          </div>
        </div>
      </div>

      {/* MODAL VIEW */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedLead(null)}>
          <div 
            className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-4 sm:p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="absolute right-4 top-4 sm:right-6 sm:top-4 sm:p-6">
               <button onClick={() => setSelectedLead(null)} className="text-zinc-400 hover:text-white transition-colors">
                 <span className="text-[10px] uppercase font-bold tracking-widest border border-zinc-700 bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700 rounded-lg transition-colors">Закрыть</span>
               </button>
            </div>
            
            <h3 className="mb-3 pr-20 text-base font-bold text-white sm:text-lg leading-snug">{selectedLead.title}</h3>
            <div className="mb-4 flex flex-wrap gap-2">
               <span className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded text-[9px] font-bold px-2 py-0.5 uppercase">{selectedLead.category?.name || 'Другое'}</span>
               <span className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded text-[9px] font-bold px-2 py-0.5 uppercase">{selectedLead.city}</span>
               {selectedLead.sourceChat && (
                 <span className="bg-accent/10 border border-accent/50 text-accent rounded text-[9px] font-bold px-2 py-0.5 uppercase truncate max-w-[150px]">
                   {selectedLead.sourceChat.replace('https://web.max.ru/', '')}
                 </span>
               )}
            </div>
            
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-xs sm:text-sm text-zinc-300 whitespace-pre-wrap max-h-[50vh] overflow-y-auto leading-relaxed font-normal">
              {selectedLead.rawText}
            </div>
            
            <div className="mt-5 flex items-center justify-between border-t border-zinc-800 pt-5">
               <div className="text-[9px] text-zinc-500 uppercase tracking-widest flex flex-col gap-1 font-bold">
                 <span>ID: {selectedLead.id}</span>
                 <span>Получено: {formatTime(selectedLead.createdAt)}</span>
               </div>
               <div className="text-xs sm:text-sm font-bold text-black bg-accent rounded px-2.5 py-1.5">{selectedLead.price} ₽</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
