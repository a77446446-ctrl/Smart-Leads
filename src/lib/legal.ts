import 'server-only';

import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { isConfiguredAdminIdentity } from '@/lib/auth/admin-config';
import { missingLegalFields, type LegalOperatorType } from '@/lib/legal-required';

export const LEGAL_DOCUMENT_TYPES = ['OFFER', 'PRIVACY', 'CONSENT'] as const;
export type LegalDocumentType = typeof LEGAL_DOCUMENT_TYPES[number];

export function getLegalConfig() {
  const operatorType = (process.env.LEGAL_OPERATOR_TYPE || 'SOLE_PROPRIETOR').trim() as LegalOperatorType;
  const version = (process.env.LEGAL_DOCUMENT_VERSION || '2026-08-23').trim();
  const effectiveDate = (process.env.LEGAL_EFFECTIVE_DATE || '23 августа 2026 года').trim();
  const operatorName = (process.env.LEGAL_OPERATOR_NAME || 'Оператор сервиса').trim();
  const taxId = (process.env.LEGAL_TAX_ID || '').trim();
  const registrationId = (process.env.LEGAL_REGISTRATION_ID || '').trim();
  const address = (process.env.LEGAL_ADDRESS || '').trim();
  const email = (process.env.LEGAL_EMAIL || '').trim();
  const supportEmail = (process.env.LEGAL_SUPPORT_EMAIL || email).trim();
  const missing = missingLegalFields(operatorType, {
    LEGAL_OPERATOR_NAME: process.env.LEGAL_OPERATOR_NAME,
    LEGAL_TAX_ID: taxId,
    LEGAL_REGISTRATION_ID: registrationId,
    LEGAL_ADDRESS: address,
    LEGAL_EMAIL: email,
    LEGAL_SUPPORT_EMAIL: supportEmail,
  });
  return { operatorType, version, effectiveDate, operatorName, taxId, registrationId, address, email, supportEmail, missing };
}

export function legalDocumentHash(type: LegalDocumentType): string {
  const config = getLegalConfig();
  return createHash('sha256').update(JSON.stringify({ type, ...config, missing: undefined })).digest('hex');
}

export async function getLegalAcceptance(userId: string) {
  const { version } = getLegalConfig();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { registrationCycle: true },
  });
  if (!user) {
    return { version, accepted: false, acceptedAt: null };
  }
  const accepted = await prisma.legalAcceptance.findMany({
    where: {
      userId,
      version,
      registrationCycle: user.registrationCycle,
      documentType: { in: [...LEGAL_DOCUMENT_TYPES] },
    },
    select: { documentType: true, documentHash: true, acceptedAt: true },
  });
  const types = new Set(accepted.filter((item) => LEGAL_DOCUMENT_TYPES.includes(item.documentType as LegalDocumentType) && item.documentHash === legalDocumentHash(item.documentType as LegalDocumentType)).map((item) => item.documentType));
  return {
    version,
    accepted: LEGAL_DOCUMENT_TYPES.every((type) => types.has(type)),
    acceptedAt: accepted.map((item) => item.acceptedAt).sort((a, b) => b.getTime() - a.getTime())[0] || null,
  };
}

export async function hasCurrentLegalAcceptance(userId: string): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      maxId: true,
      externalIdentities: {
        where: { provider: 'TELEGRAM' },
        select: { providerUserId: true },
        take: 1,
      },
    },
  });
  if (!user) return false;
  if (isConfiguredAdminIdentity({ maxId: user.maxId, telegramId: user.externalIdentities[0]?.providerUserId })) return true;
  return (await getLegalAcceptance(userId)).accepted;
}
