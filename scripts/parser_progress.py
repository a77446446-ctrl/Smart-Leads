"""Промежуточный результат и общий бюджет дополнений к чтению MAX."""
import json
import os
import sys
import time

_deadline = None


def begin():
    global _deadline
    try:
        milliseconds = int(os.environ.get('PARSER_WORKER_TIMEOUT_MS', '120000'))
    except ValueError:
        milliseconds = 120000
    seconds = min(300, max(30, milliseconds / 1000))
    # Оставляем время на выдачу результата и закрытие браузера.
    _deadline = time.monotonic() + seconds - 15


def deadline(seconds):
    local = time.monotonic() + seconds
    return min(local, _deadline) if _deadline is not None else local


def _emit(value):
    sys.stdout.write(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')
    sys.stdout.flush()


def stage(value):
    _emit({'event': 'stage', 'stage': value})
    return value


def checkpoint(payload):
    if payload['status'] == 'OK' and payload['messages']:
        _emit({'event': 'checkpoint', 'result': payload})
