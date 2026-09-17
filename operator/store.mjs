import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { publicInstance } from './core.mjs';

const selection = `id, name, customer, domain, contact, plan, monthly_fee_kopecks AS "monthlyFeeKopecks",
  paid_until::text AS "paidUntil", backup_at::text AS "backupAt", restore_at::text AS "restoreAt",
  service_status AS "serviceStatus", notes, key_hash AS "keyHash", last_seen_at AS "lastSeenAt", report,
  revision, created_at AS "createdAt", updated_at AS "updatedAt"`;
const values = v => [v.name, v.customer, v.domain, v.contact, v.plan, v.monthlyFeeKopecks, v.paidUntil, v.backupAt, v.restoreAt, v.serviceStatus, v.notes];

export function createStore(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30_000, statement_timeout: 10_000 });
  pool.on('error', () => console.error('[ПАНЕЛЬ] Потеряно свободное подключение к базе'));
  async function transaction(fn) {
    const client = await pool.connect();
    try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async function audit(client, id, action, details = {}) {
    await client.query('INSERT INTO operator_audit(instance_id, action, details) VALUES ($1,$2,$3)', [id, action, JSON.stringify(details)]);
  }
  return {
    async migrate() {
      await transaction(async client => {
        await client.query('SELECT pg_advisory_xact_lock(1789364101)');
        await client.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
      });
    },
    async health() { await pool.query('SELECT 1'); },
    async list(search, page) {
      const query = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      return transaction(async client => {
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const { rows } = await client.query(`SELECT ${selection} FROM operator_instance
          WHERE name ILIKE $1 OR customer ILIKE $1 OR domain ILIKE $1 ORDER BY created_at DESC, id LIMIT 30 OFFSET $2`, [query, (page - 1) * 30]);
        const count = await client.query('SELECT count(*)::int AS total FROM operator_instance WHERE name ILIKE $1 OR customer ILIKE $1 OR domain ILIKE $1', [query]);
        const summary = await client.query(`SELECT count(*)::int AS total,
          count(*) FILTER (WHERE key_hash IS NOT NULL AND last_seen_at > now() - interval '15 minutes')::int AS connected,
          count(*) FILTER (WHERE service_status = 'active' AND (paid_until IS NULL OR paid_until < (now() AT TIME ZONE 'Europe/Moscow')::date))::int AS unpaid,
          count(*) FILTER (WHERE key_hash IS NOT NULL AND (last_seen_at IS NULL OR last_seen_at <= now() - interval '15 minutes'))::int AS attention
          FROM operator_instance`);
        return { instances: rows.map(row => publicInstance(row)), total: count.rows[0].total, summary: summary.rows[0], page };
      });
    },
    async create(instance, key) {
      return transaction(async client => {
        const { rows } = await client.query(`INSERT INTO operator_instance
          (id,name,customer,domain,contact,plan,monthly_fee_kopecks,paid_until,backup_at,restore_at,service_status,notes,key_hash)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${selection}`, [key.id, ...values(instance), key.keyHash]);
        await audit(client, key.id, 'created');
        return publicInstance(rows[0]);
      });
    },
    async update(id, revision, instance) {
      return transaction(async client => {
        const previous = await client.query('SELECT paid_until::text, monthly_fee_kopecks, service_status FROM operator_instance WHERE id=$1 AND revision=$2 FOR UPDATE', [id, revision]);
        if (!previous.rowCount) return null;
        const { rows } = await client.query(`UPDATE operator_instance SET
          name=$3,customer=$4,domain=$5,contact=$6,plan=$7,monthly_fee_kopecks=$8,paid_until=$9,backup_at=$10,
          restore_at=$11,service_status=$12,notes=$13,revision=revision+1,updated_at=now()
          WHERE id=$1 AND revision=$2 RETURNING ${selection}`, [id, revision, ...values(instance)]);
        await audit(client, id, 'updated', {
          previous: previous.rows[0], current: { paid_until: instance.paidUntil, monthly_fee_kopecks: instance.monthlyFeeKopecks, service_status: instance.serviceStatus },
        });
        return publicInstance(rows[0]);
      });
    },
    async changeKey(id, revision, keyHash) {
      return transaction(async client => {
        const { rows } = await client.query(`UPDATE operator_instance SET key_hash=$3, last_seen_at=NULL, report=NULL,
          revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$2 RETURNING ${selection}`, [id, revision, keyHash]);
        if (!rows[0]) return null;
        await audit(client, id, keyHash ? 'key_rotated' : 'key_revoked');
        return publicInstance(rows[0]);
      });
    },
    async report(id, keyHash, report) {
      // Проверка ключа и запись атомарны: отозванный ключ не пройдёт гонку обновления.
      const result = await pool.query(`UPDATE operator_instance SET report=$3, last_seen_at=now()
        WHERE id=$1 AND key_hash=$2`, [id, keyHash, JSON.stringify(report)]);
      return result.rowCount === 1;
    },
    async audit(id) {
      const { rows } = await pool.query('SELECT id::text,action,details,created_at AS "createdAt" FROM operator_audit WHERE instance_id=$1 ORDER BY created_at DESC,id DESC LIMIT 30', [id]);
      return rows;
    },
    close: () => pool.end(),
  };
}
