import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Во всех серверных модулях используем один пул, включая production.
export const prisma =
  globalForPrisma.prisma ??
  (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL
    ? ({} as PrismaClient)
    : new PrismaClient({
        adapter: new PrismaPg(new Pool({
          connectionString: process.env.DATABASE_URL,
          max: 10,
          connectionTimeoutMillis: 3000,
          idleTimeoutMillis: 30000,
          statement_timeout: 8000,
        })),
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
      }));

if (process.env.DATABASE_URL) {
  globalForPrisma.prisma = prisma;
}
