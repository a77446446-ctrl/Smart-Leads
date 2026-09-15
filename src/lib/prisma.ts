import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Next.js build time proxy fallback to prevent db connections during build
export const prisma =
  globalForPrisma.prisma ??
  (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL
    ? ({} as PrismaClient)
    : new PrismaClient({
        adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
      }));

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
