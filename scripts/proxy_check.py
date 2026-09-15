"""Проверка SOCKS5/HTTP-прокси без вывода реквизитов."""

import os
import socket
import ssl
import sys
import urllib.request

import socks

from proxy_runtime import parse_proxy_url


def check_socks5(config):
    connection = socks.create_connection(
        ("web.max.ru", 443),
        timeout=12,
        proxy_type=socks.SOCKS5,
        proxy_addr=config["host"],
        proxy_port=config["port"],
        proxy_rdns=True,
        proxy_username=config.get("username"),
        proxy_password=config.get("password"),
    )
    connection.close()


def check_http(proxy_url):
    request = urllib.request.Request("https://web.max.ru", headers={"User-Agent": "MAKS-Lead-Hub-Proxy-Check/1.0"})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url}))
    with opener.open(request, timeout=15) as response:
        if response.status >= 500:
            raise ConnectionError("MAX недоступен через HTTP-прокси")


def public_error(error):
    if isinstance(error, socks.SOCKS5AuthError):
        return "SOCKS5 отклонил логин или пароль"
    if isinstance(error, socks.ProxyConnectionError):
        return "Сервер SOCKS5 недоступен с сервера приложения"
    if isinstance(error, socket.gaierror):
        return "Не удалось определить адрес прокси"
    if isinstance(error, (socket.timeout, TimeoutError)):
        return "Прокси не ответил за отведённое время"
    if isinstance(error, ssl.SSLError):
        return "Прокси не установил защищённое соединение"
    return "Прокси не установил соединение с MAX"


def main():
    proxy_url = os.environ.get("TEST_PROXY_URL")
    if not proxy_url:
        print("Прокси не задан", file=sys.stderr)
        return 2
    config = parse_proxy_url(proxy_url)
    if config["protocol"] == "socks5":
        check_socks5(config)
    else:
        check_http(proxy_url)
    print("RESULT: VALID")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(public_error(error), file=sys.stderr)
        sys.exit(1)
