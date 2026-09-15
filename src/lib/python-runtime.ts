export function parserPythonExecutable(): string {
  const configured = process.env.PARSER_PYTHON_EXECUTABLE?.trim();
  if (configured) {
    if (configured.length > 260 || /[\r\n\0]/.test(configured)) throw new Error('Некорректный путь к Python worker');
    return configured;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

export function parserPythonSpawnError(error: unknown): Error {
  const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
  if (code === 'ENOENT') {
    return new Error('Python worker не установлен в контейнере. Требуется повторный деплой с конфигурацией Nixpacks.');
  }
  return error instanceof Error ? error : new Error('Не удалось запустить Python worker');
}
