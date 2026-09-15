'use client';

import { hasTargetedChats } from '@/lib/lead-filter-mode';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings as SettingsIcon, 
  Bot, 
  Globe, 
  Plus, 
  Trash2, 
  Save, 
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Zap,
  Key,
  MessageSquare,
  HelpCircle,
  Info,
  User as UserIcon,
  ShieldCheck,
  RotateCw,
  Activity,
  Loader2,
  Lock,
  ChevronDown,
  Hash,
  UserCircle,
  Eye,
  EyeOff,
  Server,
  Unlock
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Setting {
  key: string;
  value: string;
}

interface MaksSession {
  id: string;
  name: string;
  active: boolean;
  status?: 'AUTHORIZING' | 'ACTIVE' | 'COOLDOWN' | 'AUTH_REQUIRED' | 'PROXY_ERROR' | 'DISABLED';
  lastUsed?: string | null;
  lastSuccessAt?: string | null;
  cooldownUntil?: string | null;
  consecutiveFailures?: number;
  totalRuns?: number;
  totalErrors?: number;
  lastError?: string | null;
  proxy?: string;
}

const SESSION_STATUS_LABELS: Record<string, string> = {
  AUTHORIZING: 'ОЖИДАЕТ QR',
  ACTIVE: 'ГОТОВ',
  COOLDOWN: 'ПАУЗА',
  AUTH_REQUIRED: 'НУЖЕН ВХОД',
  PROXY_ERROR: 'ОШИБКА ПРОКСИ',
  DISABLED: 'ВЫКЛЮЧЕН',
};

interface Chat {
  name: string;
  url: string;
  parseAll?: boolean;
  lastRunLeadsCount?: number | null;
  lastParsedAt?: string | null;
}

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const [syncing, setSyncing] = useState(false);
  const [autoParseEnabled, setAutoParseEnabled] = useState(false);
  const [parseInterval, setParseInterval] = useState<number>(300);
  const [parseTimeStart, setParseTimeStart] = useState<string>('08:00');
  const [parseTimeEnd, setParseTimeEnd] = useState<string>('23:00');
  const [parseTimeEnabled, setParseTimeEnabled] = useState<boolean>(true);
  const [leadRetentionDays, setLeadRetentionDays] = useState<number>(7);
  const [currentParsingChat, setCurrentParsingChat] = useState<string | null>(null);
  const [nextRunSeconds, setNextRunSeconds] = useState<number | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [newChat, setNewChat] = useState('');
  const [parsingChats, setParsingChats] = useState<Chat[]>([]);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showHelp, setShowHelp] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [sessions, setSessions] = useState<MaksSession[]>([]);
  const [logs, setLogs] = useState<{ time: string, msg: string, type: 'info' | 'success' | 'error' }[]>([]);
  
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState<string | null>(null);
  const [authQR, setAuthQR] = useState('');
  const [authStep, setAuthStep] = useState<'idle' | 'starting' | 'qr' | 'success' | 'error'>('idle');
  const [authError, setAuthError] = useState('');
  const authAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => authAbortRef.current?.abort(), []);

  // AI Verification State
  const [verifyingAi, setVerifyingAi] = useState(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [aiErrorMsg, setAiErrorMsg] = useState('');

  const handleVerifyAiKey = async () => {
    const key = settings['maks_ai_api_key'];
    if (!key) return;
    setVerifyingAi(true);
    setAiStatus('idle');
    try {
      const res = await fetch('/api/admin/settings/verify-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key })
      });
      const data = await res.json();
      if (data.success) {
        setAiStatus('success');
      } else {
        setAiStatus('error');
        setAiErrorMsg(data.message);
      }
    } catch (e: any) {
      setAiStatus('error');
      setAiErrorMsg(e.message);
    } finally {
      setVerifyingAi(false);
    }
  };

  // Proxy state (Split)
  const [proxyProtocol, setProxyProtocol] = useState<'http://' | 'socks5://'>('http://');
  const [proxyIP, setProxyIP] = useState('');
  const [proxyPort, setProxyPort] = useState('');
  const [proxyUser, setProxyUser] = useState('');
  const [proxyPass, setProxyPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [proxyStatus, setProxyStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid' | 'diagnosing'>('idle');
  const [proxyBusy, setProxyBusy] = useState(false);
  const [canBypass, setCanBypass] = useState(false);
  const [proxyLoaded, setProxyLoaded] = useState(false);
  const lastSyncLogsRef = useRef<string | null>(null);
  const [savedProxyIdentity, setSavedProxyIdentity] = useState('');
  const [hasSavedProxyPassword, setHasSavedProxyPassword] = useState(false);

  const proxyIdentity = (protocol = proxyProtocol, host = proxyIP, port = proxyPort, username = proxyUser) =>
    JSON.stringify([protocol, host.trim(), port.trim(), username]);

  // Unsaved changes protection
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // For legacy browsers
    };

    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      if (link && link.href && !link.href.includes('/admin/settings') && !link.target) {
        e.preventDefault();
        e.stopPropagation();
        setShowUnsavedModal(link.href);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleLinkClick, true);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleLinkClick, true);
    };
  }, [hasUnsavedChanges]);

  // Реквизиты прокси загружаются из зашифрованного серверного черновика.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/auth/proxy', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Не удалось загрузить сохранённый прокси');
        return response.json() as Promise<{ saved?: boolean; protocol?: 'http://' | 'socks5://'; host?: string; port?: string; username?: string; hasPassword?: boolean }>;
      })
      .then((draft) => {
        if (cancelled || !draft.saved || !draft.protocol || !draft.host || !draft.port) return;
        setProxyProtocol(draft.protocol);
        setProxyIP(draft.host);
        setProxyPort(draft.port);
        setProxyUser(draft.username || '');
        setHasSavedProxyPassword(Boolean(draft.hasPassword));
        setSavedProxyIdentity(proxyIdentity(draft.protocol, draft.host, draft.port, draft.username || ''));
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setProxyLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!proxyLoaded) return;
    setProxyStatus('idle');
    setCanBypass(false);
  }, [proxyProtocol, proxyIP, proxyPort, proxyUser, proxyPass, proxyLoaded]);

  useEffect(() => {
    fetchSettings();
    fetchSessions();
    setLogs([{ time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}), msg: 'Система готова к работе', type: 'info' }]);
    
    // Auto-refresh stats every 10 seconds (only if no unsaved changes)
    const interval = setInterval(() => {
      fetchSettings(true);
      fetchSessions(true);
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchSettings = async (silent = false) => {
    try {
      const res = await fetch('/api/admin/settings');
      const data: Setting[] = await res.json();
      const settingsMap: Record<string, string> = {};
      data.forEach(s => settingsMap[s.key] = s.value);
      
      // Фоновое обновление меняет только статистику, сохраняя редактируемые настройки.
      if (silent) {
          setParsingChats(prev => {
              try {
                  const dbChats = JSON.parse(settingsMap['maks_parsing_chats'] || '[]');
                  return prev.map(c => {
                      const dbC = dbChats.find((dc:any) => dc.url === c.url);
                      if (dbC) return { ...c, lastRunLeadsCount: dbC.lastRunLeadsCount ?? null, lastParsedAt: dbC.lastParsedAt };
                      return c;
                  });
              } catch(e) { return prev; }
          });
          
          if (settingsMap['sync_logs'] && settingsMap['sync_logs'] !== lastSyncLogsRef.current) {
            lastSyncLogsRef.current = settingsMap['sync_logs'];
            try {
              const loadedLogs = JSON.parse(settingsMap['sync_logs']);
              if (Array.isArray(loadedLogs) && loadedLogs.length > 0) {
                let newLogs = [];
                if (typeof loadedLogs[0] === 'string') {
                  const fallbackTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  newLogs = [...loadedLogs].reverse().map((msg: string) => ({ time: fallbackTime, msg, type: 'info' as const }));
                } else {
                  newLogs = [...loadedLogs].reverse();
                }
                setLogs(prev => {
                  const merged = [...prev];
                  // Keep local-only logs (like proxy checks) that are newer than the DB logs
                  const isDbLog = (log: any) => newLogs.some((nl: any) => nl.msg === log.msg && nl.time === log.time);
                  const localRecent = merged.filter(m => !isDbLog(m)).slice(0, 5);
                  return [...localRecent, ...newLogs].slice(0, 50);
                });
              }
            } catch(e) {}
          }
          return;
      }

      setSettings(settingsMap);
      if (settingsMap['maks_parsing_chats']) {
        try { 
            let chats = JSON.parse(settingsMap['maks_parsing_chats']); 
            let changed = false;
            chats = chats.map((c: any) => {
                let url = typeof c === 'string' ? c : c.url;
                if (url.includes('max.ru') && !url.includes('web.max.ru')) {
                    url = url.replace('max.ru', 'web.max.ru');
                    changed = true;
                }
                let name = typeof c === 'string' ? 'Новый чат' : c.name;
                if (name && (name.includes('Новый чат') || name.includes('MAX') || name.includes('непрочитан') || name.includes('сообщен') || name.includes('Синхронизация'))) {
                    const match = url.match(/@([^/&\?]+)/);
                    if (match) {
                        name = match[1];
                    } else {
                        const parts = url.split('/');
                        const slug = parts[parts.length-1] || parts[parts.length-2] || 'Чат';
                        name = slug.replace(/_/g, ' ').replace(/-/g, ' ').split(' ').map((w:string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    }
                    changed = true;
                }
                if (typeof c === 'string') return { name, url, parseAll: true, lastRunLeadsCount: null, lastParsedAt: null };
                return {
                  name,
                  url,
                  parseAll: typeof c.parseAll === 'boolean' ? c.parseAll : true,
                  lastRunLeadsCount: typeof c.lastRunLeadsCount === 'number' && Number.isInteger(c.lastRunLeadsCount) && c.lastRunLeadsCount >= 0 ? c.lastRunLeadsCount : null,
                  lastParsedAt: c.lastParsedAt || null,
                };
            });
            setParsingChats(chats);
            
            // Auto-save fixed chats to DB
            if (changed) {
                fetch('/api/admin/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'maks_parsing_chats', value: JSON.stringify(chats) }),
                });
            }
        } catch (e) { setParsingChats([]); }
      }
      setAutoParseEnabled(settingsMap['maks_parser_auto'] === 'true');
      const interval = parseInt(settingsMap['maks_parser_interval'] || '300', 10);
      setLeadRetentionDays(parseInt(settingsMap['lead_retention_days'] || '7', 10));
      setParseInterval(Math.max(interval, 60));
      setParseTimeStart(settingsMap['maks_parser_time_start'] || '08:00');
      setParseTimeEnd(settingsMap['maks_parser_time_end'] || '23:00');
      setParseTimeEnabled(settingsMap['maks_parser_time_enabled'] !== 'false');
      
      if (!silent && settingsMap['sync_logs']) {
        lastSyncLogsRef.current = settingsMap['sync_logs'];
        try {
          const loadedLogs = JSON.parse(settingsMap['sync_logs']);
          if (Array.isArray(loadedLogs) && loadedLogs.length > 0) {
            let newLogs = [];
            if (typeof loadedLogs[0] === 'string') {
              // Legacy format
              const fallbackTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              newLogs = [...loadedLogs].reverse().map((msg: string) => ({ time: fallbackTime, msg, type: 'info' as const }));
            } else {
              // New format
              newLogs = [...loadedLogs].reverse();
            }
            setLogs(newLogs.slice(0, 50));
          }
        } catch(e) {}
      }

      const lastRunStr = settingsMap['maks_parser_last_run'];
      if (lastRunStr) {
          const lastRun = parseInt(lastRunStr, 10);
          const elapsed = (Date.now() - lastRun) / 1000;
          let remaining = Math.max(interval, 60) - elapsed;
          if (remaining < 0) remaining = 0;
          setNextRunSeconds(Math.floor(remaining));
      } else if (!silent) {
          // If it's missing (never run), save the current time to DB so countdown doesn't reset on every refresh
          const now = Date.now();
          fetch('/api/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'maks_parser_last_run', value: String(now) }),
          }).catch(console.error);
          setNextRunSeconds(Math.max(interval, 60));
      }
    } catch (error) { console.error('Failed to fetch settings:', error); }
    finally { if (!silent) setLoading(false); }
  };

  const fetchSessions = async (_silent = false): Promise<MaksSession[] | null> => {
    try {
      const url = _silent ? '/api/admin/auth/sessions?sync=false' : '/api/admin/auth/sessions';
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json() as { sessions?: MaksSession[]; error?: string };
      if (!res.ok || !Array.isArray(data.sessions)) throw new Error(data.error || 'Сервер не вернул аккаунты');
      setSessions(data.sessions);
      return data.sessions;
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
      return null;
    }
  };

  const currentProxyValue = (): string => {
    if (!proxyIP.trim() || !proxyPort.trim()) throw new Error('Укажите IP и порт прокси');
    if (!/^\d+$/.test(proxyPort.trim()) || Number(proxyPort) < 1 || Number(proxyPort) > 65535) {
      throw new Error('Порт прокси должен быть числом от 1 до 65535');
    }
    const identity = proxyIdentity();
    if (!proxyPass && hasSavedProxyPassword && identity === savedProxyIdentity) return 'saved';
    if (Boolean(proxyUser) !== Boolean(proxyPass)) throw new Error('Для прокси укажите одновременно логин и пароль');
    const url = new URL(`${proxyProtocol}${proxyIP.trim()}:${proxyPort.trim()}`);
    if (proxyUser && proxyPass) {
      url.username = proxyUser;
      url.password = proxyPass;
    }
    return url.toString();
  };

  const persistProxyDraft = async (): Promise<'saved'> => {
    const proxy = currentProxyValue();
    if (proxy === 'saved') return 'saved';
    const response = await fetch('/api/admin/auth/proxy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proxy }),
    });
    const draft = await response.json() as { saved?: boolean; protocol?: 'http://' | 'socks5://'; host?: string; port?: string; username?: string; hasPassword?: boolean; error?: string };
    if (!response.ok || !draft.saved || !draft.protocol || !draft.host || !draft.port) throw new Error(draft.error || 'Не удалось сохранить прокси');
    setProxyProtocol(draft.protocol);
    setProxyIP(draft.host);
    setProxyPort(draft.port);
    setProxyUser(draft.username || '');
    setProxyPass('');
    setHasSavedProxyPassword(Boolean(draft.hasPassword));
    setSavedProxyIdentity(proxyIdentity(draft.protocol, draft.host, draft.port, draft.username || ''));
    return 'saved';
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus('idle');
    try {
      const saveKey = async (key: string, value: string) => {
        const res = await fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: 'Ошибка сервера' }));
          throw new Error(`Не удалось сохранить ${key}: ${(errData as any).error || res.status}`);
        }
      };

      await saveKey('maks_main_channel', settings['maks_main_channel'] || '');
      await saveKey('maks_ai_api_key', settings['maks_ai_api_key'] || '');
      await saveKey('maks_ai_enabled', settings['maks_ai_enabled'] || 'false');
      await saveKey('maks_spam_keywords', settings['maks_spam_keywords'] || '');
      await saveKey('maks_monetization_enabled', settings['maks_monetization_enabled'] || 'true');
      await saveKey('maks_welcome_bonus_enabled', settings['maks_welcome_bonus_enabled'] || 'true');
      await saveKey('maks_welcome_bonus_amount', settings['maks_welcome_bonus_amount'] || '300');
      await saveKey('maks_parsing_chats', JSON.stringify(parsingChats));
      await saveKey('maks_parser_auto', autoParseEnabled ? 'true' : 'false');
      await saveKey('maks_parser_time_start', parseTimeStart);
      await saveKey('maks_parser_time_end', parseTimeEnd);
      await saveKey('maks_parser_time_enabled', parseTimeEnabled ? 'true' : 'false');

      if (!canBypass && (proxyIP || proxyPort || proxyUser || proxyPass)) {
        await persistProxyDraft();
      }
      setStatus('success');
      setHasUnsavedChanges(false);
      setTimeout(() => setStatus('idle'), 3000);
      // 2. Sync accounts from files to DB
      await fetch('/api/admin/auth/sessions');
      
      addLog('Настройки и аккаунты сохранены', 'success');
    } catch (error) { 
      setStatus('error'); 
      addLog(`Ошибка сохранения: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally { setSaving(false); }
  };

  const closeAuthDialog = () => {
    authAbortRef.current?.abort();
    authAbortRef.current = null;
    setAuthorizing(false);
    setAuthStep('idle');
    setAuthQR('');
    setAuthError('');
  };

  const startAuthFlow = async (mode: 'proxy' | 'direct' = 'proxy', fullProxy?: string) => {
    authAbortRef.current?.abort();
    const controller = new AbortController();
    authAbortRef.current = controller;
    setAuthorizing(true);
    setProxyStatus('idle');
    setAuthQR('');
    setAuthError('');
    setAuthStep('starting');
    addLog(mode === 'direct' ? 'Запуск авторизации без прокси на сервере...' : 'Запуск авторизации через proxy...', 'info');

    let startTimedOut = false;
    const startTimeout = window.setTimeout(() => {
      startTimedOut = true;
      controller.abort();
    }, 20_000);

    try {
      const response = await fetch('/api/admin/auth/qr-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy: mode === 'direct' ? 'direct' : fullProxy }),
        signal: controller.signal,
      });
      window.clearTimeout(startTimeout);
      const data = await response.json() as { success?: boolean; accountId?: string; error?: string };
      if (!response.ok || !data.success || !data.accountId) {
        throw new Error(data.error || 'Сервер не запустил авторизацию MAX');
      }

      const deadline = Date.now() + 6 * 60_000;
      while (Date.now() < deadline) {
        if (controller.signal.aborted) throw new DOMException('Авторизация отменена', 'AbortError');
        const statusResponse = await fetch(`/api/admin/auth/status?id=${encodeURIComponent(data.accountId)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const statusData = await statusResponse.json() as { state?: string; qrUrl?: string; message?: string; error?: string; account?: MaksSession };
        if (!statusResponse.ok) throw new Error(statusData.error || 'Не удалось получить статус авторизации');

        if (statusData.state === 'qr' && statusData.qrUrl) {
          setAuthQR(statusData.qrUrl);
          setAuthStep('qr');
        } else if (statusData.state === 'success') {
          const refreshed = await fetchSessions(true);
          if (statusData.account && !refreshed?.some((session) => session.id === statusData.account?.id)) {
            setSessions((current) => [statusData.account as MaksSession, ...current.filter((session) => session.id !== statusData.account?.id)]);
          }
          addLog('Аккаунт MAX успешно добавлен', 'success');
          setAuthStep('success');
          setAuthQR('');
          return;
        } else if (statusData.state === 'error') {
          throw new Error(statusData.message || 'Авторизация MAX завершилась с ошибкой');
        }

        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      }
      throw new Error('Авторизация не завершилась за 6 минут');
    } catch (reason) {
      window.clearTimeout(startTimeout);
      if (controller.signal.aborted && authAbortRef.current !== controller) return;
      const message = startTimedOut
        ? 'Сервер не ответил за 20 секунд'
        : reason instanceof Error ? reason.message : 'Не удалось авторизовать аккаунт MAX';
      setAuthError(message);
      setAuthStep('error');
      addLog(`Ошибка авторизации: ${message}`, 'error');
    } finally {
      window.clearTimeout(startTimeout);
      if (authAbortRef.current === controller) authAbortRef.current = null;
      setAuthorizing(false);
    }
  };

  const handleStartQR = async (checkOnly = false) => {
    if (proxyBusy || authorizing) return;
    if (canBypass && !checkOnly) {
      await startAuthFlow('direct');
      return;
    }

    if (!proxyIP || !proxyPort) {
      alert('Укажите IP и порт прокси');
      return;
    }

    setProxyBusy(true);
    setProxyStatus('checking');
    addLog(`Проверка прокси ${proxyIP}...`, 'info');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 18_000);

    try {
      const proxyReference = await persistProxyDraft();
      const check = await fetch('/api/admin/auth/proxy-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy: proxyReference }),
        signal: controller.signal,
      });
      const checkResult = await check.json() as { valid?: boolean; error?: string };
      if (!check.ok || !checkResult.valid) {
        addLog(`Прокси не прошёл предварительную проверку: ${checkResult.error || 'нет соединения'}`, 'error');
        setProxyStatus('invalid');
        return;
      }
      addLog(checkOnly ? 'Проверка завершена: прокси доступен. Можно добавить аккаунт MAX.' : 'Прокси доступен, запускаю QR-вход', 'success');
      setProxyStatus('valid');
      if (!checkOnly) await startAuthFlow('proxy', proxyReference);
    } catch (reason) {
      addLog(reason instanceof DOMException && reason.name === 'AbortError'
        ? 'Проверка прокси превысила 18 секунд'
        : reason instanceof Error ? reason.message : 'Ошибка связи при проверке прокси', 'error');
      setProxyStatus('invalid');
    } finally {
      window.clearTimeout(timeout);
      setProxyBusy(false);
    }
  };

  const saveAutoParseSettings = async (enabled: boolean, interval?: number) => {
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'maks_parser_auto', value: enabled ? 'true' : 'false' }),
      });
      if (interval !== undefined) {
        await fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'maks_parser_interval', value: String(interval) }),
        });
      }
    } catch (e) {
      console.error('Failed to save parser settings:', e);
    }
  };

  const handleAutoParseToggle = (enabled: boolean) => {
    setAutoParseEnabled(enabled);
    saveAutoParseSettings(enabled, parseInterval);
    if (enabled) {
      setNextRunSeconds(parseInterval);
    } else {
      setNextRunSeconds(null);
    }
    addLog(enabled ? 'Авто-парсинг включен' : 'Авто-парсинг отключен', 'info');
  };

  const handleRetentionDaysChange = async (days: number) => {
    setLeadRetentionDays(days);
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'lead_retention_days', value: String(days) }),
      });
      addLog(`Срок хранения лидов изменен на ${days} дн.`, 'info');
    } catch (e) {
      console.error('Failed to save retention days:', e);
    }
  };

  const handleIntervalChange = (newInterval: number) => {
    setParseInterval(newInterval);
    if (autoParseEnabled) {
      saveAutoParseSettings(true, newInterval);
      addLog(`Интервал парсинга: ${newInterval / 60} мин.`, 'info');
    }
  };

  const addLog = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setLogs(prev => [{ time, msg, type }, ...prev].slice(0, 50));
  };

  const handleSync = async () => {
    setSyncing(true);
    setCurrentParsingChat('*');
    addLog('Запуск парсинга...', 'info');
    try {
      const res = await fetch('/api/admin/parser/sync', { method: 'POST' });
      if (!res.ok) {
        addLog(`Ошибка сервера: ${res.status} ${res.statusText}`, 'error');
        setSyncing(false);
        setCurrentParsingChat(null);
        return;
      }
      const data = await res.json();
      
      if (data.logs && data.logs.length > 0 && !data.skipped) {
        setLogs(prev => {
          let newLogs = [];
          if (typeof data.logs[0] === 'string') {
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            newLogs = [...data.logs].reverse().map((msg: string) => ({ time, msg, type: data.success ? 'info' as const : 'error' as const }));
          } else {
            newLogs = [...data.logs].reverse();
          }
          return [...newLogs, ...prev].slice(0, 50);
        });
      }

      if (data.success) {
        if (data.skipped) {
           addLog(data.message || data.logs?.[0] || 'Парсер уже выполняется в фоновом режиме', 'info');
        } else {
           setTimeout(() => addLog(`Готово. Лидов: ${data.leadsCount}`, 'success'), 100);
        }
      } else {
        setTimeout(() => addLog(`Ошибка: ${data.message || 'Сбой парсинга'}`, 'error'), 100);
      }
    } catch (error) { 
      addLog(`Ошибка парсинга: ${error instanceof Error ? error.message : String(error)}`, 'error'); 
    }
    finally { 
      setSyncing(false);
      setCurrentParsingChat(null);
    }
  };

  useEffect(() => {
    if (!autoParseEnabled || syncing) {
      if (!autoParseEnabled) setNextRunSeconds(null);
      return;
    }

    const countdown = setInterval(() => {
      setNextRunSeconds(prev => {
        if (prev === null) return null;
        return prev > 0 ? prev - 1 : 0;
      });
    }, 1000);

    return () => clearInterval(countdown);
  }, [autoParseEnabled, syncing]);

  const isInsideParsingWindow = () => {
    if (!parseTimeEnabled || !parseTimeStart || !parseTimeEnd) return true;
    const now = new Date();
    // get UTC + 3 for MSK
    const mskHours = (now.getUTCHours() + 3) % 24;
    const currentMin = mskHours * 60 + now.getUTCMinutes();
    const startMin = parseInt(parseTimeStart.split(':')[0]) * 60 + parseInt(parseTimeStart.split(':')[1]);
    const endMin = parseInt(parseTimeEnd.split(':')[0]) * 60 + parseInt(parseTimeEnd.split(':')[1]);
    if (startMin <= endMin) {
      return currentMin >= startMin && currentMin <= endMin;
    } else {
      return currentMin >= startMin || currentMin <= endMin;
    }
  };

  useEffect(() => {
    if (nextRunSeconds === 0 && !syncing && autoParseEnabled) {
      if (sessions.length > 0) {
        if (isInsideParsingWindow()) {
          // DO NOT CALL handleSync() from the frontend.
          // Let the backend cron handle the actual parsing to avoid race conditions.
          // Just reset the timer.
        } else {
          addLog('Вне рабочего времени (МСК). Парсинг отложен.', 'info');
        }
      }
      setNextRunSeconds(parseInterval);
    }
  }, [nextRunSeconds, syncing, autoParseEnabled, parseInterval, sessions.length, parseTimeStart, parseTimeEnd, parseTimeEnabled]);

  const addChat = async () => {
    if (!newChat) return;
    
    let finalUrl = newChat.trim();
    if (finalUrl.includes('max.ru') && !finalUrl.includes('web.max.ru')) {
        finalUrl = finalUrl.replace('max.ru', 'web.max.ru');
    }
    if (!finalUrl.startsWith('http')) {
        finalUrl = 'https://' + finalUrl;
    }

    // Auto-normalize profile links to MAX Web app format
    if (!finalUrl.includes('#')) {
      const urlParts = finalUrl.replace(/\/$/, '').split('/');
      const username = urlParts[urlParts.length - 1];
      if (username && !username.startsWith('+')) {
        const isNumeric = /^-?\d+$/.test(username);
        finalUrl = isNumeric ? `https://web.max.ru/a/#${username}` : `https://web.max.ru/a/#@${username}`;
      }
    }

    if (parsingChats.some(c => c.url === finalUrl)) {
        setNewChat('');
        return;
    }
    
    // Smart name extraction from URL
    let chatName = 'Новый чат';
    try {
      const urlParts = finalUrl.split('/');
      const slug = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
      if (slug) {
        chatName = slug
          .replace(/_/g, ' ')
          .replace(/-/g, ' ')
          .split(' ')
          .map((word:string) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
    } catch (e) {
      chatName = 'Новый чат';
    }

    setParsingChats([...parsingChats, { name: chatName, url: finalUrl, parseAll: true, lastRunLeadsCount: null }]);
    setNewChat('');
    setHasUnsavedChanges(true);
    addLog(`Добавлен чат: ${chatName}`, 'success');
  };

  const toggleChatMode = (url: string) => {
    setParsingChats(parsingChats.map(c => 
      c.url === url ? { ...c, parseAll: !c.parseAll } : c
    ));
    setHasUnsavedChanges(true);
    addLog('Режим чата изменен', 'info');
  };

  const editChatName = (url: string) => {
    const chat = parsingChats.find(c => c.url === url);
    if (!chat) return;
    const newName = prompt('Введите новое название чата:', chat.name);
    if (newName && newName !== chat.name) {
      setParsingChats(parsingChats.map(c => 
        c.url === url ? { ...c, name: newName } : c
      ));
      setHasUnsavedChanges(true);
      addLog(`Чат переименован: ${newName}`, 'info');
    }
  };

  const removeChat = (url: string) => {
    setParsingChats(parsingChats.filter(c => c.url !== url));
    setHasUnsavedChanges(true);
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm('Удалить этот аккаунт?')) return;
    try {
      const response = await fetch(`/api/admin/auth/sessions?id=${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Удаление отклонено сервером');
      setSessions((current) => current.filter((session) => session.id !== id));
      addLog('Аккаунт удален', 'info');
    } catch (error) { addLog('Ошибка удаления', 'error'); }
  };

  const handleToggleSession = async (session: MaksSession) => {
    try {
      const response = await fetch('/api/admin/auth/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: session.id, active: !session.active }),
      });
      if (!response.ok) throw new Error('Изменение отклонено сервером');
      await fetchSessions(true);
      addLog(session.active ? 'Аккаунт поставлен на паузу' : 'Аккаунт включен', 'info');
    } catch { addLog('Не удалось изменить состояние аккаунта', 'error'); }
  };

  const inputClasses = "w-full bg-zinc-950 border border-zinc-700 rounded-lg py-2 pl-11 pr-4 text-xs font-medium focus:ring-1 focus:ring-black transition-all text-white placeholder:text-zinc-500 outline-none";

  if (!mounted) return null;
  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-accent" size={32} /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-0 pb-20 font-sans sm:px-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 border-b border-zinc-700 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="bg-accent border border-zinc-700 p-2.5 text-black rounded-lg">
            <SettingsIcon size={20} />
          </div>
          <h1 className="text-xs sm:text-sm font-bold tracking-widest text-white uppercase leading-none">НАСТРОЙКИ</h1>
          
          <button 
            onClick={handleSave} 
            disabled={saving || !hasUnsavedChanges} 
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all sm:ml-4 border ${
              saving || !hasUnsavedChanges
                ? 'bg-zinc-900 border-zinc-800 text-zinc-500 cursor-not-allowed opacity-70'
                : 'bg-zinc-950 border-zinc-700 text-accent hover:bg-zinc-800'
            }`}
          >
            <div className="flex items-center gap-1.5">
              {saving ? <Loader2 className="animate-spin" size={12} /> : <Save size={12} />}
              <span>СОХРАНИТЬ</span>
            </div>
          </button>
        </div>
        
        <button onClick={() => setShowHelp(!showHelp)} className="flex items-center justify-center gap-2 border border-zinc-700 rounded-lg bg-zinc-900 px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-white transition-all hover:bg-zinc-800 sm:w-auto">
          <div className="flex items-center gap-1.5">
            <HelpCircle size={14} /> <span>ИНСТРУКЦИЯ</span>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:p-6 rounded-xl items-stretch">
        {/* ACCOUNTS CARD */}
        <div className="flex h-full flex-col rounded-xl border border-zinc-700 bg-zinc-900 p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 border border-zinc-700 bg-zinc-950 rounded-none flex items-center justify-center text-white"><UserIcon size={14} /></div>
            <h3 className="font-bold text-[10px] uppercase tracking-[0.2em] text-zinc-400">Аккаунты</h3>
          </div>

          <div className="mb-6 space-y-4 rounded-lg border border-zinc-700 p-4 sm:p-5 bg-transparent">
             <div className="flex items-center justify-between">
                <label className="text-[8px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Режим подключения</label>
                <div className="flex bg-zinc-950 p-1 border border-zinc-700 rounded-lg">
                   <button 
                      disabled={proxyBusy || authorizing}
                      onClick={() => {
                        setCanBypass(false);
                        setProxyStatus('idle');
                      }} // Reset status when switching
                      className={cn(
                        "px-4 py-1.5 text-[9px] font-bold uppercase transition-all border border-transparent rounded-md",
                        !canBypass ? "bg-zinc-800 text-white border-zinc-700" : "text-zinc-400 hover:text-white"
                      )}
                      type="button"
                   >
                      Proxy
                   </button>
                   <button 
                      disabled={proxyBusy || authorizing}
                      onClick={() => {
                        setCanBypass(true);
                        setProxyStatus('idle');
                        setProxyIP('');
                        setProxyPort('');
                      }}
                      className={cn(
                        "px-4 py-1.5 text-[9px] font-bold uppercase transition-all border border-transparent rounded-md",
                        canBypass ? "bg-zinc-800 text-white border-zinc-700" : "text-zinc-400 hover:text-white"
                      )}
                      type="button"
                   >
                      Без прокси
                   </button>
                </div>
             </div>

             {!canBypass ? (
               <>
                 <div className="flex items-center justify-between">
                    <label className="text-[8px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Тип прокси</label>
                    <div className="relative">
                       <select 
                          disabled={proxyBusy || authorizing}
                          value={proxyProtocol}
                          onChange={(e) => setProxyProtocol(e.target.value as any)}
                          className="bg-zinc-950 border border-zinc-700 rounded-lg py-1.5 px-3 text-[9px] font-bold text-white uppercase focus:ring-1 focus:ring-black appearance-none cursor-pointer outline-none"
                       >
                          <option value="http://">HTTP</option>
                          <option value="socks5://">SOCKS5</option>
                       </select>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="relative">
                       <Server className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={12} />
                       <input disabled={proxyBusy || authorizing} value={proxyIP} onChange={(e) => setProxyIP(e.target.value)} placeholder="IP Адрес" className={inputClasses} />
                    </div>
                    <div className="relative">
                       <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={12} />
                       <input disabled={proxyBusy || authorizing} value={proxyPort} onChange={(e) => setProxyPort(e.target.value)} placeholder="Порт" className={inputClasses} />
                    </div>
                    <div className="relative">
                       <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={12} />
                       <input disabled={proxyBusy || authorizing} value={proxyUser} onChange={(e) => setProxyUser(e.target.value)} placeholder="Логин" className={inputClasses} />
                    </div>
                    <div className="relative">
                       <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={12} />
                       <input disabled={proxyBusy || authorizing} type={showPass ? 'text' : 'password'} value={proxyPass} onChange={(e) => setProxyPass(e.target.value)} placeholder={hasSavedProxyPassword && proxyIdentity() === savedProxyIdentity ? '••••••••' : 'Пароль'} className={cn(inputClasses, "pr-10")} />
                       <button onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors">
                          {showPass ? <EyeOff size={12} /> : <Eye size={12} />}
                       </button>
                    </div>
                 </div>
               </>
             ) : (
               <div className="bg-zinc-950 border border-zinc-700 p-3 rounded-lg flex gap-3 items-center">
                  <div className="text-accent"><ShieldCheck size={20} /></div>
                  <div className="text-[9px] text-white font-bold uppercase leading-relaxed">
                    Без прокси: браузер запускается на сервере Calyphity. VPN на вашем устройстве на него не влияет.
                  </div>
               </div>
             )}

             <div className="space-y-3">
               <button 
                  onClick={canBypass ? () => startAuthFlow('direct') : () => handleStartQR()} 
                  disabled={authorizing || proxyBusy || (!canBypass && (!proxyLoaded || !proxyIP || !proxyPort))} 
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-bold uppercase tracking-widest transition-all border border-zinc-700",
                    (!canBypass && (!proxyIP || !proxyPort)) ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : 
                    proxyStatus === 'valid' ? "bg-green-500 text-white" : 
                    proxyStatus === 'invalid' ? "bg-red-500 text-white" : 
                    "bg-accent text-black hover:brightness-95"
                  )}
               >
                  {proxyStatus === 'checking' || authorizing ? <Loader2 className="animate-spin" size={12}/> : 
                   proxyStatus === 'valid' ? <CheckCircle2 size={12} /> :
                   proxyStatus === 'invalid' ? <AlertCircle size={12} /> :
                   <Plus size={12} />}
                  <span>{
                    proxyStatus === 'checking' ? 'ПРОВЕРКА...' : 
                    authorizing ? 'ОЖИДАНИЕ...' : 
                    proxyStatus === 'valid' ? 'ДОБАВИТЬ АККАУНТ MAX' :
                    proxyStatus === 'invalid' ? 'ОШИБКА. ПОВТОРИТЬ?' :
                    'ДОБАВИТЬ АККАУНТ'
                  }</span>
               </button>

               <AnimatePresence>
                 {!canBypass && proxyStatus === 'invalid' && savedProxyIdentity === proxyIdentity() && (
                   <motion.button
                     initial={{ opacity: 0, y: -10 }}
                     animate={{ opacity: 1, y: 0 }}
                     onClick={() => startAuthFlow('proxy', 'saved')}
                     disabled={authorizing || proxyBusy}
                     className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-100 border border-red-500 text-red-600 text-[8px] font-bold uppercase tracking-widest hover:bg-red-200 transition-all"
                   >
                     <Unlock size={12} />
                     <span>Всё равно добавить (Пропустить проверку)</span>
                   </motion.button>
                 )}
               </AnimatePresence>

               {!canBypass && (
                 <button
                   type="button"
                   disabled={authorizing || proxyBusy || !proxyLoaded || !proxyIP.trim() || !proxyPort.trim()}
                   onClick={async () => {
                     if (proxyBusy || authorizing) return;
                     setProxyBusy(true);
                     setProxyStatus('diagnosing');
                     addLog('Запуск пошаговой диагностики прокси...', 'info');
                     const controller = new AbortController();
                     const timeout = window.setTimeout(() => controller.abort(), 35_000);
                     try {
                       const proxyReference = await persistProxyDraft();
                       const res = await fetch('/api/admin/auth/proxy-diagnose', {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ proxy: proxyReference }),
                         signal: controller.signal,
                       });
                       const data = await res.json() as { success?: boolean; steps?: { step: string; ok: boolean; ms?: number; detail?: string; error?: string }[]; error?: string };
                       if (data.steps) {
                         for (const s of data.steps) {
                           addLog(`${s.ok ? '✅' : '❌'} ${s.step}: ${s.detail || s.error || ''} (${s.ms || 0}мс)`, s.ok ? 'success' : 'error');
                         }
                       }
                       if (data.error) addLog(`Ошибка: ${data.error}`, 'error');
                       const success = res.ok && data.success === true;
                       addLog(success ? 'Диагностика: все шаги пройдены ✅' : 'Диагностика: обнаружена проблема ❌', success ? 'success' : 'error');
                       setProxyStatus(success ? 'valid' : 'invalid');
                     } catch (e) {
                       addLog(e instanceof DOMException && e.name === 'AbortError' ? 'Диагностика превысила 35 секунд' : `Ошибка диагностики: ${e instanceof Error ? e.message : String(e)}`, 'error');
                       setProxyStatus('invalid');
                     } finally {
                       window.clearTimeout(timeout);
                       setProxyBusy(false);
                     }
                   }}
                   className={cn(
                     "w-full flex items-center justify-center gap-2 py-2 rounded-lg border text-[8px] font-bold uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed",
                     proxyStatus === 'diagnosing' 
                       ? "bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed" 
                       : "bg-zinc-950 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                   )}
                 >
                   {proxyStatus === 'diagnosing' ? <Loader2 className="animate-spin" size={12} /> : <Activity size={12} />}
                   <span>{proxyStatus === 'diagnosing' ? 'ИДЕТ ДИАГНОСТИКА...' : 'ДИАГНОСТИКА ПРОКСИ (ПОШАГОВАЯ)'}</span>
                 </button>
               )}
             </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto pr-2 custom-scrollbar min-h-[120px] max-h-[200px]">
            {sessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between bg-zinc-950 border border-zinc-700 p-3 rounded-lg group">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white"><UserIcon size={12} /></div>
                    <div className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-zinc-700", session.active ? "bg-green-500" : "bg-red-500")} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-[10px] font-bold text-white uppercase tracking-tight leading-none">{session.name}</h4>
                    <p className="text-[7px] text-zinc-400 font-bold uppercase mt-1 truncate max-w-[190px]">{session.proxy || 'Прямое подключение'}</p>
                    <p className={cn("text-[7px] font-bold uppercase mt-1", session.status === 'ACTIVE' ? 'text-green-400' : session.status === 'COOLDOWN' ? 'text-amber-400' : 'text-red-400')}>
                      {SESSION_STATUS_LABELS[session.status || 'DISABLED'] || session.status}
                      {session.consecutiveFailures ? ` · ошибок подряд: ${session.consecutiveFailures}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleToggleSession(session)}
                    disabled={session.status === 'AUTHORIZING' || session.status === 'AUTH_REQUIRED'}
                    title={session.active ? 'Поставить на паузу' : 'Включить аккаунт'}
                    className="text-zinc-500 hover:text-amber-400 disabled:opacity-30 transition-colors p-1.5"
                  >
                    <Activity size={12} />
                  </button>
                  <button onClick={() => handleDeleteSession(session.id)} title="Удалить аккаунт" className="text-zinc-500 hover:text-red-500 transition-colors p-1.5"><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-5 pt-5 border-t border-zinc-700">
            <div className="space-y-3">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-[8px] font-bold text-white uppercase tracking-[0.3em] ml-1">Использовать ИИ (DeepSeek) для анализа</label>
                  <button 
                    onClick={() => {
                      setSettings({ ...settings, maks_ai_enabled: settings['maks_ai_enabled'] === 'true' ? 'false' : 'true' });
                      setHasUnsavedChanges(true);
                    }}
                    className={cn(
                      "w-10 h-5 rounded-full flex items-center transition-colors px-1 shrink-0",
                      settings['maks_ai_enabled'] === 'true' ? "bg-accent" : "bg-zinc-700"
                    )}
                  >
                    <div className={cn(
                      "w-3.5 h-3.5 rounded-full bg-black transition-transform",
                      settings['maks_ai_enabled'] === 'true' ? "translate-x-5" : "translate-x-0"
                    )} />
                  </button>
                </div>
                {settings['maks_ai_enabled'] === 'true' && (
                  <div className="space-y-2">
                    <label className="text-[8px] font-bold text-zinc-400 uppercase tracking-[0.3em] block ml-1">API Ключ ИИ</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={12} />
                        <input 
                          type="password" 
                          value={settings['maks_ai_api_key'] || ''}
                          onChange={(e) => {
                            setSettings({ ...settings, maks_ai_api_key: e.target.value });
                            setHasUnsavedChanges(true);
                            setAiStatus('idle');
                          }}
                          placeholder="sk-..." 
                          className={cn(
                            inputClasses,
                            aiStatus === 'success' ? "border-green-500 focus:ring-green-500" :
                            aiStatus === 'error' ? "border-red-500 focus:ring-red-500" :
                            ""
                          )}
                        />
                      </div>
                      <button
                        onClick={handleVerifyAiKey}
                        disabled={verifyingAi || !settings['maks_ai_api_key']}
                        className={cn(
                          "px-4 text-[9px] font-bold uppercase transition-all flex items-center justify-center gap-2 border border-zinc-700 rounded-lg shrink-0",
                          verifyingAi ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" :
                          aiStatus === 'success' ? "bg-green-100 text-green-700 hover:bg-green-200 border-green-500" :
                          aiStatus === 'error' ? "bg-red-100 text-red-700 hover:bg-red-200 border-red-500" :
                          "bg-zinc-950 text-white hover:bg-zinc-800"
                        )}
                      >
                        {verifyingAi ? <Loader2 className="animate-spin" size={14} /> : 
                         aiStatus === 'success' ? <CheckCircle2 size={14} /> : 
                         aiStatus === 'error' ? <AlertCircle size={14} /> : 
                         <Zap size={14} />}
                        <span>{verifyingAi ? 'Проверка...' : 'Проверить'}</span>
                      </button>
                    </div>
                    {aiStatus === 'error' && (
                      <p className="text-[10px] text-red-500 mt-2 px-1">{aiErrorMsg}</p>
                    )}
                    {aiStatus === 'success' && (
                      <p className="text-[10px] text-green-500 mt-2 px-1">Ключ работает отлично. Баланс активен!</p>
                    )}
                  </div>
                )}
            </div>
            
            <div className="pt-4 border-t border-zinc-700">
              <div className="flex items-center justify-between mb-3">
                <label className="text-[8px] font-bold text-white uppercase tracking-[0.3em] ml-1">Монетизация (Платежи и баланс)</label>
                <button 
                  onClick={() => {
                    setSettings({ ...settings, maks_monetization_enabled: settings['maks_monetization_enabled'] === 'false' ? 'true' : 'false' });
                    setHasUnsavedChanges(true);
                  }}
                  className={cn(
                    "w-10 h-5 rounded-full flex items-center transition-colors px-1 shrink-0",
                    settings['maks_monetization_enabled'] !== 'false' ? "bg-accent" : "bg-zinc-700"
                  )}
                >
                  <div className={cn(
                    "w-3.5 h-3.5 rounded-full bg-black transition-transform",
                    settings['maks_monetization_enabled'] !== 'false' ? "translate-x-5" : "translate-x-0"
                  )} />
                </button>
              </div>

              <div className="flex items-center justify-between mb-3">
                <label className="text-[8px] font-bold text-white uppercase tracking-[0.3em] ml-1">Бонус за регистрацию</label>
                <button 
                  onClick={() => {
                    setSettings({ ...settings, maks_welcome_bonus_enabled: settings['maks_welcome_bonus_enabled'] === 'false' ? 'true' : 'false' });
                    setHasUnsavedChanges(true);
                  }}
                  className={cn(
                    "w-10 h-5 rounded-full flex items-center transition-colors px-1 shrink-0",
                    settings['maks_welcome_bonus_enabled'] !== 'false' ? "bg-accent" : "bg-zinc-700"
                  )}
                >
                  <div className={cn(
                    "w-3.5 h-3.5 rounded-full bg-black transition-transform",
                    settings['maks_welcome_bonus_enabled'] !== 'false' ? "translate-x-5" : "translate-x-0"
                  )} />
                </button>
              </div>
              
              {settings['maks_welcome_bonus_enabled'] !== 'false' && (
                <div className="space-y-2">
                  <label className="text-[8px] font-bold text-zinc-400 uppercase tracking-[0.3em] block ml-1">Сумма бонуса (Рублей)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-[10px] font-bold">₽</span>
                    <input 
                      type="number" 
                      min="0"
                      step="50"
                      value={settings['maks_welcome_bonus_amount'] ?? '300'}
                      onChange={(e) => {
                        setSettings({ ...settings, maks_welcome_bonus_amount: e.target.value });
                        setHasUnsavedChanges(true);
                      }}
                      className={cn(inputClasses, "pl-8")}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-zinc-700 flex flex-col flex-1 min-h-0">
              <label className="text-[8px] font-bold text-zinc-400 uppercase tracking-[0.3em] block ml-1 mb-1.5 shrink-0">Антиспам / Стоп-слова</label>
              <div className="relative flex-1 min-h-0">
                <ShieldCheck className="absolute left-4 top-3 text-zinc-500" size={12} />
                <textarea 
                  value={settings['maks_spam_keywords'] || ''}
                  disabled={!hasTargetedChats(parsingChats, settings['maks_active_target_chats'])}
                  aria-describedby="spam-filter-help"
                  onChange={(e) => {
                    setSettings({ ...settings, maks_spam_keywords: e.target.value });
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="накрутка, эскорт, ищу работу..." 
                  className={cn(inputClasses, "min-h-[60px] h-full py-2.5 resize-y rounded-lg disabled:opacity-50 disabled:cursor-not-allowed")}
                />
              </div>
              <p className="text-[9px] text-zinc-500 ml-1 leading-relaxed font-bold mt-2 shrink-0">
                <span id="spam-filter-help">{hasTargetedChats(parsingChats, settings['maks_active_target_chats'])
                  ? 'Применяется только к чатам в режиме «ЦЕЛЕВЫЕ». Вводите слова через запятую.'
                  : 'Не применяется: нет чатов в режиме «ЦЕЛЕВЫЕ». Стоп-слова сохранены.'}</span>
              </p>
            </div>
          </div>
        </div>

        {/* PARSING CARD */}
        <div className="flex h-full flex-col rounded-xl border border-zinc-700 bg-zinc-900 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 border border-zinc-700 bg-zinc-950 rounded-none flex items-center justify-center text-white"><Activity size={14} /></div>
              <h3 className="font-bold text-[10px] uppercase tracking-[0.2em] text-zinc-400">Лог событий</h3>
            </div>
            <span className="flex items-center gap-1 text-[7px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              {syncing && <Loader2 className="animate-spin" size={8} />}
              {syncing ? 'ПАРСИНГ' : 'ГОТОВ'}
            </span>
          </div>
          
          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-700 space-y-2 mb-6 flex flex-col shrink-0 min-h-[100px] resize-y overflow-hidden" style={{ resize: 'vertical' }}>
            <div className="flex-1 space-y-1 overflow-y-auto text-[9px] font-mono font-bold leading-snug text-zinc-400 custom-scrollbar pr-2">
              {logs.length === 0 ? (
                <div className="text-zinc-600 italic h-full flex items-center justify-center">Ожидание...</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={cn("grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2", log.type === 'success' ? "text-green-500" : log.type === 'error' ? "text-red-500" : "")}>
                    <span className="whitespace-nowrap">[{log.time}]</span>
                    <span className="min-w-0 whitespace-pre-wrap break-words select-text">{log.msg}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4 mb-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 border border-zinc-700 bg-zinc-950 rounded-none flex items-center justify-center text-white"><Bot size={14} /></div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-[10px] uppercase tracking-[0.2em] text-zinc-400">Очередь чатов</h3>
                    <span
                      aria-label={`Сохранено чатов: ${parsingChats.length}`}
                      className="inline-flex min-w-5 items-center justify-center rounded border border-accent bg-accent px-1.5 py-0.5 text-[9px] font-black leading-none text-black"
                    >
                      {parsingChats.length}
                    </span>
                  </div>
                  <p className="text-[8px] text-zinc-500 font-bold uppercase tracking-[0.2em]">Статус парсера</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleAutoParseToggle(!autoParseEnabled)}
                disabled={!isInsideParsingWindow()}
                className={cn(
                  'px-4 py-2 border border-zinc-700 rounded-lg text-[9px] font-bold uppercase transition-all',
                  !isInsideParsingWindow() ? 'opacity-50 cursor-not-allowed bg-zinc-800 text-zinc-500' :
                  autoParseEnabled ? 'bg-accent text-black' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white'
                )}
              >
                {autoParseEnabled ? 'АВТО ВКЛ' : 'АВТО ВЫКЛ'}
              </button>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 text-[10px] uppercase tracking-[0.2em] text-zinc-400 font-bold">
              <span className="min-w-0 truncate">
                {syncing ? 'РАБОТАЕТ СЕЙЧАС' : 
                 !autoParseEnabled ? 'РУЧНОЙ РЕЖИМ' : 
                 !isInsideParsingWindow() ? 'СТОП' : 
                 `В ОЧЕРЕДИ ${nextRunSeconds !== null ? `${Math.floor(nextRunSeconds/60)}:${String(nextRunSeconds % 60).padStart(2,'0')}` : ''}`}
              </span>
              <select
                value={parseInterval}
                onChange={(e) => handleIntervalChange(parseInt(e.target.value, 10))}
                disabled={!autoParseEnabled}
                className="shrink-0 bg-zinc-950 border border-zinc-700 rounded-lg py-1.5 px-3 text-[9px] font-bold text-white uppercase focus:ring-1 focus:ring-black appearance-none cursor-pointer outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="60">1 МИН</option>
                <option value="180">3 МИН</option>
                <option value="300">5 МИН</option>
                <option value="600">10 МИН</option>
                <option value="900">15 МИН</option>
                <option value="1800">30 МИН</option>
              </select>
            </div>

            
            <div className="flex min-w-0 items-center justify-between gap-3 text-[10px] uppercase tracking-[0.2em] text-zinc-400 font-bold mt-2">
              <span className="min-w-0 truncate">ВРЕМЯ РАБОТЫ (МСК)</span>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => { setParseTimeEnabled(!parseTimeEnabled); setHasUnsavedChanges(true); }}
                  className={cn("w-8 h-4 rounded-full flex items-center transition-colors px-1 shrink-0", parseTimeEnabled ? "bg-accent" : "bg-zinc-700")}
                >
                  <div className={cn("w-2.5 h-2.5 rounded-full bg-black transition-transform", parseTimeEnabled ? "translate-x-3.5" : "translate-x-0")} />
                </button>
                {parseTimeEnabled && (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={parseTimeStart}
                      onChange={(e) => {
                        setParseTimeStart(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      className="bg-zinc-950 border border-zinc-700 rounded-lg py-1 px-2 text-[10px] font-bold text-white focus:ring-1 focus:ring-black outline-none"
                    />
                    <span>-</span>
                    <input
                      type="time"
                      value={parseTimeEnd}
                      onChange={(e) => {
                        setParseTimeEnd(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      className="bg-zinc-950 border border-zinc-700 rounded-lg py-1 px-2 text-[10px] font-bold text-white focus:ring-1 focus:ring-black outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
              <input 
                type="text" 
                value={newChat}
                onChange={(e) => setNewChat(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addChat()}
                placeholder="max.ru/..." 
                className={inputClasses}
              />
            </div>
            <button onClick={addChat} className="bg-zinc-800 text-white rounded-lg px-4 border border-zinc-700 hover:bg-zinc-700 transition-all"><Plus size={16}/></button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto pr-2 custom-scrollbar min-h-[150px] max-h-[300px] mb-6">
            {parsingChats.map((chat) => (
              <div key={chat.url} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 overflow-hidden border border-zinc-700 bg-zinc-950 rounded-lg p-2.5 sm:gap-3 sm:p-3.5">
                <button type="button" className="min-w-0 cursor-pointer overflow-hidden text-left" onClick={() => editChatName(chat.url)} title={chat.name}>
                  <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                      <div className="relative shrink-0">
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full border border-zinc-700",
                          currentParsingChat === chat.url ? "bg-amber-500" : sessions.length > 0 ? "bg-green-500" : "bg-gray-400"
                        )} />
                        {currentParsingChat === chat.url && <div className="absolute inset-0 w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping border border-zinc-700" />}
                      </div>
                      <span className={cn(
                        "min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-tight text-white transition-colors hover:text-accent"
                      )}>
                        {chat.name}
                      </span>
                      {chat.parseAll && <span className={cn("shrink-0 border px-1.5 py-0.5 text-[6px] font-bold uppercase rounded-md", sessions.length > 0 ? "border-green-800 bg-green-900/30 text-green-400" : "border-zinc-700 bg-zinc-800 text-zinc-500")}>ВСЁ</span>}
                      {!chat.parseAll && <span className={cn("shrink-0 border px-1.5 py-0.5 text-[6px] font-bold uppercase rounded-md", sessions.length > 0 ? "border-yellow-800 bg-yellow-900/30 text-yellow-400" : "border-zinc-700 bg-zinc-800 text-zinc-500")}>ЦЕЛЕВЫЕ</span>}
                    </div>
                  <span className="block truncate text-[8px] font-bold uppercase tracking-[0.12em] text-zinc-500">{chat.url}</span>
                  {chat.lastParsedAt && (
                    <span className="mt-1 block truncate text-[8px] font-bold uppercase tracking-[0.12em] text-zinc-400">Последний парсинг: {new Date(chat.lastParsedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  )}
                </button>
                <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                  <button 
                    onClick={() => toggleChatMode(chat.url)} 
                    className={cn(
                      "shrink-0 border border-zinc-700 rounded-lg p-2 transition-all sm:p-2.5",
                      chat.parseAll 
                        ? "bg-green-900/30 text-green-400 hover:bg-green-100" 
                        : "bg-yellow-900/30 text-yellow-400 hover:bg-yellow-100"
                    )}
                    title={chat.parseAll ? "Парсинг всего контента" : "Парсинг по категориям"}
                  >
                    <Activity size={14}/>
                  </button>
                  <span
                    className="w-14 whitespace-nowrap text-right text-[7px] font-bold uppercase tracking-tight text-zinc-500 sm:w-16 sm:text-[8px]"
                    title={chat.lastRunLeadsCount == null ? 'Количество новых лидов появится после следующего завершённого прохода' : 'Новые лиды, добавленные из этого чата за последний завершённый проход'}
                  >
                    {chat.lastRunLeadsCount == null ? '— за проход' : `+${chat.lastRunLeadsCount} за проход`}
                  </span>
                  <button onClick={() => removeChat(chat.url)} className="shrink-0 p-2 text-zinc-500 transition-colors hover:text-red-500"><Trash2 size={12}/></button>
                </div>
              </div>
            ))}
          </div>

          <div className="mb-4 space-y-1.5 ml-1 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 border border-zinc-700 shrink-0"></div>
              <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">— Парсятся абсолютно все сообщения</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 border border-zinc-700 shrink-0"></div>
              <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">— Парсятся только подходящие под категории</span>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-700 shrink-0">
            {!autoParseEnabled && (
              <button 
                onClick={handleSync}
                disabled={syncing || sessions.length === 0 || !isInsideParsingWindow()}
                className={cn(
                  "neon-button w-full flex items-center justify-center gap-3 rounded-lg",
                  sessions.length === 0 ? "opacity-50 cursor-not-allowed hover:bg-accent" : "",
                  !isInsideParsingWindow() ? "opacity-50 cursor-not-allowed bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-zinc-800" : ""
                )}
              >
                <div className="flex items-center justify-center gap-3 w-full">
                  {syncing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                  <span className="leading-none text-xs sm:text-sm font-bold uppercase">ЗАПУСТИТЬ ПАРСИНГ</span>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); }
      `}</style>

      {/* Серверная QR-авторизация MAX */}
      {authStep !== 'idle' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/90 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-xl space-y-5 overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-5 text-center shadow-2xl sm:p-4 sm:p-6">
            {authStep === 'starting' && (
              <div className="space-y-5 py-10">
                <Loader2 className="mx-auto animate-spin text-accent" size={44} />
                <div><h2 className="font-bold uppercase text-white">Запускаю защищённый вход MAX</h2><p className="mt-2 text-sm text-zinc-400">Сервер открывает web.max.ru и готовит QR-код. Обычно это занимает до 20 секунд.</p></div>
              </div>
            )}
            {authStep === 'qr' && authQR && (
              <>
                <div><h2 className="text-lg font-bold uppercase text-white">Отсканируйте QR-код</h2><p className="mt-2 text-sm text-zinc-400">Откройте MAX на телефоне и подтвердите вход. Страница обновит QR автоматически.</p></div>
                <div className="overflow-hidden rounded-xl border border-zinc-700 bg-white p-2">
                  <Image src={authQR} alt="QR-код авторизации MAX" width={1280} height={800} unoptimized className="mx-auto h-auto max-h-[55vh] w-full object-contain" />
                </div>
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-accent"><Loader2 className="animate-spin" size={14} /> Ожидаю подтверждение входа…</div>
              </>
            )}
            {authStep === 'success' && (
              <div className="space-y-4 py-6">
                <CheckCircle2 className="mx-auto text-green-400" size={48} />
                <div><h2 className="font-bold uppercase text-white">Аккаунт подключён</h2><p className="mt-2 text-sm text-zinc-300">Сессия сохранена, аккаунт активен и показан в списке ниже.</p></div>
              </div>
            )}
            {authStep === 'error' && (
              <div className="space-y-4 py-6">
                <AlertCircle className="mx-auto text-red-400" size={48} />
                <div><h2 className="font-bold uppercase text-white">Авторизация не выполнена</h2><p className="mt-2 break-words text-sm text-red-300">{authError}</p></div>
              </div>
            )}
            <button type="button" onClick={closeAuthDialog} className="w-full rounded-xl border border-zinc-700 bg-zinc-950 py-3 text-xs font-bold uppercase text-white transition-colors hover:bg-zinc-800">
              {authStep === 'error' ? 'Закрыть' : authStep === 'success' ? 'Готово' : 'Отменить авторизацию'}
            </button>
          </div>
        </div>
      )}
      {/* Unsaved Changes Modal */}
      {showUnsavedModal && (
        <div className="fixed inset-0 bg-zinc-950/80 z-50 flex items-center justify-center p-4 rounded-lg">
          <div className="bg-zinc-900 border-2 border-zinc-700 p-4 sm:p-6 rounded-xl max-w-sm w-full text-center space-y-6 shadow-2xl rounded-xl">
            <div className="w-16 h-16 border-2 border-zinc-700 bg-accent flex items-center justify-center mx-auto text-black mb-4">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-lg font-bold text-white uppercase tracking-widest">Несохраненные изменения</h2>
            <p className="text-xs sm:text-sm font-bold text-zinc-400">Вы внесли изменения в настройки, но не сохранили их. Если вы уйдете сейчас, изменения будут потеряны.</p>
            <div className="space-y-3 pt-4">
              <button 
                onClick={async () => {
                  await handleSave();
                  window.location.href = showUnsavedModal;
                }} 
                className="bg-accent text-black font-bold uppercase tracking-widest border border-accent hover:brightness-95 active:scale-95 transition-all rounded-lg w-full text-xs py-3"
              >
                Сохранить и выйти
              </button>
              <button 
                onClick={() => window.location.href = showUnsavedModal} 
                className="w-full py-3 bg-red-100 border border-red-500 text-red-600 font-bold uppercase tracking-widest text-xs hover:bg-red-200 transition-colors"
              >
                Выйти без сохранения
              </button>
              <button 
                onClick={() => setShowUnsavedModal(null)} 
                className="w-full py-3 bg-zinc-800 border border-zinc-700 text-zinc-400 font-bold uppercase tracking-widest text-xs hover:bg-zinc-700 hover:text-white transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-zinc-950/80 z-50 flex items-center justify-center p-4 rounded-lg">
          <div className="bg-zinc-900 border-2 border-zinc-700 p-4 sm:p-6 rounded-xl max-w-lg w-full shadow-2xl rounded-xl">
            <h2 className="text-xs sm:text-sm font-bold text-white uppercase tracking-widest mb-6 flex items-center gap-2">
              <HelpCircle className="text-white" /> Инструкция
            </h2>
            <div className="space-y-4 text-xs text-zinc-400 leading-relaxed font-bold">
              <p>Настройки платформы Макс позволяют управлять парсингом лидов:</p>
              <ul className="list-disc pl-4 space-y-3 mt-4">
                <li><strong className="text-white">Аккаунты:</strong> добавьте прокси и авторизуйте аккаунт мессенджера <span className="text-accent bg-zinc-950 px-1 border border-zinc-700">Max</span> по QR-коду.</li>
                <li><strong className="text-white">Очередь чатов:</strong> добавьте ссылки на чаты (вида web.max.ru/...).</li>
                <li><strong className="text-white">Режим парсинга:</strong> кнопка <Activity className="inline-block" size={10}/> напротив чата позволяет выбрать:
                  <div className="mt-2 pl-2 space-y-1">
                    <div className="text-green-500 font-bold py-1">«Зеленый статус» — собираются абсолютно все сообщения.</div>
                    <div className="text-yellow-500 font-bold py-1">«Желтый статус» — только целевые (подходящие под категории).</div>
                  </div>
                </li>
              </ul>
            </div>
            <button onClick={() => setShowHelp(false)} className="mt-8 w-full py-3 bg-zinc-950 hover:bg-zinc-700 text-white font-bold uppercase tracking-widest text-xs transition-colors border border-zinc-700">
              Понятно, закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
