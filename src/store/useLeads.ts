import { create } from 'zustand';
import { Lead } from '@/types';

interface LeadsState {
  leads: Lead[];
  myLeads: Lead[];
  isLoading: boolean;
  setLeads: (leads: Lead[]) => void;
  setMyLeads: (leads: Lead[]) => void;
  buyLead: (leadId: string) => void;
}

export const useLeads = create<LeadsState>((set) => ({
  leads: [
    {
      id: '1',
      title: '🔥 Срочно нужен электрик',
      raw_text: 'Нужен электрик для замены проводки в квартире.',
      phone: '',
      city: 'Москва',
      category_id: 'cat_electric',
      score: 92,
      price: 100,
      status: 'new',
      created_at: new Date().toISOString(),
    },
    {
      id: '2',
      title: 'Сантехник - установка бойлера',
      raw_text: 'Необходимо установить бойлер в частном доме.',
      phone: '',
      city: 'Санкт-Петербург',
      category_id: 'cat_plumber',
      score: 85,
      price: 150,
      status: 'new',
      created_at: new Date().toISOString(),
    },
  ],
  myLeads: [],
  isLoading: false,
  setLeads: (leads) => set({ leads }),
  setMyLeads: (myLeads) => set({ myLeads }),
  buyLead: (leadId) => set((state) => {
    const lead = state.leads.find(l => l.id === leadId);
    if (!lead) return state;
    return {
      leads: state.leads.filter(l => l.id !== leadId),
      myLeads: [...state.myLeads, { ...lead, status: 'sold' as const }]
    };
  }),
}));
