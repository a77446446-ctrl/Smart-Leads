import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { AuthenticationError, requireCurrentUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/prisma';
import { hasActionableLeadContact, redactContactInfo } from '@/lib/redact-contact';
import { buildLeadTitle } from '@/lib/lead-title';
import { uniqueLeadCards, cleanLeadText } from '@/lib/lead-content';

export const dynamic = 'force-dynamic';

async function withRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      const transient = ['connection terminated', 'connection timeout', 'econnrefused'].some((value) => message.includes(value));
      if (!transient || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');
    const leadId = searchParams.get('leadId');
    const owned = searchParams.get('owned') === 'true';
    const requestedStatus = searchParams.get('status');
    const takeParam = Number(searchParams.get('take') || '100');
    const take = Number.isInteger(takeParam) ? Math.min(Math.max(takeParam, 1), 200) : 100;

    const where: Prisma.LeadWhereInput = { deletedAt: null };    if (leadId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leadId)) {
        return NextResponse.json({ error: 'Некорректный идентификатор лида' }, { status: 400 });
      }
      where.id = leadId;
    }
    if (categoryId && categoryId !== 'all' && categoryId.length <= 100) where.categoryId = categoryId;

    if (owned) {
      where.purchases = { some: { userId: user.id } };
      where.status = requestedStatus === 'ARCHIVED' ? 'ARCHIVED' : { not: 'ARCHIVED' };
    } else {
      where.status = 'NEW';
      // После пересчёта ключей копии не занимают лимит выдачи. Прямые ссылки остаются рабочими.
      if (!leadId) where.duplicateOfId = null;
    }

    const databaseTake = owned ? take : Math.min(take * 3, 600);
    const leads = await withRetry(() => prisma.lead.findMany({
      where,
      take: databaseTake,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        rawText: true,
        phone: true,
        allowContactless: true,
        city: true,
        categoryId: true,
        sourceChat: true,
        score: true,
        price: true,
        status: true,
        createdAt: true,
        category: {
          select: { id: true, name: true, slug: true, paymentMode: true, imageUrl: true },
        },
      },
    }));

    const visibleLeads = owned
      ? leads
      : uniqueLeadCards(leads
        .filter((lead) => lead.allowContactless
          || lead.category.slug === 'info'
          || hasActionableLeadContact([lead.title, lead.rawText, lead.phone || ''].join('\n')))
        ).slice(0, take);

    return NextResponse.json(visibleLeads.map((lead) => {
      const title = buildLeadTitle(lead.rawText, lead.title);
      const cleanedText = cleanLeadText(lead.rawText);
      return owned ? {
        ...lead,
        title,
        rawText: cleanedText,
        isPurchased: true,
      } : {
        ...lead,
        title: redactContactInfo(title, true),
        rawText: redactContactInfo(cleanedText, true),
        phone: null,
        sourceChat: null,
        isPurchased: false,
      };
    }));
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('[LEADS]', error);
    return NextResponse.json({ error: 'Не удалось загрузить лиды' }, { status: 500 });
  }
}
