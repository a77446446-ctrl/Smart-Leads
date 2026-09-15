import { adminGuard } from '@/lib/auth/admin-guard';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isSecretSettingKey, SECRET_MASK } from '@/lib/security/secret-mask';

export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await adminGuard();
  if (denied) return denied;
  try {
    const settings = await prisma.setting.findMany();
    const activeTargetChats = await prisma.targetChat.findMany({
      where: { active: true, status: 'ACTIVE' },
      select: { url: true, parseAll: true },
    });
    const displaySettings = settings.filter((setting) => setting.key !== 'maks_active_target_chats');
    displaySettings.push({ id: 'runtime-active-target-chats', key: 'maks_active_target_chats', value: JSON.stringify(activeTargetChats) });
    return NextResponse.json(displaySettings.map((setting) =>
      isSecretSettingKey(setting.key) ? { ...setting, value: SECRET_MASK } : setting,
    ));
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await adminGuard();
  if (denied) return denied;
  try {
    const parsedBody = await req.json() as unknown;
    if (typeof parsedBody !== 'object' || parsedBody === null || Array.isArray(parsedBody)) {
      return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 });
    }
    const body = parsedBody as Record<string, unknown>;
    const key = typeof body.key === 'string' ? body.key.trim() : '';
    const value = String(body.value ?? '');
    if (!/^[a-z0-9_]{1,100}$/.test(key) || value.length > 100_000) {
      return NextResponse.json({ error: 'Некорректная настройка' }, { status: 400 });
    }
    if (isSecretSettingKey(key) && value === SECRET_MASK) {
      const existing = await prisma.setting.findUnique({ where: { key } });
      return NextResponse.json(existing ? { ...existing, value: SECRET_MASK } : { key, value: '' });
    }

    const setting = await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

    return NextResponse.json(isSecretSettingKey(setting.key) ? { ...setting, value: SECRET_MASK } : setting);
  } catch (error) {
    console.error('Error updating setting:', error);
    return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 });
  }
}
