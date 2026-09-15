import Link from 'next/link';
import type { ReactNode } from 'react';
import { getLegalConfig } from '@/lib/legal';

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const config = getLegalConfig();
  return (
    <main className="min-h-screen bg-[#efefef] px-5 py-10 text-black">
      <article className="mx-auto max-w-3xl border border-black bg-white p-6 shadow-[6px_6px_0_0_#000] sm:p-10">
        <Link href="/consent" className="text-sm font-bold underline">← К подтверждению</Link>
        <h1 className="mt-6 text-3xl font-black uppercase">{title}</h1>
        <p className="mt-2 text-sm text-zinc-600">Версия {config.version}, действует с {config.effectiveDate}</p>
        {config.missing.length > 0 && (
          <div className="mt-6 border border-red-700 bg-red-50 p-4 text-sm text-red-800">
            Приём реальных платежей запрещён до заполнения реквизитов оператора: {config.missing.join(', ')}.
          </div>
        )}
        <div className="prose prose-zinc mt-8 max-w-none space-y-6 text-sm leading-7">{children}</div>
        <div className="mt-10 flex flex-wrap gap-4 border-t border-zinc-300 pt-6 text-sm">
          <Link href="/legal/offer" className="underline">Оферта</Link><Link href="/legal/privacy" className="underline">Конфиденциальность</Link><Link href="/legal/consent" className="underline">Согласие</Link><Link href="/support" className="underline">Поддержка</Link>
        </div>
      </article>
    </main>
  );
}
