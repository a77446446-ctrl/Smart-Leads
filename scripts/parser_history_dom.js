// Один контейнер MAX — одна публикация. Счётчики и цитаты не становятся отдельными лидами.
() => {
  const history = document.querySelector('.history');
  if (!history) return null;
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  const dateLabel = text => {
    text = norm(text).toLowerCase();
    if (text === 'сегодня' || text === 'вчера') {
      const date = new Date(today); date.setDate(date.getDate() - Number(text === 'вчера'));
      return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
    }
    const match = text.match(/^(\d{1,2})\s+([а-я]+)(?:\s+(\d{4}))?$/);
    if (!match || !months.includes(match[2])) return null;
    let year = Number(match[3] || today.getFullYear());
    if (!match[3] && months.indexOf(match[2]) > today.getMonth()) year--;
    return [year, months.indexOf(match[2]) + 1, Number(match[1])];
  };
  let day = null;
  let firstDivider = null;
  const rows = [];
  for (const node of history.querySelectorAll('.capsuleSeparator, .messageWrapper')) {
    if (node.matches('.capsuleSeparator')) {
      day = dateLabel(node.textContent) || day;
      if (day && !firstDivider) firstDivider = day;
      continue;
    }
    const body = node.querySelector('.bubbleContent > .text');
    const hasMedia = !!node.querySelector('.bubbleContent > .media');
    const text = (body?.innerText || body?.textContent || '').trim();
    if (!text && !hasMedia) continue;
    const time = norm(node.querySelector('.bubbleContent > .meta')?.textContent).match(/\b((?:[01]?\d|2[0-3]):[0-5]\d)\b/)?.[1];
    const publishedAt = day && time ? new Date(`${day[0]}-${String(day[1]).padStart(2,'0')}-${String(day[2]).padStart(2,'0')}T${time.padStart(5,'0')}:00+03:00`).toISOString() : undefined;
    const links = [...new Set(Array.from(body?.querySelectorAll('a[href]') || []).map(a => a.href).filter(url => /^https?:\/\//i.test(url)))];
    const content = (text || 'Медиапубликация') + (links.length ? '\n\nКонтакты (ссылки): ' + links.join(' , ') : '');
    rows.push({ text: content, id: node.getAttribute('data-mid') || node.getAttribute('data-id') || undefined,
      domIndex: node.closest('[data-index]')?.getAttribute('data-index'),
      engagement: { body: content, reactions: [], time, publishedAt } });
  }
  // При виртуализации начало списка бывает без разделителя даты.
  const startDay = firstDivider ? new Date(firstDivider[0], firstDivider[1] - 1, firstDivider[2] - 1)
    : new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (const row of rows) {
    if (row.engagement.publishedAt) break;
    const time = row.engagement.time;
    if (time) row.engagement.publishedAt = new Date([startDay.getFullYear(), String(startDay.getMonth()+1).padStart(2,'0'), String(startDay.getDate()).padStart(2,'0')].join('-')+'T'+time.padStart(5,'0')+':00+03:00').toISOString();
  }
  return rows.slice(-100);
}
