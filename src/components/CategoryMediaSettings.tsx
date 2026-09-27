'use client';

import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

type Category = { id: string; name: string; capturePhotos?: boolean; captureVideos?: boolean };
export function CategoryMediaSettings({ categories, enabled }: { categories: Category[]; enabled: boolean }) {
  const [selected, setSelected] = useState('');
  const [photos, setPhotos] = useState(false);
  const [videos, setVideos] = useState(false);
  const [saved, setSaved] = useState<Record<string, { photos: boolean; videos: boolean }>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const category = categories.find(item => item.id === selected);
  const persistedPhotos = category ? (saved[category.id]?.photos ?? category.capturePhotos ?? false) : false;
  const persistedVideos = category ? (saved[category.id]?.videos ?? category.captureVideos ?? false) : false;
  const unchanged = Boolean(category) && photos === persistedPhotos && videos === persistedVideos;
  useEffect(() => {
    if (!category) { setPhotos(false); setVideos(false); return; }
    setPhotos(saved[category.id]?.photos ?? category.capturePhotos ?? false);
    setVideos(saved[category.id]?.videos ?? category.captureVideos ?? false);
  }, [category, saved]);

  async function save() {
    if (!category) return;
    setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/admin/category-media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryId: category.id, capturePhotos: photos, captureVideos: videos }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось сохранить');
      if (data.capturePhotos !== photos || data.captureVideos !== videos) throw new Error('Сервер не подтвердил настройку медиа');
      setSaved(current => ({ ...current, [category.id]: { photos, videos } }));
      setNotice(`Сохранено: ${category.name} — фото ${photos ? 'включены' : 'выключены'}, видео ${videos ? 'включено' : 'выключено'}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Не удалось сохранить'); }
    finally { setBusy(false); }
  }

  return <section className="rounded-xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
    <h2 className="font-bold text-white">Медиа из чата</h2>
    <p className="text-sm text-zinc-400">Сначала создайте категорию, затем выберите её здесь. Фото и видео можно включать независимо для каждой категории.</p>
    {!enabled && <p className="text-sm text-amber-300">Для сбора медиа сначала выберите и сохраните одну тему приложения.</p>}
    <div className="relative">
      <select aria-label="Категория для медиа" disabled={busy} value={selected} onChange={event => { setSelected(event.target.value); setNotice(''); }} className="w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-950 py-3 pl-3 pr-12 text-white disabled:opacity-50">
        <option value="">Выберите сохранённую категорию</option>
        {categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <ChevronDown aria-hidden="true" size={14} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500" />
    </div>
    <label className="flex items-center gap-3 text-sm text-white"><input type="checkbox" checked={photos} disabled={!category || busy || !enabled} onChange={event => { setPhotos(event.target.checked); setNotice(''); }} />Сохранять фотографии исходного сообщения</label>
    <label className="flex items-center gap-3 text-sm text-white"><input type="checkbox" checked={videos} disabled={!category || busy || !enabled} onChange={event => { setVideos(event.target.checked); setNotice(''); }} />Сохранять видео исходного сообщения</label>
    <p className="text-sm text-zinc-400">В режиме «Всё» сообщения без совпадений попадают в «Другое»: медиа для них включаются у этой категории. Она появится после первого такого сообщения.</p>
    <p className="text-sm text-zinc-400">Срок бесплатных публикаций задаётся полем «Время жизни» категории: 180 минут — 3 часа, 1440 — сутки. По окончании срока удаляются текст и медиа. Купленные лиды сохраняются по прежним правилам.</p>
    <p className="text-sm text-zinc-400">До 6 фотографий по 5 МБ и одного видео до 3 МБ на сообщение. Видео сжимается до 480p и 30 секунд. Медиа платного лида доступны после покупки.</p>
    <button type="button" onClick={save} disabled={!category || busy || !enabled || unchanged} className="rounded bg-accent px-4 py-3 font-bold text-black disabled:cursor-not-allowed disabled:opacity-40">{busy ? 'Сохранение…' : unchanged ? 'Сохранено' : 'Сохранить медиа'}</button>
    {notice && <p role="status" className="text-sm text-white">{notice}</p>}
  </section>;
}
