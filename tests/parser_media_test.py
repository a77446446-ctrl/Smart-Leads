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
    def test_dom_text_content_album_and_neighbour_boundaries(self):
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page()
            page.route('**/*', lambda route: route.abort())
            page.set_content('''<style>
              .bubble {margin-left:300px;width:400px}
              .photo {width:180px;height:100px;display:inline-block}
              </style><main>
              <div class="bubble"><div class="album">
                <div class="photo" style="background-image:url(https://cdn.example/one.png)"></div>
                <div class="photo" style="background-image:url(https://cdn.example/two.png)"></div>
                <div class="photo" style="background-image:url(https://cdn.example/three.png)"></div>
              </div><div class="text-content">В Пушкино построят новую поликлинику.</div>
                <div>81<br>17,7К<br>19:05</div>
                <div class="link-preview"><div class="photo" style="background-image:url(https://cdn.example/preview.png)"></div></div>
              </div>
              <div class="bubble"><div class="text-content">Соседняя новость без фотографии.</div></div>
              </main>''')
            groups = page.evaluate(DOM_SCRIPT, [
                {"text": "В Пушкино построят новую поликлинику.\n\nКонтакты (ссылки): https://max.ru/source"},
                {"text": "Соседняя новость без фотографии."},
            ])
            self.assertEqual(groups[0]["urls"], [f"https://cdn.example/{name}.png" for name in ["one", "two", "three"]])
            self.assertEqual(groups[1]["urls"], [])
            self.assertNotIn("error", groups[1])
            browser.close()

    def test_dom_reports_ambiguous_and_missing_messages(self):
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page()
            page.set_content('''<style>article {margin-left:300px;width:400px}</style>
              <article>Одинаковое сообщение</article><article>Одинаковое сообщение</article>''')
            groups = page.evaluate(DOM_SCRIPT, [{"text": "Одинаковое сообщение"}, {"text": "Отсутствующее сообщение"}])
            self.assertEqual([group["urls"] for group in groups], [[], []])
            self.assertIn("однозначно", groups[0]["error"])
            self.assertIn("найден", groups[1]["error"])
            browser.close()

    def test_dom_does_not_take_photo_from_adjacent_article_without_text_wrapper(self):
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page()
            page.route('**/*', lambda route: route.abort())
            page.set_content('''<style>main {margin-left:300px;width:400px}</style><main>
              <article data-mid="1">Новость без фото</article>
              <article data-mid="2"><div style="width:200px;height:100px;background-image:url(https://cdn.example/neighbour.png)"></div></article>
              </main>''')
            groups = page.evaluate(DOM_SCRIPT, [{"text": "Новость без фото", "id": "1"}])
            self.assertEqual(groups, [{"urls": []}])
            browser.close()

    def test_remembers_images_loaded_by_fetch_only_with_image_mime(self):
        with patch.dict(os.environ, {"PARSER_CAPTURE_PHOTOS": "1"}):
            collector = MessagePhotos(SimpleNamespace(on=lambda *args: None))
            for kind, mime, accepted in [("fetch", "image/jpeg", True), ("xhr", "image/png; charset=binary", True), ("fetch", "application/json", False)]:
                url = f"https://cdn.example/{kind}/{mime}"
                response = SimpleNamespace(request=SimpleNamespace(resource_type=kind), status=200, url=url, headers={"content-type": mime})
                collector._remember(response)
                self.assertEqual(url in collector.responses, accepted)

    def test_dom_error_reaches_message_without_losing_text(self):
        with tempfile.TemporaryDirectory(prefix="smart-leads-photos-") as root, patch.dict(os.environ, {"PARSER_CAPTURE_PHOTOS": "1", "LEAD_MEDIA_DIR": root}):
            page = SimpleNamespace(on=lambda *args: None, evaluate=lambda *args: [{"urls": [], "error": "Не найден контейнер сообщения"}])
            message = {"text": "Новость"}
            MessagePhotos(page).enrich([message])
            self.assertEqual(message["text"], "Новость")
            self.assertEqual(message["photoError"], "Не найден контейнер сообщения")

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
                html = '''<article data-mid="1" style="margin-left:300px;width:400px">Фотография авто
                  <img src="/photo.png" width="160" height="100">
                  <div style="width:160px;height:100px;background-image:url(/second.png)"></div>
                  <div id="third" style="width:160px;height:100px"></div></article>
                  <script>fetch('/third.png').then(r => r.blob()).then(blob => {
                    document.getElementById('third').style.backgroundImage = 'url(' + URL.createObjectURL(blob) + ')';
                  });</script>'''
                def respond(route):
                    if route.request.url.endswith('.png'):
                        route.fulfill(status=200, content_type='image/png', body=png)
                    else:
                        route.fulfill(status=200, content_type='text/html; charset=utf-8', body=html)
                page.route('**/*', respond)
                page.goto('https://max.ru/test-fixture', wait_until='networkidle')
                messages = [{'text': 'Фотография авто', 'id': '1'}]
                collector.enrich(messages)
                self.assertEqual(len(messages[0]['photos']), 3)
                for photo in messages[0]['photos']:
                    self.assertEqual(photo['mimeType'], 'image/png')
                    self.assertEqual((Path(root) / 'staging' / photo['key']).read_bytes(), png)
                browser.close()

    def test_files_and_failure_isolation(self):
        data = b"\xff\xd8\xff" + b"x" * 20
        with tempfile.TemporaryDirectory(prefix="smart-leads-photos-") as root, patch.dict(os.environ, {"PARSER_CAPTURE_PHOTOS": "1", "LEAD_MEDIA_DIR": root}):
            page = SimpleNamespace(on=lambda *args: None, evaluate=lambda *args: [{"urls": ["https://cdn.example/photo"]}, {"urls": []}])
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
            self.assertEqual([group["urls"] for group in result], [["blob:https://max.ru/auto"], ["blob:https://max.ru/sport"], []])
            browser.close()

    def test_dom_finds_photo_above_text_without_message_id(self):
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page()
            page.set_content('''<style>.messageItem {margin-left:300px;width:400px}
              img {width:300px;height:160px}</style>
              <div class="messageItem"><div class="PhotoPreview"><img id="news"></div>
                <div class="messageText">Внимание родителям!</div>
                <div class="avatar"><img id="avatar"></div></div>
              <div class="messageItem"><div class="PhotoPreview"><img id="neighbour"></div>
                <div class="messageText">Другая новость</div></div>''')
            page.evaluate('''() => { for (const img of document.querySelectorAll('img')) {
              Object.defineProperty(img, 'naturalWidth', {value:300});
              Object.defineProperty(img, 'naturalHeight', {value:160});
              Object.defineProperty(img, 'currentSrc', {value:'blob:https://max.ru/' + img.id});
            } }''')
            result = page.evaluate(DOM_SCRIPT, [{"text": "Внимание родителям!"}, {"text": "Другая новость"}])
            self.assertEqual([group["urls"] for group in result], [["blob:https://max.ru/news"], ["blob:https://max.ru/neighbour"]])
            browser.close()


if __name__ == "__main__":
    unittest.main()
