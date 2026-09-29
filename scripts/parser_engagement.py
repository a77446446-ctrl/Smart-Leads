"""Отдельные счётчики MAX, без изменения исходного текста и привязки фотографий."""
import base64
import re
import time
from pathlib import Path
from parser_progress import deadline

DOM_SCRIPT = Path(__file__).with_name('parser_message_dom.js').read_text(encoding='utf-8')


def enrich_engagement(page, messages):
    try:
        work_deadline = deadline(35)
        screenshots = 0
        if time.monotonic() >= work_deadline:
            return
        engagements = page.evaluate(DOM_SCRIPT, messages)
        # Сначала свежие посты: они первыми появятся в ленте.
        for index in range(min(len(messages), len(engagements)) - 1, -1, -1):
            message, engagement = messages[index], engagements[index]
            if engagement:
                # Анимированные реакции MAX иногда не читаются через canvas.
                # Снимок самой иконки берём только из однозначного сообщения.
                dom_index = message.get('domIndex')
                if isinstance(dom_index, str) and re.fullmatch(r'-?\d+', dom_index):
                    try:
                        row = page.locator(f'.history [data-index="{dom_index}"] .messageWrapper')
                        unique = row.count() == 1
                    except Exception:
                        unique = False
                    if unique:
                        for index, reaction in enumerate(engagement.get('reactions', [])):
                            if reaction.get('emoji') or reaction.get('image'):
                                continue
                            if screenshots >= 128 or time.monotonic() >= work_deadline:
                                break
                            try:
                                icon = row.locator('button.reaction').nth(index).locator('.animoji')
                                timeout_ms = max(1, min(1500, int((work_deadline - time.monotonic()) * 1000)))
                                png = icon.screenshot(timeout=timeout_ms, animations='disabled')
                                image = 'data:image/png;base64,' + base64.b64encode(png).decode('ascii')
                                if png.startswith(b'\x89PNG\r\n\x1a\n') and len(image) <= 12000:
                                    reaction['image'] = image
                                screenshots += 1
                            except Exception:
                                continue
                message['engagement'] = {**message.get('engagement', {}), **engagement}
    except Exception:
        # Недоступная статистика не останавливает получение текста и фотографий.
        pass
