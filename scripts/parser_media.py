"""Фотографии из уже загруженного MAX: отдельное дополнение к текстовому worker."""
import base64
import os
import time
import uuid
from pathlib import Path

MAX_BYTES = 5 * 1024 * 1024
MAX_BATCH_BYTES = 20 * 1024 * 1024
MAX_STAGING_BYTES = 64 * 1024 * 1024
DOM_SCRIPT = Path(__file__).with_name("parser_photo_dom.js").read_text(encoding="utf-8")


def image_mime(data):
    if not data or len(data) > MAX_BYTES:
        return None
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


class MessagePhotos:
    def __init__(self, page):
        self.page = page
        self.enabled = os.environ.get("PARSER_CAPTURE_PHOTOS") == "1"
        self.responses = {}
        if self.enabled:
            page.on("requestfinished", self._finished)

    def _finished(self, request):
        try:
            response = request.response()
            if response:
                self._remember(response)
        except Exception:
            pass

    def _remember(self, response):
        try:
            mime = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            # Часть вложений SPA загружает через fetch/XHR перед показом в альбоме.
            if response.request.resource_type != "image" and not (
                response.request.resource_type in ("fetch", "xhr")
                and mime in ("image/jpeg", "image/png", "image/gif", "image/webp")
            ):
                return
            if response.status != 200 or not response.url.startswith("https://"):
                return
            size = int(response.headers.get("content-length", "0"))
            if size > MAX_BYTES:
                return
            self.responses[response.url] = response
            while len(self.responses) > 256:
                del self.responses[next(iter(self.responses))]
        except Exception:
            pass

    def _bytes(self, url):
        if url.startswith("blob:"):
            # Только blob текущей страницы. Не делаем серверных запросов по ссылкам из чата.
            encoded = self.page.evaluate("""async ({url, limit}) => {
              if (!url.startsWith('blob:' + location.origin + '/')) return null;
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 1500);
              try {
                const response = await fetch(url, {signal: controller.signal});
                const blob = await response.blob();
                if (blob.size > limit) return null;
                return await new Promise(resolve => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result).split(',')[1]);
                  reader.onerror = () => resolve(null);
                  reader.readAsDataURL(blob);
                });
              } catch { return null; } finally { clearTimeout(timer); }
            }""", {"url": url, "limit": MAX_BYTES})
            return base64.b64decode(encoded, validate=True) if encoded else b""
        response = self.responses.get(url)
        return response.body() if response else b""

    def enrich(self, messages):
        if not messages:
            return
        # Один отчёт на пакет: без текстов сообщений, URL вложений и данных сессии.
        report = {"enabled": self.enabled, "messages": len(messages), "found": 0, "saved": 0, "errors": 0}
        messages[0]["photoReport"] = report
        if not self.enabled:
            return
        try:
            root = Path(os.environ.get("LEAD_MEDIA_DIR") or Path.cwd() / "data" / "lead-media")
            directory = root / "staging"
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            usage = sum(file.stat().st_size for file in directory.iterdir() if file.is_file())
            groups = self.page.evaluate(DOM_SCRIPT, messages)
            report["found"] = sum(len(group["urls"][:6]) for group in groups)
            total = 0
            started = time.monotonic()
            for message, group in zip(messages, groups):
                if group.get("error"):
                    message["photoError"] = group["error"]
                for url in group["urls"][:6]:
                    if usage >= MAX_STAGING_BYTES or total >= MAX_BATCH_BYTES or time.monotonic() - started > 8:
                        message["photoError"] = "Достигнут лимит сбора фотографий за один проход"
                        break
                    try:
                        data = self._bytes(url)
                        mime = image_mime(data)
                        if not mime:
                            message["photoError"] = "Фотография не загружена в MAX или имеет неподдерживаемый размер/формат"
                            continue
                        if total + len(data) > MAX_BATCH_BYTES or usage + len(data) > MAX_STAGING_BYTES:
                            message["photoError"] = "Достигнут лимит временного хранилища фотографий"
                            break
                        key = str(uuid.uuid4())
                        with (directory / key).open("xb") as output:
                            os.chmod(directory / key, 0o600)
                            output.write(data)
                        total += len(data)
                        usage += len(data)
                        message.setdefault("photos", []).append({"key": key, "mimeType": mime})
                        report["saved"] += 1
                    except Exception:
                        message["photoError"] = "Не удалось сохранить фотографию; текст сохранится отдельно"
        except Exception:
            for message in messages:
                message["photoError"] = "Сбор фотографий недоступен; текст сохранится отдельно"
        finally:
            report["errors"] = sum(bool(message.get("photoError")) for message in messages)
