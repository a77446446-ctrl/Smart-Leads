import os
import requests

proxy_str = os.environ.get("TEST_PROXY_URL")
if not proxy_str:
    raise SystemExit("Укажите TEST_PROXY_URL в переменных окружения")

proxies = {
    "http": proxy_str,
    "https": proxy_str
}

print("Testing configured proxy")
try:
    print("Fetching IP through proxy...")
    res = requests.get("https://api.ipify.org", proxies=proxies, timeout=10)
    print("IP via proxy:", res.text)
    print("Fetching web.max.ru through proxy...")
    res2 = requests.get("https://web.max.ru", proxies=proxies, timeout=10)
    print("Status:", res2.status_code)
except Exception as exc:
    print("Error:", str(exc))
