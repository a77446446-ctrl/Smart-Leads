'use client';

import Link from 'next/link';
import { useBranding } from '@/components/BrandingProvider';

export function LegalFooter() {
  const brand = useBranding();
  return (
    <footer className="mx-auto w-full max-w-2xl px-6 pb-28 pt-8 text-center text-xs text-zinc-500">
      <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2">
        <Link href="/legal/offer" className="underline hover:text-black">Публичная оферта</Link>
        <Link href="/legal/privacy" className="underline hover:text-black">Политика конфиденциальности</Link>
        <Link href="/legal/consent" className="underline hover:text-black">Согласие на обработку данных</Link>
        <Link href="/support" className="underline hover:text-black">Поддержка</Link>
      </nav>
      <p className="mt-3">© {new Date().getFullYear()} {brand.name}</p>
    </footer>
  );
}
