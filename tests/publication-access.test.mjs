import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './helpers/load-ts.mjs';
import * as contacts from '../src/lib/redact-contact.ts';
import * as titles from '../src/lib/lead-title.ts';
import * as content from '../src/lib/lead-content.ts';

class AuthenticationError extends Error {}
const next = { NextResponse: { json: (body, init) => Response.json(body, init) } };

test('лента открывает контакты только явно бесплатной публикации, старый лид остаётся закрытым', async () => {
  const rows = ['PUBLIC', 'CONTACT', undefined].map((accessMode, index) => ({
    id: `row-${index}`, title: `Материал ${index}`, rawText: `Материал ${index}\nКонтакт +79991234567`, phone: '+79991234567',
    category: { slug: 'sport', name: 'Спорт' }, allowContactless: true, accessMode, price: 0, sourceChat: 'https://max.ru/private',
  }));
  const route = loadTs('src/app/api/leads/route.ts', {
    'next/server': next,
    '@/lib/auth/current-user': { AuthenticationError, requireCurrentUser: async () => ({ id: 'reader' }) },
    '@/lib/prisma': { prisma: { lead: { findMany: async () => rows } } },
    '@/lib/redact-contact': contacts, '@/lib/lead-title': titles, '@/lib/lead-content': content,
  });
  const response = await route.GET(new Request('https://app.example/api/leads'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body[0].rawText, /79991234567/);
  for (const row of body.slice(1)) {
    assert.doesNotMatch(row.rawText, /79991234567/);
    assert.equal(row.phone, null);
  }
  assert.ok(body.every(row => row.sourceChat === null));
});

test('прямой запрос покупки бесплатной публикации не меняет баланс, статус и покупки', async () => {
  let unexpected = 0;
  const tx = {
    purchase: { findFirst: async () => null },
    lead: { findUnique: async () => ({ id: 'news', status: 'NEW', accessMode: 'PUBLIC' }) },
  };
  const route = loadTs('src/app/api/buy-lead/route.ts', {
    'next/server': next, '@prisma/client': { Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } } },
    '@/lib/auth/current-user': { AuthenticationError, requireCurrentUser: async () => ({ id: 'reader' }) },
    '@/lib/money': { kopecksToRubles: value => value / 100, rublesToKopecks: value => { unexpected++; return value * 100; } },
    '@/lib/prisma': { prisma: { $transaction: operation => operation(tx) } },
    '@/services/bot-outbox': { enqueuePurchaseDelivery: async () => { unexpected++; } },
    '@/lib/legal': { hasCurrentLegalAcceptance: async () => true },
  });
  const response = await route.POST(new Request('https://app.example/api/buy-lead', { method: 'POST', body: JSON.stringify({ leadId: 'news' }) }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'PUBLICATION_NOT_PURCHASABLE');
  assert.equal(unexpected, 0);
});
