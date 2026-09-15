'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Pause, Play, Plus, Search, Trash2, X } from 'lucide-react';

type Chat = {
  id: string; url: string; name: string | null; provider: string; status: string;
  active: boolean; score: number; discoveryCount: number; lastDiscoveredAt: string;
  lastCheckedAt: string | null; lastError: string | null;
};
type Run = { id: string; status: string; queries: number; candidates: number; activated: number; error: string | null; startedAt: string };

export default function DiscoveryPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/discovery/chats', { cache: 'no-store' });
      if (!response.ok) throw new Error('Не удалось загрузить источники');
      const data = await response.json() as { chats: Chat[]; runs: Run[] };
      setChats(data.chats); setRuns(data.runs); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Ошибка загрузки'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async () => {
    setRunning(true); setError('');
    try {
      const response = await fetch('/api/admin/discovery/run', { method: 'POST' });
      const data = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.message || data.error || 'Поиск завершился с ошибкой');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Ошибка поиска'); }
    finally { setRunning(false); }
  };

  const add = async () => {
    if (!url.trim()) return;
    const response = await fetch('/api/admin/discovery/chats', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) { setError(data.error || 'Не удалось добавить чат'); return; }
    setUrl(''); await load();
  };

  const setStatus = async (id: string, status: 'ACTIVE' | 'PENDING' | 'REJECTED') => {
    const response = await fetch('/api/admin/discovery/chats', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }),
    });
    if (!response.ok) { setError('Не удалось изменить статус'); return; }
    await load();
  };

  const deleteChat = async (id: string, name: string | null) => {
    if (!confirm(`Удалить источник «${name || 'MAX-чат'}»?`)) return;
    const response = await fetch('/api/admin/discovery/chats', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    });
    if (!response.ok) { setError('Не удалось удалить источник'); return; }
    await load();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-0 pb-20 font-sans sm:px-6">
      <div className="flex flex-col gap-4 border-b border-zinc-700 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="bg-accent border border-zinc-700 p-2.5 text-black rounded-lg">
            <Search size={20} />
          </div>
          <h1 className="text-xs sm:text-sm font-bold tracking-widest text-white uppercase leading-none">ДЕТЕКТИВ</h1>
        </div>
        <button
          onClick={() => void run()}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 border border-zinc-700 text-accent text-[9px] font-bold uppercase tracking-widest transition-all hover:bg-zinc-700 sm:ml-4"
        >
          {running ? <Loader2 className="animate-spin" size={12} /> : <Search size={12} />}
          <span>ЗАПУСТИТЬ ПОИСК</span>
        </button>
      </div>
      {error && <div className="rounded-xl border border-red-700 bg-red-950/40 p-4 text-sm text-red-200">{error}</div>}
      <section className="flex flex-col rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden shadow-lg mt-6">
        <div className="flex items-center gap-3 p-4 sm:p-6 border-b border-zinc-800">
           <div className="w-8 h-8 border border-zinc-700 bg-zinc-950 flex items-center justify-center text-zinc-400">
              <Plus size={14} />
           </div>
           <h3 className="font-bold text-[10px] uppercase tracking-[0.2em] text-zinc-400">ДОБАВИТЬ MAX-ЧАТ ВРУЧНУЮ</h3>
        </div>
        <div className="p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row"><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://max.ru/..." className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-accent font-bold text-sm text-white" /><button onClick={() => void add()} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-5 font-bold uppercase text-xs hover:border-accent text-white"><Plus size={16} /> Добавить</button></div>
        </div>
      </section>
      <section className="flex flex-col rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden shadow-lg mt-6">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-zinc-800">
           <div className="flex items-center gap-3">
             <div className="w-8 h-8 border border-zinc-700 bg-zinc-950 flex items-center justify-center text-zinc-400">
                <Search size={14} />
             </div>
             <h3 className="font-bold text-[10px] uppercase tracking-[0.2em] text-zinc-400">ИСТОЧНИКИ: {chats.length}</h3>
           </div>
        </div>
        <div className="p-0">
          {loading ? <div className="p-4 sm:p-6 text-zinc-400 font-bold uppercase tracking-widest text-xs">Загрузка…</div> : chats.length === 0 ? <div className="p-4 sm:p-6 text-zinc-500 font-bold uppercase tracking-widest text-xs">Источники пока не найдены</div> : <div className="divide-y divide-zinc-800/50">{chats.map((chat) => (
            <div key={chat.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] hover:bg-zinc-800/30 transition-colors">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-white">{chat.name || 'MAX-чат'}</span><span className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-zinc-400">{chat.provider}</span><span className="text-[9px] border border-accent/30 font-bold uppercase tracking-widest bg-accent/10 px-2 py-0.5 rounded text-accent">оценка {chat.score}</span></div><a href={chat.url} target="_blank" rel="noreferrer" className="mt-2 block truncate text-xs text-zinc-400 hover:text-white font-bold">{chat.url}</a><p className="mt-2 text-[10px] uppercase tracking-widest font-bold text-zinc-500">Найден {chat.discoveryCount} раз · {new Date(chat.lastDiscoveredAt).toLocaleString('ru-RU')}</p>{chat.lastError && <p className="mt-2 text-xs font-bold text-red-400">{chat.lastError}</p>}</div>
              <div className="flex items-center gap-2"><button title="Активировать" onClick={() => void setStatus(chat.id, 'ACTIVE')} className="rounded-lg border border-zinc-700 p-2.5 bg-zinc-800 text-zinc-400 hover:text-green-400 hover:border-green-500 transition-all"><Check size={14} /></button><button title="На проверку" onClick={() => void setStatus(chat.id, 'PENDING')} className="rounded-lg border border-zinc-700 p-2.5 bg-zinc-800 text-zinc-400 hover:text-yellow-400 hover:border-yellow-500 transition-all">{chat.active ? <Pause size={14} /> : <Play size={14} />}</button><button title="Отклонить" onClick={() => void setStatus(chat.id, 'REJECTED')} className="rounded-lg border border-zinc-700 p-2.5 bg-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-500 transition-all"><X size={14} /></button><button title="Удалить навсегда" onClick={() => void deleteChat(chat.id, chat.name)} className="rounded-lg border border-zinc-700 p-2.5 bg-zinc-800 text-zinc-500 hover:text-red-500 hover:border-red-600 hover:bg-red-950/50 transition-all"><Trash2 size={14} /></button></div>
            </div>
          ))}</div>}
        </div>
      </section>
      <section className="flex flex-col rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden shadow-lg mt-6">
        <div className="flex items-center gap-3 p-4 sm:p-6 border-b border-zinc-800">
           <div className="w-8 h-8 border border-zinc-700 bg-zinc-950 flex items-center justify-center text-zinc-400">
              <Play size={14} />
           </div>
           <h3 className="font-bold text-[10px] uppercase tracking-[0.2em] text-zinc-400">ПОСЛЕДНИЕ ЗАПУСКИ</h3>
        </div>
        <div className="p-4 sm:p-6">
           <div className="space-y-3">{runs.slice(0, 10).map((item) => <div key={item.id} className="flex flex-wrap justify-between items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs font-bold uppercase tracking-widest"><span className="text-white">{new Date(item.startedAt).toLocaleString('ru-RU')} <span className="text-zinc-500 mx-2">•</span> <span className={item.status === 'COMPLETED' ? 'text-green-500' : item.status === 'ERROR' ? 'text-red-500' : 'text-accent'}>{item.status}</span></span><span className="text-zinc-500">ЗАПРОСОВ: <span className="text-white">{item.queries}</span> / НАЙДЕНО: <span className="text-white">{item.candidates}</span> / АКТИВИРОВАНО: <span className="text-white">{item.activated}</span></span></div>)}</div>
        </div>
      </section>
    </div>
  );
}
