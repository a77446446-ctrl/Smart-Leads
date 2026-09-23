"""Проверка фотографий в изолированном браузере без входа в MAX и без внешней сети."""
import os
import sys
import tempfile
import struct
import zlib
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from parser_media import MessagePhotos, DOM_SCRIPT, image_mime


class PhotoTests(unittest.TestCase):
    def test_completed_browser_response_keeps_original_bytes(self):
        from playwright.sync_api import sync_playwright
        def chunk(kind, value):
            return struct.pack('!I', len(value)) + kind + value + struct.pack('!I', zlib.crc32(kind + value))
        png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', 160, 100, 8, 2, 0, 0, 0))
        png += chunk(b'IDAT', zlib.compress((b'\x00' + b'\x55\x88\xaa' * 160) * 100)) + chunk(b'IEND', b'')
        with tempfile.TemporaryDirectory(prefix='smart-leads-photos-') as root, patch.dict(os.environ, {'PARSER_CAPTURE_PHOTOS': '1', 'LEAD_MEDIA_DIR': root}):
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                page = browser.new_page()
                collector = MessagePhotos(page)
                html = '<article data-mid="1" style="margin-left:300px;width:400px">Фотография авто<img src="/photo.png" width="160" height="100"></article>'
                def respond(route):
                    if route.request.url.endswith('/photo.png'):
                        route.fulfill(status=200, content_type='image/png', body=png)
                    else:
                        route.fulfill(status=200, content_type='text/html; charset=utf-8', body=html)
                page.route('**/*', respond)
                page.goto('https://max.ru/test-fixture', wait_until='networkidle')
                messages = [{'text': 'Фотография авто', 'id': '1'}]
                collector.enrich(messages)
                self.assertEqual(messages[0]['photos'][0]['mimeType'], 'image/png')
                self.assertEqual((Path(root) / 'staging' / messages[0]['photos'][0]['key']).read_bytes(), png)
                browser.close()

    def test_files_and_failure_isolation(self):
        data = b"\xff\xd8\xff" + b"x" * 20
        with tempfile.TemporaryDirectory(prefix="smart-leads-photos-") as root, patch.dict(os.environ, {"PARSER_CAPTURE_PHOTOS": "1", "LEAD_MEDIA_DIR": root}):
            page = SimpleNamespace(on=lambda *args: None, evaluate=lambda *args: [["https://cdn.example/photo"], []])
            collector = MessagePhotos(page)
            collector.responses["https://cdn.example/photo"] = SimpleNamespace(body=lambda: data)
            messages = [{"text": "Авто", "id": "1"}, {"text": "Спорт", "id": "2"}]
            collector.enrich(messages)
            self.assertEqual(messages[0]["text"], "Авто")
            self.assertNotIn("photos", messages[1])
            self.assertEqual((Path(root) / "staging" / messages[0]["photos"][0]["key"]).read_bytes(), data)
            collector.responses.clear()
            collector.enrich([{"text": "Нет файла"}])
            self.assertIsNone(image_mime(b"<svg>unsafe</svg>"))
            self.assertIsNone(image_mime(b"\xff\xd8\xff" + b"x" * (5 * 1024 * 1024)))

    def test_dom_associates_only_own_photo(self):
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page()
            page.set_content('''<style>article {margin-left:300px;width:400px} img {width:200px;height:150px}</style>
              <article data-mid="1"><div class="MessageText">Новость авто</div><img id="auto"><div class="avatar"><img id="avatar"></div></article>
              <article data-mid="2"><div class="MessageText">Новость спорта</div><img id="sport"></article>
              <article data-mid="3">Повтор текста<img id="duplicate1"></article><article data-mid="4">Повтор текста<img id="duplicate2"></article>''')
            page.evaluate('''() => { for (const img of document.querySelectorAll('img')) {
              Object.defineProperty(img, 'naturalWidth', {value:300}); Object.defineProperty(img, 'naturalHeight', {value:200});
              Object.defineProperty(img, 'currentSrc', {value:'blob:https://max.ru/' + img.id});
            } }''')
            result = page.evaluate(DOM_SCRIPT, [{"text": "Новость авто", "id": "1"}, {"text": "Новость спорта"}, {"text": "Повтор текста"}])
            self.assertEqual(result, [["blob:https://max.ru/auto"], ["blob:https://max.ru/sport"], []])
            browser.close()


if __name__ == "__main__":
    unittest.main()
