// Дополняет уже найденный текст: не меняет селекторы и правила основного парсера.
(messages) => {
  const textSelector = '[class*="MessageText"], [class*="messageText"], .text-content, [class*="text-content"]';
  const boundarySelector = '[data-mid], [role="article"], article, div[data-id], .MessageList .Message, [class*="messageItem"], [class*="MessageItem"], [class*="message-item"]';
  const candidates = Array.from(document.querySelectorAll(
    '[data-mid], [role="article"], article, div[data-id], .MessageList .Message, [class*="Message"], [class*="message"], ' + textSelector
  ));
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const textOf = node => normalize(node.innerText || node.textContent);
  const visible = node => { const box = node.getBoundingClientRect(); return box.width > 150 && box.left > 250; };
  const excluded = '[class*="avatar" i], [class*="sticker" i], [class*="emoji" i], [class*="link-preview" i], [class*="linkPreview" i], [class*="urlPreview" i]';
  const imageUrls = container => {
    const urls = new Set();
    // MAX может показывать плитки альбома через background-image вместо img.
    for (const node of container.querySelectorAll('*')) {
      if (node.closest(excluded)) continue;
      const box = node.getBoundingClientRect();
      if (box.width < 100 || box.height < 60) continue;
      if (node.tagName === 'IMG') {
        if (node.naturalWidth >= 120 && node.naturalHeight >= 80) urls.add(node.currentSrc || node.src);
      } else {
        const background = getComputedStyle(node).backgroundImage;
        for (const match of background.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)) {
          const url = match[1] ?? match[2] ?? match[3].trim();
          if (/^(https:\/\/|blob:)/.test(url)) urls.add(url);
        }
      }
    }
    return [...urls].filter(Boolean).slice(0, 6);
  };
  return messages.map(message => {
    const text = normalize(message.text.split('\n\nКонтакты (ссылки): ')[0]);
    if (!text) return { urls: [] };
    const byId = message.id ? candidates.filter(node => visible(node)
      && [node.getAttribute('data-mid'), node.getAttribute('data-id')].includes(message.id)) : [];
    const matches = byId.length ? byId : candidates.filter(node => visible(node) && textOf(node) === text);
    // Совпавшие вложенные узлы относятся к одному сообщению; одинаковые соседние сообщения — нет.
    const leaves = matches.filter(node => !matches.some(other => other !== node && node.contains(other)));
    if (leaves.length !== 1) return {
      urls: [],
      error: leaves.length ? 'Не удалось однозначно связать фотографии с сообщением MAX' : 'Не найден контейнер сообщения MAX для сбора фотографий',
    };

    let container = leaves[0];
    for (let depth = 0; container && depth < 7 && container !== document.body; depth++, container = container.parentElement) {
      const content = textOf(container);
      if (!content.includes(text) || content.length > text.length + 180) break;
      // Не поднимаемся до списка чата, где можно захватить фотографию соседнего сообщения.
      if (Array.from(container.querySelectorAll(boundarySelector)).some(node =>
        !node.contains(leaves[0]) && !leaves[0].contains(node))) break;
      if (Array.from(container.querySelectorAll(textSelector)).some(node =>
        !node.contains(leaves[0]) && !leaves[0].contains(node) && textOf(node))) break;
      const urls = imageUrls(container);
      if (urls.length) return { urls };
    }
    return { urls: [] };
  });
}
