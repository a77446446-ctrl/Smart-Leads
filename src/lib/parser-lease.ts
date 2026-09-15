import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';

const LEASE_ID = 'max-parser';
const DEFAULT_LEASE_MS = 5 * 60_000;

export async function acquireParserLease(durationMs = DEFAULT_LEASE_MS): Promise<string | null> {
  const token = randomUUID();
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + durationMs);

  await prisma.parserLease.upsert({
    where: { id: LEASE_ID },
    update: {},
    create: { id: LEASE_ID },
  });

  const claimed = await prisma.parserLease.updateMany({
    where: {
      id: LEASE_ID,
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    data: { token, lockedUntil, lastStartedAt: now },
  });

  return claimed.count === 1 ? token : null;
}

export async function refreshParserLease(token: string, durationMs = DEFAULT_LEASE_MS): Promise<boolean> {
  const updated = await prisma.parserLease.updateMany({
    where: { id: LEASE_ID, token },
    data: { lockedUntil: new Date(Date.now() + durationMs) },
  });
  return updated.count === 1;
}

export async function releaseParserLease(token: string, result: string): Promise<void> {
  await prisma.parserLease.updateMany({
    where: { id: LEASE_ID, token },
    data: {
      token: null,
      lockedUntil: null,
      lastFinishedAt: new Date(),
      lastResult: result.slice(0, 500),
    },
  });
}

