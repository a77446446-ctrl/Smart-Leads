FROM node:22-bookworm

WORKDIR /app

# Устанавливаем Python, pip
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv && rm -rf /var/lib/apt/lists/*

# Создаем виртуальное окружение Python
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Копируем requirements.txt и ставим Python пакеты
COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

# Устанавливаем браузеры для Playwright и системные зависимости
RUN playwright install --with-deps chromium

# Устанавливаем Node.js пакеты
COPY package.json package-lock.json ./
RUN npm ci

# Копируем проект и собираем
COPY . .
RUN npx prisma generate
RUN npm run build

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "run", "start"]
