'use client';

import React, { useState, useEffect } from 'react';
import { LeadCard } from '@/components/cards/LeadCard';
import { useUser } from '@/store/useUser';
import { Loader2, Archive } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function MyLeadsPage() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const focusedLeadId = searchParams.get('lead');
  const [myLeads, setMyLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      const leadQuery = focusedLeadId ? `&leadId=${encodeURIComponent(focusedLeadId)}` : '';
      fetch(`/api/leads?owned=true&take=200${leadQuery}`)
        .then(res => res.json())
        .then(data => {
          setMyLeads(data);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
    }
  }, [user, focusedLeadId]);

  if (loading) {
    return <div className="flex justify-center items-center h-[50vh]"><Loader2 className="animate-spin text-accent" size={32} /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-black">Мои лиды</h2>
        <Link 
          href="/archive" 
          className="p-2 bg-white border-2 border-black shadow-[2px_2px_0_0_#000] hover:bg-accent active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center"
          title="Архив"
        >
          <Archive size={20} className="text-black" />
        </Link>
      </div>
      
      <div className="space-y-4">
        {myLeads.length > 0 ? (
          myLeads.map((lead) => (
            <div key={lead.id} className="relative">
              <LeadCard lead={lead} isPurchased={true} highlighted={lead.id === focusedLeadId} />
            </div>
          ))
        ) : (
          <div className="glass-panel p-10 text-center space-y-4">
            <div className="text-[#ccc] text-4xl">📦</div>
            <p className="text-[#666] text-sm font-bold">У вас пока нет купленных лидов.<br/>Самое время найти первый заказ!</p>
            <Link href="/dashboard" className="neon-button w-full mt-4 inline-block text-center">Перейти в ленту</Link>
          </div>
        )}
      </div>
    </div>
  );
}
