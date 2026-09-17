import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createStore } from './store.mjs';
import { InputError, createSession, digest, equalSecret, httpsOrigin, issueKey, keyIdentity, SESSION_SECONDS, validSession, validateInstance, validateReport } from './core.mjs';

const cookieName = 'smart_leads_operator';
const assets = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/app.js', ['app.js', 'text/javascript; charset=utf-8']], ['/style.css', ['style.css', 'text/css; charset=utf-8']]]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function bodyJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new InputError('Требуется application/json');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_384) throw new InputError('Слишком большой запрос');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new InputError('Некорректный JSON'); }
}

export async function createOperatorServer({ store, adminKey, origin, production = true }) {
  if (!adminKey || adminKey.trim().length < 32 || adminKey.length > 512) throw new Error('Задайте OPERATOR_ADMIN_KEY: случайный ключ от 32 до 512 символов');
  origin = httpsOrigin(origin, !production);
  const staticFiles = new Map(await Promise.all([...assets].map(async ([path, [file, type]]) => [path, { data: await readFile(new URL(`./public/${file}`, import.meta.url)), type }])));
  const sessionSecret = digest(`operator-session:${adminKey}`);
  // Ограничение по адресу соединения; X-Forwarded-For не считается доверенным.
  const attempts = new Map();
  function limited(req) {
    const now = Date.now();
    for (const [key, entry] of attempts) if (entry.until < now) attempts.delete(key);
    const key = req.socket.remoteAddress || 'unknown';
    const entry = attempts.get(key) || { count: 0, until: now + 60_000 };
    if (attempts.size >= 10_000 && !attempts.has(key)) return true;
    entry.count += 1;
    attempts.set(key, entry);
    return entry.count > 20;
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    function json(status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
    function cookie(value, maxAge) { res.setHeader('Set-Cookie', `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${production ? '; Secure' : ''}`); }
    try {
      const url = new URL(req.url, origin);
      const path = url.pathname;
      if (req.method === 'GET' && path === '/api/health') { await store.health(); return json(200, { ok: true }); }
      if (req.method === 'GET' && staticFiles.has(path)) {
        const asset = staticFiles.get(path);
        res.writeHead(200, { 'Content-Type': asset.type }); return res.end(asset.data);
      }
      if (req.method === 'POST' && path === '/api/instance-report') {
        const key = req.headers.authorization?.replace(/^Bearer /, '');
        const id = keyIdentity(key);
        if (!id) return json(401, { error: 'Ключ экземпляра недействителен' });
        const report = validateReport(await bodyJson(req));
        if (!await store.report(id, digest(key), report)) return json(401, { error: 'Ключ экземпляра недействителен' });
        return json(200, { ok: true });
      }
      // Все изменения из браузера требуют точного Origin, включая вход и выход.
      if (req.method !== 'GET' && req.headers.origin !== origin) return json(403, { error: 'Источник запроса не разрешён' });
      if (path === '/api/login' && req.method === 'POST') {
        if (limited(req)) { res.setHeader('Retry-After', '60'); return json(429, { error: 'Слишком много попыток. Повторите через минуту' }); }
        const body = await bodyJson(req);
        if (!equalSecret(body?.key, adminKey)) return json(401, { error: 'Неверный ключ входа' });
        cookie(createSession(sessionSecret), SESSION_SECONDS);
        return json(200, { ok: true });
      }
      if (path === '/api/logout' && req.method === 'POST') { cookie('', 0); return json(200, { ok: true }); }
      const token = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
      if (!validSession(token, sessionSecret)) return json(401, { error: 'Войдите в панель оператора' });
      if (path === '/api/session' && req.method === 'GET') return json(200, { ok: true, origin });
      if (path === '/api/instances' && req.method === 'GET') {
        const page = Number(url.searchParams.get('page') || 1);
        const search = url.searchParams.get('q') || '';
        if (!Number.isSafeInteger(page) || page < 1 || page > 100_000 || search.length > 160) throw new InputError('Некорректные параметры поиска');
        return json(200, await store.list(search, page));
      }
      if (path === '/api/instances' && req.method === 'POST') {
        const data = validateInstance(await bodyJson(req));
        const issued = issueKey();
        const instance = await store.create(data, issued);
        return json(201, { instance, key: issued.key, controlUrl: origin });
      }
      const match = /^\/api\/instances\/([^/]+)(?:\/(rotate-key|revoke-key|audit))?$/.exec(path);
      if (!match || !uuid.test(match[1])) return json(404, { error: 'Не найдено' });
      const [, id, action] = match;
      if (req.method === 'GET' && action === 'audit') return json(200, { events: await store.audit(id) });
      if ((!action && req.method === 'PATCH') || (['rotate-key', 'revoke-key'].includes(action) && req.method === 'POST')) {
        const body = await bodyJson(req);
        if (!Number.isSafeInteger(body?.revision) || body.revision < 1) throw new InputError('Обновите карточку перед сохранением');
        const issued = action === 'rotate-key' ? issueKey(id) : null;
        const instance = action ? await store.changeKey(id, body.revision, issued?.keyHash || null) : await store.update(id, body.revision, validateInstance(body));
        if (!instance) return json(409, { error: 'Карточка уже изменена. Обновите список и откройте её заново' });
        return json(200, { instance, ...(issued ? { key: issued.key, controlUrl: origin } : {}) });
      }
      return json(405, { error: 'Метод не поддерживается' });
    } catch (error) {
      if (res.destroyed || res.writableEnded) return;
      if (error instanceof InputError) return json(400, { error: error.message });
      if (error.code === '23505') return json(409, { error: 'Экземпляр с таким доменом уже зарегистрирован' });
      // Не выводим тело запроса, строки подключения, токены или ошибки драйвера.
      console.error('[ПАНЕЛЬ] Запрос не выполнен');
      return json(503, { error: 'Сервис временно недоступен. Повторите запрос' });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.timeout = 20_000;
  return server;
}

async function main() {
  const { OPERATOR_DATABASE_URL, OPERATOR_ADMIN_KEY, OPERATOR_PUBLIC_URL } = process.env;
  if (!OPERATOR_DATABASE_URL) throw new Error('Задайте OPERATOR_DATABASE_URL отдельной базы реестра');
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Некорректный PORT');
  const store = createStore(OPERATOR_DATABASE_URL);
  const server = await createOperatorServer({ store, adminKey: OPERATOR_ADMIN_KEY, origin: OPERATOR_PUBLIC_URL, production: process.env.NODE_ENV !== 'development' });
  await store.migrate();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, process.env.OPERATOR_HOST || '0.0.0.0', resolve); });
  console.log(`[ПАНЕЛЬ] Сервер запущен на порту ${port}`);
  let closing = false;
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
    if (closing) return;
    closing = true;
    server.close(() => { void store.close(); });
    setTimeout(() => process.exit(1), 15_000).unref();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('[ПАНЕЛЬ] Запуск не выполнен. Проверьте OPERATOR_DATABASE_URL, OPERATOR_ADMIN_KEY и OPERATOR_PUBLIC_URL'); process.exitCode = 1; });
