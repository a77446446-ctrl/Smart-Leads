'use client';

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { BrandingProvider, useBranding } from '@/components/BrandingProvider';
import { Logo } from '@/components/Logo';
import { parseBranding, type Branding } from '@/lib/branding';

const fields: Array<{ key: keyof Branding; label: string; max: number }> = [
  { key: 'name', label: 'Название продукта', max: 60 },
  { key: 'tagline', label: 'Короткий заголовок', max: 120 },
  { key: 'description', label: 'Описание продукта', max: 500 },
  { key: 'welcomeText', label: 'Приветствие на странице входа', max: 500 },
  { key: 'supportEmail', label: 'Email поддержки', max: 254 },
];

export default function BrandingPage() {
  const current = useBranding();
  const router = useRouter();
  const [draft, setDraft] = useState<Branding>(current);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/branding', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 403 || response.status === 401 ? 'Настройки доступны только владельцу экземпляра.' : 'Не удалось загрузить настройки.');
        const value = parseBranding(await response.json());
        if (!controller.signal.aborted) { setDraft(value); setReady(true); }
      })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(''); setMessage('');
    let value: Branding;
    try { value = parseBranding(draft); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Проверьте настройки'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/admin/branding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Не удалось сохранить');
      setDraft(parseBranding(body));
      setMessage('Бренд сохранён. Новые настройки применены к приложению.');
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Ошибка сохранения'); }
    finally { setBusy(false); }
  }

  async function upload(file: File | undefined, field: 'logoUrl' | 'heroImageUrl') {
    if (!file) return;
    setError(''); setMessage('');
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Выберите PNG, JPEG, WEBP или GIF размером до 5 МБ.'); return;
    }
    setBusy(true);
    try {
      const data = new FormData();
      data.set('file', file);
      const response = await fetch('/api/admin/upload', { method: 'POST', body: data });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Не удалось загрузить изображение');
      setDraft(value => ({ ...value, [field]: body.url }));
      setMessage('Изображение загружено. Сохраните бренд, чтобы применить его.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Ошибка загрузки'); }
    finally { setBusy(false); }
  }

  const rgb = [1, 3, 5].map(offset => Number.parseInt(draft.accent.slice(offset, offset + 2), 16)).join(' ');
  return <div className="mx-auto max-w-5xl">
    <h1 className="text-3xl font-black">Бренд</h1>
    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">Название, логотип, картинка главной страницы и тексты вашего экземпляра. Изменения появятся в приложении после сохранения.</p>
    {loading && <p role="status" className="mt-6">Загружаем настройки…</p>}
    {error && <p role="alert" className="my-5 rounded-xl border border-red-500 bg-red-950 p-4 text-red-100">{error}</p>}
    {message && <p role="status" className="my-5 rounded-xl border border-green-600 bg-green-950 p-4 text-green-100">{message}</p>}
    <div className="mt-8 grid gap-8 lg:grid-cols-2">
      <form onSubmit={save}>
        <fieldset disabled={busy || loading || !ready} className="space-y-5 disabled:opacity-60">
          {fields.map(field => <label key={field.key} className="block text-sm font-bold">
            {field.label}
            <input type={field.key === 'supportEmail' ? 'email' : 'text'} name={field.key}
              maxLength={field.max} required={['name', 'tagline', 'description'].includes(field.key)}
              value={draft[field.key]} onChange={event => { setDraft({ ...draft, [field.key]: event.target.value }); setMessage(''); }}
              className="mt-2 block w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-3 text-white focus:outline-accent" />
          </label>)}
          <label className="block text-sm font-bold">Акцентный цвет
            <input type="color" value={draft.accent} onChange={event => setDraft({ ...draft, accent: event.target.value })} className="mt-2 block h-12 w-24 cursor-pointer" />
            <span className="mt-2 block text-xs font-normal text-zinc-400">Светлый оттенок для кнопок с чёрным текстом. Читаемость проверяется при сохранении.</span>
          </label>
          <label className="block text-sm font-bold">Логотип
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => { void upload(event.target.files?.[0], 'logoUrl'); event.target.value = ''; }} className="mt-2 block w-full text-xs" />
          </label>
          {draft.logoUrl && <button type="button" onClick={() => setDraft({ ...draft, logoUrl: '' })} className="text-sm underline">Использовать стандартный знак</button>}
          <label className="block text-sm font-bold">Картинка главной страницы
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => { void upload(event.target.files?.[0], 'heroImageUrl'); event.target.value = ''; }} className="mt-2 block w-full text-xs" />
            <span className="mt-2 block text-xs font-normal text-zinc-400">PNG, JPEG, WEBP или GIF до 5 МБ. Изображение целиком помещается между логотипом и описанием; лучше подходит вертикальная иллюстрация.</span>
          </label>
          {draft.heroImageUrl && <button type="button" onClick={() => setDraft({ ...draft, heroImageUrl: '' })} className="text-sm underline">Убрать картинку главной страницы</button>}
          <button type="submit" className="block w-full rounded-lg bg-accent px-5 py-4 font-black text-black hover:brightness-95">{busy ? 'Сохраняем…' : 'Сохранить бренд'}</button>
        </fieldset>
      </form>
      <section aria-label="Предпросмотр бренда" className="h-fit rounded-2xl bg-white p-6 text-black" style={{ '--accent-rgb': rgb } as CSSProperties}>
        <BrandingProvider value={draft}>
          <p className="mb-6 text-xs font-bold uppercase tracking-widest text-zinc-500">Предпросмотр</p>
          <Logo size="md" />
          {draft.heroImageUrl && <div className="relative mt-7 h-72 w-full">
            <Image src={draft.heroImageUrl} alt="Картинка главной страницы" fill unoptimized sizes="(max-width: 1024px) 100vw, 400px" className="object-contain" />
          </div>}
          <div className={draft.heroImageUrl ? 'mt-7 border-2 border-black p-5' : ''}>
            <h2 className={`${draft.heroImageUrl ? '' : 'mt-8'} break-words text-2xl font-black`}>{draft.tagline}</h2>
            <p className="mt-4 break-words text-sm leading-relaxed text-zinc-600">{draft.description}</p>
            <p className="mt-4 break-words text-sm text-zinc-500">{draft.welcomeText}</p>
          </div>
          <span className="mt-8 block rounded-lg bg-accent p-4 text-center font-black text-black">Открыть ленту</span>
        </BrandingProvider>
      </section>
    </div>
  </div>;
}
