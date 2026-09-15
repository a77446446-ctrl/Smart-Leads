import { NextResponse } from 'next/server';
import { aiService } from '@/services/ai';
import { prisma } from '@/lib/prisma';
import { verifyBearerSecret } from '@/lib/security/api-secret';
import { createLeadWithDeliveries, LeadContactRequiredError } from '@/services/bot-outbox';
import { DuplicateLeadError } from '@/lib/lead-identity';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!verifyBearerSecret(request.headers.get('authorization'), process.env.INGEST_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const parsedBody = await request.json() as unknown;
    if (typeof parsedBody !== 'object' || parsedBody === null || Array.isArray(parsedBody)) {
      return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 });
    }

    const body = parsedBody as Record<string, unknown>;
    const rawText = typeof body.rawText === 'string' ? body.rawText.trim() : '';
    const source = typeof body.source === 'string' ? body.source.trim().slice(0, 500) : null;
    if (!rawText || rawText.length > 20_000) {
      return NextResponse.json({ error: 'Текст лида должен содержать от 1 до 20000 символов' }, { status: 400 });
    }

    const processed = await aiService.processLead(rawText);
    if (processed.isSpam) {
      return NextResponse.json({ status: 'ignored', reason: 'spam' });
    }

    const category = await prisma.category.findUnique({ where: { slug: processed.category } });
    if (!category) {
      return NextResponse.json({ status: 'ignored', reason: 'category_not_found' });
    }

    const lead = await createLeadWithDeliveries({
      title: processed.title,
      rawText,
      city: processed.city,
      categoryId: category.id,
      sourceChat: source,
      score: processed.score,
      price: category.leadPrice,
      status: 'NEW',
    });

    return NextResponse.json({ status: 'success', leadId: lead.id });
  } catch (error) {
    if (error instanceof DuplicateLeadError) {
      return NextResponse.json({ status: 'ignored', reason: 'duplicate', leadId: error.leadId });
    }
    if (error instanceof LeadContactRequiredError) {
      return NextResponse.json({ status: 'ignored', reason: 'contact_not_found' });
    }
    console.error('[INGEST]', error);
    return NextResponse.json({ error: 'Не удалось обработать лид' }, { status: 500 });
  }
}
