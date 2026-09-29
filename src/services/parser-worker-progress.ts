import type { ChildProcess } from 'node:child_process';

/** Останавливаем всю группу worker вместе с браузером, включая зависшее завершение. */
export function stopParserWorker(child: ChildProcess) {
  const stop = (signal: NodeJS.Signals) => {
    try {
      if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch { /* Процесс уже завершился. */ }
  };
  stop('SIGTERM');
  const timer = setTimeout(() => stop('SIGKILL'), 2000);
  timer.unref();
}

/** Читаем служебные строки worker, сохраняя только подтверждённый результат чтения чата. */
export class ParserWorkerProgress<T extends {
  status: string; source_chat: string; title: string | null;
  messages: Array<{ text: string }>; error?: string;
}> {
  private pending = '';
  private snapshot: T | null = null;
  stage = 'запуск Python и Chromium';

  constructor(private readonly chatUrl: string) {}

  collect(chunk: string) {
    this.pending += chunk;
    let end: number;
    while ((end = this.pending.indexOf('\n')) !== -1) {
      const line = this.pending.slice(0, end);
      this.pending = this.pending.slice(end + 1);
      try {
        const message = JSON.parse(line);
        if (message.event === 'stage' && typeof message.stage === 'string') {
          this.stage = message.stage.slice(0, 160);
        }
        const result = message.result;
        if (message.event === 'checkpoint' && result?.status === 'OK'
          && result.source_chat === this.chatUrl && Array.isArray(result.messages)
          && result.messages.length > 0 && result.messages.length <= 100
          && result.messages.every((item: unknown) => item && typeof (item as { text?: unknown }).text === 'string')
          && (result.title === null || typeof result.title === 'string')) {
          this.snapshot = result;
        }
      } catch { /* Обычный stdout не является служебным сообщением. */ }
    }
  }

  recover(): T | null {
    return this.snapshot ? { ...this.snapshot,
      error: `Текст сохранён; дополнения прерваны на этапе «${this.stage}»` } : null;
  }
}
