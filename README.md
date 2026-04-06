# Telegram Bot Admin Panel

Универсальная self-hosted админ-панель для Telegram-бота с современным тёмным интерфейсом и установкой на VPS в пару команд.  
Проект поднимается через Docker Compose и работает как отдельный runtime бота (long polling).

🔗 Репозиторий: [https://github.com/PaikFest/Telegram-Bot-Admin-Panel](https://github.com/PaikFest/Telegram-Bot-Admin-Panel)

---

## Что это
**Telegram Bot Admin Panel** — это операторская веб-панель для управления диалогами Telegram-бота:
- принимать входящие сообщения,
- отвечать пользователям,
- делать массовые рассылки,
- работать с историей сообщений и медиа,
- безопасно входить в панель по login/password.

Без привязки к VPN, оплатам, тарифам или другим узким бизнес-сценариям.

---

## Что умеет
- 📨 **Inbox**: список диалогов, история сообщений, ответы пользователям
- 🖼️ **Фото в чате**: просмотр входящих изображений и отправка фото из панели
- 📣 **Broadcasts**: массовые рассылки (текст/изображения) через очередь outbox
- 👥 **Users**: список пользователей Telegram и ручное добавление
- 📜 **Logs**: системные логи и базовая диагностика
- ⚙️ **Settings**: смена логина/пароля администратора
- 🔒 **Auth + Session**: вход по login/password, cookie-сессии
- 🧠 **Long polling runtime**: проект сам получает Telegram updates (без webhook)
- 🛡️ **Скрытый admin path**: доступ к панели и API через секретный путь

---

## Для кого подходит
- Владельцам Telegram-ботов, которым нужна аккуратная self-hosted админка
- Командам поддержки/операторам, которые отвечают пользователям в чате
- Тем, кто хочет запускать систему на своём VPS и контролировать данные

---

## Что понадобится перед установкой
Подготовьте:
- Ubuntu VPS (22.04 или 24.04)
- root-доступ к серверу
- `BOT_TOKEN` от вашего Telegram-бота (через @BotFather)
- открытый входящий порт `80` (для Caddy)

> Домен не обязателен: система может работать по IP.

---

## Быстрый старт
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/PaikFest/Telegram-Bot-Admin-Panel/main/install.sh)
```

Во время установки скрипт:
1. спросит `BOT_TOKEN` (скрытым вводом),
2. проверит токен через Telegram API,
3. поднимет сервисы через Docker Compose,
4. дождётся health checks,
5. покажет итоговые данные доступа.

---

## Альтернативный запуск с явным репозиторием
Если хотите явно указать репозиторий:
```bash
REPO_URL="https://github.com/PaikFest/Telegram-Bot-Admin-Panel.git" bash <(curl -fsSL https://raw.githubusercontent.com/PaikFest/Telegram-Bot-Admin-Panel/main/install.sh)
```

---

## Что вы получите после установки
Скрипт выведет:
- полный **Admin URL** (с секретным base path),
- **Login**,
- **Password**,
- имя/username бота (если Telegram API вернул их),
- статусы здоровья сервисов.

Также данные сохраняются в файл:
```text
/root/opener-bot-admin-credentials.txt
```
(с правами доступа `600`).

---

## Как открыть панель
Используйте URL из summary после установки. Формат обычно такой:
```text
http://<SERVER_IP>/<ADMIN_PATH_TOKEN>/<ADMIN_PATH_UUID>/login
```

Важно: это **дополнительный слой сокрытия**. Он не заменяет авторизацию — login/password всё равно обязательны.

---

## Обновление проекта
```bash
cd /opt/Telegram-AdminBot-Panel
git pull
bash update.sh
```

---

## Сброс логина/пароля администратора
```bash
cd /opt/Telegram-AdminBot-Panel
bash reset-admin-password.sh
```

Скрипт обновит credentials и снова покажет актуальный Admin URL + новые данные входа.

---

## Удаление проекта
```bash
cd /opt/Telegram-AdminBot-Panel
bash uninstall.sh
```

Удаляет контейнеры, volume-данные проекта и credentials-файл.

---

## Коротко про интерфейс
### Inbox
Главный рабочий экран:
- список диалогов слева,
- переписка справа,
- ответ текстом/фото,
- история сообщений и статусы доставки.

### Broadcasts
Массовые сообщения всем активным пользователям:
- создание рассылки,
- очередь отправки,
- история запусков и результаты.

### Users
Список Telegram-пользователей:
- поиск,
- статусы,
- ручное добавление пользователя.

### Logs
Минимальные системные логи для операционной диагностики.

### Settings
Смена admin login/password внутри панели.

---

## Безопасность
Пожалуйста, соблюдайте базовые правила:
- 🔐 храните `.env`, login/password и credentials-файл в секрете
- 🔑 **никогда не публикуйте `BOT_TOKEN`**
- 🌐 по возможности используйте HTTPS (reverse proxy + TLS)
- 🧱 ограничьте доступ к VPS (firewall, SSH-ключи, fail2ban)
- 🧾 регулярно обновляйте систему и проект (`update.sh`)

---

## Важно знать
- Проект использует **long polling**, не webhook.
- Основной рабочий путь деплоя: `install.sh` / `update.sh`.
- Доступ в админку идёт через секретный base path + авторизацию.
- Если вы переносите сервер или меняется IP, проверяйте актуальный `APP_URL` и итоговый Admin URL.

---

## Поддержка и Issues
Если нашли баг или хотите предложить улучшение — создайте issue:  
👉 [https://github.com/PaikFest/Telegram-Bot-Admin-Panel/issues](https://github.com/PaikFest/Telegram-Bot-Admin-Panel/issues)

---

Спасибо, что используете **Telegram Bot Admin Panel**.  
Пусть поддержка пользователей будет быстрой, спокойной и удобной 💙
