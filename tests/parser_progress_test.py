"""Проверка общего бюджета и сохранения текста без сети и аккаунта MAX."""
import io
import json
import contextlib
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import parser_progress
import parser_worker
from parser_media import MessagePhotos
from parser_engagement import enrich_engagement


class ProgressTests(unittest.TestCase):
    def tearDown(self):
        parser_progress._deadline = None

    def test_media_share_remaining_worker_budget(self):
        with patch.dict(os.environ, {'PARSER_WORKER_TIMEOUT_MS': '120000'}):
            with patch('parser_progress.time.monotonic', return_value=0):
                parser_progress.begin()
            with patch('parser_progress.time.monotonic', return_value=90):
                self.assertEqual(parser_progress.deadline(45), 105)
                self.assertEqual(parser_progress.deadline(35), 105)

    def test_invalid_and_extreme_limits_are_bounded(self):
        for configured, deadline in [('bad', 105), ('-1', 15), ('9999999', 285)]:
            with patch.dict(os.environ, {'PARSER_WORKER_TIMEOUT_MS': configured}), patch('parser_progress.time.monotonic', return_value=0):
                parser_progress.begin()
                self.assertEqual(parser_progress.deadline(1000), deadline)

    def test_expired_budget_preserves_text_and_skips_browser_calls(self):
        parser_progress._deadline = 0
        message = {'text': 'Текст уже получен', 'id': '1'}
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {'PARSER_CAPTURE_PHOTOS': '1', 'LEAD_MEDIA_DIR': directory}):
            page = SimpleNamespace(on=lambda *_: None)
            MessagePhotos(page).enrich([message])
            enrich_engagement(page, [message])
        self.assertEqual(message['text'], 'Текст уже получен')
        self.assertNotIn('photos', message)
        self.assertEqual(message['photoReport']['saved'], 0)
        self.assertEqual(message['photoReport']['errors'], 1)

    def test_only_nonempty_success_is_checkpointed(self):
        output = io.StringIO()
        with patch('sys.stdout', output):
            parser_progress.checkpoint({'status': 'AUTH_REQUIRED', 'messages': []})
            parser_progress.checkpoint({'status': 'OK', 'messages': []})
            parser_progress.checkpoint({'status': 'OK', 'messages': [{'text': 'Текст'}]})
        rows = output.getvalue().splitlines()
        self.assertEqual(len(rows), 1)
        self.assertEqual(json.loads(rows[0])['result']['messages'][0]['text'], 'Текст')

    def test_hash_url_checkpoint_uses_requested_chat_before_worker_normalization(self):
        requested = 'https://web.max.ru/a/#@news'
        page = SimpleNamespace(goto=lambda *_args, **_kwargs: None, wait_for_timeout=lambda *_args: None)
        context = SimpleNamespace(new_page=lambda: page, close=lambda: None)
        browser = SimpleNamespace(new_context=lambda **_kwargs: context, close=lambda: None)
        playwright = SimpleNamespace(chromium=SimpleNamespace(launch=lambda **_kwargs: browser))
        output = io.StringIO()
        with patch.dict(os.environ, {'PARSER_PROXY_URL': 'direct'}), \
                patch('sys.stdout', output), \
                patch.object(parser_worker, 'load_session', return_value=(Path('test.json'), {}, {})), \
                patch.object(parser_worker, 'build_playwright_proxy', return_value=(None, None)), \
                patch.object(parser_worker, 'sync_playwright', return_value=contextlib.nullcontext(playwright)), \
                patch.object(parser_worker, 'MessagePhotos', return_value=SimpleNamespace(enrich=lambda _messages: None)), \
                patch.object(parser_worker, 'wait_for_app', return_value={'login': False, 'ready': True}), \
                patch.object(parser_worker, 'extract_title', return_value='Новости'), \
                patch.object(parser_worker, 'latest_messages', return_value=[{'text': 'Новая запись'}]), \
                patch.object(parser_worker, 'save_session'), \
                patch.object(parser_worker, 'enrich_engagement'):
            final = parser_worker.run_parser('test', requested)
        checkpoints = [json.loads(row)['result'] for row in output.getvalue().splitlines()
                       if json.loads(row).get('event') == 'checkpoint']
        self.assertEqual(final['status'], 'OK')
        self.assertEqual(final['source_chat'], 'https://web.max.ru/news')
        self.assertEqual(checkpoints[0]['source_chat'], requested)
        self.assertEqual(checkpoints[0]['messages'][0]['text'], 'Новая запись')


if __name__ == '__main__':
    unittest.main()
