import { adminGuard } from '@/lib/auth/admin-guard';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { maxParser } from '@/services/max-parser';
import { reconcilePayments } from '@/services/yookassa';

export const maxDuration = 300; // 5 minutes timeout

export async function POST() {
  const denied = await adminGuard();
  if (denied) return denied;
  try {
    console.log('Starting manual parser sync...');
    
    // Set syncing = true in DB and update last run time
    const nowStr = Date.now().toString();
    await prisma.setting.upsert({
      where: { key: 'syncing' },
      update: { value: 'true' },
      create: { key: 'syncing', value: 'true' }
    });
    await prisma.setting.upsert({
      where: { key: 'maks_parser_last_run' },
      update: { value: nowStr },
      create: { key: 'maks_parser_last_run', value: nowStr }
    });

    // Background YooKassa reconciliation
    try {
      const reconciled = await reconcilePayments();
      if (reconciled > 0) console.log(`Reconciled ${reconciled} payments.`);
    } catch(e) { console.error('Reconciliation error:', e); }

    const result = await maxParser.sync();
    
    // Set syncing = false in DB
    await prisma.setting.upsert({
      where: { key: 'syncing' },
      update: { value: 'false' },
      create: { key: 'syncing', value: 'false' }
    });

    // Save logs to DB so frontend can fetch them
    if (result.logs && !result.skipped) {
      await prisma.setting.upsert({
         where: { key: 'sync_logs' },
         update: { value: JSON.stringify(result.logs) },
         create: { key: 'sync_logs', value: JSON.stringify(result.logs) }
      });
    }

    console.log('Parser sync result:', result);
    return NextResponse.json(result);
  } catch (error) {
    // Ensure we reset syncing flag on error
    await prisma.setting.upsert({
      where: { key: 'syncing' },
      update: { value: 'false' },
      create: { key: 'syncing', value: 'false' }
    });
    console.error('Error in manual sync:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, message: errorMsg }, { status: 500 });
  }
}
