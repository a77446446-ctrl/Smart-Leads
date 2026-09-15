"""Изолированный worker чтения одного MAX-чата через один аккаунт."""

import hashlib
import json
import os
import random
import re
import sys
import time
import signal
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

def _handle_sigterm(*args):
    sys.exit(0)

signal.signal(signal.SIGTERM, _handle_sigterm)

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from proxy_runtime import build_playwright_proxy

SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
MAX_SESSION_BYTES = 10 * 1024 * 1024
DEBUG_ARTIFACTS = os.environ.get("PARSER_DEBUG_ARTIFACTS", "false").lower() == "true"
ALLOWED_MAX_HOSTS = {"max.ru", "web.max.ru"}


def result(chat_url, status, title=None, messages=None, error=None):
    payload = {
        "title": title,
        "messages": messages or [],
        "source_chat": chat_url,
        "status": status,
    }
    if error:
        payload["error"] = str(error).replace("\r", " ").replace("\n", " ")[:500]
    return payload


def normalize_chat_target(chat_url):
    """Проверяет URL повторно внутри worker и сохраняет регистр идентификатора чата."""
    if not isinstance(chat_url, str) or not chat_url.strip() or len(chat_url) > 2048:
        raise ValueError("Некорректная ссылка на чат MAX")

    parsed = urlsplit(chat_url.strip())
    hostname = (parsed.hostname or "").lower()
    try:
        port = parsed.port
    except ValueError as error:
        raise ValueError("Некорректный порт в ссылке MAX") from error

    if (
        parsed.scheme.lower() != "https"
        or hostname not in ALLOWED_MAX_HOSTS
        or port is not None
        or parsed.username
        or parsed.password
    ):
        raise ValueError("Разрешены только HTTPS-ссылки max.ru без авторизационных данных")

    fragment = parsed.fragment
    path = parsed.path or "/"
    query = parsed.query

    if fragment:
        # Настройки МАКС сохраняют URL в hash-формате (web.max.ru/a/#@name),
        # но MAX использует path-маршрутизацию (web.max.ru/name).
        # Преобразуем hash обратно в прямой путь.
        identifier = fragment[1:] if fragment.startswith(("@", "/")) else fragment
        if not identifier:
            raise ValueError("Ссылка MAX не содержит идентификатор чата")
        path = "/" + identifier
        fragment = ""
        query = ""
    elif path.lower() in {"/", "/a", "/a/"}:
        raise ValueError("Ссылка MAX не содержит идентификатор чата")

    return urlunsplit(("https", "web.max.ru", path, query, fragment))


def empty_chat_diagnostic(page, state):
    """Возвращает безопасную диагностику без идентификатора и полного URL чата."""
    current = urlsplit(page.url)
    title = " ".join((page.title() or "без заголовка").split())[:80]
    return (
        "Сообщения не найдены: "
        f"path={current.path or '/'}; "
        f"hash={current.fragment[:60] if current.fragment else 'нет'}; "
        f"shell={int(state.get('shell') or 0)}; "
        f"DOM-кандидаты={int(state.get('messages') or 0)}; "
        f"title={title}"
    )


def session_path(session_id):
    if not SESSION_ID_RE.fullmatch(session_id):
        raise ValueError("Некорректный идентификатор сессии")
    directory = Path(os.environ.get("PARSER_SESSIONS_DIR") or Path.cwd() / "sessions").resolve()
    target = (directory / f"{session_id}.json").resolve()
    if target.parent != directory:
        raise ValueError("Некорректный путь сессии")
    return target


def load_session(session_id):
    target = session_path(session_id)
    size = target.stat().st_size
    if size <= 0 or size > MAX_SESSION_BYTES:
        raise ValueError("Некорректный размер файла сессии")
    with target.open("r", encoding="utf-8") as handle:
        document = json.load(handle)
    storage = document.get("storage") if isinstance(document, dict) and "storage" in document else document
    meta = document.get("meta", {}) if isinstance(document, dict) else {}
    return target, storage, meta


def save_session(target, context, meta):
    temporary = target.with_suffix(".json.tmp")
    document = {"storage": context.storage_state(), "meta": meta}
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(document, handle, ensure_ascii=False, separators=(",", ":"))
    os.replace(temporary, target)
    if os.name != "nt":
        os.chmod(target, 0o600)


def stable_viewport(session_id):
    digest = hashlib.sha256(session_id.encode("utf-8")).digest()
    variants = [(1280, 800), (1366, 768), (1440, 900), (1536, 864)]
    width, height = variants[digest[0] % len(variants)]
    return {"width": width, "height": height}


def app_is_ready(page):
    return page.evaluate("""
        () => {
          const text = (document.body?.innerText || '').toLowerCase();
          const nodes = document.querySelectorAll('[data-mid], [role="article"], [class*="Message"], [class*="message"]');
          let messages = 0;
          for (const node of nodes) {
              const box = node.getBoundingClientRect();
              if (box.width > 150 && box.height > 15 && box.left > 250) {
                  messages++;
              }
          }
          const shell = document.querySelectorAll('[class*="ChatList"], [class*="chat-list"], [class*="Sidebar"], nav').length;
          const login = /qr[- ]?код|войти|авторизац|сканируйте/.test(text.slice(0, 2000));
          return { ready: messages > 0 || (shell > 0 && !login), login, messages, shell };
        }
    """)


def wait_for_app(page, seconds=30, check_messages=True):
    deadline = time.monotonic() + seconds
    state = {"ready": False, "login": False}
    # Wait until the shell (sidebar) loads
    while time.monotonic() < deadline:
        state = app_is_ready(page)
        if state.get("shell") > 0 or state.get("login") or state.get("messages") > 0:
            break
        page.wait_for_timeout(750)
        
    if state.get("login") and not state.get("messages") and not state.get("shell"):
        return state

    if not check_messages:
        return state

    # Now wait specifically for messages to appear (since proxy can be slow)
    message_deadline = time.monotonic() + 15  # Wait up to 15 seconds for chat history
    while time.monotonic() < message_deadline:
        state = app_is_ready(page)
        if state.get("messages") > 0:
            break
        page.wait_for_timeout(1000)

    # Force a final wait just in case DOM is still rendering
    page.wait_for_timeout(2000)
    return state

def human_scroll(page):
    rng = random.SystemRandom()
    page.mouse.move(rng.randint(150, 700), rng.randint(120, 500), steps=rng.randint(4, 9))
    page.wait_for_timeout(rng.randint(450, 1000))
    for _ in range(rng.randint(2, 4)):
        page.mouse.wheel(0, rng.randint(160, 420))
        page.wait_for_timeout(rng.randint(650, 1600))


def extract_messages(page):
    return page.evaluate(r"""
      () => {
        const selectors = [
          '[data-mid]', '[role="article"]', '.MessageList .Message',
          '[class*="MessageText"]', '[class*="messageText"]',
          '.text-content', '[class*="text-content"]',
          '[class*="Message"]', '[class*="message"]'
        ];
        let elements = [];
        for (const selector of selectors) {
          try {
            const candidates = Array.from(document.querySelectorAll(selector)).filter((node) => {
              const text = (node.innerText || node.textContent || '').trim();
              const box = node.getBoundingClientRect();
              return text.length > 5 && box.width > 150 && box.left > 250;
            });
            if (candidates.length > elements.length) elements = candidates;
          } catch {}
        }
        if (elements.length === 0) {
          elements = Array.from(document.querySelectorAll('article, div[data-id]')).filter((node) => {
            const text = (node.innerText || node.textContent || '').trim();
            const box = node.getBoundingClientRect();
            return text.length > 5 && box.width > 150 && box.left > 250;
          });
        }
        const seen = new Set();
        return elements.map((node) => {
          let text = (node.innerText || node.textContent || '').trim();
          const links = [...new Set(Array.from(node.querySelectorAll('a[href]'))
            .map((link) => link.href).filter((href) => /^https?:\/\//i.test(href) && !/(?:t\.me\/(?:\+|joinchat|c\/|share)|t\.me\/[a-zA-Z0-9_]+\/\d+)/i.test(href)))];
          if (links.length) text += '\n\nКонтакты (ссылки): ' + links.join(' , ');
          return { text, id: node.getAttribute('data-mid') || node.getAttribute('data-id') || undefined };
        }).filter((item) => {
          if (seen.has(item.text)) return false;
          seen.add(item.text);
          return true;
        }).slice(-100);
      }
    """)


def extract_title(page):
    return page.evaluate("""
      () => {
        const selectors = [
          '.top-info .title', '.chat-info .title', '.ChatHeader .title',
          '[class*="ChatHeader"] [class*="title"]', '[class*="chat-header"] [class*="title"]', 'h1'
        ];
        for (const selector of selectors) {
          const node = document.querySelector(selector);
          const text = (node?.innerText || '').trim();
          if (text) return text.slice(0, 200);
        }
        return (document.title || '').slice(0, 200) || null;
      }
    """)


def classify_exception(error, has_proxy):
    message = str(error)
    upper = message.upper()
    if has_proxy and any(marker in upper for marker in [
        "ERR_PROXY", "ERR_TUNNEL", "SOCKS", "PROXY CONNECTION", "ECONNREFUSED"
    ]):
        return "PROXY_ERROR"
    if "429" in message or "TOO MANY REQUESTS" in upper:
        return "RATE_LIMITED"
    if isinstance(error, PlaywrightTimeoutError):
        return "TIMEOUT"
    return "ERROR"


def run_parser(session_id, chat_url):
    target, storage, meta = load_session(session_id)
    proxy_url = os.environ.get("PARSER_PROXY_URL") or meta.get("proxy") or "direct"
    relay = None
    browser = None
    context = None
    stage = "инициализация"
    try:
        stage = "проверка URL чата"
        chat_url = normalize_chat_target(chat_url)
        stage = "подключение прокси"
        proxy, relay = build_playwright_proxy(proxy_url)
        with sync_playwright() as playwright:
            launch_options = {
                "headless": True,
                "args": [
                    "--disable-dev-shm-usage",
                    "--no-sandbox",
                    "--disable-gpu",
                    "--disable-software-rasterizer",
                    "--disable-extensions",
                    "--disable-background-networking",
                    "--disable-background-timer-throttling",
                    "--disable-client-side-phishing-detection",
                    "--disable-default-apps",
                    "--disable-hang-monitor",
                    "--disable-popup-blocking",
                    "--disable-prompt-on-repost",
                    "--disable-sync",
                    "--metrics-recording-only",
                    "--no-first-run",
                    "--safebrowsing-disable-auto-update",
                    "--mute-audio"
                ]
            }
            if proxy:
                launch_options["proxy"] = proxy
            stage = "запуск Chromium"
            browser = playwright.chromium.launch(**launch_options)
            stage = "загрузка сессии браузера"
            context = browser.new_context(
                storage_state=storage,
                viewport=stable_viewport(session_id),
                locale="ru-RU",
                timezone_id="Europe/Moscow",
            )
            page = context.new_page()

            # Загружаем SPA сразу с маршрутом чата: MAX читает hash при старте приложения.
            stage = "открытие целевого чата MAX"
            response = page.goto(chat_url, timeout=60_000, wait_until="domcontentloaded")
            if response and response.status == 429:
                return result(chat_url, "RATE_LIMITED", error="Превышен лимит запросов MAX (429)")

            stage = "ожидание сообщений чата"
            state = wait_for_app(page, seconds=30, check_messages=True)
            
            if state.get("login") and not state.get("ready"):
                return result(chat_url, "AUTH_REQUIRED", error="Сессия MAX требует повторного входа")

            page.wait_for_timeout(random.SystemRandom().randint(600, 1400))
            human_scroll(page)
            title = extract_title(page)
            messages = extract_messages(page)
            save_session(target, context, {**meta, "proxy": None, "formatVersion": 2})

            empty_error = None
            if not messages:
                final_state = app_is_ready(page)
                empty_error = empty_chat_diagnostic(page, final_state)
            if DEBUG_ARTIFACTS and not messages:
                directory = Path.cwd() / "debug_screenshots"
                directory.mkdir(exist_ok=True)
                page.screenshot(path=str(directory / f"empty_{session_id}_{int(time.time())}.png"))
            return result(
                chat_url,
                "OK" if messages else "EMPTY",
                title=title,
                messages=messages,
                error=empty_error,
            )
    except FileNotFoundError:
        return result(chat_url, "AUTH_REQUIRED", error="Файл сессии не найден")
    except Exception as error:
        status = classify_exception(error, proxy_url != "direct")
        if DEBUG_ARTIFACTS and context:
            try:
                directory = Path.cwd() / "debug_screenshots"
                directory.mkdir(exist_ok=True)
                context.pages[0].screenshot(path=str(directory / f"error_{session_id}_{int(time.time())}.png"))
            except Exception:
                pass
        return result(chat_url, status, error=f"Этап «{stage}»: {error}")
    finally:
        if context:
            try:
                context.close()
            except Exception:
                pass
        if browser:
            try:
                browser.close()
            except Exception:
                pass
        if relay:
            relay.stop()


def main():
    if len(sys.argv) != 3:
        payload = result("", "ERROR", error="Ожидались session_id и chat_url")
    else:
        payload = run_parser(sys.argv[1], sys.argv[2])
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()