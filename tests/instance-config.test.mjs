import assert from 'node:assert/strict';
import test from 'node:test';
import { encryptInstanceValue, decryptInstanceValue } from '../src/lib/instance-secrets.ts';
import { missingLegalFields } from '../src/lib/legal-required.ts';

const master = 'test-only-master-secret-with-at-least-32-chars';

test('секреты клиента шифруются, не раскрываются и требуют прежнего мастер-ключа', () => {
  const value = 'секрет-бота-123';
  const encrypted = encryptInstanceValue(value, master);
  assert.ok(encrypted.startsWith('instance:v1:'));
  assert.ok(!encrypted.includes(value));
  assert.equal(decryptInstanceValue(encrypted, master), value);
  assert.throws(() => decryptInstanceValue(encrypted, 'another-test-master-secret-with-32-chars'));
  assert.throws(() => decryptInstanceValue(encrypted + 'x', master));
  assert.throws(() => encryptInstanceValue(value, 'short'));
  assert.equal(decryptInstanceValue(encryptInstanceValue('', master), master), '');
});

test('самозанятый указывает реальные имя, ИНН и контакты без ОГРНИП и юридического адреса', () => {
  const values = {
    LEGAL_OPERATOR_NAME: 'Иванов Иван', LEGAL_TAX_ID: '123456789012',
    LEGAL_EMAIL: 'owner@example.org', LEGAL_SUPPORT_EMAIL: 'support@example.org',
  };
  assert.deepEqual(missingLegalFields('SELF_EMPLOYED', values), []);
  assert.deepEqual(missingLegalFields('SOLE_PROPRIETOR', values), ['LEGAL_REGISTRATION_ID', 'LEGAL_ADDRESS']);
  assert.deepEqual(missingLegalFields('COMPANY', values), ['LEGAL_REGISTRATION_ID', 'LEGAL_ADDRESS']);
});
