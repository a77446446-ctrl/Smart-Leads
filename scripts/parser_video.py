"""Сбор и ограниченное перекодирование видео из загруженного сообщения MAX."""
import base64
import os
import subprocess
import time
import uuid
from pathlib import Path

DOM_SCRIPT = Path(__file__).with_name("parser_video_dom.js").read_text(encoding="utf-8")
MAX_SOURCE_BYTES = 20 * 1024 * 1024
MAX_VIDEO_BYTES = 3 * 1024 * 1024
MAX_STAGING_BYTES = 64 * 1024 * 1024


class MessageVideos:
    def __init__(self, page):
        self.page = page
        self.enabled = os.environ.get("PARSER_CAPTURE_VIDEOS") == "1"
        self.responses = {}
        if self.enabled:
            page.on("requestfinished", self._finished)

    def _finished(self, request):
        try:
            response = request.response()
            if not response or response.status not in (200, 206) or not response.url.startswith("https://"):
                return
            mime = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            if request.resource_type not in ("media", "fetch", "xhr") or not mime.startswith("video/"):
                return
            size = int(response.headers.get("content-length", "0"))
            if not size or size > MAX_SOURCE_BYTES:
                return
            self.responses[response.url] = response
            while len(self.responses) > 64:
                del self.responses[next(iter(self.responses))]
        except Exception:
            pass

    def _bytes(self, url):
        if url.startswith("blob:"):
            encoded = self.page.evaluate("""async ({url, limit}) => {
              if (!url.startsWith('blob:' + location.origin + '/')) return null;
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 2500);
              try {
                const response = await fetch(url, {signal: controller.signal});
                if (Number(response.headers.get('content-length') || 0) > limit) return null;
                const reader = response.body?.getReader();
                if (!reader) return null;
                const chunks = [];
                let size = 0;
                while (true) {
                  const {done, value} = await reader.read();
                  if (done) break;
                  size += value.byteLength;
                  if (size > limit) { await reader.cancel(); return null; }
                  chunks.push(value);
                }
                const blob = new Blob(chunks);
                return await new Promise(resolve => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result).split(',')[1]);
                  reader.onerror = () => resolve(null);
                  reader.readAsDataURL(blob);
                });
              } catch { return null; } finally { clearTimeout(timer); }
            }""", {"url": url, "limit": MAX_SOURCE_BYTES})
            return base64.b64decode(encoded, validate=True) if encoded else b""
        response = self.responses.get(url)
        data = response.body() if response else b""
        return data if len(data) <= MAX_SOURCE_BYTES else b""

    def enrich(self, messages):
        if not messages:
            return
        report = {"enabled": self.enabled, "messages": len(messages), "found": 0, "saved": 0, "errors": 0}
        messages[0]["videoReport"] = report
        if not self.enabled:
            return
        try:
            directory = Path(os.environ.get("LEAD_MEDIA_DIR") or Path.cwd() / "data" / "lead-media") / "staging"
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            usage = sum(file.stat().st_size for file in directory.iterdir() if file.is_file())
            started = time.monotonic()
            for message in reversed(messages):
                if time.monotonic() - started > 45:
                    message["videoError"] = "Достигнут лимит времени сбора видео"
                    continue
                group = self.page.evaluate(DOM_SCRIPT, [message])[0]
                report["found"] += len(group["urls"])
                if group.get("error"):
                    message["videoError"] = group["error"]
                for url in group["urls"]:
                    key = str(uuid.uuid4())
                    target = directory / key
                    source = directory / str(uuid.uuid4())
                    try:
                        if usage >= MAX_STAGING_BYTES:
                            raise ValueError("Временное хранилище заполнено")
                        data = self._bytes(url)
                        if not data or len(data) > MAX_SOURCE_BYTES:
                            raise ValueError("Видео не загружено или слишком велико")
                        if usage + len(data) > MAX_STAGING_BYTES:
                            raise ValueError("Временное хранилище заполнено")
                        with source.open("xb") as output:
                            output.write(data)
                        del data
                        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                                        "-protocol_whitelist", "file,pipe", "-i", str(source), "-threads", "2",
                                        "-t", "30", "-vf", "scale=w=854:h=480:force_original_aspect_ratio=decrease:force_divisible_by=2",
                                        "-r", "24", "-c:v", "libx264", "-preset", "veryfast", "-crf", "35",
                                        "-maxrate", "450k", "-bufsize", "900k", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "32k",
                                        "-movflags", "+faststart", "-f", "mp4", str(target)],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=35, check=True)
                        size = target.stat().st_size
                        if size < 12 or size > MAX_VIDEO_BYTES or usage + size > MAX_STAGING_BYTES:
                            raise ValueError("Видео после сжатия превышает лимит 3 МБ")
                        os.chmod(target, 0o600)
                        usage += size
                        message.setdefault("videos", []).append({"key": key, "mimeType": "video/mp4"})
                        report["saved"] += 1
                    except Exception:
                        target.unlink(missing_ok=True)
                        message["videoError"] = "Видео не удалось сохранить; текст сохранён отдельно"
                    finally:
                        source.unlink(missing_ok=True)
        except Exception:
            for message in messages:
                message["videoError"] = "Сбор видео недоступен; текст сохранён отдельно"
        finally:
            report["errors"] = sum(bool(message.get("videoError")) for message in messages)
