// Дополняет уже найденный текст: не меняет селекторы и правила основного парсера.
(messages) => {
  const textSelector = '[class*="MessageText"], [class*="messageText"], .text-content, [class*="text-content"]';
  const candidates = Array.from(document.querySelectorAll(
    '[data-mid], [role="article"], article, div[data-id], .MessageList .Message, [class*="Message"], [class*="message"]'
  ));
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const textOf = node => normalize(node.innerText || node.textContent);
  const visible = node => { const box = node.getBoundingClientRect(); return box.width > 150 && box.left > 250; };
  const imageUrls = container => [...new Set(Array.from(container.querySelectorAll('img')).filter(img => {
    if (img.closest('[class*="avatar" i], [class*="sticker" i], [class*="emoji" i], [class*="link-preview" i], [class*="linkPreview" i], [class*="urlPreview" i]')) return false;
    const box = img.getBoundingClientRect();
    return img.naturalWidth >= 120 && img.naturalHeight >= 80 && box.width >= 100 && box.height >= 60;
  }).map(img => img.currentSrc || img.src).filter(Boolean))].slice(0, 6);
  return messages.map(message => {
    const text = normalize(message.text.split('\n\nКонтакты (ссылки): ')[0]);
    if (!text) return [];
    const byId = message.id ? candidates.filter(node => visible(node)
      && [node.getAttribute('data-mid'), node.getAttribute('data-id')].includes(message.id)) : [];
    const matches = byId.length ? byId : candidates.filter(node => visible(node) && textOf(node) === text);
    // Совпавшие вложенные узлы относятся к одному сообщению; одинаковые соседние сообщения — нет.
    const leaves = matches.filter(node => !matches.some(other => other !== node && node.contains(other)));
    if (leaves.length !== 1) return [];

    let container = leaves[0];
    for (let depth = 0; container && depth < 7 && container !== document.body; depth++, container = container.parentElement) {
      const content = textOf(container);
      if (!content.includes(text) || content.length > text.length + 180) break;
      // Не поднимаемся до списка чата, где можно захватить фотографию соседнего сообщения.
      if (Array.from(container.querySelectorAll(textSelector)).some(node =>
        !node.contains(leaves[0]) && !leaves[0].contains(node) && textOf(node))) break;
      const urls = imageUrls(container);
      if (urls.length) return urls;
    }
    return [];
  });
}
