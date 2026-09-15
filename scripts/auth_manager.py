"""Серверная QR-авторизация MAX с защищёнными артефактами и конечными статусами."""

import asyncio
import json
import os
import re
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright

from proxy_runtime import build_playwright_proxy

SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
URL_RE = re.compile(r"\b(?:https?|socks5h?)://[^\s]+", re.IGNORECASE)


def safe_error(error):
    message = URL_RE.sub("[proxy скрыт]", str(error or "Неизвестная ошибка"))
    return " ".join(message.split())[:500]


def write_status(target, state, message=None):
    document = {"state": state, "message": safe_error(message) if message else None, "updatedAt": int(time.time())}
    temporary = target.with_suffix(".json.tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(document, handle, ensure_ascii=False, separators=(",", ":"))
    os.replace(temporary, target)
    if os.name != "nt":
        os.chmod(target, 0o600)


async def login_detected(page):
    return await page.evaluate("""
      () => {
        const text = (document.body?.innerText || '').toLowerCase();
        const loginVisible = /qr[- ]?код|войти|авторизац|сканируйте|номер телефона/.test(text.slice(0, 3000));
        const appVisible = document.querySelectorAll(
          '[class*="ChatList"], [class*="chat-list"], [class*="Sidebar"], [data-testid*="chat"], input[placeholder*="Поиск"], input[placeholder*="Найти"]'
        ).length > 0;
        const storageKeys = [...Object.keys(localStorage), ...Object.keys(sessionStorage)];
        const authStored = storageKeys.some((key) => /token|auth|session/i.test(key));
        return authStored || (appVisible && !loginVisible);
      }
    """)


async def capture_qr(page, target):
    temporary = target.with_suffix(".png.tmp")
    selectors = [
        '[class*="qr" i] canvas',
        '[class*="qr" i] img',
        '[class*="qr" i] svg',
        'canvas',
        '[data-testid*="qr"]',
        'img[src*="data:image"]',
        'svg',
        'img',
    ]
    captured = False
    for selector in selectors:
        locator = page.locator(selector)
        for index in range(min(await locator.count(), 10)):
            item = locator.nth(index)
            box = await item.bounding_box()
            if box and 120 <= box["width"] <= 500 and 120 <= box["height"] <= 500:
                await item.screenshot(path=str(temporary), animations="disabled", type="png")
                captured = True
                break
        if captured:
            break
    if not captured:
        # Fallback: crop the center part of the screen where the QR card usually is
        clip = {"x": 340, "y": 100, "width": 600, "height": 600}
        await page.screenshot(path=str(temporary), clip=clip, animations="disabled", type="png")
    os.replace(temporary, target)
    if os.name != "nt":
        os.chmod(target, 0o600)


async def run(session_id):
    if not SESSION_ID_RE.fullmatch(session_id):
        raise ValueError("Некорректный идентификатор сессии")

    proxy_url = os.environ.get("PARSER_PROXY_URL") or "direct"
    session_dir = Path(os.environ.get("PARSER_SESSIONS_DIR") or Path.cwd() / "sessions").resolve()
    session_dir.mkdir(parents=True, exist_ok=True)
    target = (session_dir / f"{session_id}.json").resolve()
    if target.parent != session_dir:
        raise ValueError("Некорректный путь сессии")

    auth_dir = (session_dir / ".auth").resolve()
    auth_dir.mkdir(parents=True, exist_ok=True)
    status_target = (auth_dir / f"{session_id}.status.json").resolve()
    qr_target = (auth_dir / f"{session_id}.qr.png").resolve()
    if status_target.parent != auth_dir or qr_target.parent != auth_dir:
        raise ValueError("Некорректный путь авторизации")

    write_status(status_target, "starting")
    proxy, relay = build_playwright_proxy(proxy_url)
    browser = None
    try:
        async with async_playwright() as playwright:
            requested_headless = os.environ.get("PARSER_AUTH_HEADLESS", "true").lower() != "false"
            has_display = os.name == "nt" or bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))
            headless = requested_headless or not has_display
            launch_options = {"headless": headless}
            if headless and os.name != "nt":
                launch_options["args"] = ["--no-sandbox", "--disable-dev-shm-usage"]
            if proxy:
                launch_options["proxy"] = proxy

            browser = await playwright.chromium.launch(**launch_options)
            context_options = {
                "viewport": {"width": 1280, "height": 800},
                "locale": "ru-RU",
                "ignore_https_errors": True,
            }
            timezone = os.environ.get("PARSER_AUTH_TIMEZONE", "").strip()
            if timezone:
                context_options["timezone_id"] = timezone
            context = await browser.new_context(**context_options)
            page = await context.new_page()

            last_error = None
            for attempt in range(3):
                try:
                    await page.goto("https://web.max.ru", timeout=60_000, wait_until="domcontentloaded")
                    last_error = None
                    break
                except Exception as error:
                    last_error = error
                    if attempt < 2:
                        await asyncio.sleep(3)
            if last_error:
                raise last_error

            await page.wait_for_timeout(2_000)
            await capture_qr(page, qr_target)
            write_status(status_target, "qr")

            deadline = time.monotonic() + 300
            next_capture = time.monotonic() + 15
            authorized = False
            while time.monotonic() < deadline:
                if await login_detected(page):
                    authorized = True
                    break
                if time.monotonic() >= next_capture:
                    await capture_qr(page, qr_target)
                    write_status(status_target, "qr")
                    next_capture = time.monotonic() + 15
                await asyncio.sleep(1)
            if not authorized:
                raise TimeoutError("QR-код не подтверждён за 5 минут")

            await asyncio.sleep(4)
            document = {
                "storage": await context.storage_state(),
                "meta": {
                    "name": os.environ.get("MAX_ACCOUNT_NAME") or f"Аккаунт {session_id[:8]}",
                    "id": session_id,
                    "formatVersion": 2,
                    "createdAt": int(time.time()),
                },
            }
            temporary = target.with_suffix(".json.tmp")
            with temporary.open("w", encoding="utf-8") as handle:
                json.dump(document, handle, ensure_ascii=False, separators=(",", ":"))
            os.replace(temporary, target)
            if os.name != "nt":
                os.chmod(target, 0o600)
            write_status(status_target, "success")
            try:
                qr_target.unlink()
            except FileNotFoundError:
                pass
            print("SUCCESS: сессия MAX сохранена", flush=True)
    except Exception as error:
        write_status(status_target, "error", safe_error(error))
        raise
    finally:
        if browser:
            await browser.close()
        if relay:
            relay.stop()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Ожидался session_id", file=sys.stderr)
        sys.exit(2)
    try:
        asyncio.run(run(sys.argv[1]))
    except Exception as error:
        print(f"Ошибка авторизации: {safe_error(error)}", file=sys.stderr)
        sys.exit(1)
