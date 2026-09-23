// Дополняет уже найденный текст: не меняет селекторы и правила основного парсера.
(messages) => {
  const boundary = '[data-mid], [role="article"], article, div[data-id]';
  const candidates = Array.from(document.querySelectorAll(
    boundary + ', [class*="MessageText"], [class*="messageText"], .text-content, [class*="text-content"]'
  ));
  const textOf = node => (node.innerText || node.textContent || '').trim();
  const visible = node => { const box = node.getBoundingClientRect(); return box.width > 150 && box.left > 250; };
  return messages.map(message => {
    const text = message.text.split('\n\nКонтакты (ссылки): ')[0];
    const matches = candidates.filter(node => visible(node) && (message.id
      ? [node.getAttribute('data-mid'), node.getAttribute('data-id')].includes(message.id)
      : textOf(node) === text));
    const containers = [...new Set(matches.map(node => node.closest(boundary)).filter(Boolean))];
    // Не берём фотографию соседнего сообщения при неоднозначном совпадении текста.
    if (containers.length !== 1) return [];
    const container = containers[0];
    return [...new Set(Array.from(container.querySelectorAll('img')).filter(img => {
      if (img.closest(boundary) !== container) return false;
      if (img.closest('[class*="avatar" i], [class*="sticker" i], [class*="emoji" i], [class*="preview" i]')) return false;
      const box = img.getBoundingClientRect();
      return img.naturalWidth >= 120 && img.naturalHeight >= 80 && box.width >= 100 && box.height >= 60;
    }).map(img => img.currentSrc || img.src).filter(Boolean))].slice(0, 6);
  });
}
