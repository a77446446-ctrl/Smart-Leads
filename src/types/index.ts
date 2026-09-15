export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  max_id: string;
  name: string;
  role: UserRole;
  balance: number;
  rating: number;
  notify_enabled: boolean;
  bot_available: boolean;
  monetizationEnabled?: boolean;
  created_at: string;
}

export type PaymentMode = 'lead' | 'subscription' | 'hybrid';

export interface Category {
  id: string;
  name: string;
  slug: string;
  payment_mode: PaymentMode;
  lead_price: number;
  subscription_price: number;
  days: number;
  active: boolean;
}

export interface Subscription {
  id: string;
  user_id: string;
  category_id: string;
  expires_at: string;
}

export type LeadStatus = 'new' | 'sold' | 'archived';

export interface Lead {
  id: string;
  title: string;
  raw_text: string;
  phone: string;
  city: string;
  category_id: string;
  score: number;
  price: number;
  status: LeadStatus;
  created_at: string;
}

export interface Purchase {
  id: string;
  user_id: string;
  lead_id: string;
  price: number;
  created_at: string;
}

export type TransactionType = 'topup' | 'buy' | 'refund';

export interface Transaction {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  created_at: string;
}
