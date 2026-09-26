import { Clock, Eye, MessageCircle, Smile } from 'lucide-react';
import type { LeadEngagement as Engagement } from '@/lib/lead-engagement';

export function LeadEngagement({ value }: { value?: Engagement | null }) {
  if (!value?.show || (!value.reactions.length && !value.views && !value.comments && !value.time)) return null;
  return <div className="mb-4 space-y-3" aria-label="Статистика сообщения в MAX">
    <div className="flex flex-wrap gap-1.5">
      {value.reactions.map((reaction, index) => <span key={index} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-zinc-700">
        {reaction.image
          // Маленький PNG извлечён из canvas MAX; внешних запросов здесь нет.
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={reaction.image} width={20} height={20} alt="Реакция" />
          : reaction.emoji ? <span className="text-base leading-none">{reaction.emoji}</span> : <Smile size={16} aria-label="Реакция" />}
        {reaction.count}
      </span>)}
    </div>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500">
      {value.comments && <span className="inline-flex items-center gap-1.5"><MessageCircle size={14} />Комментарии: {value.comments}</span>}
      {value.views && <span className="inline-flex items-center gap-1" title="Просмотры в MAX"><Eye size={14} />{value.views}</span>}
      {value.time && <span className="inline-flex items-center gap-1" title="Время сообщения в MAX"><Clock size={13} />{value.time}</span>}
    </div>
  </div>;
}
