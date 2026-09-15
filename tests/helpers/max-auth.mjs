import { createHmac } from 'node:crypto';
import { loadTs } from './load-ts.mjs';
import { buildMaxDisplayName, verifyMaxInitData } from '../../src/lib/auth/max-init-data.ts';

const botToken = 'isolated-test-bot-token';

export function authHandler(prisma) {
  return loadTs('src/app/api/auth/max/route.ts', {
    'next/server': { NextResponse: { json(body, init) {
      const response = Response.json(body, init);
      response.cookies = { set() {} };
      return response;
    } } },
    '@/lib/prisma': { prisma },
    '@/lib/auth/max-init-data': { buildMaxDisplayName, verifyMaxInitData: data => verifyMaxInitData(data, botToken) },
    '@/lib/auth/session': { createSessionToken: async () => 'test-session', sessionCookie: { name: 'test', options: {}, maxAge: 60 } },
    '@/lib/auth/current-user': { serializeCurrentUser: user => ({ id: user.id, balance: user.balance }) },
    '@/lib/auth/admin-config': { isConfiguredAdminMaxId: () => false },
  }).POST;
}

export function authRequest(maxId = '123456789') {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: maxId, first_name: 'Тест бонуса' }) });
  const data = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', createHmac('sha256', secret).update(data).digest('hex'));
  return new Request('http://localhost/api/auth/max', { method: 'POST', body: JSON.stringify({ initData: params.toString() }) });
}

export function memoryBonusStore(settings = {}) {
  let user = null;
  const entries = [];
  const tx = {
    blockedMaxUser: { findUnique: async () => null },
    setting: { findUnique: async ({ where }) => settings[where.key] === undefined ? null : { value: settings[where.key] } },
    user: {
      upsert: async ({ create, update }) => {
        user = user ? { ...user, ...update } : { id: 'test-user', balance: 0, onboardingBonusGrantedAt: null, ...create };
        return { ...user };
      },
      updateMany: async ({ where, data }) => {
        if (where.id !== user.id || (Object.hasOwn(where, 'onboardingBonusGrantedAt') && user.onboardingBonusGrantedAt !== where.onboardingBonusGrantedAt)) return { count: 0 };
        user.balance += data.balance.increment;
        user.onboardingBonusGrantedAt = data.onboardingBonusGrantedAt;
        return { count: 1 };
      },
      findUnique: async () => ({ ...user }),
    },
    transaction: { create: async ({ data }) => { entries.push(data); return data; } },
  };
  return { prisma: { ...tx, $transaction: callback => callback(tx) }, entries, user: () => user };
}
