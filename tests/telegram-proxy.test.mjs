import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { loadTs } from './helpers/load-ts.mjs';

const TOKEN = 'https://oauth.telegram.org/token';
const KEYS = 'https://oauth.telegram.org/.well-known/jwks.json';

function setup(context) {
  const previous = process.env.TELEGRAM_PROXY_URL;
  delete process.env.TELEGRAM_PROXY_URL;
  context.after(() => {
    if (previous === undefined) delete process.env.TELEGRAM_PROXY_URL;
    else process.env.TELEGRAM_PROXY_URL = previous;
  });
  const calls = [];
  const agents = [];
  class ProxyAgent {
    constructor(options) { this.options = options; this.closed = false; agents.push(this); }
    async close() { this.closed = true; }
  }
  const transport = loadTs('src/lib/auth/telegram-http.ts', {
    'server-only': {},
    undici: {
      ProxyAgent,
      fetch: async (url, options) => {
        calls.push({ url, options });
        return new Response('{}');
      },
    },
  });
  return { ...transport, calls, agents };
}

test('без прокси Telegram использует прямое соединение с тайм-аутом и запретом редиректов', async (context) => {
  const transport = setup(context);
  const direct = context.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, KEYS);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response('{"keys":[]}');
  });
  assert.deepEqual(await (await transport.fetchTelegram(KEYS)).json(), { keys: [] });
  assert.equal(direct.mock.callCount(), 1);
  assert.equal(transport.agents.length, 0);
});

test('прокси отделяет свои реквизиты от Telegram и сохраняет POST и PKCE', async (context) => {
  const transport = setup(context);
  const direct = context.mock.method(globalThis, 'fetch', async () => { throw new Error('Прямой запрос запрещён'); });
  process.env.TELEGRAM_PROXY_URL = 'http://proxy-user:p%40ss%3Aword@proxy.example:8080';
  const body = new URLSearchParams({ code: 'test-code', code_verifier: 'test-verifier' });
  await transport.fetchTelegram(TOKEN, { method: 'POST', headers: { Authorization: 'Basic telegram-secret' }, body });
  await transport.fetchTelegram(KEYS);
  assert.equal(direct.mock.callCount(), 0);
  assert.equal(transport.agents.length, 1);
  assert.deepEqual(transport.agents[0].options, {
    uri: 'http://proxy.example:8080',
    token: 'Basic ' + Buffer.from('proxy-user:p@ss:word').toString('base64'),
  });
  assert.equal(transport.calls[0].options.headers.Authorization, 'Basic telegram-secret');
  assert.equal(transport.calls[0].options.body, body);
  assert.equal(transport.calls[0].options.method, 'POST');
  assert.equal(transport.calls[0].options.redirect, 'error');
  assert.equal(transport.calls[1].options.dispatcher, transport.agents[0]);
});

test('HTTPS-прокси без пароля поддерживается, смена и отключение закрывают прежний агент', async (context) => {
  const transport = setup(context);
  context.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  process.env.TELEGRAM_PROXY_URL = 'https://proxy.example:8443';
  await transport.fetchTelegram(KEYS);
  assert.deepEqual(transport.agents[0].options, { uri: 'https://proxy.example:8443' });
  process.env.TELEGRAM_PROXY_URL = 'http://second.example:8080';
  await transport.fetchTelegram(KEYS);
  assert.equal(transport.agents[0].closed, true);
  delete process.env.TELEGRAM_PROXY_URL;
  await transport.fetchTelegram(KEYS);
  assert.equal(transport.agents[1].closed, true);
});

test('неверный прокси не раскрывает пароль и не переключается на прямое соединение', async (context) => {
  const transport = setup(context);
  const direct = context.mock.method(globalThis, 'fetch', async () => { throw new Error('Прямой запрос запрещён'); });
  for (const value of ['socks5://user:secret@proxy.example:1080', 'not-a-url-secret', 'http://user:secret@proxy.example/path', 'http://user:secret@proxy.example/?x=1', 'http://:secret@proxy.example', 'http://user:%ZZ@proxy.example']) {
    process.env.TELEGRAM_PROXY_URL = value;
    await assert.rejects(transport.fetchTelegram(KEYS), (error) => {
      assert.match(error.message, /TELEGRAM_PROXY_URL/);
      assert.doesNotMatch(error.message, /secret|proxy.example|%ZZ/);
      return true;
    });
  }
  assert.equal(direct.mock.callCount(), 0);
  assert.equal(transport.calls.length, 0);
});

test('транспорт запрещает посторонний адрес и скрывает исходную сетевую ошибку', async (context) => {
  const transport = setup(context);
  context.mock.method(globalThis, 'fetch', async () => { throw new Error('http://user:secret@proxy.example'); });
  await assert.rejects(transport.fetchTelegram('https://attacker.example/token'), /Недопустимый адрес/);
  await assert.rejects(transport.fetchTelegram(KEYS), (error) => {
    assert.match(error.message, /напрямую/);
    assert.doesNotMatch(error.message, /user|secret|proxy.example/);
    return true;
  });
});

test('настоящий HTTP-прокси получает CONNECT и свои реквизиты, но не секрет Telegram', async (context) => {
  const previous = process.env.TELEGRAM_PROXY_URL;
  const server = createServer();
  const connections = [];
  server.on('connect', (request, socket) => {
    connections.push({ target: request.url, headers: request.headers });
    socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  process.env.TELEGRAM_PROXY_URL = `http://test-user:test-password@127.0.0.1:${port}`;
  const transport = loadTs('src/lib/auth/telegram-http.ts', { 'server-only': {} });
  context.after(async () => {
    try {
      delete process.env.TELEGRAM_PROXY_URL;
      const direct = context.mock.method(globalThis, 'fetch', async () => new Response('{}'));
      await transport.fetchTelegram(KEYS);
      direct.mock.restore();
      await new Promise(resolve => server.close(resolve));
    } finally {
      if (previous === undefined) delete process.env.TELEGRAM_PROXY_URL;
      else process.env.TELEGRAM_PROXY_URL = previous;
    }
  });
  await assert.rejects(transport.fetchTelegram(TOKEN, {
    method: 'POST',
    headers: { Authorization: 'Basic telegram-client-secret' },
    body: new URLSearchParams({ code: 'telegram-code' }),
  }), /через прокси/);
  assert.ok(connections.length >= 1);
  for (const connection of connections) {
    assert.equal(connection.target, 'oauth.telegram.org:443');
    assert.equal(connection.headers['proxy-authorization'], 'Basic ' + Buffer.from('test-user:test-password').toString('base64'));
    assert.equal(connection.headers.authorization, undefined);
  }
});
