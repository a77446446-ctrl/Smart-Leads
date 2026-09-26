import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEngagement, presentLeadEngagement } from '../src/lib/lead-engagement.ts';
import { loadTs } from './helpers/load-ts.mjs';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

test('Всё показывает счётчики отдельно, Целевые сохраняет только текст', () => {
  const value = { body: 'Оплата: 2500\nНачало: 08:00', reactions: [{ count: '244', emoji: '👍' }], views: '15,1K', time: '08:00', comments: '43' };
  const all = normalizeEngagement(value, true);
  assert.deepEqual(all.reactions, value.reactions);
  const target = normalizeEngagement(value, false);
  assert.equal(target.body, value.body); assert.deepEqual(target.reactions, []); assert.equal(target.comments, undefined);
  const { LeadEngagement } = loadTs('src/components/cards/LeadEngagement.tsx', {});
  const html = renderToStaticMarkup(React.createElement(LeadEngagement, { value: all }));
  assert.match(html, /244/); assert.match(html, /👍/); assert.match(html, /Комментарии: 43/);
  assert.equal(renderToStaticMarkup(React.createElement(LeadEngagement, { value: target })), '');
});

test('старые цифры убираются без выдумывания реакций, суммы внутри новости остаются', () => {
  const text = 'Цена выросла на 10%\n244\n39\n12\n15,1K\n08:00\n💬 Комментарии (43)';
  assert.equal(presentLeadEngagement(text, null).text, 'Цена выросла на 10%');
  assert.equal(presentLeadEngagement('Оплата:\n4500', null).text, 'Оплата:\n4500');
  assert.equal(normalizeEngagement({ body: 'Новость', reactions: [{ count: '2', image: 'https://evil.example/x.svg' }] }, true).reactions[0].image, undefined);
});
