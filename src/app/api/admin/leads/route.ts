import { adminGuard } from '@/lib/auth/admin-guard';
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: NextRequest) {
  const denied = await adminGuard();
  if (denied) return denied;
  try {
    const { id, status } = await req.json();
    if (!id || !status) {
      return NextResponse.json({ error: 'Missing id or status' }, { status: 400 });
    }

    const lead = await prisma.lead.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ success: true, lead });
  } catch (error) {
    console.error('Failed to update lead:', error);
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await adminGuard();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    // Soft delete any purchases related to this lead
    await prisma.purchase.updateMany({
      where: { leadId: id },
      data: { deletedAt: new Date() }
    });

    await prisma.lead.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'ARCHIVED' }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete lead:', error);
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const denied = await adminGuard();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(req.url);
    const takeParam = Number(searchParams.get('take') || '500');
    const take = Number.isInteger(takeParam) ? Math.min(Math.max(takeParam, 1), 1000) : 500;

    const leads = await prisma.lead.findMany({
      where: { deletedAt: null },
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        rawText: true,
        phone: true,
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
    });

    return NextResponse.json(leads);
  } catch (error) {
    console.error('Failed to fetch leads:', error);
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }
}

