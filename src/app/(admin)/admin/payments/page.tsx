'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowDownLeft, ArrowUpRight, CreditCard, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Transaction {
  id: string;
  type: 'TOPUP' | 'BUY' | 'REFUND';
  amount: string;
  createdAt: string;
  user: {
    name: string;
    maxId: string;
  };
}

function transactionLabel(type: Transaction['type']) {
  if (type === 'TOPUP') return 'Пополнение';
  if (type === 'BUY') return 'Покупка лида';
  return 'Возврат';
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ru-RU');
}

function TransactionIcon({ type }: { type: Transaction['type'] }) {
  return (
    <div
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
        type === 'TOPUP'
          ? 'border-green-800 bg-green-900/30 text-green-400'
          : type === 'BUY'
            ? 'border-accent/50 bg-accent/10 text-accent'
            : 'border-red-800 bg-red-900/30 text-red-400',
      )}
    >
      {type === 'TOPUP' ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
    </div>
  );
}

export default function PaymentsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/payments', { cache: 'no-store' });
      const data: unknown = await response.json();

      if (!response.ok) {
        const message = typeof data === 'object' && data !== null && 'error' in data
          ? String(data.error)
          : 'Не удалось загрузить платежи';
        throw new Error(message);
      }

      if (!Array.isArray(data)) {
        throw new Error('Сервер вернул некорректный список платежей');
      }

      setTransactions(data as Transaction[]);
    } catch (reason) {
      setTransactions([]);
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить платежи');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTransactions();
  }, [fetchTransactions]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-0 pb-20 font-sans sm:px-6">
      <div className="flex flex-col gap-4 border-b border-zinc-700 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="bg-accent border border-zinc-700 p-2.5 text-black rounded-lg">
            <CreditCard size={20} />
          </div>
          <h1 className="text-xs sm:text-sm font-bold tracking-widest text-white uppercase leading-none">ПЛАТЕЖИ</h1>
        </div>
        <button
          type="button"
          onClick={() => void fetchTransactions()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 border border-zinc-700 text-accent text-[9px] font-bold uppercase tracking-widest transition-all hover:bg-zinc-700 sm:ml-4"
        >
          {loading ? <RefreshCw className="animate-spin" size={12} /> : <RefreshCw size={12} />}
          <span>ОБНОВИТЬ</span>
        </button>
      </div>

      {error && (
        <div className="flex flex-col gap-4 rounded-xl border border-red-800 bg-red-950/40 p-4 text-red-200 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 shrink-0" size={20} />
            <div><p className="font-bold uppercase">Не удалось открыть платежи</p><p className="mt-1 text-sm text-red-300">{error}</p></div>
          </div>
          <button type="button" onClick={() => void fetchTransactions()} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-700 px-4 text-xs font-bold uppercase hover:bg-red-900/50">
            <RefreshCw size={16} /> Повторить
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-64 items-center justify-center"><RefreshCw className="animate-spin text-accent" size={32} /></div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="space-y-3 md:hidden max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
            {transactions.map((transaction) => (
              <article key={transaction.id} className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-lg">
                <div className="flex items-center gap-3">
                  <TransactionIcon type={transaction.type} />
                  <div className="min-w-0 flex-1"><div className="font-bold text-white">{transactionLabel(transaction.type)}</div><div className="mt-1 truncate text-[10px] font-bold text-zinc-500">{formatDate(transaction.createdAt)}</div></div>
                  <div className={cn('text-lg font-bold', transaction.type === 'TOPUP' ? 'text-green-400' : 'text-white')}>
                    {transaction.type === 'TOPUP' ? '+' : '-'}{transaction.amount} ₽
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-4">
                  <div className="min-w-0"><div className="truncate text-xs sm:text-sm font-bold text-white">{transaction.user.name}</div><div className="mt-1 truncate text-[10px] font-bold text-zinc-500">ID: {transaction.user.maxId}</div></div>
                  <span className="rounded border border-green-800 bg-green-900/30 px-2 py-1 text-[9px] font-bold uppercase text-green-400">Успешно</span>
                </div>
              </article>
            ))}
          </div>

          <div className="hidden md:flex flex-col rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden shadow-lg mt-6">
            <div className="flex items-center gap-3 p-4 sm:p-6 border-b border-zinc-800 shrink-0">
               <div className="w-8 h-8 border border-zinc-700 bg-zinc-950 flex items-center justify-center text-zinc-400">
                  <CreditCard size={14} />
               </div>
               <h3 className="font-bold text-[10px] uppercase tracking-[0.2em] text-zinc-400">ИСТОРИЯ ПЛАТЕЖЕЙ</h3>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[400px] p-0 custom-scrollbar relative">
              <table className="w-full min-w-[850px] border-collapse text-left">
                <thead className="sticky top-0 bg-zinc-900/95 backdrop-blur z-10 shadow-sm"><tr className="border-b border-zinc-800 text-[10px] font-bold uppercase tracking-widest text-zinc-400"><th className="px-8 py-4">Тип</th><th className="px-6 py-4">Сумма</th><th className="px-6 py-4">Пользователь</th><th className="px-6 py-4">Дата и время</th><th className="px-8 py-4 text-right">Статус</th></tr></thead>
                <tbody className="text-sm bg-transparent">
                  {transactions.map((transaction) => (
                    <tr key={transaction.id} className="border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/50">
                      <td className="px-8 py-4"><div className="flex items-center gap-3"><TransactionIcon type={transaction.type} /><div className="font-bold text-white">{transactionLabel(transaction.type)}</div></div></td>
                      <td className={cn('px-6 py-4 text-lg font-bold', transaction.type === 'TOPUP' ? 'text-green-400' : 'text-white')}>{transaction.type === 'TOPUP' ? '+' : '-'}{transaction.amount} ₽</td>
                      <td className="px-6 py-4"><div className="font-bold text-white">{transaction.user.name}</div><div className="text-[10px] font-bold text-zinc-500">ID: {transaction.user.maxId}</div></td>
                      <td className="px-6 py-4 font-bold text-zinc-400">{formatDate(transaction.createdAt)}</td>
                      <td className="px-8 py-4 text-right"><span className="rounded border border-green-800 bg-green-900/30 px-2 py-1 text-[10px] font-bold uppercase text-green-400">Успешно</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {transactions.length === 0 && !error && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 py-16 text-center font-bold uppercase text-zinc-500">Транзакции не найдены</div>
          )}
        </motion.div>
      )}
    </div>
  );
}
