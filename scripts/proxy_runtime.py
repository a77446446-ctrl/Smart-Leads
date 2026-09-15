"""Общая безопасная настройка HTTP/SOCKS5-прокси для Playwright."""

import asyncio
import threading
from urllib.parse import unquote, urlsplit


def parse_proxy_url(proxy_url):
    if not proxy_url or proxy_url == "direct":
        return None
    parsed = urlsplit(proxy_url)
    protocol = parsed.scheme.lower()
    if protocol not in {"http", "https", "socks5", "socks5h"}:
        raise ValueError("Неподдерживаемый протокол прокси")
    if not parsed.hostname or parsed.port is None:
        raise ValueError("Для прокси обязательны хост и порт")
    return {
        "protocol": "socks5" if protocol in {"socks5", "socks5h"} else "http",
        "host": parsed.hostname,
        "port": parsed.port,
        "username": unquote(parsed.username) if parsed.username else None,
        "password": unquote(parsed.password) if parsed.password else None,
    }


async def _pipe(reader, writer):
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except (asyncio.CancelledError, ConnectionResetError, BrokenPipeError, OSError):
        pass
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def _handle_client(local_reader, local_writer, config):
    remote_writer = None
    try:
        greeting = await asyncio.wait_for(local_reader.readexactly(2), timeout=10)
        methods = await asyncio.wait_for(local_reader.readexactly(greeting[1]), timeout=10)
        if greeting[0] != 5 or 0 not in methods:
            return
        local_writer.write(b"\x05\x00")
        await local_writer.drain()

        header = await asyncio.wait_for(local_reader.readexactly(4), timeout=10)
        if header[0] != 5 or header[1] != 1:
            return
        address_type = header[3]
        if address_type == 1:
            address = await local_reader.readexactly(4)
        elif address_type == 3:
            size = await local_reader.readexactly(1)
            address = size + await local_reader.readexactly(size[0])
        elif address_type == 4:
            address = await local_reader.readexactly(16)
        else:
            return
        port = await local_reader.readexactly(2)
        request = header + address + port

        remote_reader, remote_writer = await asyncio.wait_for(
            asyncio.open_connection(config["host"], config["port"]), timeout=15
        )
        remote_writer.write(b"\x05\x01\x02")
        await remote_writer.drain()
        response = await asyncio.wait_for(remote_reader.readexactly(2), timeout=10)
        if response != b"\x05\x02":
            raise ConnectionError("Прокси не поддерживает авторизацию")

        username = config["username"].encode("utf-8")
        password = config["password"].encode("utf-8")
        if len(username) > 255 or len(password) > 255:
            raise ValueError("Слишком длинные реквизиты прокси")
        remote_writer.write(bytes([1, len(username)]) + username + bytes([len(password)]) + password)
        await remote_writer.drain()
        auth_response = await asyncio.wait_for(remote_reader.readexactly(2), timeout=10)
        if auth_response[1] != 0:
            raise PermissionError("Прокси отклонил авторизацию")

        remote_writer.write(request)
        await remote_writer.drain()
        connect_header = await asyncio.wait_for(remote_reader.readexactly(4), timeout=15)
        reply_type = connect_header[3]
        if reply_type == 1:
            reply_address = await remote_reader.readexactly(4)
        elif reply_type == 3:
            size = await remote_reader.readexactly(1)
            reply_address = size + await remote_reader.readexactly(size[0])
        elif reply_type == 4:
            reply_address = await remote_reader.readexactly(16)
        else:
            raise ConnectionError("Некорректный ответ SOCKS5")
        reply_port = await remote_reader.readexactly(2)
        local_writer.write(connect_header + reply_address + reply_port)
        await local_writer.drain()
        if connect_header[1] != 0:
            return
        await asyncio.gather(_pipe(local_reader, remote_writer), _pipe(remote_reader, local_writer))
    except Exception:
        try:
            local_writer.write(b"\x05\x01\x00\x01\x00\x00\x00\x00\x00\x00")
            await local_writer.drain()
        except Exception:
            pass
    finally:
        try:
            local_writer.close()
        except Exception:
            pass
        if remote_writer:
            try:
                remote_writer.close()
            except Exception:
                pass


class Socks5RelayThread:
    def __init__(self, config):
        self.config = config
        self.local_port = None
        self._loop = None
        self._server = None
        self._ready = threading.Event()
        self._thread = None

    def start(self):
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        if not self._ready.wait(timeout=10) or not self.local_port:
            raise ConnectionError("Не удалось запустить локальный SOCKS5 relay")
        return self.local_port

    def _run(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._loop.run_until_complete(self._serve())

    async def _serve(self):
        async def on_client(reader, writer):
            await _handle_client(reader, writer, self.config)

        self._server = await asyncio.start_server(on_client, "127.0.0.1", 0)
        self.local_port = self._server.sockets[0].getsockname()[1]
        self._ready.set()
        await self._server.serve_forever()

    def stop(self):
        if self._server and self._loop:
            self._loop.call_soon_threadsafe(self._server.close)


def build_playwright_proxy(proxy_url):
    config = parse_proxy_url(proxy_url)
    if not config:
        return None, None
    username = config.get("username")
    password = config.get("password")
    if config["protocol"] == "socks5" and username and password:
        relay = Socks5RelayThread(config)
        port = relay.start()
        return {"server": f"socks5://127.0.0.1:{port}"}, relay
    server = f"{config['protocol']}://{config['host']}:{config['port']}"
    proxy = {"server": server}
    if config["protocol"] == "http" and username and password:
        proxy.update({"username": username, "password": password})
    return proxy, None

