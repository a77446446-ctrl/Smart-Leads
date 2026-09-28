# syntax=docker/dockerfile:1
FROM node:22-bookworm

WORKDIR /app

# Устанавливаем Python, pip
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv && rm -rf /var/lib/apt/lists/*

# Создаем виртуальное окружение Python
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Копируем requirements.txt и ставим Python пакеты с повторным использованием кэша.
COPY requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/pip pip3 install -r requirements.txt

# На сервере парсер и вход запускают Chromium без графического интерфейса.
# Скачиваем только headless shell и предпочитаем IPv4: IPv6 CDN недоступен на VPS.
RUN NODE_OPTIONS=--dns-result-order=ipv4first playwright install --with-deps --only-shell chromium

# Сохраняем кэш npm между сборками; аудит выполняется отдельно от деплоя.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --prefer-offline

# Копируем проект и собираем
COPY . .
RUN npm run build

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "run", "start"]
