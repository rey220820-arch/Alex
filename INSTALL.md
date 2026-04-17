# ТОП ГЕН — Инструкция по установке

## Файлы проекта

Скопируйте на сервер 5 файлов:

```
/var/www/topgen/
├── index.html      (19 КБ — HTML-разметка)
├── style.css       (34 КБ — стили)
├── app.js          (106 КБ — логика)
├── sw.js           (2 КБ — Service Worker)
├── manifest.json   (0.5 КБ — PWA-манифест)
└── icons/
    ├── icon-192.png   (логотип 192x192)
    └── icon-512.png   (логотип 512x512)
```

> **Иконки:** подготовьте PNG 192x192 и 512x512 с логотипом «ТОП ГЕН».
> Без них приложение работает, но на домашнем экране будет пустая иконка.

## Шаг 1. Настройка Nginx

Добавьте в конфиг Nginx (например `/etc/nginx/sites-enabled/topgen`):

```nginx
server {
    listen 443 ssl http2;
    server_name ваш-домен.ru;

    ssl_certificate     /etc/letsencrypt/live/ваш-домен.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ваш-домен.ru/privkey.pem;

    # Безопасность
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header Referrer-Policy strict-origin-when-cross-origin;

    # Статика ТОП ГЕН
    location / {
        root /var/www/topgen;
        index index.html;
        try_files $uri $uri/ /index.html;

        # Кеширование статики
        location ~* \.(css|js|png|ico|json)$ {
            expires 1h;
            add_header Cache-Control "public, must-revalidate";
        }
    }

    # Проксирование Matrix API на Synapse
    location /_matrix {
        proxy_pass http://127.0.0.1:8008;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Host $host;
        client_max_body_size 50M;
    }

    # Проксирование Synapse Admin API
    location /_synapse {
        proxy_pass http://127.0.0.1:8008;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Host $host;
    }
}

# Редирект HTTP → HTTPS
server {
    listen 80;
    server_name ваш-домен.ru;
    return 301 https://$host$request_uri;
}
```

Применить:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Шаг 2. Настройка Synapse (homeserver.yaml)

Критические настройки для закрытого контура:

```yaml
# ЗАКРЫТЬ ФЕДЕРАЦИЮ — данные не уходят наружу
federation_domain_whitelist: []

# Регистрация только по токену
enable_registration: true
registration_requires_token: true

# Отключить гостей
allow_guest_access: false

# Превью ссылок — отключить если не нужно (сервер ходит по ссылкам)
url_preview_enabled: false

# Лимиты от брутфорса
rc_login:
  per_second: 0.5
  burst_count: 5

rc_registration:
  per_second: 0.1
  burst_count: 3

# Политика паролей
password_config:
  enabled: true
  minimum_length: 8
  require_digit: true
  require_symbol: false
  require_lowercase: true
  require_uppercase: false

# Размер загрузки
max_upload_size: 50M

# Публичные комнаты — выключить
allow_public_rooms_without_auth: false
allow_public_rooms_over_federation: false
```

Перезапустить Synapse:
```bash
sudo systemctl restart matrix-synapse
```

## Шаг 3. Создание администратора

Если ещё не создан:
```bash
register_new_matrix_user -c /etc/matrix-synapse/homeserver.yaml http://localhost:8008
```
Ввести логин, пароль, ответить `yes` на вопрос про admin.

## Шаг 4. Проверка

1. Откройте `https://ваш-домен.ru` в браузере
2. Появится splash-экран «ТОП ГЕН», потом форма входа
3. Войдите под администратором
4. Создайте чат (кнопка `+ чат` или меню → `Новый чат`)
5. Создайте приглашение (меню → `Приглашения`) → скопируйте ссылку
6. Откройте ссылку в другом браузере/инкогнито → зарегистрируйте сотрудника
7. Проверьте отправку сообщений, фото, голосовых

## Шаг 5. Установка на телефон (PWA)

### iPhone (Safari):
1. Откройте `https://ваш-домен.ru`
2. Нажмите кнопку «Поделиться» (квадрат со стрелкой)
3. «На экран Домой»
4. Приложение появится как иконка

### Android (Chrome):
1. Откройте `https://ваш-домен.ru`
2. Меню (три точки) → «Добавить на главный экран»
3. Или баннер «Установить» появится автоматически

## Что получает сотрудник

- Мессенджер работает как обычное приложение
- Оффлайн: сообщения встают в очередь, уходят при появлении сети
- Push-уведомления (если разрешены)
- Ватермарк с логином (защита от скриншотов)
- Автоблокировка через 15 мин бездействия

## Что может администратор

- **Создавать чаты и каналы** (📢 — только админ пишет)
- **Приглашать по ссылке** с токеном (одноразовые/многоразовые)
- **Удалять участников** из чатов (красная кнопка «Удалить»)
- **Увольнять сотрудников** (деактивация аккаунта)
- **Сбрасывать пароли** (временный пароль → показан один раз)
- **Управлять хранилищем** (очистка медиа-кеша)
- **Просматривать журнал** действий (кик, увольнение, сброс пароля)
- **Видеть устройства** сотрудников и завершать сессии

## Поддержка

Если что-то не работает:
1. Откройте DevTools (F12) → Console — ищите ошибки
2. Проверьте что Synapse доступен: `curl http://localhost:8008/_matrix/client/versions`
3. Проверьте Nginx: `sudo nginx -t`
4. Логи Synapse: `journalctl -u matrix-synapse -f`
