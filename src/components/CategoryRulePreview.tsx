'use client';

import { useMemo, useState } from 'react';
import { previewCategoryRule } from '@/lib/category-editor';

const messages = {
  empty: 'Введите текст сообщения для проверки.',
  inactive: 'Категория выключена и не участвует в распределении по словам.',
  'missing-plus': 'Добавьте хотя бы одно слово-плюс: без него совпадения с этой категорией не будет.',
  excluded: 'Сообщение не подходит этой категории: найдено слово-минус.',
  unmatched: 'Совпадений со словами-плюсами этой категории нет.',
  matched: 'Сообщение подходит этой категории по словам.',
} as const;

export function CategoryRulePreview({ name, plus, minus, active, themed }: {
  name: string;
  plus: string[];
  minus: string[];
  active: boolean;
  themed: boolean;
}) {
  const [text, setText] = useState('');
  const result = useMemo(() => previewCategoryRule(text, plus, minus, active), [text, plus, minus, active]);
  return (
    <section aria-labelledby="category-preview-heading" className="rounded-lg border border-zinc-700 bg-zinc-950 p-4 sm:p-6 space-y-4">
      <div className="space-y-2">
        <h4 id="category-preview-heading" className="text-sm font-bold text-white">Проверка слов: {name.trim() || 'новая категория'}</h4>
        <p className="text-sm text-zinc-300">Введите пример сообщения. Проверка учитывает текущие слова в форме, включая ещё не сохранённые. Текст остаётся в браузере.</p>
      </div>
      <label htmlFor="category-preview-text" className="block text-sm text-zinc-300">Текст для проверки</label>
      <textarea id="category-preview-text" value={text} onChange={event => setText(event.target.value)} maxLength={10000} rows={4}
        placeholder="Вставьте сообщение из чата…"
        className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm text-white outline-none focus:border-accent" />
      <div role="status" aria-live="polite" className="space-y-2 text-sm text-zinc-300">
        <p className={result.status === 'matched' ? 'text-green-400' : result.status === 'excluded' ? 'text-red-300' : ''}>{messages[result.status]}</p>
        {result.plusMatches.length > 0 && <p>Совпали слова-плюсы: {result.plusMatches.join(', ')}.</p>}
        {result.minusMatches.length > 0 && <p>Совпали слова-минусы: {result.minusMatches.join(', ')}.</p>}
        {result.conflicts.length > 0 && <p className="text-amber-300">Одинаковые слова в обоих списках: {result.conflicts.join(', ')}. При совпадении минус исключает категорию.</p>}
      </div>
      <details className="text-sm text-zinc-400">
        <summary className="cursor-pointer text-zinc-300">Как применяются правила</summary>
        <ul className="mt-3 list-disc pl-5 space-y-2">
          <li>Достаточно одного слова-плюса. Любое совпавшее слово-минус исключает эту категорию.</li>
          <li>Регистр и различие «е/ё» не учитываются. Короткие слова до трёх символов ищутся целиком, более длинные — также внутри слова. Например, «ремонт» совпадёт с «ремонта».</li>
          <li>Если подходят несколько категорий, итоговое распределение учитывает все активные категории. Эта проверка показывает только текущую.</li>
          <li>Режим источника «Всё» сохраняет сообщения и без совпадения категории; несовпавшие попадают в «Другое».</li>
          <li>{themed ? 'При выбранной теме режим «Целевые» требует совпадения с активной категорией по словам. Новости, события и «Отдам даром» допускаются без контакта; для остальных тем сохраняются дополнительные проверки контакта и качества.' : 'Без выбранной темы действует прежний отбор лидов: проверяются контакт и качество, но отсутствие совпадения категории само по себе не запрещает попадание в «Другое».'}</li>
        </ul>
      </details>
      <p className="text-xs text-zinc-400">Это проверка слов, а не запуск парсинга. Совпадение не гарантирует публикацию: парсер также обрабатывает текст и применяет свои проверки. Для применения изменений нажмите «Сохранить категорию».</p>
    </section>
  );
}
