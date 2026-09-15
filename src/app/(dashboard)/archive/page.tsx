'use client';
import React, { useState, useEffect } from 'react';
import { LeadCard } from '@/components/cards/LeadCard';
import { useUser } from '@/store/useUser';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ArchivePage() {
  const { user } = useUser();
  const [archivedLeads, setArchivedLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchArchive = async () => {
      try {
        const res = await fetch('/api/leads?owned=true&status=ARCHIVED');
        const data = await res.json();
        setArchivedLeads(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchArchive();
  }, [user]);

  if (!user) return null;

  if (loading) {
    return <div className="flex justify-center items-center h-[50vh]"><Loader2 className="animate-spin text-accent" size={32} /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link 
          href="/my-leads" 
          className="p-2 bg-white border-2 border-black shadow-[2px_2px_0_0_#000] hover:bg-accent active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center"
        >
          <ArrowLeft size={20} className="text-black" />
        </Link>
        <h2 className="text-2xl font-black">Архив</h2>
      </div>
      
      <div className="space-y-4">
        {archivedLeads.length > 0 ? (
          archivedLeads.map((lead) => (
            <div key={lead.id} className="relative opacity-80 hover:opacity-100 transition-opacity">
              <LeadCard lead={lead} isPurchased={true} />
            </div>
          ))
        ) : (
          <div className="glass-panel p-10 text-center space-y-4">
            <div className="text-[#ccc] text-4xl">🗄️</div>
            <p className="text-[#666] text-sm font-bold">У вас пока нет лидов в архиве.</p>
          </div>
        )}
      </div>
    </div>
  );
}
