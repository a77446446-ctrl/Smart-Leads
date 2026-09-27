// Читаем только DOM одного сообщения. Анимации реакций MAX представлены canvas.
async (messages) => {
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
  let iconBytes = 0;
  const images = new Set();
  const results = new Array(messages.length).fill(null);
  const deadline = Date.now() + 20000;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    const wrappers = Array.from(document.querySelectorAll('.messageWrapper'));
    const original = norm(message.text.split('\n\nКонтакты (ссылки): ')[0]);
    const matches = wrappers.filter(node => {
      const body = node.querySelector('.bubbleContent > .text');
      const text = body && norm(body.innerText || body.textContent);
      return text && (norm(node.innerText) === original || original.includes(text));
    });
    const indexed = matches.filter(node => message.domIndex != null && node.closest('[data-index]')?.getAttribute('data-index') === message.domIndex);
    const matched = indexed.length === 1 ? indexed : matches;
    if (matched.length !== 1) continue;
    const root = matched[0];
    const body = root.querySelector('.bubbleContent > .text');
    const icon = button => {
      const emoji = button.querySelector('img[alt]')?.getAttribute('alt');
      if (emoji && emoji.length <= 32 && /\p{Extended_Pictographic}/u.test(emoji)) return { emoji };
      const canvas = button.querySelector('canvas');
      try {
        if (canvas && canvas.width > 0 && canvas.height > 0 && canvas.width <= 512 && canvas.height <= 512) {
          // Прозрачный кадр не подменяет реакцию пустым изображением.
          const copy = document.createElement('canvas');
          copy.width = 32; copy.height = 32;
          const context = copy.getContext('2d');
          context.drawImage(canvas, 0, 0, 32, 32);
          const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
          if (pixels && pixels.some((value, index) => index % 4 === 3 && value > 0)) {
            const image = copy.toDataURL('image/png');
            if (image.length <= 12000 && (images.has(image) || iconBytes + image.length <= 512000)) {
              if (!images.has(image)) { images.add(image); iconBytes += image.length; }
              return { image };
            }
          }
        }
      } catch { /* Недоступный кадр оставляем без выдуманного эмодзи. */ }
      return {};
    };
    const readReactions = () => Array.from(root.querySelectorAll('button.reaction')).slice(0, 16).map(button => ({
      count: norm(button.querySelector('.counter')?.textContent), ...icon(button),
    }));
    let reactions = readReactions();
    if (reactions.some(item => !item.emoji && !item.image) && Date.now() < deadline) {
      root.querySelector('button.reaction')?.scrollIntoView({ block: 'center', behavior: 'instant' });
      const until = Math.min(deadline, Date.now() + 1000);
      while (Date.now() < until && reactions.some(item => !item.emoji && !item.image)) {
        await new Promise(resolve => setTimeout(resolve, 100));
        reactions = readReactions();
      }
    }
    const meta = root.querySelector('.bubbleContent > .meta');
    const time = norm(meta?.textContent).match(/(?:^|\s)([0-2]?\d:[0-5]\d)(?:\s|$)/)?.[1];
    const comments = Array.from(root.querySelectorAll('.inlineKeyboard button')).map(button =>
      (button.getAttribute('aria-label') || button.textContent).match(/Комментарии\s*\(([\d\s]+)\)/i)?.[1]).find(Boolean);
    const links = message.text.includes('\n\nКонтакты (ссылки): ')
      ? '\n\nКонтакты (ссылки): ' + message.text.split('\n\nКонтакты (ссылки): ').slice(1).join('\n\nКонтакты (ссылки): ') : '';
    results[index] = { body: (body.innerText || body.textContent).trim() + links, reactions,
      views: norm(meta?.querySelector('.views')?.textContent), time, comments };
  }
  return results;
}
