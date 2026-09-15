'use client';

import { useEffect, useState } from 'react';
import { Check, CreditCard, Loader2, Wallet } from 'lucide-react';
import { useUser } from '@/store/useUser';

type CategoryPlan = { id: string; name: string; subscriptionPrice: number; days: number };

export function PaymentCenter() {
  const [plans, setPlans] = useState<CategoryPlan[]>([]);
  const [presets, setPresets] = useState<number[]>([]);
  const [amount, setAmount] = useState(500);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/payments/plans', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Не удалось загрузить тарифы');
        return response.json() as Promise<{ categories: CategoryPlan[]; topupPresets: number[] }>;
      })
      .then((data) => { 
        setPlans(data.categories); 
        setPresets(data.topupPresets); 
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Ошибка тарифов'));
  }, []);

  const pay = async (payload: { kind: 'TOPUP' | 'SUBSCRIPTION'; amount?: number; categoryId?: string }, key: string) => {
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError('Укажите email для электронного чека'); return; }
    setBusy(key); setError('');
    try {
      const response = await fetch('/api/payments/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, receiptEmail: email, clientRequestId: crypto.randomUUID() }),
      });
      const data = await response.json() as { confirmationUrl?: string | null; error?: string };
      if (!response.ok || !data.confirmationUrl) throw new Error(data.error || 'ЮKassa не вернула ссылку оплаты');
      window.location.assign(data.confirmationUrl);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Ошибка оплаты'); setBusy(''); }
  };

  const { user } = useUser();

  if (user && user.monetizationEnabled === false) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-black uppercase">Подписки</h2>
        </div>
        <div className="border border-black bg-white p-6 shadow-[4px_4px_0_0_#000]">
          <h3 className="text-xl font-black uppercase mb-4">Открытый доступ</h3>
          <p className="text-sm font-bold text-gray-700">
            В данный момент все заказы и получение контактов абсолютно бесплатны. Пополнение баланса и покупка PRO-статуса не активны.
          </p>
        </div>
      </div>
    );
  }

  return <div className="space-y-8">
    <div><h2 className="text-2xl font-black uppercase">Баланс и PRO</h2><p className="mt-2 text-sm font-bold uppercase text-[#666]">Безопасная оплата на странице ЮKassa</p></div>
    {error && <div className="border border-red-700 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    <label className="block space-y-2"><span className="text-sm font-black uppercase">Email для чека</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.ru" className="w-full border border-black bg-white px-4 py-3 outline-none focus:shadow-[3px_3px_0_0_#000]" /></label>

    <section className="glass-panel border-black p-6">
      <div className="mb-5 flex items-center gap-3"><Wallet /><h3 className="text-xl font-black uppercase">Пополнить баланс</h3></div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{presets.map((value) => <button key={value} onClick={() => setAmount(value)} className={`border border-black p-3 font-black transition-colors ${amount === value ? 'bg-accent shadow-[2px_2px_0_0_#000]' : 'bg-white hover:bg-gray-50'}`}>{value} ₽</button>)}</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <input type="number" min={100} max={100000} value={amount} onChange={(event) => setAmount(Number(event.target.value))} className="w-full sm:col-span-2 border border-black px-4 py-3 font-black text-center outline-none focus:shadow-[2px_2px_0_0_#000] transition-shadow" />
        <button disabled={Boolean(busy)} onClick={() => void pay({ kind: 'TOPUP', amount: amount }, 'topup')} className="w-full sm:col-span-2 flex items-center justify-center gap-2 border border-black bg-accent px-4 py-3 text-[13px] font-black uppercase text-black shadow-[2px_2px_0_0_#000] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50">
          {busy === 'topup' ? <Loader2 className="animate-spin" size={16} /> : <CreditCard size={16} />} Оплатить
        </button>
      </div>
    </section>

    <section className="space-y-5"><h3 className="text-xl font-black uppercase">Тарифы PRO</h3>{plans.length === 0 ? <p className="text-sm text-zinc-600">Активные PRO-тарифы пока не настроены администратором.</p> : plans.map((plan) => <div key={plan.id} className="glass-panel border-black p-6"><div className="flex items-start justify-between gap-4"><div><h4 className="text-lg font-black uppercase">{plan.name} {plan.id !== 'GLOBAL_PRO' && 'PRO'}</h4><p className="mt-1 text-3xl font-black">{plan.subscriptionPrice} ₽ <span className="text-sm text-zinc-600">/ {plan.days} дней</span></p></div><div className="border border-black bg-accent p-3"><Check /></div></div><p className="my-5 text-sm font-bold">{plan.id === 'GLOBAL_PRO' ? 'Безлимитный доступ ко всем лидам всех категорий без отдельной оплаты.' : 'Доступ к лидам категории без отдельной оплаты на срок подписки.'}</p><button disabled={Boolean(busy)} onClick={() => void pay({ kind: 'SUBSCRIPTION', categoryId: plan.id }, plan.id)} className="neon-button flex w-full items-center justify-center gap-2">{busy === plan.id ? <Loader2 className="animate-spin" /> : <CreditCard />} Активировать PRO</button></div>)}</section>
    <p className="text-xs leading-5 text-zinc-500">Нажимая «Оплатить», вы переходите на защищённую страницу ЮKassa. Зачисление выполняется только после серверного подтверждения платежа.</p>
  </div>;
}
