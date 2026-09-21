import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { getAppOrigin } from '@/lib/app-origin';
import { isConfiguredAdminTelegramId } from '@/lib/auth/admin-config';
import { createSessionToken, sessionCookie, type SessionRole } from '@/lib/auth/session';
import {
  exchangeTelegramAuthorizationCode,
  getTelegramOidcConfig,
  telegramLoginStateCookie,
  verifyTelegramIdToken,
  verifyTelegramLoginState,
  type TelegramProfile,
} from '@/lib/auth/telegram-oidc';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

class BlockedTelegramUserError extends Error {}

function redirectToLogin(request: Request, error: string) {
  const response = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, getAppOrigin(request.url)));
  response.cookies.set(telegramLoginStateCookie.name, '', {
    ...telegramLoginStateCookie.options,
    maxAge: 0,
  });
  return response;
}

async function registerTelegramUser(profile: TelegramProfile, configuredAdmin: boolean) {
  const now = new Date();
  const bonusSetting = await prisma.setting.findUnique({ where: { key: 'maks_welcome_bonus_amount' } });
  const bonusEnabledSetting = await prisma.setting.findUnique({ where: { key: 'maks_welcome_bonus_enabled' } });
  const isBonusEnabled = bonusEnabledSetting?.value !== 'false';
  const parsedBonus = bonusSetting?.value ? Number.parseInt(bonusSetting.value, 10) : 300;
  const bonusKopecks = isBonusEnabled && Number.isSafeInteger(parsedBonus) && parsedBonus > 0 ? parsedBonus : 0;

  return prisma.$transaction(async (tx) => {
    const blockedBeforeRegistration = await tx.blockedExternalIdentity.findUnique({
      where: { provider_providerUserId: { provider: 'TELEGRAM', providerUserId: profile.telegramId } },
      select: { providerUserId: true },
    });
    if (blockedBeforeRegistration) throw new BlockedTelegramUserError('Учётная запись заблокирована');

    const identity = await tx.externalIdentity.findUnique({
      where: { provider_providerUserId: { provider: 'TELEGRAM', providerUserId: profile.telegramId } },
      select: { userId: true },
    });

    const current = identity
      ? await tx.user.update({
          where: { id: identity.userId },
          data: {
            name: profile.name,
            role: configuredAdmin ? 'ADMIN' : 'USER',
            lastLoginAt: now,
            deletedAt: null,
          },
        })
      : await tx.user.create({
          data: {
            name: profile.name,
            role: configuredAdmin ? 'ADMIN' : 'USER',
            lastLoginAt: now,
            externalIdentities: {
              create: {
                provider: 'TELEGRAM',
                providerUserId: profile.telegramId,
                username: profile.username,
                displayName: profile.name,
                photoUrl: profile.photoUrl,
              },
            },
          },
        });

    if (identity) {
      await tx.externalIdentity.update({
        where: { provider_providerUserId: { provider: 'TELEGRAM', providerUserId: profile.telegramId } },
        data: { username: profile.username, displayName: profile.name, photoUrl: profile.photoUrl },
      });
    }

    const monetizationSetting = await tx.setting.findUnique({ where: { key: 'maks_monetization_enabled' } });
    if (monetizationSetting?.value !== 'false' && bonusKopecks > 0) {
      const bonusGrant = await tx.user.updateMany({
        where: { id: current.id, onboardingBonusGrantedAt: null },
        data: { onboardingBonusGrantedAt: now, balance: { increment: bonusKopecks } },
      });
      if (bonusGrant.count === 1) {
        await tx.transaction.create({
          data: { userId: current.id, type: 'ONBOARDING_BONUS', amount: bonusKopecks },
        });
      }
    }

    const blockedAfterRegistration = await tx.blockedExternalIdentity.findUnique({
      where: { provider_providerUserId: { provider: 'TELEGRAM', providerUserId: profile.telegramId } },
      select: { providerUserId: true },
    });
    if (blockedAfterRegistration) throw new BlockedTelegramUserError('Учётная запись заблокирована');

    return tx.user.findUniqueOrThrow({
      where: { id: current.id },
      select: { id: true, role: true },
    });
  });
}

export async function GET(request: NextRequest) {
  try {
    const providerError = request.nextUrl.searchParams.get('error');
    if (providerError) return redirectToLogin(request, 'telegram_cancelled');

    const state = verifyTelegramLoginState(
      request.cookies.get(telegramLoginStateCookie.name)?.value,
      request.nextUrl.searchParams.get('state'),
    );
    const config = getTelegramOidcConfig();
    const idToken = await exchangeTelegramAuthorizationCode(
      request.nextUrl.searchParams.get('code') || '',
      state.verifier,
      config,
    );
    const profile = await verifyTelegramIdToken(idToken, state.nonce, config);

    const blocked = await prisma.blockedExternalIdentity.findUnique({
      where: { provider_providerUserId: { provider: 'TELEGRAM', providerUserId: profile.telegramId } },
      select: { providerUserId: true },
    });
    if (blocked) throw new BlockedTelegramUserError('Учётная запись заблокирована');

    const configuredAdmin = isConfiguredAdminTelegramId(profile.telegramId);
    let user;
    try {
      user = await registerTelegramUser(profile, configuredAdmin);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        user = await registerTelegramUser(profile, configuredAdmin);
      } else {
        throw error;
      }
    }

    const role: SessionRole = user.role === 'ADMIN' ? 'ADMIN' : 'USER';
    const token = await createSessionToken(user.id, role);
    const response = NextResponse.redirect(new URL(role === 'ADMIN' ? '/admin' : '/dashboard', getAppOrigin(request.url)));
    response.cookies.set(sessionCookie.name, token, {
      ...sessionCookie.options,
      maxAge: sessionCookie.maxAge,
    });
    response.cookies.set(telegramLoginStateCookie.name, '', {
      ...telegramLoginStateCookie.options,
      maxAge: 0,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка авторизации Telegram';
    console.error('[TELEGRAM AUTH CALLBACK]', message);
    if (error instanceof BlockedTelegramUserError) return redirectToLogin(request, 'telegram_blocked');
    return redirectToLogin(request, 'telegram_failed');
  }
}
