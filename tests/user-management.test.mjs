import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('удалённая учётная запись теряет сессию, настройки и активные подписки', () => {
  const currentUser = read('src/lib/auth/current-user.ts');
  const adminUsers = read('src/app/api/admin/users/route.ts');

  assert.match(currentUser, /deletedAt:\s*null/);
  assert.match(adminUsers, /userCategoryPreference\.deleteMany/);
  assert.match(adminUsers, /subscription\.updateMany/);
  assert.match(adminUsers, /notifyEnabled:\s*false/);
  assert.match(adminUsers, /botStartedAt:\s*null/);
  assert.match(adminUsers, /registrationCycle:\s*\{\s*increment:\s*1\s*\}/);
  assert.match(adminUsers, /isConfiguredAdminMaxId\(target\.maxId\)/);
});

test('обычное удаление допускает новую регистрацию, а полный блок запрещает все входы', () => {
  const authRoute = read('src/app/api/auth/max/route.ts');
  const webhookRoute = read('src/app/api/webhooks/max/route.ts');
  const adminUsers = read('src/app/api/admin/users/route.ts');

  assert.match(authRoute, /deletedAt:\s*null/);
  assert.match(authRoute, /ACCOUNT_BLOCKED/);
  assert.ok((authRoute.match(/blockedMaxUser\.findUnique/g) || []).length >= 3);
  assert.match(webhookRoute, /blockedMaxUser\.findUnique/);
  assert.match(webhookRoute, /ignored:\s*true/);
  assert.match(adminUsers, /blockedMaxUser\.upsert/);
});

test('админка показывает отдельные действия удаления и полного блока', () => {
  const page = read('src/app/(admin)/admin/users/page.tsx');

  assert.match(page, /Удалить/);
  assert.match(page, /Полный блок/);
  assert.match(page, /method:\s*'DELETE'/);
  assert.match(page, /window\.confirm/);
});

test('после удаления требуется явный вход через MAX и новый комплект согласий', () => {
  const login = read('src/app/(auth)/login/page.tsx');
  const legal = read('src/lib/legal.ts');
  const schema = read('prisma/schema.prisma');

  assert.match(login, /onClick=\{authenticate\}/);
  assert.match(login, /destinationAfterLegal/);
  assert.match(legal, /registrationCycle:\s*user\.registrationCycle/);
  assert.match(schema, /@@unique\(\[userId, documentType, version, registrationCycle\], map: "LegalAcceptance_registration_cycle_key"\)/);
});
