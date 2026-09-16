import 'server-only';

import { randomUUID } from 'crypto';
import { getBranding } from '@/lib/branding-server';
import { Prisma } from '@prisma/client';
import { getLegalConfig, hasCurrentLegalAcceptance } from '@/lib/legal';
import { kopecksToRubles, rublesToKopecks } from '@/lib/money';
import { prisma } from '@/lib/prisma';

const API = 'https://api.yookassa.ru/v3';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type YooPayment = {
  id: string; status: string; paid?: boolean; created_at?: string;
  amount?: { value?: string; currency?: string };
  confirmation?: { confirmation_url?: string };
  metadata?: Record<string, string>;
};

function credentials() {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const secret = process.env.YOOKASSA_SECRET_KEY?.trim();
  if (!shopId || !secret) throw new Error('ЮKassa не настроена');
  return { shopId, secret };
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/Basic\s+\S+/gi, 'Basic ***').slice(0, 500);
}

async function requestYoo(path: string, init?: { method?: 'POST'; body?: unknown; idempotencyKey?: string }): Promise<YooPayment> {
  const { shopId, secret } = credentials();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${API}${path}`, {
      method: init?.method || 'GET', cache: 'no-store', signal: controller.signal,
      headers: {
        Authorization: `Basic ${Buffer.from(`${shopId}:${secret}`).toString('base64')}`,
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.idempotencyKey ? { 'Idempotence-Key': init.idempotencyKey } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    const raw = await response.text();
    if (Buffer.byteLength(raw) > 1024 * 1024) throw new Error('Ответ ЮKassa превышает лимит');
    const payload = JSON.parse(raw) as YooPayment & { description?: string };
    if (!response.ok) throw new Error(`ЮKassa HTTP ${response.status}: ${payload.description || 'ошибка API'}`);
    return payload;
  } finally { clearTimeout(timer); }
}

function amountValue(kopecks: number): string {
  return kopecksToRubles(kopecks).toFixed(2);
}

function returnUrl(orderId: string): string {
  const configured = process.env.YOOKASSA_RETURN_URL || `${process.env.NEXT_PUBLIC_APP_URL || ''}/subscriptions`;
  const url = new URL(configured);
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')) {
    throw new Error('YOOKASSA_RETURN_URL должен использовать HTTPS');
  }
  url.searchParams.set('payment', orderId);
  return url.toString();
}

export async function createPaymentOrder(userId: string, input: {
  kind?: unknown; amount?: unknown; categoryId?: unknown; receiptEmail?: unknown; clientRequestId?: unknown;
}) {
  credentials();
  const legal = getLegalConfig();
  if (legal.missing.length > 0) throw new Error(`Не заполнены реквизиты: ${legal.missing.join(', ')}`);
  if (!await hasCurrentLegalAcceptance(userId)) throw new Error('LEGAL_ACCEPTANCE_REQUIRED');
  if (typeof input.clientRequestId !== 'string' || !UUID.test(input.clientRequestId)) throw new Error('Некорректный clientRequestId');
  if (typeof input.receiptEmail !== 'string' || input.receiptEmail.length > 254 || !EMAIL.test(input.receiptEmail)) throw new Error('Укажите корректный email для чека');
  const kind = input.kind === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : input.kind === 'TOPUP' ? 'TOPUP' : null;
  if (!kind) throw new Error('Некорректный тип платежа');

  let amount: number;
  let categoryId: string | null = null;
  let subscriptionDays: number | null = null;
  let description: string;
  if (kind === 'TOPUP') {
    if (typeof input.amount !== 'number' || !Number.isSafeInteger(input.amount)) throw new Error('Некорректная сумма');
    amount = Number(input.amount);
    if (amount < 100 || amount > 100_000) throw new Error('Сумма пополнения должна быть от 100 до 100 000 ₽');
    description = `Пополнение баланса ${(await getBranding()).name} на ${amountValue(amount)} ₽`;
  } else {
    if (input.categoryId === 'GLOBAL_PRO') {
      categoryId = 'GLOBAL_PRO';
      subscriptionDays = 30;
      amount = 100000; // 1000 RUB in kopecks
      description = `PRO ПОДПИСКА (ВСЕ ЛИДЫ) на 30 дней`;
    } else {
      if (typeof input.categoryId !== 'string' || !UUID.test(input.categoryId)) throw new Error('Некорректная категория');
      const category = await prisma.category.findFirst({ where: { id: input.categoryId, active: true } });
      if (!category || category.subscriptionPrice <= 0 || category.days < 1) throw new Error('PRO-подписка недоступна');
      categoryId = category.id; subscriptionDays = Math.min(category.days, 3650);
      amount = category.subscriptionPrice;
      description = `PRO «${category.name}» на ${subscriptionDays} дней`.slice(0, 128);
    }
  }

  const idempotencyKey = randomUUID();
  let order;
  try {
    order = await prisma.paymentOrder.create({ data: {
      userId, categoryId, clientRequestId: input.clientRequestId, idempotencyKey, kind,
      amount, receiptEmail: input.receiptEmail.toLowerCase(), description, subscriptionDays,
    } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.paymentOrder.findUnique({ where: { userId_clientRequestId: { userId, clientRequestId: input.clientRequestId } } });
      if (existing) return { id: existing.id, status: existing.status, confirmationUrl: existing.confirmationUrl };
    }
    throw error;
  }

  const vatCode = Number(process.env.YOOKASSA_VAT_CODE || '1');
  if (!Number.isInteger(vatCode) || vatCode < 1 || vatCode > 12) throw new Error('Некорректный код НДС ЮKassa');
  try {
    const payment = await requestYoo('/payments', { method: 'POST', idempotencyKey, body: {
      amount: { value: amountValue(amount), currency: 'RUB' }, capture: true,
      confirmation: { type: 'redirect', return_url: returnUrl(order.id) }, description,
      metadata: { order_id: order.id, user_id: userId, kind },
      receipt: { customer: { email: input.receiptEmail.toLowerCase() }, items: [{
        description, quantity: '1.00', amount: { value: amountValue(amount), currency: 'RUB' },
        vat_code: vatCode, payment_mode: kind === 'TOPUP' ? 'advance' : 'full_payment', payment_subject: 'service',
      }] },
    } });
    const confirmationUrl = payment.confirmation?.confirmation_url;
    if (!payment.id || !confirmationUrl || !confirmationUrl.startsWith('https://')) throw new Error('ЮKassa не вернула ссылку подтверждения');
    await prisma.paymentOrder.update({ where: { id: order.id }, data: {
      providerPaymentId: payment.id, status: payment.status.toUpperCase(), confirmationUrl,
      providerCreatedAt: payment.created_at ? new Date(payment.created_at) : null,
    } });
    return { id: order.id, status: payment.status.toUpperCase(), confirmationUrl };
  } catch (error) {
    await prisma.paymentOrder.update({ where: { id: order.id }, data: { status: 'FAILED', lastError: errorText(error) } });
    throw error;
  }
}

async function fulfill(orderId: string, payment: YooPayment): Promise<'credited' | 'duplicate'> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const order = await tx.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
        const claimed = await tx.paymentOrder.updateMany({ where: { id: order.id, creditedAt: null }, data: { status: 'SUCCEEDED', creditedAt: new Date(), lastError: null } });
        if (claimed.count !== 1) return 'duplicate';
        if (order.kind === 'TOPUP') {
          await tx.user.update({ where: { id: order.userId }, data: { balance: { increment: order.amount } } });
          await tx.transaction.create({ data: { userId: order.userId, type: 'TOPUP',  amount: order.amount } });
        } else if (order.kind === 'SUBSCRIPTION' && order.categoryId && order.subscriptionDays) {
          const current = await tx.subscription.findFirst({ where: { userId: order.userId, categoryId: order.categoryId }, orderBy: { expiresAt: 'desc' } });
          const base = current && current.expiresAt > new Date() ? current.expiresAt : new Date();
          const expiresAt = new Date(base.getTime() + order.subscriptionDays * 86_400_000);
          if (current) await tx.subscription.update({ where: { id: current.id }, data: { expiresAt } });
          else await tx.subscription.create({ data: { userId: order.userId, categoryId: order.categoryId, expiresAt } });
          await tx.transaction.create({ data: { userId: order.userId, type: 'SUBSCRIPTION',  amount: order.amount } });
        }
        return 'credited';
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2)) throw error;
    }
  }
  throw new Error(`Не удалось обработать платёж ${payment.id}`);
}

export async function processYooWebhook(paymentId: string, event: string) {
  if (!paymentId || paymentId.length > 100) throw new Error('Некорректный payment id');
  const payment = await requestYoo(`/payments/${encodeURIComponent(paymentId)}`);
  const order = await prisma.paymentOrder.findUnique({ where: { providerPaymentId: payment.id } });
  if (!order || payment.metadata?.order_id !== order.id || payment.metadata?.user_id !== order.userId) throw new Error('Платёж не связан с заказом');
  if (payment.amount?.currency !== 'RUB' || payment.amount.value !== amountValue(order.amount)) throw new Error('Сумма платежа не совпадает с заказом');
  if (event === 'payment.canceled' || payment.status === 'canceled') {
    if (!order.creditedAt) await prisma.paymentOrder.update({ where: { id: order.id }, data: { status: 'CANCELED' } });
    return { status: 'canceled' };
  }
  if (event !== 'payment.succeeded' || payment.status !== 'succeeded' || payment.paid !== true) throw new Error('Платёж ещё не подтверждён');
  return { status: await fulfill(order.id, payment) };
}


export async function reconcilePayments() {
  const pendingOrders = await prisma.paymentOrder.findMany({
    where: {
      status: { in: ['CREATED', 'PENDING', 'WAITING_FOR_CAPTURE'] },
      providerPaymentId: { not: null },
      createdAt: { lt: new Date(Date.now() - 5 * 60 * 1000) }
    }
  });

  let reconciled = 0;
  for (const order of pendingOrders) {
    if (!order.providerPaymentId) continue;
    try {
      const payment = await requestYoo(`/payments/${encodeURIComponent(order.providerPaymentId)}`);
      
      if (payment.amount?.currency !== 'RUB' || payment.amount.value !== amountValue(order.amount)) {
        continue;
      }
      if (payment.metadata?.order_id !== order.id) {
        continue;
      }

      if (payment.status === 'succeeded' && payment.paid === true) {
        await fulfill(order.id, payment);
        reconciled++;
      } else if (payment.status === 'canceled') {
        await prisma.paymentOrder.update({ where: { id: order.id }, data: { status: 'CANCELED' } });
        reconciled++;
      }
    } catch (e) {
      console.error(`Reconciliation failed for order ${order.id}:`, e);
    }
  }
  return reconciled;
}
