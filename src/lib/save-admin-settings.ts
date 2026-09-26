/** Ограничивает весь цикл сохранения, включая чтение ответа и отдельный зашифрованный черновик прокси. */
export async function saveAdminSettings(
  settings: { key: string; value: string }[],
  saveProxy?: (signal: AbortSignal) => Promise<unknown>,
  timeoutMs = 20_000,
): Promise<void> {
  const controller = new AbortController();
  let settingsSaved = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(settingsSaved
        ? 'Настройки и чаты сохранены, но подтверждение сохранения прокси не получено. Проверьте прокси и повторите попытку.'
        : 'Сервер не подтвердил сохранение за 20 секунд. Изменения оставлены в форме. Проверьте соединение и повторите попытку.');
      reject(error);
      controller.abort(error);
    }, timeoutMs);
  });
  const save = async () => {
    const response = await fetch('/api/admin/settings/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }), signal: controller.signal,
    });
    const data = await response.json().catch(() => null) as { saved?: boolean; error?: string } | null;
    controller.signal.throwIfAborted();
    if (!response.ok || data?.saved !== true) throw new Error(data?.error || 'Сервер не подтвердил сохранение настроек');
    settingsSaved = true;
    if (saveProxy) {
      try { await saveProxy(controller.signal); }
      catch (error) {
        controller.signal.throwIfAborted();
        throw new Error('Настройки и чаты сохранены, но прокси не сохранён: ' + (error instanceof Error ? error.message : 'ошибка запроса'));
      }
    }
    controller.signal.throwIfAborted();
  };
  try { await Promise.race([deadline, save()]); }
  finally { if (timer) clearTimeout(timer); }
}
