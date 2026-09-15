import assert from 'node:assert/strict';
import test from 'node:test';

import { hasOnlyExpiredLeadDates } from '../src/lib/lead-date.ts';

const septemberFifthMoscow = new Date('2026-09-05T12:00:00+03:00');

test('просроченная дата лида отбрасывается', () => {
  assert.equal(
    hasOnlyExpiredLeadDates('Срочно! Завтра на работу 31.08.2026', septemberFifthMoscow),
    true,
  );
  assert.equal(
    hasOnlyExpiredLeadDates('Работа была 31 августа 2026 года', septemberFifthMoscow),
    true,
  );
});

test('сегодняшняя и будущая даты остаются допустимыми', () => {
  assert.equal(hasOnlyExpiredLeadDates('Работа сегодня 05.09.2026', septemberFifthMoscow), false);
  assert.equal(hasOnlyExpiredLeadDates('Работа завтра 06.09.2026', septemberFifthMoscow), false);
  assert.equal(hasOnlyExpiredLeadDates('Работа завтра без даты', septemberFifthMoscow), false);
});

test('диапазон не считается просроченным, пока его последняя дата не прошла', () => {
  assert.equal(hasOnlyExpiredLeadDates('Работа с 31.08 по 06.09', septemberFifthMoscow), false);
  assert.equal(hasOnlyExpiredLeadDates('Работа с 30.08 по 31.08', septemberFifthMoscow), true);
});

test('даты без года корректно обрабатываются на границе года', () => {
  const decemberThirtyFirstMoscow = new Date('2026-12-31T12:00:00+03:00');
  const januaryFirstMoscow = new Date('2027-01-01T12:00:00+03:00');
  assert.equal(hasOnlyExpiredLeadDates('Работа 01.01', decemberThirtyFirstMoscow), false);
  assert.equal(hasOnlyExpiredLeadDates('Работа 31.12', januaryFirstMoscow), true);
});

test('некорректные даты и обычные числа не блокируют лид', () => {
  assert.equal(hasOnlyExpiredLeadDates('Зарплата 4200 рублей, требуется 2 человека', septemberFifthMoscow), false);
  assert.equal(hasOnlyExpiredLeadDates('Работа 31.02.2026', septemberFifthMoscow), false);
});
