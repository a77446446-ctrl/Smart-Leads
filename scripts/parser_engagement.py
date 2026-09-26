"""Отдельные счётчики MAX, без изменения исходного текста и привязки фотографий."""
from pathlib import Path

DOM_SCRIPT = Path(__file__).with_name('parser_message_dom.js').read_text(encoding='utf-8')


def enrich_engagement(page, messages):
    try:
        for message, engagement in zip(messages, page.evaluate(DOM_SCRIPT, messages)):
            if engagement:
                message['engagement'] = engagement
    except Exception:
        # Недоступная статистика не останавливает получение текста и фотографий.
        pass
