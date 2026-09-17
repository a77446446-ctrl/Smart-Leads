# Развёртывание Smart Leads в Coolify

Для новых клиентских экземпляров используйте [минимальные инфраструктурные переменные и настройку интеграций в админке](owner-setup.md). Большой список ниже остаётся вариантом настройки всех интеграций через Coolify.

Репозиторий GitHub уже содержит `Dockerfile` в корне. В Coolify выбрать сборку **Dockerfile**, ветку `main`, Base Directory `/`, Dockerfile Location `Dockerfile`, Ports Exposes `3000` и постоянный HTTPS-домен. Контейнер слушает `0.0.0.0:3000`; команда запуска сама применяет миграции Prisma и запускает Next.js с внутренним планировщиком.

## Переменные приложения

Для нового экземпляра вставить в **Configuration → Environment Variables → Developer view** и заменить все значения в угловых скобках. Если переменные в Coolify уже есть, сохранить их реальные значения: Developer view при сохранении синхронизирует весь список и может удалить пропущенные строки. Значения с пробелами записывать в двойных кавычках. Секреты удобно затем пометить как секретные в Normal view. Пустые значения в примере означают выключенную необязательную интеграцию.

```dotenv
# Основа: для одного PostgreSQL без пулера URL могут совпадать.
DATABASE_URL=postgresql://<USER>:<PASSWORD>@<POSTGRES_HOST>:5432/<DATABASE>?schema=public
DIRECT_URL=postgresql://<USER>:<PASSWORD>@<POSTGRES_HOST>:5432/<DATABASE>?schema=public
NEXT_PUBLIC_APP_URL=https://<ВАШ-ДОМЕН>
AUTH_SESSION_SECRET=<ПОСТОЯННЫЙ_СЛУЧАЙНЫЙ_СЕКРЕТ_НЕ_КОРОЧЕ_32_СИМВОЛОВ>
CRON_SECRET=<ДРУГОЙ_ПОСТОЯННЫЙ_СЛУЧАЙНЫЙ_СЕКРЕТ_НЕ_КОРОЧЕ_32_СИМВОЛОВ>
INGEST_SECRET=<ТРЕТИЙ_ПОСТОЯННЫЙ_СЛУЧАЙНЫЙ_СЕКРЕТ_НЕ_КОРОЧЕ_32_СИМВОЛОВ>

# Парсер MAX: ключи и volume сохранять между обновлениями.
PARSER_PROXY_ENCRYPTION_KEY=<ПОСТОЯННЫЙ_СЛУЧАЙНЫЙ_КЛЮЧ_НЕ_КОРОЧЕ_32_СИМВОЛОВ>
PARSER_SESSION_ENCRYPTION_KEY=<ДРУГОЙ_ПОСТОЯННЫЙ_КЛЮЧ_НЕ_КОРОЧЕ_32_СИМВОЛОВ>
PARSER_SESSIONS_DIR=/app/data/sessions
PARSER_PYTHON_EXECUTABLE=/opt/venv/bin/python
PARSER_AUTH_HEADLESS=true
PARSER_AUTH_TIMEZONE=
PARSER_WORKER_TIMEOUT_MS=120000
PARSER_DEBUG_ARTIFACTS=false

# Вход и публикация через MAX: заполнять после создания собственного бота.
MAX_BOT_TOKEN=<ТОКЕН_БОТА_MAX>
MAX_BOT_USERNAME=<ИМЯ_БОТА_БЕЗ_СИМВОЛА_@>
MAX_WEBHOOK_SECRET=<ОТДЕЛЬНЫЙ_СЛУЧАЙНЫЙ_СЕКРЕТ_5_256_СИМВОЛОВ_A_Z_0_9_ПОДЧЕРКИВАНИЕ_ИЛИ_ДЕФИС>
ADMIN_MAX_IDS=<ВАШ_ЧИСЛОВОЙ_MAX_ID>

# Веб-вход Telegram: это Client ID и Client Secret из BotFather → Login Widget,
# а не токен Telegram-бота.
TELEGRAM_CLIENT_ID=<ЧИСЛОВОЙ_CLIENT_ID>
TELEGRAM_CLIENT_SECRET=<CLIENT_SECRET>
ADMIN_TELEGRAM_IDS=<ВАШ_ЧИСЛОВОЙ_TELEGRAM_ID>

# Юридические документы: реальные реквизиты оператора.
LEGAL_DOCUMENT_VERSION=2026-08-23
LEGAL_EFFECTIVE_DATE=<ДАТА_НАЧАЛА_ДЕЙСТВИЯ>
LEGAL_OPERATOR_TYPE=SOLE_PROPRIETOR
LEGAL_OPERATOR_NAME=<ИМЯ_ИЛИ_НАЗВАНИЕ_ОПЕРАТОРА>
LEGAL_TAX_ID=<ИНН>
LEGAL_REGISTRATION_ID=<ОГРН_ИЛИ_ОГРНИП>
LEGAL_ADDRESS=<ЮРИДИЧЕСКИЙ_АДРЕС>
LEGAL_EMAIL=<EMAIL>
LEGAL_SUPPORT_EMAIL=<EMAIL_ПОДДЕРЖКИ>

# Только при подключении реальных платежей ЮKassa.
YOOKASSA_SHOP_ID=
YOOKASSA_SECRET_KEY=
YOOKASSA_VAT_CODE=1
YOOKASSA_RETURN_URL=https://<ВАШ-ДОМЕН>/subscriptions

# Необязательный поиск чатов: по умолчанию отключён.
DISCOVERY_ENABLED=false
DISCOVERY_INTERVAL_HOURS=6
DISCOVERY_AUTO_ACTIVATE_SCORE=85
DISCOVERY_HTTP_TIMEOUT_MS=10000
DISCOVERY_QUERIES=
DISCOVERY_GOOGLE_API_KEY=
DISCOVERY_GOOGLE_CX=
DISCOVERY_VK_TOKEN=
DISCOVERY_VK_API_VERSION=5.199
DISCOVERY_SEED_URLS=

# Необязательный ИИ-анализ.
DEEPSEEK_API_KEY=
OPENAI_API_KEY=

# В образе есть официальный PEM; включать, только если без него MAX API не проходит TLS.
NODE_EXTRA_CA_CERTS=/app/certs/russian-trusted-ca-bundle.pem
```

`ADMIN_MAX_IDS` и `ADMIN_TELEGRAM_IDS` допускают несколько числовых ID через запятую. Для входа Telegram административный ID не обязателен: сначала можно войти как обычный пользователь, затем узнать свой ID из таблицы `ExternalIdentity` и добавить его в `ADMIN_TELEGRAM_IDS` с последующим redeploy. Если MAX-бот ещё не создан, оставить все `MAX_BOT_*` и `ADMIN_MAX_IDS` пустыми; кнопка MAX тогда покажет, что вход пока не настроен. Для запуска парсера MAX-аккаунт и прокси добавляются в интерфейсе администратора.

Не менять `AUTH_SESSION_SECRET` и ключи парсера без плана ротации: смена первого завершит пользовательские сессии, смена ключей парсера сделает прежние зашифрованные данные нечитаемыми. `DEV_LOGIN_ENABLED`, `DEV_ADMIN_MAX_ID` и `SMART_LEADS_RUNTIME_DIR` относятся только к локальной среде и в Coolify не нужны. `ONBOARDING_BONUS_KOPECKS` код не использует: бонус задаётся в настройках приложения. `TELEGRAM_BOT_TOKEN` для текущего веб-входа тоже не используется; публикация в Telegram-канал/группу пока не реализована.

## Настройка платформ после деплоя

1. В BotFather выбрать своего бота → **Login Widget**. Добавить два Allowed URLs: `https://<ВАШ-ДОМЕН>` и `https://<ВАШ-ДОМЕН>/api/auth/telegram/callback`. Скопировать Client ID и Client Secret в переменные выше. Оставить алгоритм подписи `RS256`. После redeploy проверить кнопку Telegram на публичном домене.
2. Для MAX создать бота, сохранить токен и имя в переменных или в разделе **Интеграции**, а публичный URL приложения добавить в настройках его Mini App. Подписку webhook можно включить кнопкой **Подключить webhook MAX** в разделе **Интеграции** или командой `npm run bot:webhook` в терминале запущенного контейнера Coolify. Её адрес — `https://<ВАШ-ДОМЕН>/api/webhooks/max`; вручную вводить webhook URL в env не нужно.
   При подключении реальных платежей указать в ЮKassa URL уведомлений `https://<ВАШ-ДОМЕН>/api/webhooks/yookassa`.
3. В **Persistent Storage** добавить volume с Destination Path `/app/data` — там лежат сессии парсера и данные загрузок. Для базы PostgreSQL настроить отдельное постоянное хранилище и резервное копирование.
4. В Coolify включить healthcheck `GET /api/health` на порту `3000`; ожидаемый ответ — HTTP 200 и `db: connected`.

После сохранения переменных выполнить **Redeploy**. Если база в отдельном контейнере Coolify, `POSTGRES_HOST` должен быть её внутренним сетевым именем, доступным приложению. Секреты не публиковать в GitHub и не присылать в переписке.
# Центральная панель и ключ подключения

Клиентская переменная подключения к реестру — `SMART_LEADS_INSTANCE_KEY`; её значение выдаёт центральная панель после создания карточки. Адрес панели — `SMART_LEADS_CONTROL_URL`. Обе переменные задаются только для Runtime. Центральный сайт разворачивается отдельно через `Dockerfile.operator`. Полные шаги и памятка менеджера: [operator-control.md](operator-control.md).
