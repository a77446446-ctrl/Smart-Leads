# Этап 4. «Детектив» источников MAX

## Архитектура

Конвейер не скрейпит HTML Google и не обходит защиту сайтов. Он получает данные через официальный Google Custom Search JSON API и официальный VK API, извлекает только ссылки `https://max.ru/...`, нормализует их в `https://web.max.ru/...`, удаляет tracking-параметры и сохраняет аудит в PostgreSQL.

Состояния источника:

- `PENDING` — кандидат требует проверки;
- `ACTIVE` — источник включён в рабочий парсер;
- `REJECTED` — администратор отклонил источник; повторное обнаружение не активирует его автоматически.

Таблица `TargetChat` является источником истины для автоматически найденных чатов. Старый JSON `Setting.maks_parsing_chats` продолжает работать для обратной совместимости. Парсер объединяет оба списка по нормализованному URL и не копирует записи `TargetChat` обратно в JSON.

## Настройка Coolify

1. Перед запуском новой версии выполнить `npx prisma migrate deploy`.
2. Установить `DISCOVERY_ENABLED=true`.
3. Установить интервал `DISCOVERY_INTERVAL_HOURS=6` и порог `DISCOVERY_AUTO_ACTIVATE_SCORE=85`.
4. Настроить хотя бы одного провайдера:
   - Google: `DISCOVERY_GOOGLE_API_KEY` и `DISCOVERY_GOOGLE_CX`;
   - VK: `DISCOVERY_VK_TOKEN` и при необходимости `DISCOVERY_VK_API_VERSION`.
5. Запросы перечислить через `|` в `DISCOVERY_QUERIES`.

Официальные спецификации:

- Google Custom Search: https://developers.google.com/custom-search/v1/reference/rest/v1/cse/list
- VK API schema: https://github.com/VKCOM/api-schema

Секреты задаются только в Environment Variables Coolify. Они не сохраняются в `Setting`, не возвращаются API и маскируются в текстах ошибок.

## Управление

- `/admin/discovery` — список источников, история запусков, ручное добавление, активация и отклонение;
- `POST /api/admin/discovery/run` — ручной запуск с обязательной ролью `ADMIN`;
- `POST /api/internal/discovery/run` — cron endpoint с `Authorization: Bearer <CRON_SECRET>`;
- cron-процесс опрашивает endpoint раз в минуту, но реальный поиск запускается только после заданного интервала;
- DB lease `max-chat-discovery` исключает параллельный поиск несколькими репликами.

## Smoke-проверка

1. Оставить `DISCOVERY_ENABLED=false`, применить миграцию и проверить открытие `/admin/discovery`.
2. Добавить тестовую корректную ссылку вручную и убедиться, что она получила `ACTIVE`.
3. Перевести её в `PENDING`, затем в `REJECTED`; проверить, что парсер её не берёт.
4. Настроить один официальный API, включить поиск и нажать «Запустить поиск».
5. Проверить последнюю запись `DiscoveryRun`, отсутствие токенов в логах и дедупликацию повторно найденных URL.
6. Запустить синхронизацию парсера и проверить заполнение `lastCheckedAt`/`lastError`.

## Откат

Сначала установить `DISCOVERY_ENABLED=false`. Код предыдущей версии не использует новые таблицы, поэтому аддитивную миграцию можно оставить. Удалять `TargetChat` и `DiscoveryRun` при штатном откате не нужно: это сохраняет аудит и исключает потерю данных.
