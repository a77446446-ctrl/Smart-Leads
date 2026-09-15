import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('юридические согласия версионируются и миграция не удаляет данные', () => {
  const schema = read('prisma/schema.prisma');
  const migration = read('prisma/migrations/20260823050000_stage_5_legal/migration.sql');
  assert.match(schema, /model LegalAcceptance/);
  assert.match(schema, /@@unique\(\[userId, documentType, version, registrationCycle\], map: "LegalAcceptance_registration_cycle_key"\)/);
  assert.match(schema, /documentHash\s+String/);
  assert.doesNotMatch(migration, /^\s*(?:DROP\b|TRUNCATE\b|DELETE\s+FROM\b)/im);
});

test('оферта, политика, согласие и поддержка доступны отдельными страницами', () => {
  for (const path of ['src/app/legal/offer/page.tsx', 'src/app/legal/privacy/page.tsx', 'src/app/legal/consent/page.tsx', 'src/app/support/page.tsx']) {
    assert.ok(read(path).length > 300, `${path} не должен быть пустым`);
  }
  const footer = read('src/components/legal/LegalFooter.tsx');
  assert.match(footer, /\/legal\/offer/);
  assert.match(footer, /\/legal\/privacy/);
  assert.match(footer, /\/legal\/consent/);
  assert.match(footer, /\/support/);
});

test('согласие на данные отделено от акцепта оферты', () => {
  const card = read('src/components/legal/LegalAcceptanceCard.tsx');
  assert.match(card, /offerAccepted/);
  assert.match(card, /privacyRead/);
  assert.match(card, /consentGiven/);
  assert.match(card, /acceptedDocuments: \['OFFER', 'PRIVACY', 'CONSENT'\]/);
  assert.doesNotMatch(card, /const \[checked, setChecked\]/);
});

test('кнопка согласия показывает понятное действие без номера версии', () => {
  const card = read('src/components/legal/LegalAcceptanceCard.tsx');
  assert.match(card, /Отметьте все пункты/);
  assert.match(card, /Подтвердить согласие/);
  assert.match(card, /Сохраняем согласие…/);
  assert.doesNotMatch(card, /Подтвердить версию/);
  assert.match(card, /JSON\.stringify\(\{ acceptedDocuments: \['OFFER', 'PRIVACY', 'CONSENT'\], version \}\)/);
});

test('сервер принимает только актуальную полную версию и сохраняет SHA-256', () => {
  const legal = read('src/lib/legal.ts');
  const route = read('src/app/api/legal/acceptance/route.ts');
  assert.match(legal, /createHash\('sha256'\)/);
  assert.match(route, /LEGAL_DOCUMENT_TYPES\.every/);
  assert.match(route, /body\.version !== version/);
  assert.match(route, /legalAcceptance\.upsert/);
  assert.match(legal, /registrationCycle:\s*user\.registrationCycle/);
  assert.match(route, /userId_documentType_version_registrationCycle/);
});

test('покупка заблокирована до принятия актуальных документов', () => {
  const purchase = read('src/app/api/buy-lead/route.ts');
  assert.match(purchase, /hasCurrentLegalAcceptance/);
  assert.match(purchase, /LEGAL_ACCEPTANCE_REQUIRED/);
  assert.match(purchase, /428/);
});

test('шаблон окружения требует реальные реквизиты оператора', () => {
  const env = read('.env.example');
  for (const key of ['LEGAL_OPERATOR_NAME', 'LEGAL_TAX_ID', 'LEGAL_REGISTRATION_ID', 'LEGAL_ADDRESS', 'LEGAL_EMAIL', 'LEGAL_SUPPORT_EMAIL']) {
    assert.match(env, new RegExp(`^${key}=`, 'm'));
  }
});
