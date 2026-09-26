import React, { useState } from 'react';
import { LeadPhotos } from '@/components/cards/LeadPhotos';
import { LeadEngagement } from '@/components/cards/LeadEngagement';
import Image from 'next/image';
import { MapPin, Clock, Phone, Link as LinkIcon } from 'lucide-react';
import { LeadText, LeadIcon } from '@/components/ui/LeadText';
import { leadMapLabel } from '@/lib/lead-map-link';
import { leadLocationLabel } from '@/lib/lead-location';

interface LeadCardProps {
  lead: any;
  onBuy?: (id: string) => void;
  isPurchased?: boolean;
  highlighted?: boolean;
}

const phoneContactClass = 'm-1 inline-flex items-center gap-1 whitespace-nowrap rounded border border-black bg-accent px-1.5 py-0.5 align-middle text-[11px] font-black text-black';
const linkContactClass = 'm-1 inline-flex items-center gap-1 whitespace-nowrap rounded border border-black bg-black px-1.5 py-0.5 align-middle text-[11px] font-black text-white';

function formatLeadCreatedAt(value: unknown): string {
  const date = new Date(String(value || ''));
  if (!Number.isFinite(date.getTime())) return 'Время не указано';
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const day = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  return `${time}, ${day}`;
}

export const LeadCard = ({ lead, onBuy, isPurchased, highlighted }: LeadCardProps) => {
  const [expanded, setExpanded] = useState(false);

  const isInfo = lead.category?.slug === 'info' || lead.category?.name?.toLowerCase().includes('инфо');
  const isPublic = lead.accessMode === 'PUBLIC';

  // Mask contacts if it's not purchased yet, regardless of price
  const shouldMask = !isPurchased && !isInfo && !isPublic;
  const locationLabel = leadLocationLabel(lead.rawText, lead.city);

  const renderTextWithLinks = (text: string, truncateAt?: number, markAddresses = true) => {
    if (!text) return null;
    const combinedRegex = /(\[(?:контакт скрыт(?::(?:phone|link|yandex))?|ссылка скрыта)\]|контакт\s+скрыт|https?:\/\/[^\s]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\/[^\s]*|@[a-zA-Z0-9_]+|(?:\+?7|8)[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\b\d{10}\b)/gi;
    
    let currentLength = 0;
    const parts = text.split(combinedRegex);
    const result: React.ReactNode[] = [];
    
    for (let i = 0; i < parts.length; i++) {
      let part = parts[i];
      if (!part) continue;
      const nextPart = parts[i + 1] || '';
      const literalHidden = /^контакт\s+скрыт$/iu.test(nextPart);
      const phoneContext = /(?:номер\s+телефона|телефон|phone)\s*[:—–-]?\s*$/iu.test(part)
        || /[☎📞📱]\s*$/u.test(part);
      const partLiteralHidden = /^контакт\s+скрыт$/iu.test(part);
      const partPhoneContext = /(?:номер\s+телефона|телефон|phone)\s*[:—–-]?\s*$/iu.test(parts[i - 1] || '')
        || /[☎📞📱]\s*$/u.test(parts[i - 1] || '');
      if (/^\[контакт скрыт:phone\]$/iu.test(nextPart) || /^(?:\+?7|8)[\s-]?\(?\d{3}\)?/u.test(nextPart)
        || (literalHidden && phoneContext)) {
        part = part.replace(/[☎📞📱][\uFE0F\u200D]*\s*$/u, '');
      } else if (literalHidden || /^\[(?:контакт скрыт:link|ссылка скрыта)\]$/iu.test(nextPart) || /^(?:https?:\/\/|@)/iu.test(nextPart)) {
        part = part.replace(/[🔗][\uFE0F\u200D]*\s*$/u, '');
      }
      if (!part) continue;
      
      let nodeToAdd: React.ReactNode = <LeadText text={part} markAddresses={markAddresses} />;
      let charsToAdd = part.length;
      
      if (/^(?:\[(?:контакт скрыт|ссылка скрыта)|контакт\s+скрыт)/iu.test(part)) {
        charsToAdd = 16;
        if (/^\[контакт скрыт:phone\]$/iu.test(part) || (partLiteralHidden && partPhoneContext)) {
          nodeToAdd = <span key={i} className={phoneContactClass}><Phone size={10} /> КОНТАКТ СКРЫТ</span>;
        } else if (/^\[контакт скрыт:yandex\]$/iu.test(part)) {
          nodeToAdd = <span key={i} className={linkContactClass}><MapPin size={10} /> КОНТАКТ СКРЫТ</span>;
        } else {
          nodeToAdd = <span key={i} className={linkContactClass}><LinkIcon size={10} /> КОНТАКТ СКРЫТ</span>;
        }
      } else if (part.match(/(https?:\/\/[^\s]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\/[^\s]*|@[a-zA-Z0-9_]+)/)) {
        charsToAdd = 16; 
        const mapLabel = leadMapLabel(part);
        const isMapLink = Boolean(mapLabel);
        
        if (shouldMask && !isMapLink) {
          nodeToAdd = <span key={i} className={linkContactClass}><LinkIcon size={10} /> КОНТАКТ СКРЫТ</span>;
        } else {
          let href = part;
          if (part.startsWith('@')) href = `https://t.me/${part.substring(1)}`;
          else if (!part.startsWith('http')) href = `https://${part}`;
          
          let linkText = part;
          let linkClass = "m-1 inline-flex items-center gap-1 break-all rounded border border-black px-1.5 py-0.5 align-middle text-xs font-bold transition-all ";

          if (isMapLink) {
             linkText = mapLabel || part;
             
             linkClass += "bg-white text-black shadow-[2px_2px_0_0_#000] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-none";
          } else {
             linkClass += "bg-black text-white hover:bg-zinc-800";
          }
          
          nodeToAdd = <a key={i} href={href} target="_blank" rel="noopener noreferrer" className={linkClass} onClick={(e) => e.stopPropagation()}>{isMapLink ? <LeadIcon kind="location" /> : <LinkIcon size={11} />}<LeadText text={linkText} /></a>;
        }
      } else if (part.match(/(?:\+?7|8)[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\b\d{10}\b/)) {
        charsToAdd = 16;
        if (shouldMask) {
          nodeToAdd = <span key={i} className={phoneContactClass}><Phone size={10} /> КОНТАКТ СКРЫТ</span>;
        } else {
          const cleanPhone = part.replace(/[^\d+]/g, '');
          nodeToAdd = <a key={i} href={`tel:${cleanPhone}`} className={phoneContactClass} onClick={(e) => e.stopPropagation()}><Phone size={10} />{part}</a>;
        }
      } else {
        if (truncateAt && currentLength + charsToAdd > truncateAt) {
           nodeToAdd = <LeadText markAddresses={markAddresses} text={Array.from(part.substring(0, truncateAt - currentLength)).join('').replace(/[\uD800-\uDBFF]$/, '') + '…'} />;
           result.push(<React.Fragment key={i}>{nodeToAdd}</React.Fragment>);
           break;
        }
      }
      
      result.push(<React.Fragment key={i}>{nodeToAdd}</React.Fragment>);
      currentLength += charsToAdd;
      
      if (truncateAt && currentLength >= truncateAt) {
         if (i < parts.length - 1 && typeof nodeToAdd !== 'string') result.push(<React.Fragment key={i + '_dots'}>...</React.Fragment>);
         break;
      }
    }
    
    return result;
  };

  return (
    <div id={`lead-${lead.id}`} className={`bg-white border-2 border-black p-4 md:p-5 flex flex-col h-full relative shadow-[4px_4px_0_0_#000] ${highlighted ? 'ring-4 ring-accent ring-offset-2' : ''}`}>
      <div className="flex-grow z-10 relative">
        {/* Background Watermark Image */}
        {lead.category?.imageUrl && (
          <div className="absolute bottom-0 right-2 w-40 h-40 opacity-[0.15] mix-blend-multiply pointer-events-none flex items-end justify-end z-[-1]">
            <Image src={lead.category.imageUrl} alt="" fill sizes="160px" className="object-contain grayscale" />
          </div>
        )}

        {/* Header (Category & Time) */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[9px] uppercase tracking-widest font-black px-2 py-0.5 border border-black w-fit ${
              isInfo ? 'bg-purple-500 text-white' : 'bg-black text-accent'
            }`}>
              {isInfo ? 'СИСТЕМА' : (lead.category?.name || 'Лид')}
            </span>
            {isPurchased && (
              <span className="text-[9px] uppercase tracking-widest font-black px-2 py-0.5 border border-black w-fit bg-green-500 text-black">
                ПОЛУЧЕНО
              </span>
            )}
          </div>
          <div title="Добавлено в приложение" className="flex items-center text-[#666] text-[11px] font-medium gap-1 ml-2 shrink-0">
            <Clock size={12} aria-hidden="true" />
            {formatLeadCreatedAt(lead.createdAt)}
          </div>
        </div>

        {/* Title */}
        <h3 className="text-black font-bold text-[17px] leading-snug mb-3">
          <LeadText text={lead.title} />
        </h3>

        {(isPurchased || isPublic) && <LeadPhotos photos={lead.media} />}

        {/* Text Body */}
        <p className="text-[#333] text-[14px] leading-relaxed mb-6 font-medium whitespace-pre-wrap break-words">
          {expanded ? renderTextWithLinks(lead.rawText) : renderTextWithLinks(lead.rawText, 280)}
        </p>

        {(lead.rawText?.length || 0) > 280 && (
          <button 
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className="text-zinc-700 text-xs font-semibold hover:text-black mb-4 border-b border-zinc-300 pb-0.5"
          >
            {expanded ? 'Скрыть' : 'Подробнее...'}
          </button>
        )}
        <LeadEngagement value={lead.sourceEngagement} />
      </div>
      
      <div className="flex flex-wrap items-start justify-between gap-3 mt-auto pt-4 border-t border-[#ddd] relative">
        {locationLabel && <div className="flex min-w-0 flex-1 items-start gap-1.5 text-[#666] text-xs font-bold z-10 relative">
          <LeadIcon kind={/^метро\s/iu.test(locationLabel) ? 'metro' : 'location'} />
          <span className="min-w-0 whitespace-pre-wrap break-words">{renderTextWithLinks(locationLabel, undefined, false)}</span>
        </div>}
        {!isInfo && !isPublic && (
          <div className="ml-auto shrink-0 text-[11px] font-black uppercase bg-white text-black px-2 py-1 border border-black shadow-[2px_2px_0_0_var(--accent)] z-10 relative">
            {lead.category?.paymentMode === 'SUBSCRIPTION' || lead.category?.paymentMode === 'PRO'
              ? 'ПО ПОДПИСКЕ' 
              : lead.price > 0 ? `${lead.price} ₽` : 'БЕСПЛАТНО'}
          </div>
        )}
      </div>

      {onBuy && !isPurchased && !isInfo && !isPublic && (
        <button 
          onClick={() => onBuy(lead.id)}
          className="w-full mt-5 py-4 bg-accent text-black font-black text-sm border border-black hover:brightness-95 active:scale-[0.98] transition-all flex items-center justify-center gap-2 uppercase tracking-tighter"
        >
          [ ЗАБРАТЬ КОНТАКТ ]
        </button>
      )}

      {isPurchased && !isInfo && lead.status !== 'ARCHIVED' && (
        <div className="flex justify-center mt-5">
          <button 
            onClick={async () => {
              if (confirm('Удалить лид в архив?')) {
                 try {
                   await fetch('/api/archive-lead', { method: 'POST', body: JSON.stringify({ leadId: lead.id }) });
                   window.location.reload();
                 } catch (e) {}
              }
            }}
            className="w-[160px] py-2 font-black text-[10px] border border-black shadow-[2px_2px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center gap-3 uppercase tracking-tighter bg-white text-black hover:bg-gray-100"
          >
            <span className="text-red-500 text-sm leading-none font-bold">✕</span> В АРХИВ
          </button>
        </div>
      )}
    </div>
  );
};
