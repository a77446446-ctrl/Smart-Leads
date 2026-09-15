import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminGuard } from '@/lib/auth/admin-guard';
import fs from 'fs';
import path from 'path';

export const maxDuration = 300; // 5 minutes timeout


export async function POST() {
  const denied = await adminGuard();
  if (denied) return denied;

  try {

    // 1. Find the retention setting
    const retentionSetting = await prisma.setting.findUnique({
      where: { key: 'lead_retention_days' }
    });
    const retentionDays = parseInt(retentionSetting?.value || '7', 10);
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - retentionDays);

    // 2. Soft-delete leads whose ttlMinutes has expired
    // We cannot easily do this in one SQL query with Prisma because ttlMinutes is in Category and createdAt is in Lead.
    // Instead we'll fetch categories and update leads per category.
    const categories = await prisma.category.findMany({ select: { id: true, ttlMinutes: true } });
    let softDeletedCount = 0;
    
    for (const category of categories) {
      const expirationDate = new Date();
      expirationDate.setMinutes(expirationDate.getMinutes() - category.ttlMinutes);
      
      const res = await prisma.lead.updateMany({
        where: {
          categoryId: category.id,
          createdAt: { lt: expirationDate },
          deletedAt: null,
          status: 'NEW'
        },
        data: {
          status: 'ARCHIVED',
          deletedAt: new Date()
        }
      });
      softDeletedCount += res.count;
    }

    // 3. Hard delete leads older than retentionDate that have NO purchases
    const hardDeletedLeads = await prisma.lead.deleteMany({
      where: {
        deletedAt: { lt: retentionDate },
        purchases: { none: {} }
      }
    });

    // 4. Scrub text from sold leads older than retentionDate to save space
    const scrubbedLeads = await prisma.lead.updateMany({
      where: {
        deletedAt: { lt: retentionDate },
        purchases: { some: {} },
        rawText: { not: '[Текст удален по сроку давности]' }
      },
      data: {
        rawText: '[Текст удален по сроку давности]',
        phone: null,
      }
    });

    
    // 5. Cleanup debug_screenshots folder
    let deletedFiles = 0;
    try {
      const debugDir = path.join(process.cwd(), 'debug_screenshots');
      if (fs.existsSync(debugDir)) {
        const files = fs.readdirSync(debugDir);
        const now = Date.now();
        const MAX_AGE = 3 * 24 * 60 * 60 * 1000; // 3 days
        for (const file of files) {
          if (!file.endsWith('.png') && !file.endsWith('.jpg') && !file.endsWith('.log')) continue;
          const filePath = path.join(debugDir, file);
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > MAX_AGE) {
            fs.unlinkSync(filePath);
            deletedFiles++;
          }
        }
      }
    } catch (e) {
      console.error('Failed to cleanup debug files:', e);
    }

    return NextResponse.json({
      success: true,
      softDeleted: softDeletedCount,
      hardDeleted: hardDeletedLeads.count,
      scrubbed: scrubbedLeads.count,
      deletedDebugFiles: deletedFiles,
    });
  } catch (error) {
    console.error('[CLEANUP]', error);
    
    // 5. Cleanup debug_screenshots folder
    let deletedFiles = 0;
    try {
      const debugDir = path.join(process.cwd(), 'debug_screenshots');
      if (fs.existsSync(debugDir)) {
        const files = fs.readdirSync(debugDir);
        const now = Date.now();
        const MAX_AGE = 3 * 24 * 60 * 60 * 1000; // 3 days
        for (const file of files) {
          if (!file.endsWith('.png') && !file.endsWith('.jpg') && !file.endsWith('.log')) continue;
          const filePath = path.join(debugDir, file);
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > MAX_AGE) {
            fs.unlinkSync(filePath);
            deletedFiles++;
          }
        }
      }
    } catch (e) {
      console.error('Failed to cleanup debug files:', e);
    }

    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
