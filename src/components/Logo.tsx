'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useBranding } from '@/components/BrandingProvider';

export function Logo({ className, size = 'lg' }: { className?: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const brand = useBranding();
  const [failedUrl, setFailedUrl] = useState('');
  const sizes = { sm: 'text-sm', md: 'text-xl', lg: 'text-3xl', xl: 'text-5xl' };
  return <span className={cn('inline-flex min-w-0 items-center gap-2 font-black tracking-tight', sizes[size], className)}>
    {brand.logoUrl && failedUrl !== brand.logoUrl
      ? <img src={brand.logoUrl} alt="" className="h-[1.4em] max-w-[3em] shrink-0 object-contain" onError={() => setFailedUrl(brand.logoUrl)} />
      : <span aria-hidden="true" className="inline-flex h-[1.4em] w-[1.4em] shrink-0 items-center justify-center rounded-md bg-accent text-black">{Array.from(brand.name)[0] || 'S'}</span>}
    <span className="min-w-0 break-words">{brand.name}</span>
  </span>;
}
