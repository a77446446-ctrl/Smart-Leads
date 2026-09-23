'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  X, 
  Save, 
  Loader2, 
  Hash, 
  MinusCircle, 
  PlusCircle,
  Tag as TagIcon,
  AlertCircle,
  Zap,
  Crown,
  ChevronDown,
  UploadCloud,
  ImageIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApplicationThemeSettings } from '@/components/ApplicationThemeSettings';
import { CategoryMediaSettings } from '@/components/CategoryMediaSettings';
import { APPLICATION_THEMES, ApplicationThemeId } from '@/lib/application-theme';
import { CategoryRulePreview } from '@/components/CategoryRulePreview';
import { mergeCategoryKeywords } from '@/lib/category-editor';

interface Category {
  id: string;
  name: string;
  slug: string;
  plusKeywords: string | null;
  minusKeywords: string | null;
  paymentMode: 'LEAD' | 'SUBSCRIPTION' | 'HYBRID';
  leadPrice: number;
  subscriptionPrice: number;
  active: boolean;
  ttlMinutes: number;
  imageUrl?: string | null;
  showcaseChatId?: string | null;
  showcaseEnabled: boolean;
  showcaseKind: 'PUBLIC' | 'PRIVATE';
}

interface MaxBotChat {
  chatId: string;
  title: string | null;
  kind: string;
  active: boolean;
}

const initialFormData = {
  name: '',
  leadPrice: 50,
  subscriptionPrice: 1000,
  plusKeywords: '',
  minusKeywords: '',
  paymentMode: 'LEAD' as const,
  active: true,
  ttlMinutes: 1440,
  imageUrl: '',
  showcaseChatId: '',
  showcaseEnabled: false,
  showcaseKind: 'PUBLIC' as const
};

export default function AdminCategoriesPage() {
  const [applicationTheme, setApplicationTheme] = useState<ApplicationThemeId | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [maxBotChats, setMaxBotChats] = useState<MaxBotChat[]>([]);
  const [discoveringChannels, setDiscoveringChannels] = useState(false);
  const [channelError, setChannelError] = useState('');
  const [discoveryMessage, setDiscoveryMessage] = useState('');
  
  // Tag Inputs State
  const [plusTags, setPlusTags] = useState<string[]>([]);
  const [minusTags, setMinusTags] = useState<string[]>([]);
  const [plusInput, setPlusInput] = useState('');
  const [minusInput, setMinusInput] = useState('');

  // Form state
  const [formData, setFormData] = useState<Partial<Category>>({
    name: '',
    paymentMode: 'LEAD',
    leadPrice: 0,
    subscriptionPrice: 0,
    active: true,
    showcaseChatId: '',
    showcaseEnabled: false,
    showcaseKind: 'PUBLIC'
  });

  const fetchMaxBotChats = async (): Promise<MaxBotChat[]> => {
    try {
      const response = await fetch('/api/admin/bot/chats', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось загрузить MAX-каналы');
      const chats = Array.isArray(data) ? data : [];
      setMaxBotChats(chats);
      return chats;
    } catch (error) {
      setMaxBotChats([]);
      setChannelError(error instanceof Error ? error.message : 'Не удалось загрузить MAX-каналы');
      return [];
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchMaxBotChats();
  }, []);

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/admin/category');
      const data = await res.json();
      const categories = Array.isArray(data) ? data.map(cat => ({
        ...cat,
        leadPrice: cat.leadPrice,
        subscriptionPrice: cat.subscriptionPrice
      })) : [];
      setCategories(categories);
    } catch (e) {
      console.error('Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (cat: Category) => {
    setEditingId(cat.id);
    setFormData(cat);
    setPlusTags(mergeCategoryKeywords(cat.plusKeywords ?? ''));
    setMinusTags(mergeCategoryKeywords(cat.minusKeywords ?? ''));
    setPlusInput('');
    setMinusInput('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData({
      name: '',
      paymentMode: 'LEAD',
      leadPrice: 0,
      subscriptionPrice: 0,
      active: true,
      ttlMinutes: 1440,
      imageUrl: '',
      showcaseChatId: '',
      showcaseEnabled: false,
      showcaseKind: 'PUBLIC'
    });
    setPlusTags([]);
    setMinusTags([]);
    setPlusInput('');
    setMinusInput('');
  };

  const processTags = mergeCategoryKeywords;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, type: 'plus' | 'minus') => {
    if (e.key === 'Enter' || e.key === ',' || e.key === '.' || e.key === ';') {
      e.preventDefault();
      const val = type === 'plus' ? plusInput : minusInput;
      if (!val.trim()) return;
      
      if (type === 'plus') {
        setPlusTags(processTags(val, plusTags));
        setPlusInput('');
      } else {
        setMinusTags(processTags(val, minusTags));
        setMinusInput('');
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent, type: 'plus' | 'minus') => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    if (type === 'plus') {
      setPlusTags(processTags(pasteData, plusTags));
    } else {
      setMinusTags(processTags(pasteData, minusTags));
    }
  };

  const removeTag = (index: number, type: 'plus' | 'minus') => {
    if (type === 'plus') {
      setPlusTags(plusTags.filter((_, i) => i !== index));
    } else {
      setMinusTags(minusTags.filter((_, i) => i !== index));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
      if (res.ok && data.url) {
        setFormData(prev => ({ ...prev, imageUrl: data.url }));
      } else {
        alert(data.error || 'Ошибка загрузки файла');
      }
    } catch (err) {
      console.error(err);
      alert('Ошибка при загрузке картинки');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDiscoverChannels = async () => {
    const knownChatIds = new Set(maxBotChats.map((chat) => chat.chatId));
    setDiscoveringChannels(true);
    setChannelError('');
    setDiscoveryMessage('');
    try {
      const response = await fetch('/api/admin/bot/chats', {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось включить обнаружение MAX-каналов');

      setDiscoveryMessage('Webhook включён. Опубликуйте любой новый пост в канале MAX — ожидаю событие до 60 секунд.');
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        const chats = await fetchMaxBotChats();
        const detectedChat = chats.find((chat) => chat.active && !knownChatIds.has(chat.chatId));
        if (!detectedChat) continue;

        setFormData((current) => ({
          ...current,
          showcaseEnabled: true,
          showcaseChatId: detectedChat.chatId,
          showcaseKind: 'PUBLIC',
        }));
        setDiscoveryMessage('Канал обнаружен и выбран. Сохраните изменения категории.');
        return;
      }
      setDiscoveryMessage('Новое событие от MAX пока не получено. Опубликуйте новый пост в канале и повторите обнаружение.');
    } catch (error) {
      setChannelError(error instanceof Error ? error.message : 'Не удалось включить обнаружение MAX-каналов');
    } finally {
      setDiscoveringChannels(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name) {
      alert('Пожалуйста, введите название категории');
      return;
    }
    setSaving(true);
    
    const finalData = {
      ...formData,
      plusKeywords: mergeCategoryKeywords(plusInput, plusTags).join(','),
      minusKeywords: mergeCategoryKeywords(minusInput, minusTags).join(',')
    };

    try {
      const res = await fetch('/api/admin/category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalData)
      });
      
      const result = await res.json();

      if (res.ok) {
        await fetchCategories();
        handleCancel();
      } else {
        console.error('Server error:', result);
        const detailMsg = result.details ? `\nДетали: ${result.details}` : '';
        const codeMsg = result.code ? ` (Код: ${result.code})` : '';
        alert(`Ошибка сервера: ${result.error || 'Неизвестная ошибка'}${codeMsg}${detailMsg}`);
      }
    } catch (e) {
      console.error('Network error:', e);
      alert('Ошибка сети или сервера. Проверьте консоль.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Вы уверены? Удаление категории приведет к остановке парсинга лидов для нее.')) return;
    try {
      const res = await fetch(`/api/admin/category?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        alert('Категория успешно удалена');
        await fetchCategories();
      } else {
        const data = await res.json();
        alert(`Ошибка при удалении: ${data.error || 'Неизвестная ошибка'}`);
      }
    } catch (e) {
      alert('Ошибка сети при удалении категории');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-accent" /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-0 pb-20 font-sans sm:px-6">
      <div className="flex flex-col gap-4 border-b border-zinc-700 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="bg-accent border border-zinc-700 p-2.5 text-black rounded-lg">
            <TagIcon size={20} />
          </div>
          <h1 className="text-xs sm:text-sm font-bold tracking-widest text-white uppercase leading-none">КАТЕГОРИИ</h1>
        </div>
      </div>

      <ApplicationThemeSettings onSaved={setApplicationTheme} />
      <CategoryMediaSettings categories={categories} enabled={applicationTheme !== null} />

      {/* Форма категории выбранной темы. */}
      <div className="flex flex-col rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden shadow-lg">
        <div className="flex items-center gap-3 p-4 sm:p-6 border-b border-zinc-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
             <Zap size={64} className="text-white" />
          </div>
          <div className="w-8 h-8 border border-zinc-700 bg-zinc-950 flex items-center justify-center text-zinc-400 z-10">
            {editingId ? <Edit2 size={14} /> : <Plus size={14} />}
          </div>
          <h3 className="font-bold text-[10px] uppercase tracking-[0.2em] text-zinc-400 z-10">
            {editingId ? 'РЕДАКТИРОВАТЬ КАТЕГОРИЮ' : 'ДОБАВИТЬ НОВУЮ КАТЕГОРИЮ'}
          </h3>
        </div>
        
        <div className="p-4 sm:p-6 space-y-8">

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:p-6">
           <div className="space-y-3 md:col-span-4">
            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Название категории</label>
            <input 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})}
              placeholder={`Например: ${APPLICATION_THEMES.find(theme => theme.id === applicationTheme)?.example ?? 'Ремонт квартир'}`}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg py-3 px-4 text-xs sm:text-sm font-bold focus:border-accent outline-none transition-all placeholder:text-zinc-600 text-white" 
            />
          </div>

          <div className="space-y-3 md:col-span-2">
            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">
              {formData.paymentMode === 'SUBSCRIPTION' ? 'Цена подписки (₽)' : 'Цена за лид (₽)'}
            </label>
            <div className="relative">
               <input 
                 type="number"
                 value={formData.paymentMode === 'SUBSCRIPTION' ? formData.subscriptionPrice : formData.leadPrice} 
                 onChange={e => {
                   if (formData.paymentMode === 'SUBSCRIPTION') {
                     setFormData({...formData, subscriptionPrice: Number(e.target.value)});
                   } else {
                     setFormData({...formData, leadPrice: Number(e.target.value)});
                   }
                 }}
                 className="w-full bg-zinc-950 border border-zinc-700 rounded-lg py-3 px-4 text-xs sm:text-sm font-bold focus:border-accent outline-none transition-all text-white" 
               />
               <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-zinc-500 uppercase">
                  {(formData.paymentMode === 'SUBSCRIPTION' ? formData.subscriptionPrice : formData.leadPrice) === 0 ? 'БЕСПЛАТНО' : 'РУБ'}
               </div>
            </div>
          </div>

          <div className="space-y-3 md:col-span-3">
            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Тип доступа</label>
            <div className="relative">
              <select 
                value={formData.paymentMode}
                onChange={e => setFormData({...formData, paymentMode: e.target.value as any})}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg py-3 px-4 text-xs sm:text-sm font-bold focus:border-accent outline-none transition-all appearance-none cursor-pointer text-white"
              >
                <option value="LEAD">ПОШТУЧНО</option>
                <option value="SUBSCRIPTION">PRO (ПОДПИСКА)</option>
                <option value="HYBRID">ГИБРИД</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                 <ChevronDown size={14} />
              </div>
            </div>
          </div>

          <div className="space-y-3 md:col-span-3">
            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Время жизни (минут)</label>
            <div className="relative">
               <input 
                 type="number"
                 value={formData.ttlMinutes || 1440} 
                 onChange={e => setFormData({...formData, ttlMinutes: Number(e.target.value)})}
                 className="w-full bg-zinc-950 border border-zinc-700 rounded-lg py-3 px-4 text-xs sm:text-sm font-bold focus:border-accent outline-none transition-all text-white" 
               />
               <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-zinc-500 uppercase">
                  МИН
               </div>
            </div>
          </div>
          
          <div className="space-y-3 md:col-span-12">
            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Водяной знак для карточки (Опционально)</label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <input 
                type="file" 
                id="file-upload" 
                accept="image/*" 
                onChange={handleFileUpload} 
                className="hidden" 
              />
              <label 
                htmlFor="file-upload" 
                className="cursor-pointer bg-zinc-950 border border-zinc-700 hover:border-accent hover:text-accent text-zinc-400 rounded-lg px-6 py-4 flex items-center justify-center gap-3 transition-all font-bold text-xs uppercase w-full sm:w-auto shrink-0"
              >
                {isUploading ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}
                {isUploading ? 'Загрузка...' : 'Загрузить картинку'}
              </label>

              {formData.imageUrl && (
                <div className="relative group bg-zinc-950 border border-zinc-700 rounded-lg p-2 h-16 w-16 flex items-center justify-center shrink-0">
                  <img src={formData.imageUrl} alt="preview" className="max-w-full max-h-full object-contain" />
                  <button 
                    onClick={() => setFormData(prev => ({ ...prev, imageUrl: '' }))}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Удалить"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              {formData.imageUrl && (
                <span className="text-zinc-500 text-[10px] break-all flex-1">{formData.imageUrl}</span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-zinc-950 border border-zinc-700 rounded-lg p-5">
          <label className="md:col-span-3 flex items-center gap-3 text-xs font-bold text-white uppercase cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(formData.showcaseEnabled)}
              onChange={(event) => setFormData({ ...formData, showcaseEnabled: event.target.checked })}
              className="h-5 w-5 accent-lime-300"
            />
            Публиковать в MAX
          </label>
          <div className="md:col-span-6 space-y-2">
            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Канал для публикации лидов</label>
            <select
              value={formData.showcaseChatId || ''}
              onChange={(event) => setFormData({ ...formData, showcaseChatId: event.target.value })}
              disabled={!formData.showcaseEnabled}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg py-3 px-4 text-xs sm:text-sm font-bold text-white disabled:opacity-40"
            >
              <option value="">Выберите подключённый MAX-канал</option>
              {maxBotChats.filter((chat) => chat.active).map((chat) => (
                <option key={chat.chatId} value={chat.chatId}>
                  {chat.title || `${chat.kind} ${chat.chatId}`}
                </option>
              ))}
              {formData.showcaseChatId && !maxBotChats.some((chat) => chat.chatId === formData.showcaseChatId) && (
                <option value={formData.showcaseChatId}>Текущий chat_id: {formData.showcaseChatId}</option>
              )}
            </select>
          </div>
          <div className="md:col-span-3 space-y-2">
            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Тип витрины</label>
            <select
              value={formData.showcaseKind || 'PUBLIC'}
              onChange={(event) => setFormData({ ...formData, showcaseKind: event.target.value as 'PUBLIC' | 'PRIVATE' })}
              disabled={!formData.showcaseEnabled}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg py-3 px-4 text-xs sm:text-sm font-bold text-white disabled:opacity-40"
            >
              <option value="PUBLIC">ПУБЛИЧНАЯ</option>
              <option value="PRIVATE">ПРИВАТНАЯ</option>
            </select>
          </div>
          <div className="md:col-span-12 space-y-2 border-t border-zinc-800 pt-4">
            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Обнаружить MAX-канал</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleDiscoverChannels}
                disabled={discoveringChannels}
                className="flex items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-5 py-3 text-[10px] font-bold uppercase text-black transition-all hover:brightness-95 disabled:opacity-40"
              >
                {discoveringChannels ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {discoveringChannels ? 'Ожидаю событие MAX…' : 'Начать обнаружение'}
              </button>
              <button
                type="button"
                onClick={() => void fetchMaxBotChats()}
                disabled={discoveringChannels}
                className="flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-5 py-3 text-[10px] font-bold uppercase text-zinc-300 transition-all hover:border-zinc-500 disabled:opacity-40"
              >
                Обновить список
              </button>
            </div>
            {channelError && <p className="text-[10px] font-bold text-red-400">{channelError}</p>}
            {discoveryMessage && <p className="text-[10px] font-bold text-lime-300">{discoveryMessage}</p>}
            {!channelError && !discoveryMessage && (
              <p className="text-[10px] text-zinc-500">
                Нажмите «Начать обнаружение», затем опубликуйте любой новый пост в канале. Бот должен быть администратором с правом читать и отправлять сообщения.
              </p>
            )}
          </div>
        </div>

        {/* TAG INPUTS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:p-6">
          {/* PLUS KEYWORDS */}
          <div className="space-y-4">
            <label className="text-[9px] font-bold text-green-500 uppercase tracking-widest ml-1 flex items-center gap-2">
              <PlusCircle size={14} /> Ключевые слова (ПЛЮС)
            </label>
            <div className="bg-zinc-950 border border-zinc-700 rounded-lg p-4 min-h-[120px] focus-within:border-green-500 transition-all flex flex-wrap gap-2 items-start content-start">
               {plusTags.map((tag, i) => (
                 <div key={i} className="flex items-center gap-1.5 bg-green-900/30 border border-green-800 text-green-400 rounded px-3 py-1.5 text-[10px] font-bold uppercase transition-all hover:bg-green-900/50 animate-in fade-in zoom-in duration-200">
                    {tag}
                    <button onClick={() => removeTag(i, 'plus')} className="hover:text-white transition-colors"><X size={10} /></button>
                 </div>
               ))}
               <input 
                 value={plusInput}
                 onChange={e => setPlusInput(e.target.value)}
                 onKeyDown={e => handleKeyDown(e, 'plus')}
                 onPaste={e => handlePaste(e, 'plus')}
                 placeholder={plusTags.length === 0 ? (APPLICATION_THEMES.find(theme => theme.id === applicationTheme)?.plus ?? 'установить, собрать, починить…') : ''}
                 className="w-full min-w-full bg-transparent outline-none text-xs sm:text-sm font-bold p-1 placeholder:text-zinc-600 mt-1 text-white"
               />
            </div>
          </div>

          {/* MINUS KEYWORDS */}
          <div className="space-y-4">
            <label className="text-[9px] font-bold text-red-500 uppercase tracking-widest ml-1 flex items-center gap-2">
              <MinusCircle size={14} /> Стоп-слова (МИНУС)
            </label>
            <div className="bg-zinc-950 border border-zinc-700 rounded-lg p-4 min-h-[120px] focus-within:border-red-500 transition-all flex flex-wrap gap-2 items-start content-start">
               {minusTags.map((tag, i) => (
                 <div key={i} className="flex items-center gap-1.5 bg-red-900/30 border border-red-800 text-red-400 rounded px-3 py-1.5 text-[10px] font-bold uppercase transition-all hover:bg-red-900/50 animate-in fade-in zoom-in duration-200">
                    {tag}
                    <button onClick={() => removeTag(i, 'minus')} className="hover:text-white transition-colors"><X size={10} /></button>
                 </div>
               ))}
               <input 
                 value={minusInput}
                 onChange={e => setMinusInput(e.target.value)}
                 onKeyDown={e => handleKeyDown(e, 'minus')}
                 onPaste={e => handlePaste(e, 'minus')}
                 placeholder={minusTags.length === 0 ? (APPLICATION_THEMES.find(theme => theme.id === applicationTheme)?.minus ?? 'предлагаю услуги, резюме…') : ''}
                 className="w-full min-w-full bg-transparent outline-none text-xs sm:text-sm font-bold p-1 placeholder:text-zinc-600 mt-1 text-white"
               />
            </div>
          </div>
        </div>

        <p className="text-sm text-zinc-400">Разделяйте слова запятой, точкой с запятой или переносом строки. Словосочетание пишите целиком. Последнее введённое слово сохранится и без нажатия Enter.</p>
        <CategoryRulePreview
          themed={applicationTheme !== null}
          name={formData.name ?? ''}
          plus={mergeCategoryKeywords(plusInput, plusTags)}
          minus={mergeCategoryKeywords(minusInput, minusTags)}
          active={formData.active ?? true}
        />

        <div className="flex gap-4 justify-end pt-4 border-t border-zinc-700">
          {editingId && (
            <button onClick={handleCancel} className="px-8 py-4 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-[10px] font-bold uppercase tracking-[0.2em] transition-all flex items-center gap-2 text-zinc-400 hover:text-white">
              <X size={14} /> ОТМЕНИТЬ
            </button>
          )}
          <button 
            onClick={handleSave} 
            disabled={saving || !formData.name}
            className="bg-accent text-black font-bold uppercase py-4 px-10 rounded-lg border border-accent hover:brightness-95 active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50 disabled:shadow-none"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            {editingId ? 'СОХРАНИТЬ ИЗМЕНЕНИЯ' : 'СОЗДАТЬ КАТЕГОРИЮ'}
          </button>
        </div>
        </div>
      </div>

      {/* CATEGORIES LIST */}
      <div className="flex flex-col rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden shadow-lg mt-6">
        <div className="flex items-center gap-3 p-4 sm:p-6 border-b border-zinc-800">
           <div className="w-8 h-8 border border-zinc-700 bg-zinc-950 flex items-center justify-center text-zinc-400">
              <TagIcon size={14} />
           </div>
           <h3 className="font-bold text-[10px] uppercase tracking-[0.2em] text-zinc-400">СПИСОК КАТЕГОРИЙ</h3>
        </div>
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:p-6">
            {categories.map((cat) => (
          <div key={cat.id} className="group relative overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-sm transition-all hover:bg-zinc-800/80 sm:p-4 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:p-6">
              <div className="space-y-2 max-w-xs">
                <div className="flex items-center gap-3">
                  <h4 className="text-xl font-bold uppercase tracking-tight text-white">{cat.name}</h4>
                  {cat.paymentMode === 'SUBSCRIPTION' && (
                    <div className="bg-yellow-900/30 text-yellow-500 rounded p-1 border border-yellow-800" title="PRO (Только подписка)">
                       <Crown size={14} />
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                   <div className={cn(
                      "text-[8px] font-bold px-2.5 py-1 rounded border uppercase tracking-widest",
                      cat.active ? "bg-green-900/30 text-green-400 border-green-800" : "bg-zinc-800 text-zinc-500 border-zinc-700"
                    )}>
                      {cat.active ? 'АКТИВНА' : 'ПАУЗА'}
                   </div>
                   <div className="text-[8px] font-bold px-2.5 py-1 rounded border border-zinc-700 bg-zinc-800 text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Zap size={10} /> {cat.paymentMode === 'SUBSCRIPTION' ? 'PRO' : cat.paymentMode}
                   </div>
                   <div className="text-[8px] font-bold px-2.5 py-1 rounded border border-accent/50 bg-accent/10 text-accent uppercase tracking-widest">
                      {cat.leadPrice === 0 ? 'FREE' : `${cat.leadPrice} РУБ`}
                   </div>
                   <div className="text-[8px] font-bold px-2.5 py-1 rounded border border-red-800 bg-red-900/30 text-red-400 uppercase tracking-widest flex items-center gap-1">
                      <Trash2 size={10} /> {(cat as any).ttlMinutes || 1440} МИН
                   </div>
                </div>
              </div>

              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 sm:p-6 lg:px-8 border-zinc-700 lg:border-l">
                 <div className="space-y-2">
                    <span className="text-[8px] font-bold uppercase tracking-widest text-green-500">ПЛЮС-СЛОВА:</span>
                    <div className="flex flex-wrap gap-1.5">
                       {cat.plusKeywords ? cat.plusKeywords.split(',').slice(0, 10).map((t, i) => (
                         <span key={i} className="text-[9px] font-bold text-zinc-400 bg-zinc-800 rounded border border-zinc-700 px-2 py-0.5">{t.trim()}</span>
                       )) : <span className="text-[9px] italic text-zinc-600 font-bold">Все сообщения</span>}
                       {cat.plusKeywords && cat.plusKeywords.split(',').length > 10 && <span className="text-[9px] text-zinc-600">...</span>}
                    </div>
                 </div>
                 <div className="space-y-2">
                    <span className="text-[8px] font-bold uppercase tracking-widest text-red-500">СТОП-СЛОВА:</span>
                    <div className="flex flex-wrap gap-1.5">
                       {cat.minusKeywords ? cat.minusKeywords.split(',').slice(0, 10).map((t, i) => (
                         <span key={i} className="text-[9px] font-bold text-zinc-400 bg-zinc-800 rounded border border-zinc-700 px-2 py-0.5">{t.trim()}</span>
                       )) : <span className="text-[9px] italic text-zinc-600 font-bold">Нет</span>}
                       {cat.minusKeywords && cat.minusKeywords.split(',').length > 10 && <span className="text-[9px] text-zinc-600">...</span>}
                    </div>
                 </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => handleEdit(cat)} className="w-12 h-12 flex items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 transition-all text-zinc-400 hover:text-white"><Edit2 size={18}/></button>
                <button onClick={() => handleDelete(cat.id)} className="w-12 h-12 flex items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-red-900/30 transition-all text-zinc-500 hover:text-red-500"><Trash2 size={18}/></button>
              </div>
            </div>
          </div>
        ))}

        {categories.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32 text-zinc-600 gap-4 sm:p-6">
             <div className="bg-zinc-900 rounded-xl border border-zinc-700 p-4 sm:p-6"><AlertCircle size={64} className="text-white" /></div>
             <p className="text-[10px] font-bold uppercase tracking-[0.4em] opacity-50 text-white">Категории не настроены</p>
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
