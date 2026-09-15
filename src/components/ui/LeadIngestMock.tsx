'use client';

import React, { useState } from 'react';
import { Send, Cpu, CheckCircle } from 'lucide-react';

export const LeadIngestMock = () => {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  const handleIngest = async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: text }),
      });
      const data = await res.json();
      console.log('Ingest result:', data);
      setStatus('success');
      setText('');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (error) {
      console.error(error);
      setStatus('idle');
    }
  };

  return (
    <div className="flex flex-col h-full rounded-xl border border-zinc-700 bg-zinc-900 p-4 sm:p-4 sm:p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-8 h-8 border border-zinc-700 bg-zinc-950 flex items-center justify-center text-accent">
          <Cpu size={14} />
        </div>
        <h3 className="font-bold text-[10px] uppercase tracking-[0.2em] text-zinc-400">AI ПАРСЕР (ТЕСТ)</h3>
      </div>
      
      <textarea 
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Вставьте сырой текст заказа (например: 'нужен электрик в москве починить розетку')"
        className="w-full h-32 bg-zinc-950 border border-zinc-700 rounded-lg p-4 text-sm focus:outline-none focus:border-accent text-white"
      />

      <button 
        onClick={handleIngest}
        disabled={status === 'loading' || !text}
        className="w-full bg-accent text-black font-bold py-4 px-6 rounded-lg hover:brightness-95 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {status === 'loading' ? (
          'Обработка AI...'
        ) : status === 'success' ? (
          <>
            <CheckCircle size={18} />
            Лид добавлен
          </>
        ) : (
          <>
            <Send size={18} />
            Отправить в обработку
          </>
        )}
      </button>
    </div>
  );
};
