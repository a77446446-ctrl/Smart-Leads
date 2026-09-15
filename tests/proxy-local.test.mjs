import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import { loadTs } from './helpers/load-ts.mjs';
import { normalizeProxyUrl } from '../src/lib/proxy.ts';
import * as pythonRuntime from '../src/lib/python-runtime.ts';

function route(name, denied = null) {
  return loadTs(`src/app/api/admin/auth/${name}/route.ts`, {
    '@/lib/auth/admin-guard': { adminGuard: async () => denied },
    '@/lib/parser-accounts': { safeParserError: String },
    '@/lib/proxy-draft': { resolveProxyInput: normalizeProxyUrl },
    '@/lib/python-runtime': pythonRuntime,
    'next/server': { NextResponse: { json: Response.json } },
  }).POST;
}

async function withProxy(protocol, reject, callback) {
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let buffer = Buffer.alloc(0);
    let greeted = false;
    socket.on('data', data => {
      buffer = Buffer.concat([buffer, data]);
      if (protocol === 'http') {
        if (!buffer.includes('\r\n\r\n')) return;
        socket.end(reject ? 'HTTP/1.1 407 Proxy Authentication Required\r\n\r\n' : 'HTTP/1.1 200 Connection Established\r\n\r\n');
      } else {
        if (!greeted) {
          if (buffer.length < 2 || buffer.length < 2 + buffer[1]) return;
          buffer = buffer.subarray(2 + buffer[1]);
          greeted = true;
          socket.write(Buffer.from([5, 0]));
        }
        if (buffer.length >= 5 && buffer.length >= 7 + buffer[4]) {
          socket.end(Buffer.from([5, reject ? 5 : 0, 0, 1, 127, 0, 0, 1, 1, 187]));
        }
      }
    });
  });
  await new Promise((resolve, rejectListen) => { server.once('error', rejectListen); server.listen(0, '127.0.0.1', resolve); });
  try {
    await callback(`${protocol === 'http' ? 'http' : 'socks5'}://127.0.0.1:${server.address().port}`);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }
}

const request = proxy => new Request('http://localhost/api/admin/auth/proxy-check', { method: 'POST', body: JSON.stringify({ proxy }) });

test('локальная диагностика: реальные Python-скрипты различают успех и отказ HTTP/SOCKS5', async () => {
  // Эмуляторы слушают только loopback; соединений с MAX и реальными прокси нет.
  for (const protocol of ['http', 'socks5']) {
    for (const reject of [false, true]) {
      await withProxy(protocol, reject, async proxy => {
        const response = await route('proxy-diagnose')(request(proxy));
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.success, !reject, JSON.stringify(result));
        assert.ok(result.steps.length >= 3);
        assert.equal(result.steps.at(-1).ok, !reject);
        if (protocol === 'socks5') {
          const checked = await (await route('proxy-check')(request(proxy))).json();
          assert.equal(checked.valid, !reject, JSON.stringify(checked));
        }
      });
    }
  }
});

test('диагностика и проверка прокси сохраняют отказ доступа администратора', async () => {
  for (const name of ['proxy-check', 'proxy-diagnose']) {
    for (const status of [401, 403]) {
      assert.equal((await route(name, Response.json({}, { status }))(request('invalid'))).status, status);
    }
  }
});
