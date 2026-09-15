import Link from 'next/link';
import { getLegalConfig } from '@/lib/legal';
import { getBranding } from '@/lib/branding-server';

export default async function SupportPage() {
  const c = getLegalConfig();
  const brand = await getBranding();
  c.supportEmail = c.supportEmail || brand.supportEmail;
  return <main className="min-h-screen bg-[#efefef] px-5 py-10"><div className="mx-auto max-w-2xl border border-black bg-white p-8 shadow-[6px_6px_0_0_#000]"><Link href="/dashboard" className="text-sm font-bold underline">← В приложение</Link><h1 className="mt-6 text-3xl font-black uppercase">Поддержка</h1><p className="mt-6 leading-7">Вопросы по покупке, возврату, персональным данным или удалению контакта направляйте на <a className="font-bold underline" href={`mailto:${c.supportEmail}`}>{c.supportEmail || 'email поддержки не настроен'}</a>.</p><p className="mt-4 text-sm text-zinc-600">Укажите MAX ID, идентификатор покупки или ссылку на источник. Для запроса об удалении чужого публичного контакта не присылайте лишние документы; поддержка сообщит безопасный способ подтверждения принадлежности.</p></div></main>;
}
