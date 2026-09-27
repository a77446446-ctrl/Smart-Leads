"""Регрессии: конец чата, отдельные публикации, дата MAX, отложенные значки."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from parser_history import latest_messages, DOM_SCRIPT
from parser_engagement import enrich_engagement
from playwright.sync_api import sync_playwright

class HistoryTests(unittest.TestCase):
    def test_history_reaches_latest_and_preserves_order_without_nested_duplicates(self):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.set_content('''<style>.scrollListScrollable {height:300px;overflow:auto}
              .messageWrapper {height:350px}</style><div class="history"><div class="scrollListScrollable"><div class="scrollListContent">
              <div class="item" data-index="0"><div class="capsuleSeparator">25 сентября 2026</div>
              <div class="messageWrapper"><div class="message"><div class="message"><div class="bubbleContent">
              <span class="text">Первая новость</span><span class="meta">10K 23:59</span></div></div></div></div></div>
              <div class="item" data-index="1"><div class="capsuleSeparator">26 сентября 2026</div>
              <div class="messageWrapper"><div class="bubbleContent"><span class="text">Последняя новость</span>
              <span class="meta">3K 08:00</span></div></div></div></div></div></div>''')
            rows = latest_messages(page, lambda _: self.fail('Не должен вызываться старый извлекатель'))
            self.assertEqual([row['text'] for row in rows], ['Первая новость', 'Последняя новость'])
            self.assertEqual(rows[0]['engagement']['publishedAt'], '2026-09-25T20:59:00.000Z')
            self.assertEqual(rows[1]['engagement']['publishedAt'], '2026-09-26T05:00:00.000Z')
            self.assertTrue(page.evaluate('''() => {const n=document.querySelector('.scrollListScrollable');
              return n.scrollHeight-n.clientHeight-n.scrollTop < 8}'''))
            browser.close()

    def test_reaction_canvas_is_loaded_after_scroll_and_scaled_on_high_dpi(self):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={'width':1000,'height':400})
            page.set_content('''<div style="height:1800px"></div><div class="messageWrapper"><div class="bubbleContent">
              <span class="text">Новость с реакциями</span><div class="reactions">
              <button class="reaction"><canvas width="100" height="100" style="width:20px;height:20px"></canvas><span class="counter">42</span></button>
              <button class="reaction"><img alt="👍"><span class="counter">3</span></button>
              </div><span class="meta"><span class="views">1,2K</span> 08:00</span></div></div>
              <div style="height:800px"></div><script>
              const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){
                const ctx=entry.target.getContext('2d');ctx.fillStyle='orange';ctx.fillRect(0,0,100,100);}});
              observer.observe(document.querySelector('canvas'));
              </script>''')
            rows=[{'text':'Новость с реакциями','engagement':{'body':'Новость с реакциями','publishedAt':'2026-09-26T05:00:00.000Z'}}]
            enrich_engagement(page, rows)
            self.assertTrue(rows[0]['engagement']['reactions'][0]['image'].startswith('data:image/png;base64,'))
            self.assertEqual(rows[0]['engagement']['reactions'][1]['emoji'], '👍')
            self.assertEqual(rows[0]['engagement']['publishedAt'], '2026-09-26T05:00:00.000Z')
            browser.close()

if __name__ == '__main__':
    unittest.main()
