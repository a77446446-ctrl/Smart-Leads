'use strict';
const $ = id => document.getElementById(id);
const labels = { connected: 'На связи', waiting: 'Ожидает подключения', unknown: 'Нет свежих данных', revoked: 'Ключ отозван' };
const services = { active: 'Активно', paused: 'Пауза', archived: 'Архив' };
let page = 1, search = '', items = [], selected = null, requestId = 0, noticeTimer, authenticated = false;
const number = value => new Intl.NumberFormat('ru-RU').format(value);
const day = value => value ? new Date(value).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }) : 'Не указано';
const time = value => value ? new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' }) : 'Нет данных';
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date());

function notice(message, error = false) {
  clearTimeout(noticeTimer); $('notice').textContent = message; $('notice').classList.toggle('error', error); $('notice').hidden = false;
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, error ? 10_000 : 5000);
}
function element(tag, text, className) { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; }
async function api(path, method = 'GET', body) {
  const response = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000) });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/login') showLogin();
    throw new Error(data.error || 'Не удалось выполнить запрос');
  }
  return data;
}
function showLogin() {
  authenticated = false; requestId++; items = []; selected = null;
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  $('key-block').textContent = ''; $('rows').replaceChildren(); $('login').hidden = false; $('workspace').hidden = true;
}
async function reload() {
  const current = ++requestId;
  $('list-status').textContent = 'Обновление…';
  try {
    const data = await api(`/api/instances?page=${page}&q=${encodeURIComponent(search)}`);
    if (current !== requestId || !authenticated) return;
    if (page > 1 && data.instances.length === 0) { page--; return reload(); }
    items = data.instances;
    for (const name of ['total', 'connected', 'attention', 'unpaid']) $(`stat-${name}`).textContent = number(data.summary[name]);
    $('list-count').textContent = number(data.total); $('page-number').textContent = String(page);
    $('prev').disabled = page === 1; $('next').disabled = page * 30 >= data.total;
    $('list-status').textContent = `Показано ${items.length} из ${data.total} · Обновлено ${time(new Date())} МСК`;
    $('empty').hidden = items.length > 0;
    $('empty').querySelector('h3').textContent = search ? 'Ничего не найдено' : 'Начните с первого экземпляра';
    $('empty').querySelector('p').textContent = search ? 'Измените запрос и повторите поиск.' : 'Создайте карточку клиента, получите ключ и добавьте его в приложение в Coolify.';
    $('rows').replaceChildren(...items.map(row => {
      const tr = document.createElement('tr');
      const app = document.createElement('td'); app.append(element('span', row.name, 'app-title'), element('small', row.customer));
      const link = element('a', row.domain, 'domain'); link.href = row.domain; link.target = '_blank'; link.rel = 'noreferrer'; app.append(link);
      const status = document.createElement('td'); status.append(element('span', labels[row.connectionStatus], `badge ${row.connectionStatus}`));
      if (row.report?.version) status.append(element('div', `Версия ${row.report.version}`, 'status-text'));
      const seen = element('td', time(row.lastSeenAt));
      const service = document.createElement('td'); service.append(element('span', row.plan || 'Без тарифа'), element('small', `${number(row.monthlyFeeKopecks / 100)} ₽ / мес. · ${services[row.serviceStatus]}`));
      const payment = element('td', day(row.paidUntil), row.serviceStatus === 'active' && (!row.paidUntil || row.paidUntil < today()) ? 'unpaid' : '');
      const action = document.createElement('td'); const button = element('button', 'Открыть →', 'text-button'); button.addEventListener('click', () => openEditor(row)); action.append(button);
      tr.append(app, status, seen, service, payment, action); return tr;
    }));
  } catch (error) { if (current === requestId) { $('list-status').textContent = 'Не удалось обновить. Показанные данные могут устареть.'; notice(error.message, true); } }
}
function switchView(view) {
  $('instances-view').hidden = view !== 'instances'; $('guide-view').hidden = view !== 'guide';
  $('breadcrumb').textContent = view === 'guide' ? 'Инструкции и настройки' : 'Экземпляры';
  document.querySelectorAll('.nav-button').forEach(button => button.classList.toggle('active', button.dataset.view === view));
}
function openEditor(row = null) {
  selected = row; $('instance-form').reset();
  const initial = row ? { ...row, monthlyFeeRub: String(row.monthlyFeeKopecks / 100) } : { monthlyFeeRub: '0', serviceStatus: 'active' };
  for (const [name, value] of Object.entries(initial)) { const field = $('instance-form').elements.namedItem(name); if (field) field.value = value ?? ''; }
  $('editor-title').textContent = row ? row.name : 'Новый экземпляр';
  $('save').textContent = row ? 'Сохранить изменения' : 'Создать и получить ключ';
  $('save-hint').textContent = row ? 'Изменения сохраняются в журнале.' : 'После создания вы получите ключ подключения.';
  for (const id of ['metrics', 'key-actions', 'audit-section']) $(id).hidden = !row;
  $('instance-form').elements.backupAt.max = today(); $('instance-form').elements.restoreAt.max = today();
  if (row) {
    $('instance-id').textContent = `ID: ${row.id} · ${labels[row.connectionStatus]} · ${time(row.lastSeenAt)} МСК`;
    const report = row.report;
    const metrics = report ? [['Версия приложения', report.version], ['Материалов', number(report.materials)], ['Пользователей', number(report.users)], ['Очередь MAX', number(report.queuePending)], ['Ошибок доставки MAX', number(report.queueFailed)], ['Объём базы', `${number(Math.round(report.databaseBytes / 1024 / 1024))} МБ`], ['Успешный сбор', time(report.lastParserSuccessAt) + ' МСК']] : [['Состояние', 'Отчёт ещё не получен']];
    $('metric-grid').replaceChildren(...metrics.map(([name, value]) => { const item = element('div', name); item.append(element('strong', value)); return item; }));
    $('revoke').disabled = row.connectionStatus === 'revoked';
    $('audit').textContent = 'Загрузка журнала…';
    void api(`/api/instances/${row.id}/audit`).then(data => {
      if (selected?.id !== row.id) return;
      const actions = { created: 'Экземпляр создан', updated: 'Карточка обновлена', key_rotated: 'Выпущен новый ключ', key_revoked: 'Ключ отозван' };
      $('audit').replaceChildren(...data.events.map(event => {
        let message = `${time(event.createdAt)} МСК · ${actions[event.action] || event.action}`;
        if (event.action === 'updated' && event.details?.previous && event.details?.current) {
          if (event.details.previous.paid_until !== event.details.current.paid_until) message += ` · Оплачено по: ${day(event.details.previous.paid_until)} → ${day(event.details.current.paid_until)}`;
          if (event.details.previous.monthly_fee_kopecks !== event.details.current.monthly_fee_kopecks) message += ` · Стоимость: ${number(event.details.previous.monthly_fee_kopecks / 100)} → ${number(event.details.current.monthly_fee_kopecks / 100)} ₽`;
        }
        return element('p', message);
      }));
    }).catch(error => { if (selected?.id === row.id) $('audit').textContent = error.message; });
  }
  $('editor').showModal();
}
function showKey(data) {
  $('key-block').textContent = `SMART_LEADS_CONTROL_URL=${data.controlUrl}\nSMART_LEADS_INSTANCE_KEY=${data.key}`;
  $('key-dialog').showModal();
}
function formBusy(busy) { $('editor-close').disabled = busy; $('save').disabled = busy; $('rotate').disabled = busy; $('revoke').disabled = busy || selected?.connectionStatus === 'revoked'; }
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try { await api('/api/login', 'POST', { key: $('admin-key').value }); $('admin-key').value = ''; authenticated = true; $('login').hidden = true; $('workspace').hidden = false; await reload(); }
  catch (error) { notice(error.message, true); } finally { button.disabled = false; }
});
$('logout').addEventListener('click', async () => { try { await api('/api/logout', 'POST', {}); showLogin(); } catch (error) { notice(error.message, true); } });
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
for (const id of ['create', 'empty-create']) $(id).addEventListener('click', () => openEditor());
$('editor-close').addEventListener('click', () => $('editor').close());
$('editor').addEventListener('cancel', event => { if ($('save').disabled) event.preventDefault(); });
$('refresh').addEventListener('click', reload);
$('prev').addEventListener('click', () => { page--; void reload(); });
$('next').addEventListener('click', () => { page++; void reload(); });
$('search-form').addEventListener('submit', event => { event.preventDefault(); search = $('search').value.trim(); page = 1; void reload(); });
$('instance-form').addEventListener('submit', async event => {
  event.preventDefault(); formBusy(true);
  try {
    const body = Object.fromEntries(new FormData(event.currentTarget));
    if (selected) body.revision = selected.revision;
    const data = await api(selected ? `/api/instances/${selected.id}` : '/api/instances', selected ? 'PATCH' : 'POST', body);
    $('editor').close(); if (data.key) showKey(data); else notice('Изменения сохранены');
    await reload();
  } catch (error) { notice(error.message, true); } finally { formBusy(false); }
});
async function changeKey(action) {
  if (!selected) return;
  const message = action === 'rotate-key' ? 'Старый ключ перестанет работать сразу. После выпуска вставьте новый ключ в Coolify этого клиента. Продолжить?' : 'Прекратить приём отчётов этого экземпляра? Само клиентское приложение продолжит работу.';
  if (!confirm(message)) return;
  formBusy(true);
  try {
    const data = await api(`/api/instances/${selected.id}/${action}`, 'POST', { revision: selected.revision });
    $('editor').close(); if (data.key) showKey(data); else notice('Ключ отозван'); await reload();
  } catch (error) { notice(error.message, true); } finally { formBusy(false); }
}
$('rotate').addEventListener('click', () => changeKey('rotate-key'));
$('revoke').addEventListener('click', () => changeKey('revoke-key'));
$('copy-key').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('key-block').textContent); notice('Переменные скопированы'); }
  catch { notice('Выделите блок и скопируйте вручную: Ctrl+C', true); }
});
$('key-close').addEventListener('click', () => { $('key-dialog').close(); });
$('key-dialog').addEventListener('cancel', event => { event.preventDefault(); notice('Сохраните ключ и нажмите «Я сохранил ключ»'); });
$('key-dialog').addEventListener('close', () => { $('key-block').textContent = ''; });
void api('/api/session').then(async () => { authenticated = true; $('login').hidden = true; $('workspace').hidden = false; await reload(); }).catch(() => showLogin());
setInterval(() => { if (authenticated && !document.hidden && !document.querySelector('dialog[open]') && !$('instances-view').hidden) void reload(); }, 60_000);
