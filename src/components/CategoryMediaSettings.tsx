'use client';

import React, { useEffect, useState } from 'react';

type Category = { id: string; name: string; capturePhotos?: boolean };
export function CategoryMediaSettings({ categories, enabled }: { categories: Category[]; enabled: boolean }) {
  const [selected, setSelected] = useState('');
  const [photos, setPhotos] = useState(false);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const category = categories.find(item => item.id === selected);
  useEffect(() => {
    if (!category) { setPhotos(false); return; }
    setPhotos(saved[category.id] ?? category.capturePhotos ?? false);
  }, [category, saved]);

  async function save() {
    if (!category) return;
    setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/admin/category-media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryId: category.id, capturePhotos: photos }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось сохранить');
      setSaved(current => ({ ...current, [category.id]: data.capturePhotos }));
      setNotice(`Сохранено: ${category.name} — ${data.capturePhotos ? 'с фотографиями' : 'без фотографий'}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Не удалось сохранить'); }
    finally { setBusy(false); }
  }

  return <section className="rounded-xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
    <h2 className="font-bold text-white">Фотографии из чата</h2>
    <p className="text-sm text-zinc-400">Сначала создайте категорию, затем выберите её здесь. Например: «Авто» — с фотографиями, «Спорт» — без фотографий. Настройка сохраняется отдельно.</p>
    {!enabled && <p className="text-sm text-amber-300">Для сбора фотографий сначала выберите и сохраните одну тему приложения.</p>}
    <select aria-label="Категория для фотографий" disabled={busy} value={selected} onChange={event => { setSelected(event.target.value); setNotice(''); }} className="w-full rounded border border-zinc-700 bg-zinc-950 p-3 text-white">
      <option value="">Выберите сохранённую категорию</option>
      {categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    <label className="flex items-center gap-3 text-sm text-white"><input type="checkbox" checked={photos} disabled={!category || busy || !enabled} onChange={event => setPhotos(event.target.checked)} />Сохранять фотографии исходного сообщения</label>
    <p className="text-sm text-zinc-400">В режиме «Всё» сообщения без совпадений попадают в «Другое»: фотографии для них включаются у этой категории. Она появится после первого такого сообщения.</p>
    <p className="text-sm text-zinc-400">Срок бесплатных публикаций задаётся полем «Время жизни» категории: 180 минут — 3 часа, 1440 — сутки. По окончании срока удаляются текст и фотографии. Купленные лиды сохраняются по прежним правилам.</p>
    <p className="text-sm text-zinc-400">До 6 фотографий по 5 МБ. Для платного лида фотографии доступны после покупки. Видео и отправка фотографий в MAX/Telegram будут подключены отдельным этапом.</p>
    <button type="button" onClick={save} disabled={!category || busy || !enabled} className="rounded bg-accent px-4 py-3 font-bold text-black disabled:opacity-40">{busy ? 'Сохранение…' : 'Сохранить фотографии'}</button>
    {notice && <p role="status" className="text-sm text-white">{notice}</p>}
  </section>;
}
