import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { classifyLeadCategory, normalizeCategoryText } from '../src/lib/lead-category.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const categories = [
  { slug: 'drivers', name: 'Водители', plusKeywords: 'водител, категория c, категория е', minusKeywords: 'ищу работу' },
  { slug: 'cleaning', name: 'Уборка', plusKeywords: 'уборка, уборщица, клининг', minusKeywords: 'предлагаю услуги' },
  { slug: 'handyman', name: 'Мастер на час', plusKeywords: 'электрик, сантехник, ремонт', minusKeywords: 'обучение' },
];

test('локальный классификатор распределяет лиды по плюс-словам', () => {
  assert.equal(classifyLeadCategory('Требуется водитель категории C', categories).categorySlug, 'drivers');
  assert.equal(classifyLeadCategory('Нужна уборщица в офис', categories).categorySlug, 'cleaning');
  assert.equal(classifyLeadCategory('Нужен электрик для ремонта розетки', categories).categorySlug, 'handyman');
});

test('минус-слово запрещает соответствующую категорию', () => {
  const result = classifyLeadCategory('Ищу работу водителем категории C', categories);
  assert.equal(result.categorySlug, 'other');
  assert.equal(result.matched, false);
});

test('без плюс-совпадений лид явно относится к категории Другое', () => {
  const result = classifyLeadCategory('Требуется фотограф на мероприятие', categories);
  assert.deepEqual(result, { categorySlug: 'other', matched: false, score: 0, matchedKeywords: [] });
  assert.equal(classifyLeadCategory('Любое сообщение', [{ slug: 'empty', plusKeywords: '', minusKeywords: '' }]).matched, false);
});

test('нормализация учитывает регистр, ё и разделители', () => {
  assert.equal(normalizeCategoryText('  РЕМОНТ-Мебели, Ёлки!  '), 'ремонт мебели елки');
  assert.equal(
    classifyLeadCategory('ТРЕБУЕТСЯ УБОРЩИЦА-КЛИНИНГ', categories).categorySlug,
    'cleaning',
  );
});

test('при пересечении выбирается наиболее подтверждённая категория', () => {
  const result = classifyLeadCategory('Нужен электрик, небольшой ремонт', categories);
  assert.equal(result.categorySlug, 'handyman');
  assert.deepEqual(result.matchedKeywords.sort(), ['ремонт', 'электрик']);
});

test('парсер сохраняет исходную логику по явному требованию владельца', () => {
  // 14.09.2026: владелец отменил изменение фильтра. Строгое совпадение категорий не является требованием к этой версии.
  const report = JSON.parse(read('docs/source-integrity.json'));
  for (const file of ['src/services/max-parser.ts', 'scripts/parser_worker.py']) {
    const bytes = readFileSync(new URL(`../${file}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), report.protectedSha256[file]);
  }
});
