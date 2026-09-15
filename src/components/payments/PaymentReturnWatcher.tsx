'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export function PaymentReturnWatcher() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('payment');
    if (!id) return;
    let stopped = false;
    const run = async () => {
      setMessage('Проверяем оплату…');
      for (let attempt = 0; attempt < 15 && !stopped; attempt++) {
        try {
          const response = await fetch(`/api/payments/status?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
          const data = await response.json() as { status?: string; creditedAt?: string | null };
          if (data.status === 'SUCCEEDED' && data.creditedAt) {
            setMessage('Оплата подтверждена');
            window.history.replaceState(null, '', window.location.pathname);
            window.setTimeout(() => window.location.reload(), 700);
            return;
          }
          if (['CANCELED', 'FAILED'].includes(data.status || '')) { setMessage('Платёж не завершён'); return; }
        } catch { /* webhook или сеть могут отставать */ }
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      }
      if (!stopped) setMessage('Платёж обрабатывается. Баланс обновится после подтверждения ЮKassa.');
    };
    void run();
    return () => { stopped = true; };
  }, []);

  if (!message) return null;
  return <div className="fixed left-4 right-4 top-20 z-50 mx-auto flex max-w-md items-center gap-3 border border-black bg-white p-4 text-sm font-bold shadow-[4px_4px_0_0_#000]"><Loader2 className="animate-spin" size={18} />{message}</div>;
}
