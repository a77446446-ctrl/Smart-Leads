// Дополняет уже найденный текст: не меняет селекторы и правила основного парсера.
async (messages) => {
  const textSelector = '[class*="MessageText"], [class*="messageText"], .text-content, [class*="text-content"]';
  const boundarySelector = '[data-mid], [role="article"], article, div[data-id], .MessageList .Message, .messageWrapper, [class*="messageItem"], [class*="MessageItem"], [class*="message-item"]';
  const candidateSelector = '[data-mid], [role="article"], article, div[data-id], .MessageList .Message, [class*="Message"], [class*="message"], ' + textSelector;
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const textOf = node => normalize(node.innerText || node.textContent);
  const visible = node => { const box = node.getBoundingClientRect(); return box.width > 150 && box.height > 0; };
  const excluded = '[class*="avatar" i], [class*="sticker" i], [class*="emoji" i], [class*="link-preview" i], [class*="linkPreview" i], [class*="urlPreview" i], .video, video';
  const inspect = container => {
    const entries = [];
    // В MAX img появляется внутри image-placeholder только после прокрутки к фото.
    // Миниатюрный data:image фон заглушки не является исходной фотографией.
    for (const node of container.querySelectorAll('*')) {
      if (entries.length >= 6) break;
      if (node.closest(excluded)) continue;
      const box = node.getBoundingClientRect();
      if (box.width < 100 || box.height < 60) continue;
      if (node.matches('.image-placeholder') || node.tagName === 'IMG') {
        if (node.tagName === 'IMG' && node.closest('.image-placeholder')) continue;
        const img = node.tagName === 'IMG' ? node : node.querySelector('img');
        const url = img && img.complete && img.naturalWidth >= 120 && img.naturalHeight >= 80 ? img.currentSrc || img.src : null;
        entries.push({ target: node, url });
      } else {
        const background = getComputedStyle(node).backgroundImage;
        for (const match of background.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)) {
          const url = match[1] ?? match[2] ?? match[3].trim();
          if (/^(https:\/\/|blob:)/.test(url) && entries.length < 6) entries.push({ target: node, url });
        }
      }
    }
    return { urls: [...new Set(entries.map(entry => entry.url).filter(Boolean))], pending: entries.filter(entry => !entry.url).map(entry => entry.target) };
  };
  const locate = message => {
    const candidates = Array.from(document.querySelectorAll(candidateSelector));
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
      const state = inspect(container);
      if (state.urls.length || state.pending.length) return { container, ...state };
    }
    return { urls: [] };
  };
  const deadline = Date.now() + 15000;
  const groups = [];
  for (const message of messages) {
    let state = locate(message);
    const messageDeadline = Math.min(deadline, Date.now() + 2500);
    while (state.pending?.length && Date.now() < messageDeadline) {
      // Прокручиваем только однозначно найденное вложение; не открываем медиапросмотрщик.
      state.pending[0].scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      await new Promise(resolve => setTimeout(resolve, 100));
      // MAX может заменить узлы при виртуализации списка. Повторно проверяем привязку к тексту.
      state = locate(message);
    }
    if (state.pending?.length) {
      // Частичный альбом не сохраняем: иначе позиции снимков перепутаются при повторном сборе.
      groups.push({ urls: [], error: 'Фотографии MAX не загрузились после прокрутки за отведённое время' });
    } else {
      groups.push(state.error ? { urls: [], error: state.error } : { urls: state.urls });
    }
  }
  return groups;
}
