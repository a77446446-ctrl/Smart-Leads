import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldRecoverPhotoMigration } from '../scripts/recover-photo-migration.mjs';

const photo = '20260923020000_lead_photos';
const row = (migration_name, finished_at = null, rolled_back_at = null) => ({ migration_name, finished_at, rolled_back_at });

test('восстановление касается только единственной сбойной миграции фотографий', () => {
  assert.equal(shouldRecoverPhotoMigration([row(photo)]), true);
  assert.equal(shouldRecoverPhotoMigration([]), false);
  assert.equal(shouldRecoverPhotoMigration([row('20260923010000_other')]), false);
  assert.equal(shouldRecoverPhotoMigration([row(photo), row('20260923010000_other')]), false);
  assert.equal(shouldRecoverPhotoMigration([row(photo, new Date())]), false);
});

test('повторная автоматическая попытка блокируется', () => {
  assert.throws(() => shouldRecoverPhotoMigration([row(photo), row(photo, null, new Date())]), /уже восстанавливалась/);
});
