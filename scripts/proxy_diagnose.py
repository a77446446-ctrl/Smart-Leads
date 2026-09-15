"""Пошаговая диагностика прокси-соединения."""

import json
import os
import socket
import struct
import sys
import time


def step(name, func):
    """Выполняет шаг диагностики и возвращает результат."""
    start = time.monotonic()
    try:
        result = func()
        elapsed = round((time.monotonic() - start) * 1000)
        return {"step": name, "ok": True, "ms": elapsed, "detail": result}
    except Exception as error:
        elapsed = round((time.monotonic() - start) * 1000)
        return {"step": name, "ok": False, "ms": elapsed, "error": f"{type(error).__name__}: {error}"}


def diagnose(host, port, username=None, password=None, protocol="socks5"):
    results = []

    # 1. DNS resolution
    def resolve():
        addr = socket.getaddrinfo(host, port, socket.AF_UNSPEC, socket.SOCK_STREAM)
        return f"Resolved to {addr[0][4][0]}"
    results.append(step("DNS resolve", resolve))
    if not results[-1]["ok"]:
        return results

    # 2. TCP connection
    sock = [None]
    def tcp_connect():
        s = socket.create_connection((host, port), timeout=10)
        sock[0] = s
        return f"TCP connected to {host}:{port}"
    results.append(step("TCP connect", tcp_connect))
    if not results[-1]["ok"]:
        return results

    s = sock[0]

    if protocol == "socks5":
        # 3. SOCKS5 greeting
        def socks5_greeting():
            if username and password:
                s.sendall(b"\x05\x02\x00\x02")  # support no-auth and user/pass
            else:
                s.sendall(b"\x05\x01\x00")  # support no-auth only
            response = s.recv(2)
            if len(response) < 2:
                raise ConnectionError(f"Получено {len(response)} байт вместо 2")
            version, method = response[0], response[1]
            if version != 5:
                raise ConnectionError(f"SOCKS версия {version}, ожидалось 5")
            method_names = {0: "NO_AUTH", 2: "USERNAME_PASSWORD", 255: "NO_ACCEPTABLE"}
            return f"SOCKS5 method: {method_names.get(method, method)}"
        results.append(step("SOCKS5 greeting", socks5_greeting))
        if not results[-1]["ok"]:
            s.close()
            return results

        # 4. SOCKS5 auth (if required)
        if username and password and "USERNAME_PASSWORD" in results[-1].get("detail", ""):
            def socks5_auth():
                u = username.encode("utf-8")
                p = password.encode("utf-8")
                s.sendall(bytes([1, len(u)]) + u + bytes([len(p)]) + p)
                response = s.recv(2)
                if len(response) < 2:
                    raise ConnectionError(f"Auth: получено {len(response)} байт")
                if response[1] != 0:
                    raise PermissionError(f"Auth отклонён, код: {response[1]}")
                return "Авторизация успешна"
            results.append(step("SOCKS5 auth", socks5_auth))
            if not results[-1]["ok"]:
                s.close()
                return results

        # 5. SOCKS5 CONNECT to web.max.ru:443
        def socks5_connect():
            target_host = b"web.max.ru"
            request = b"\x05\x01\x00\x03" + bytes([len(target_host)]) + target_host + struct.pack("!H", 443)
            s.sendall(request)
            response = s.recv(10)
            if len(response) < 2:
                raise ConnectionError(f"Connect: получено {len(response)} байт")
            if response[1] != 0:
                error_codes = {
                    1: "General failure", 2: "Not allowed", 3: "Network unreachable",
                    4: "Host unreachable", 5: "Connection refused", 6: "TTL expired",
                    7: "Command not supported", 8: "Address not supported",
                }
                raise ConnectionError(f"CONNECT отклонён: {error_codes.get(response[1], response[1])}")
            return "CONNECT к web.max.ru:443 успешен"
        results.append(step("SOCKS5 CONNECT", socks5_connect))

    elif protocol == "http":
        # 3. HTTP CONNECT
        def http_connect():
            connect_request = f"CONNECT web.max.ru:443 HTTP/1.1\r\nHost: web.max.ru:443\r\n"
            if username and password:
                import base64
                creds = base64.b64encode(f"{username}:{password}".encode()).decode()
                connect_request += f"Proxy-Authorization: Basic {creds}\r\n"
            connect_request += "\r\n"
            s.sendall(connect_request.encode())
            response = b""
            while b"\r\n\r\n" not in response and len(response) < 4096:
                chunk = s.recv(1024)
                if not chunk:
                    break
                response += chunk
            status_line = response.split(b"\r\n")[0].decode(errors="replace")
            if b"200" in response.split(b"\r\n")[0]:
                return f"HTTP CONNECT успешен: {status_line}"
            raise ConnectionError(f"HTTP CONNECT отклонён: {status_line}")
        results.append(step("HTTP CONNECT", http_connect))

    s.close()
    return results


def main():
    proxy_url = os.environ.get("TEST_PROXY_URL")
    if not proxy_url:
        print(json.dumps({"error": "TEST_PROXY_URL не задан"}))
        return 1

    from proxy_runtime import parse_proxy_url
    config = parse_proxy_url(proxy_url)
    if not config:
        print(json.dumps({"error": "Не удалось разобрать URL прокси"}))
        return 1

    results = diagnose(
        host=config["host"],
        port=config["port"],
        username=config.get("username"),
        password=config.get("password"),
        protocol=config["protocol"],
    )

    # Summary
    all_ok = all(r["ok"] for r in results)
    output = {"success": all_ok, "steps": results}
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
