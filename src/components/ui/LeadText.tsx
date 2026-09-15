import React from 'react';
import { isLeadAddressLine } from '@/lib/lead-location';

type IconKind = 'metro' | 'payment' | 'clock' | 'location' | 'phone' | 'link' | 'calendar';

const LABELS: Record<IconKind, string> = {
  metro: 'Метро', payment: 'Оплата', clock: 'Время', location: 'Адрес',
  phone: 'Телефон', link: 'Ссылка', calendar: 'Дата',
};

const COLORS: Record<IconKind, string> = {
  metro: '#dc2626', payment: '#a16207', clock: '#475569', location: '#dc2626',
  phone: '#16a34a', link: '#2563eb', calendar: '#7c3aed',
};

/** Цветные пиктограммы; исходные слова и условия объявления сохраняются. */
export function LeadIcon({ kind }: { kind: IconKind }) {
  return (
    <svg role="img" aria-label={LABELS[kind]} viewBox="0 0 24 24" width="19" height="19"
      className="mx-0.5 inline-block shrink-0 align-[-4px]" style={{ color: COLORS[kind] }}
      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'metro' && <>
        <path d="M3 21v-9a9 9 0 0 1 18 0v9Z" />
        <path d="M7 18V9l5 6 5-6v9" strokeWidth="2.3" />
      </>}
      {kind === 'payment' && <>
        <circle cx="15" cy="6" r="4" fill="#facc15" /><path d="M15 4v4m-1-3h2" />
        <path d="m2 15 4-3h5l3 2h5a2 2 0 0 1 1 4l-6 3-8-2H2Z" fill="#fed7aa" />
        <path d="M6 12v7m5-5h3a2 2 0 0 1 0 4h-4" />
      </>}
      {kind === 'clock' && <>
        <circle cx="12" cy="12" r="9" fill="#e0f2fe" />
        <path d="M12 7v5l3 2M12 3v2m0 14v2M3 12h2m14 0h2" />
      </>}
      {kind === 'location' && <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" fill="#fecaca" /><circle cx="12" cy="10" r="2.5" fill="white" /></>}
      {kind === 'phone' && <path d="m6 3 3 5-2 2a14 14 0 0 0 7 7l2-2 5 3c-1 4-5 4-9 2C6 17 2 11 3 6c0-2 1-3 3-3Z" fill="#bbf7d0" />}
      {kind === 'link' && <><path d="m10 7 2-2a5 5 0 0 1 7 7l-2 2M14 17l-2 2a5 5 0 0 1-7-7l2-2M8 16l8-8" /></>}
      {kind === 'calendar' && <><rect x="4" y="5" width="16" height="16" rx="2" fill="#ede9fe" /><path d="M8 3v4m8-4v4M4 10h16m-12 4h2m4 0h2m-8 3h2" /></>}
    </svg>
  );
}

function iconKind(value: string): IconKind | null {
  if (/🚇|🚉|🚆|Ⓜ|^[мМ]\.$/u.test(value)) return 'metro';
  if (/💰|💵|💴|💶|💷|💸|🪙|💳/u.test(value)) return 'payment';
  if (/⏰|⌚|⏱|⏲|🕰|[\u{1F550}-\u{1F567}]/u.test(value)) return 'clock';
  if (/📍|📌|🗺/u.test(value)) return 'location';
  if (/☎|📞|📱/u.test(value)) return 'phone';
  if (/🔗/u.test(value)) return 'link';
  if (/📅|📆|🗓/u.test(value)) return 'calendar';
  return null;
}

/** Меняем только представление значков; суммы, слова и пробелы остаются на месте. */
export function LeadText({ text, markAddresses = false }: { text: string; markAddresses?: boolean }) {
  if (markAddresses) {
    return <>{text.split('\n').map((line, index) => <React.Fragment key={index}>
      {index > 0 ? '\n' : null}
      {isLeadAddressLine(line) && !/^[\s]*[📍📌🗺]/u.test(line) ? <LeadIcon kind="location" /> : null}
      <LeadText text={line} />
    </React.Fragment>)}</>;
  }
  const pattern = /(?:Ⓜ\uFE0F?|(?<!\p{L})[мМ]\.(?=\s+[А-ЯЁ])|\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}[\uFE0F\p{Emoji_Modifier}]*(?:\u200D\p{Extended_Pictographic}[\uFE0F\p{Emoji_Modifier}]*)*)/gu;
  const nodes: React.ReactNode[] = [];
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index!;
    nodes.push(text.slice(offset, index));
    const kind = iconKind(match[0]);
    nodes.push(kind
      ? <React.Fragment key={index}><LeadIcon kind={kind} />{kind === 'metro' && !/метро\s*$/iu.test(text.slice(0, index)) && !/^\s*метро(?:\s|$)/iu.test(text.slice(index + match[0].length)) ? 'метро' : null}</React.Fragment>
      : <span key={index} className="inline-block">{match[0]}</span>);
    offset = index + match[0].length;
  }
  nodes.push(text.slice(offset));
  return <>{nodes}</>;
}
