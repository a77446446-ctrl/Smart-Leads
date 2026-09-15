import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { backfillLeadIdentities } from '../src/lib/lead-identity-backfill.ts';

if (!process.env.DATABASE_URL) throw new Error('Для индексации лидов требуется DATABASE_URL');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
try {
  console.log('Проверка уникальности сохранённых объявлений...');
  const result = await backfillLeadIdentities(prisma);
  console.log(`Индексация завершена: новых ключей ${result.indexed}, копий ${result.duplicates}. Записи и покупки сохранены.`);
} finally {
  await prisma.$disconnect();
  await pool.end();
}
