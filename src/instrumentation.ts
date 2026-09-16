export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.DATABASE_URL) {
    try {
      const { loadInstanceConfig } = await import('@/lib/instance-config');
      await loadInstanceConfig();
    } catch (error) {
      console.error('[НАСТРОЙКИ ЭКЗЕМПЛЯРА] Не удалось загрузить настройки:', error instanceof Error ? error.message : 'неизвестная ошибка');
    }
  }
}
