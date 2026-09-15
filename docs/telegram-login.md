# Вход через Telegram

Smart Leads использует официальный Telegram OpenID Connect Authorization Code Flow с PKCE. Пароль, токен бота и секрет клиента не передаются в браузер. Сервер проверяет подпись ID token, `issuer`, `audience`, срок действия и одноразовый `nonce`.

## Настройка BotFather

1. Открыть `@BotFather` и выбрать Telegram-бота клиента.
2. Открыть **Login Widget**.
3. Добавить разрешённый origin: `https://ВАШ-ДОМЕН`.
4. Добавить точный callback: `https://ВАШ-ДОМЕН/api/auth/telegram/callback`.
5. Скопировать выданные **Client ID** и **Client Secret**. Токен бота для входа не используется.
6. В Advanced оставить алгоритм подписи `RS256`.

## Переменные Coolify

```dotenv
NEXT_PUBLIC_APP_URL=https://ВАШ-ДОМЕН
TELEGRAM_CLIENT_ID=ЧИСЛОВОЙ_CLIENT_ID_ИЗ_BOTFATHER
TELEGRAM_CLIENT_SECRET=СЕКРЕТ_ИЗ_BOTFATHER
ADMIN_TELEGRAM_IDS=ВАШ_TELEGRAM_ID
```

`TELEGRAM_CLIENT_SECRET` и `AUTH_SESSION_SECRET` должны быть секретными runtime-переменными. После сохранения переменных выполнить redeploy. Кнопка входа находится на `/login`.

Официальный OIDC Telegram требует заранее разрешённый публичный HTTPS-адрес. Полностью проверить реальный вход на `localhost` нельзя; локально проверяются интерфейс, криптография и обработчики, а авторизация ботом проверяется после деплоя домена.

## Модель пользователя

MAX ID хранится только у пользователей, которые действительно вошли через MAX. Telegram ID хранится в `ExternalIdentity`; фиктивные MAX ID не создаются. Уведомления существующего MAX-бота доступны только профилям с MAX ID. Таблица внешних идентификаторов позволяет позже добавить безопасную привязку Telegram к существующему профилю MAX без переноса покупок и баланса.
