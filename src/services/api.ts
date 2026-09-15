import { Lead, User, Category } from '@/types';

export const api = {
  leads: {
    getAll: async (categoryId?: string): Promise<Lead[]> => {
      const url = categoryId ? `/api/leads?categoryId=${categoryId}` : '/api/leads';
      const res = await fetch(url);
      return res.json();
    },
    buy: async (leadId: string) => {
      const res = await fetch('/api/buy-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      });
      return res.json();
    }
  },
  admin: {
    getStats: async () => {
      const res = await fetch('/api/admin/stats');
      return res.json();
    },
    updateCategory: async (data: Partial<Category>) => {
      const res = await fetch('/api/admin/category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.json();
    }
  },
  profile: {
    get: async (): Promise<User> => {
      const res = await fetch('/api/profile');
      return res.json();
    }
  }
};
