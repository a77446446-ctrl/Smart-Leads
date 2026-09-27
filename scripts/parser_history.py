"""Чтение конца истории MAX без случайной прокрутки и вложенных дублей."""
import time
from pathlib import Path

DOM_SCRIPT = Path(__file__).with_name('parser_history_dom.js').read_text(encoding='utf-8')


def latest_messages(page, fallback):
    deadline = time.monotonic() + 15
    previous = None
    stable = 0
    while time.monotonic() < deadline:
        state = page.evaluate('''() => {
          const history = document.querySelector('.history');
          const scroller = history?.querySelector('.scrollListScrollable');
          if (!scroller) return null;
          const end = document.querySelector('button[aria-label="В конец"]');
          if (end && end.getBoundingClientRect().width) end.click();
          scroller.scrollTop = scroller.scrollHeight;
          return { last: Array.from(history.querySelectorAll('.messageWrapper')).at(-1)?.querySelector('.bubbleContent > .text')?.textContent,
            height: scroller.scrollHeight, bottom: scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 8 };
        }''')
        if state is None:
            return fallback(page)
        page.wait_for_timeout(350)
        signature = (state['height'], state.get('last'))
        stable = stable + 1 if signature == previous and state['bottom'] else 0
        if stable >= 3:
            break
        previous = signature
    rows = page.evaluate(DOM_SCRIPT)
    if rows is None:
        return fallback(page)
    return rows
