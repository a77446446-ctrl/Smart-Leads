// Читаем только DOM одного сообщения. Анимации реакций MAX представлены canvas.
(messages) => {
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
  const wrappers = Array.from(document.querySelectorAll('.messageWrapper'));
  let iconBytes = 0;
  return messages.map(message => {
    const original = norm(message.text.split('\n\nКонтакты (ссылки): ')[0]);
    const matches = wrappers.filter(node => {
      const body = node.querySelector('.bubbleContent > .text');
      const text = body && norm(body.innerText || body.textContent);
      return text && (norm(node.innerText) === original || original.includes(text));
    });
    if (matches.length !== 1) return null;
    const root = matches[0];
    const body = root.querySelector('.bubbleContent > .text');
    const icon = button => {
      const emoji = button.querySelector('img[alt]')?.getAttribute('alt');
      if (emoji && emoji.length <= 32) return { emoji };
      const canvas = button.querySelector('canvas');
      try {
        if (canvas && canvas.width > 0 && canvas.width <= 64 && canvas.height <= 64) {
          // Прозрачный кадр не подменяет реакцию пустым изображением.
          const copy = document.createElement('canvas');
          copy.width = canvas.width; copy.height = canvas.height;
          const context = copy.getContext('2d');
          context.drawImage(canvas, 0, 0);
          const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
          if (pixels && pixels.some((value, index) => index % 4 === 3 && value > 0)) {
            const image = copy.toDataURL('image/png');
            if (image.length <= 12000 && iconBytes + image.length <= 256000) { iconBytes += image.length; return { image }; }
          }
        }
      } catch { /* Недоступный кадр оставляем без выдуманного эмодзи. */ }
      return {};
    };
    const reactions = Array.from(root.querySelectorAll('button.reaction')).slice(0, 16).map(button => ({
      count: norm(button.querySelector('.counter')?.textContent), ...icon(button),
    }));
    const meta = root.querySelector('.bubbleContent > .meta');
    const time = norm(meta?.textContent).match(/(?:^|\s)([0-2]?\d:[0-5]\d)(?:\s|$)/)?.[1];
    const comments = Array.from(root.querySelectorAll('.inlineKeyboard button')).map(button =>
      (button.getAttribute('aria-label') || button.textContent).match(/Комментарии\s*\(([\d\s]+)\)/i)?.[1]).find(Boolean);
    const links = message.text.includes('\n\nКонтакты (ссылки): ')
      ? '\n\nКонтакты (ссылки): ' + message.text.split('\n\nКонтакты (ссылки): ').slice(1).join('\n\nКонтакты (ссылки): ') : '';
    return { body: (body.innerText || body.textContent).trim() + links, reactions,
      views: norm(meta?.querySelector('.views')?.textContent), time, comments };
  });
}
