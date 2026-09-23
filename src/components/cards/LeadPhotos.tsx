'use client';
import React, { useState } from 'react';

export function LeadPhotos({ photos }: { photos?: { id: string }[] }) {
  const [failed, setFailed] = useState<string[]>([]);
  const visible = (photos || []).filter(photo => !failed.includes(photo.id)).slice(0, 6);
  if (!visible.length) return null;
  return <div className="mb-4 grid grid-cols-1 gap-2" aria-label="Фотографии исходного сообщения">
    {visible.map((photo, index) => <a key={photo.id} href={`/api/lead-media/${encodeURIComponent(photo.id)}`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
      {/* Оригинал требует cookie: публичный оптимизатор Next/Image здесь использовать нельзя. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/lead-media/${encodeURIComponent(photo.id)}`} alt={`Фотография ${index + 1} из сообщения`} loading="lazy" decoding="async" className="max-h-96 w-full object-contain" onError={() => setFailed(current => [...current, photo.id])} />
    </a>)}
  </div>;
}
