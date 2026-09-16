'use client';

import { useEffect, useState } from 'react';

type Field = { value: string; configured: boolean };
type Snapshot = Record<string, Field>;
type Definition = { key: string; label: string; hint: string; secret?: boolean };

const groups: Array<{ title: string; description: string; fields: Definition[] }> = [
  {
    title: 'MAX', description: 'Бот и Mini App вашего экземпляра. После смены токена или секрета обновите подписку webhook.',
    fields: [
      { key: 'MAX_BOT_TOKEN', label: 'Токен бота MAX', hint: 'Из настроек бота на платформе MAX.', secret: true },
      { key: 'MAX_BOT_USERNAME', label: 'Никнейм бота', hint: 'Только часть ссылки max.ru/… — без @ и адреса сайта.' },
      { key: 'MAX_WEBHOOK_SECRET', label: 'Секрет webhook', hint: 'Создайте случайную строку из латинских букв, цифр, _ и -.', secret: true },
    ],
  },
  {
    title: 'Telegram', description: 'Для входа пользователей: BotFather → ваш бот → Login Widget. Токен Telegram-бота здесь не нужен.',
    fields: [
      { key: 'TELEGRAM_CLIENT_ID', label: 'Client ID', hint: 'Числовой ID из раздела Login Widget.' },
      { key: 'TELEGRAM_CLIENT_SECRET', label: 'Client Secret', hint: 'Скопируйте целиком из того же раздела.', secret: true },
    ],
  },
  {
    title: 'ЮKassa', description: 'Реквизиты магазина клиента. Реальные платежи требуют заполненных юридических данных ниже.',
    fields: [
      { key: 'YOOKASSA_SHOP_ID', label: 'Shop ID', hint: 'Числовой идентификатор магазина ЮKassa.' },
      { key: 'YOOKASSA_SECRET_KEY', label: 'Секретный ключ API', hint: 'Из кабинета ЮKassa → Интеграция → Ключи API.', secret: true },
      { key: 'YOOKASSA_VAT_CODE', label: 'Код НДС', hint: 'Код из настроек чеков магазина; 1 означает «Без НДС».' },
    ],
  },
  {
    title: 'Оператор сервиса', description: 'Данные владельца экземпляра, который оказывает услугу конечным пользователям и принимает их платежи.',
    fields: [
      { key: 'LEGAL_OPERATOR_TYPE', label: 'Статус оператора', hint: 'Для самозанятого ОГРНИП и юридический адрес не требуются в приложении.' },
      { key: 'LEGAL_DOCUMENT_VERSION', label: 'Версия документов', hint: 'Например, 2026-09-16. Измените при обновлении документов.' },
      { key: 'LEGAL_EFFECTIVE_DATE', label: 'Дата начала действия', hint: 'Например, 16 сентября 2026 года.' },
      { key: 'LEGAL_OPERATOR_NAME', label: 'Имя или название', hint: 'Настоящее имя самозанятого, ИП или название организации.' },
      { key: 'LEGAL_TAX_ID', label: 'ИНН', hint: 'Настоящий ИНН оператора.' },
      { key: 'LEGAL_REGISTRATION_ID', label: 'ОГРН / ОГРНИП', hint: 'Заполняется компанией или ИП; самозанятый без ИП оставляет пустым.' },
      { key: 'LEGAL_ADDRESS', label: 'Юридический адрес', hint: 'Заполняется компанией или ИП; для самозанятого без ИП необязателен.' },
      { key: 'LEGAL_EMAIL', label: 'Email оператора', hint: 'Адрес для юридических обращений пользователей.' },
      { key: 'LEGAL_SUPPORT_EMAIL', label: 'Email поддержки', hint: 'Адрес для вопросов и обращений пользователей.' },
    ],
  },
];

export default function InstancePage() {
  const [snapshot, setSnapshot] = useState<Snapshot>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/instance-config', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Не удалось загрузить настройки');
        const data = await response.json() as Snapshot;
        setSnapshot(data);
        setDraft(Object.fromEntries(Object.entries(data).map(([key, item]) => [key, item.value])));
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Ошибка загрузки'));
  }, []);

  async function save(key: string, clear = false) {
    setBusy(key); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/instance-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: key, value: clear ? '' : draft[key] || (key === 'LEGAL_OPERATOR_TYPE' ? 'SOLE_PROPRIETOR' : '') }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось сохранить');
      setSnapshot(data as Snapshot);
      setDraft(previous => ({ ...previous, [key]: (data as Snapshot)[key]?.value || '' }));
      setMessage(clear ? 'Настройка удалена.' : 'Настройка сохранена.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Ошибка сохранения'); }
    finally { setBusy(''); }
  }

  async function connectMaxWebhook() {
    setBusy('webhook'); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/bot/chats', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'MAX не принял webhook');
      setMessage('Webhook MAX подключён: ' + data.webhookUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Ошибка подключения MAX'); }
    finally { setBusy(''); }
  }

  return <main className="mx-auto max-w-4xl pb-16">
    <h1 className="text-3xl font-black">Интеграции и реквизиты</h1>
    <p className="mt-3 text-sm leading-relaxed text-zinc-400">Настройки этого экземпляра. Секреты хранятся зашифрованными и после сохранения больше не отображаются. Пустое поле секрета оставляет прежнее значение.</p>
    {error && <p role="alert" className="mt-5 rounded-lg border border-red-500 bg-red-950 p-4 text-red-100">{error}</p>}
    {message && <p role="status" className="mt-5 rounded-lg border border-green-600 bg-green-950 p-4 text-green-100">{message}</p>}
    {groups.map(group => <section key={group.title} className="mt-8 rounded-xl border border-zinc-700 bg-zinc-900 p-5 sm:p-7">
      <h2 className="text-xl font-black">{group.title}</h2>
      <p className="mt-2 text-sm text-zinc-400">{group.description}</p>
      <div className="mt-5 space-y-6">
        {group.fields.map(field => <div key={field.key} className="border-t border-zinc-700 pt-5">
          <label htmlFor={field.key} className="block text-sm font-bold">{field.label}</label>
          <p className="mt-1 text-xs text-zinc-400">{field.hint}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {field.key === 'LEGAL_OPERATOR_TYPE' ? <select id={field.key} value={draft[field.key] || 'SOLE_PROPRIETOR'} onChange={event => setDraft({ ...draft, [field.key]: event.target.value })} className="min-w-0 flex-1 rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-3 text-white">
              <option value="SOLE_PROPRIETOR">ИП</option><option value="COMPANY">Организация</option><option value="SELF_EMPLOYED">Самозанятый</option>
            </select> : <input id={field.key} type={field.secret ? 'password' : 'text'} autoComplete="off" value={draft[field.key] || ''} onChange={event => setDraft({ ...draft, [field.key]: event.target.value })} placeholder={field.secret && snapshot[field.key]?.configured ? 'Сохранено — введите новое значение только для замены' : 'Введите значение'} className="min-w-0 flex-1 rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-3 text-white" />}
            <button type="button" disabled={Boolean(busy) || !snapshot[field.key] || (field.secret && !draft[field.key])} onClick={() => save(field.key)} className="rounded-lg bg-accent px-5 py-3 font-bold text-black disabled:opacity-40">Сохранить</button>
            {field.secret && snapshot[field.key]?.configured && <button type="button" disabled={Boolean(busy)} onClick={() => save(field.key, true)} className="rounded-lg border border-zinc-600 px-3 py-3 text-sm">Удалить</button>}
          </div>
          {field.secret && <p className="mt-2 text-xs text-zinc-400">{snapshot[field.key]?.configured ? 'Секрет настроен' : 'Секрет не настроен'}</p>}
        </div>)}
      </div>
      {group.title === 'MAX' && <button type="button" disabled={Boolean(busy)} onClick={connectMaxWebhook} className="mt-6 rounded-lg border border-zinc-500 px-5 py-3 text-sm font-bold disabled:opacity-40">Подключить webhook MAX</button>}
    </section>)}
  </main>;
}
