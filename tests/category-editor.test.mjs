import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './helpers/load-ts.mjs';

const classifier = loadTs('src/lib/lead-category.ts', {});
const { mergeCategoryKeywords, previewCategoryRule } = loadTs('src/lib/category-editor.ts', { '@/lib/lead-category': classifier });

test('редактор сохраняет незавершённый ввод вместе с тегами и удаляет повторы', () => {
  const existing = ['Спорт', 'Футбол'];
  assert.deepEqual(mergeCategoryKeywords(' футбол; хоккей\nтурнир, СПОРТ', existing), ['Спорт', 'Футбол', 'хоккей', 'турнир']);
  assert.deepEqual(existing, ['Спорт', 'Футбол']);
  assert.deepEqual(mergeCategoryKeywords('авто'), ['авто']);
  assert.deepEqual(mergeCategoryKeywords('Ёлка, елка. Ремонт-мебели; ремонт мебели'), ['Ёлка', 'Ремонт-мебели']);
  assert.deepEqual(mergeCategoryKeywords(' , ;\r\n ...'), []);
});

test('проверка рубрики объясняет плюс и приоритет минуса без требования контакта', () => {
  const pass = previewCategoryRule('Сегодня футбольный турнир', ['футбол', 'турнир'], ['ставки'], true);
  assert.equal(pass.status, 'matched');
  assert.deepEqual(pass.plusMatches, ['футбол', 'турнир']);
  const excluded = previewCategoryRule('Ставки на футбольный турнир', ['футбол'], ['ставки'], true);
  assert.equal(excluded.status, 'excluded');
  assert.deepEqual(excluded.minusMatches, ['ставки']);
  assert.deepEqual(excluded.plusMatches, ['футбол']);
});

test('проверка обрабатывает выключенную категорию, пустой текст, отсутствие плюсов и совпадений', () => {
  assert.equal(previewCategoryRule('Футбол', ['футбол'], [], false).status, 'inactive');
  assert.equal(previewCategoryRule('  \n', ['футбол'], [], true).status, 'empty');
  assert.equal(previewCategoryRule('Футбол', [], [], true).status, 'missing-plus');
  assert.equal(previewCategoryRule('Футбол', ['авто'], [], true).status, 'unmatched');
  const conflict = previewCategoryRule('Ёлка', ['Ёлка'], ['елка'], true);
  assert.equal(conflict.status, 'excluded');
  assert.deepEqual(conflict.conflicts, ['Ёлка']);
});

test('предпросмотр использует тот же алгоритм слов, что и действующий классификатор', () => {
  const plus = ['мир', 'ремонт', 'ёлка', 'коммерческое помещение'];
  const minus = ['ставки', 'без оплаты'];
  for (const text of ['Примирение', 'МИР', 'Ремонта квартиры', 'ЕЛКА', 'Сдам коммерческое-помещение', 'Ремонт без оплаты', 'Мир и ставки', 'Праздник']) {
    const result = previewCategoryRule(text, plus, minus, true);
    const actual = classifier.classifyLeadCategory(text, [{ slug: 'rubric', plusKeywords: plus.join(','), minusKeywords: minus.join(',') }]);
    assert.equal(result.status === 'matched', actual.matched, text);
  }
});
