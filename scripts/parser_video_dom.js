// Видео ищем только в контейнере конкретного текстового сообщения.
(messages) => messages.map(message => {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const body = normalize(message.engagement?.body || message.text.split('\n\nКонтакты (ссылки): ')[0]);
  const indexed = message.domIndex == null ? [] : Array.from(document.querySelectorAll('.history [data-index]'))
    .filter(node => node.getAttribute('data-index') === message.domIndex)
    .flatMap(node => Array.from(node.querySelectorAll('.messageWrapper')));
  const wrappers = indexed.length ? indexed : Array.from(document.querySelectorAll('.messageWrapper'))
    .filter(node => normalize(node.querySelector('.bubbleContent > .text')?.textContent) === body);
  if (wrappers.length !== 1) return { urls: [], error: wrappers.length ? 'Неоднозначная привязка видео к сообщению MAX' : undefined };
  const urls = Array.from(wrappers[0].querySelectorAll('video')).map(video => video.currentSrc || video.src || video.querySelector('source')?.src)
    .filter(url => url && /^(https:\/\/|blob:)/.test(url));
  return { urls: [...new Set(urls)].slice(0, 1) };
})
