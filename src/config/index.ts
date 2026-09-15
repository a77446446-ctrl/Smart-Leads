import { DEFAULT_BRANDING } from '@/lib/branding';

export const APP_CONFIG = {
  name: DEFAULT_BRANDING.name,
  version: '1.0.0',
  colors: {
    background: '#ffffff',
    text: '#000000',
    accent: 'var(--accent)',
    secondary: '#ffffff',
  },
  api: {
    baseUrl: process.env.NEXT_PUBLIC_API_URL || '/api',
  },
};

export const MONETIZATION_DEFAULTS = {
  subscriptionDays: 30,
  minTopup: 100,
};
