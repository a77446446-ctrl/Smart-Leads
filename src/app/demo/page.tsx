import Link from 'next/link';
import { ArrowLeft, Bell, CheckCircle2, ExternalLink, Settings2, Users } from 'lucide-react';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { BrandingProvider } from '@/components/BrandingProvider';
import { getBranding } from '@/lib/branding-server';

const demoLeads = [
  {
    category: 'Маркетинг',
    title: 'Нужен подрядчик на настройку рекламы для нового проекта',
    source: 'MAX',
    time: 'сегодня, 10:24',
  },
  {
    category: 'Разработка',
    title: 'Ищем специалиста для создания интернет-магазина',
    source: 'Telegram',
    time: 'сегодня, 09:48',
  },
  {
    category: 'Дизайн',
    title: 'Требуется дизайнер презентации для отдела продаж',
    source: 'MAX',
    time: 'вчера, 18:12',
  },
];

export default async function DemoPage() {
  if (process.env.NODE_ENV === 'production') redirect('/login');

  const brand = await getBranding();

  return (
    <BrandingProvider value={brand}>
      <main className="min-h-screen bg-zinc-100 text-black">
        <header className="border-b-2 border-black bg-white px-4 py-4 sm:px-8">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <Logo />
            <Link
              href="/login"
              className="flex items-center gap-2 border-2 border-black px-3 py-2 text-xs font-black uppercase hover:bg-zinc-100"
            >
              <ArrowLeft size={16} />
              Выйти из демо
            </Link>
          </div>
        </header>

        <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-10">
          <section className="border-2 border-black bg-accent p-5 sm:p-7">
            <p className="text-xs font-black uppercase tracking-widest">Тестовый просмотр</p>
            <h1 className="mt-3 max-w-2xl text-3xl font-black leading-tight sm:text-5xl">
              {brand.name}: рабочее пространство для заявок
            </h1>
            <p className="mt-4 max-w-2xl text-sm font-medium leading-relaxed sm:text-base">
              Это безопасный демонстрационный режим. Здесь показаны учебные данные, а реальные
              подключения к MAX, Telegram и база клиентов не используются.
            </p>
          </section>

          <section className="grid gap-4 sm:grid-cols-3">
            <div className="border-2 border-black bg-white p-5">
              <Bell className="mb-5" size={24} />
              <p className="text-3xl font-black">24</p>
              <p className="mt-1 text-sm font-bold text-zinc-600">новые заявки сегодня</p>
            </div>
            <div className="border-2 border-black bg-white p-5">
              <Users className="mb-5" size={24} />
              <p className="text-3xl font-black">8</p>
              <p className="mt-1 text-sm font-bold text-zinc-600">активных категорий</p>
            </div>
            <div className="border-2 border-black bg-white p-5">
              <CheckCircle2 className="mb-5" size={24} />
              <p className="text-3xl font-black">98%</p>
              <p className="mt-1 text-sm font-bold text-zinc-600">доставлено подписчикам</p>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <div className="border-2 border-black bg-white p-5 sm:p-7">
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Лента</p>
                  <h2 className="mt-1 text-2xl font-black">Последние заявки</h2>
                </div>
                <span className="border border-zinc-300 px-2 py-1 text-[10px] font-black uppercase">Демо</span>
              </div>
              <div className="space-y-3">
                {demoLeads.map((lead) => (
                  <article key={lead.title} className="border border-zinc-300 p-4">
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase text-zinc-500">
                      <span className="bg-accent px-2 py-1 text-black">{lead.category}</span>
                      <span>{lead.source}</span>
                      <span>{lead.time}</span>
                    </div>
                    <h3 className="mt-3 text-base font-black leading-snug">{lead.title}</h3>
                    <p className="mt-3 text-xs font-bold text-zinc-500">Контакт откроется после подключения источника.</p>
                  </article>
                ))}
              </div>
            </div>

            <aside className="border-2 border-black bg-black p-5 text-white sm:p-7">
              <Settings2 className="mb-6 text-accent" size={28} />
              <p className="text-xs font-black uppercase tracking-widest text-zinc-400">Что будет дальше</p>
              <h2 className="mt-2 text-2xl font-black">Настроим ваш продукт</h2>
              <ol className="mt-6 space-y-4 text-sm font-medium leading-relaxed text-zinc-200">
                <li><span className="mr-2 font-black text-accent">01</span> Подключим авторизацию MAX и Telegram.</li>
                <li><span className="mr-2 font-black text-accent">02</span> Добавим ваши категории и источники.</li>
                <li><span className="mr-2 font-black text-accent">03</span> Включим доставку заявок и медиафайлов.</li>
              </ol>
              <Link
                href="/login"
                className="mt-8 flex items-center justify-center gap-2 bg-accent px-4 py-3 text-center text-xs font-black uppercase text-black hover:brightness-95"
              >
                <ExternalLink size={16} />
                Вернуться к авторизации
              </Link>
            </aside>
          </section>
        </div>
      </main>
    </BrandingProvider>
  );
}
