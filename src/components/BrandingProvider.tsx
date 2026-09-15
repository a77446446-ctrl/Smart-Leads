'use client';

import { createContext, useContext } from 'react';
import { DEFAULT_BRANDING, type Branding } from '@/lib/branding';

const BrandingContext = createContext<Branding>({ ...DEFAULT_BRANDING });

export function BrandingProvider({ value, children }: { value: Branding; children: React.ReactNode }) {
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() { return useContext(BrandingContext); }
