'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { APPLICATION_THEMES, ApplicationThemeId, isApplicationThemeId } from '@/lib/application-theme';

export function ApplicationThemeSettings({ onSaved }: { onSaved: (theme: ApplicationThemeId | null) => void }) {
  const [selected, setSelected] = useState<ApplicationThemeId | ''>('');
  const [saved, setSaved] = useState<ApplicationThemeId | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false);
    setError('');
    async function load() {
      try {
        const response = await fetch('/api/admin/application-theme', { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Не удалось загрузить тему.');
        if (data.theme !== null && !isApplicationThemeId(data.theme)) throw new Error('Сервер вернул неизвестную тему.');
        if (controller.signal.aborted) return;
        setSaved(data.theme);
        setSelected(data.theme ?? '');
        onSaved(data.theme);
        setLoaded(true);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить тему.');
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt, onSaved]);

  async function save() {
    if (!loaded || busy || !selected || selected === saved) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/application-theme', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: selected }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось сохранить тему.');
      if (!isApplicationThemeId(data.theme)) throw new Error('Сервер не подтвердил сохранение темы.');
      setSaved(data.theme);
      onSaved(data.theme);
      setMessage('Тема сохранена. Теперь заполните категории ниже.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить тему.');
    } finally {
      setBusy(false);
    }
  }

  const example = APPLICATION_THEMES.find(theme => theme.id === selected);
  const current = APPLICATION_THEMES.find(theme => theme.id === saved);
  return (
    <section aria-labelledby="application-theme-heading" className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 sm:p-6 space-y-5">
      <div className="space-y-2">
        <h2 id="application-theme-heading" className="text-base font-bold text-white">Тема приложения</h2>
        <p className="text-sm text-zinc-300">Выберите только одну тему для всего приложения. Категории — это рубрики внутри выбранной темы; добавляйте их в форме ниже.</p>
        <p className="text-sm text-zinc-400">{loaded ? `Сохранённая тема: ${current?.name ?? 'ещё не выбрана'}.` : error ? 'Тема не загружена.' : 'Загрузка темы…'}</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {!loaded && error && <button type="button" onClick={() => setAttempt(value => value + 1)} className="text-sm text-accent underline">Повторить загрузку</button>}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 space-y-2">
          <label htmlFor="application-theme" className="text-sm text-zinc-300">Одна тема приложения</label>
          <div className="relative">
            <select id="application-theme" value={selected} disabled={!loaded || busy}
              onChange={event => { if (isApplicationThemeId(event.target.value)) setSelected(event.target.value); setMessage(''); }}
              className="w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-950 py-3 pl-3 pr-12 text-sm text-white disabled:opacity-50">
              <option value="" disabled>Выберите тему</option>
              {APPLICATION_THEMES.map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
            </select>
            <ChevronDown aria-hidden="true" size={14} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500" />
          </div>
        </div>
        <button type="button" onClick={() => void save()} disabled={!loaded || busy || !selected || selected === saved}
          className="self-start sm:self-end rounded-lg bg-accent px-5 py-3 text-sm font-bold text-black disabled:opacity-50">
          {busy ? 'Сохранение…' : 'Сохранить тему'}
        </button>
      </div>
      {selected && selected !== saved && <p className="text-sm text-amber-300">Выбор ещё не сохранён. Смена темы заменит предыдущую; существующие категории останутся. Проверьте, что они подходят новой теме.</p>}
      {message && <p role="status" className="text-sm text-accent">{message}</p>}
      <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-4 space-y-3 text-sm text-zinc-300">
        <h3 className="font-bold text-white">Как заполнить категории</h3>
        <ol className="list-decimal pl-5 space-y-2">
          <li>Выберите тему и нажмите «Сохранить тему». Несколько тем одновременно выбрать нельзя.</li>
          <li>Добавьте нужные рубрики в разделе ниже. Примеры не создаются автоматически.</li>
          <li>Укажите для каждой категории свои слова-плюсы и слова-минусы и сохраните категорию.</li>
        </ol>
        {example ? <div className="space-y-1">
          <p><strong>{example.name}:</strong> {example.categories.join(', ')}.</p>
          <p>Пример категории: «{example.example}».</p>
          <p>Слова-плюсы: {example.plus}.</p>
          <p>Слова-минусы: {example.minus}.</p>
        </div> : <p>Например: «Новости» → «Спорт», «Авто»; «Аренда и недвижимость» → «Аренда квартир», «Коммерческие помещения».</p>}
      </div>
      <p className="text-xs text-zinc-400">Тема применяется к следующим полученным сообщениям. Новости, события и «Отдам даром» сохраняются для чтения без покупки; остальные темы используют доступ к контактам. Старые публикации и покупки сохраняют прежние права. Вложения и отдельный срок удаления бесплатных публикаций пока не подключены.</p>
    </section>
  );
}
