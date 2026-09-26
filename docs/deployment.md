# Развёртывание демонстрации на Linux

Нужны Docker Engine, Compose 2.24.4 или новее, Git, Bash и OpenSSL. Порт 80 должен быть свободен. Секреты создаются один раз на сервере и не попадают в Git.

```bash
git clone https://github.com/proger89/test123334.git /opt/vsm-hackathon
cd /opt/vsm-hackathon
APP_URL=http://185.173.147.205 bash scripts/server.sh start
bash scripts/server.sh status
```

Скрипт последовательно собирает сервер и интерфейс, выполняет миграции и ждёт готовности. Проект называется `vsm-hackathon-demo`, база использует отдельный постоянный том. Другие Docker-проекты не затрагиваются. Порт БД наружу не публикуется. Службы автоматически запускаются после перезагрузки Docker. Память служб и размер журналов ограничены в `compose.server.yaml`; пул PHP запускает до трёх процессов.

Защищённый адрес стенда: https://185.173.147.205/. Обычный HTTP перенаправляет на HTTPS. По просьбе владельца Amnezia удалена, порт 443 передан тренажёру. Адрес с `:8443` также доступен для совместимости с первой настройкой HTTPS.

## HTTPS на сервере Aeza

Конфигурация рассчитана на адрес `185.173.147.205`, каталог `/opt/vsm-hackathon` и свободные порты 443 и 8443. Для другого сервера измените IP в `infra/nginx.tls.conf` и `scripts/certificates.sh`, а также рабочий каталог службы. Исходный локальный запуск на порту 8180 остаётся по HTTP.

Сертификат Let's Encrypt подтверждает IP-адрес. Используется [краткосрочный профиль сертификата](https://letsencrypt.org/2026/03/11/shorter-certs-certbot/); Certbot 5.8.0 закреплён по digest. Проверка продления запускается четыре раза в сутки, а пропущенный из-за выключения сервера запуск выполняется после включения. Порт 80 должен оставаться доступен для проверки владения адресом. Закрытый ключ хранится в `runtime/letsencrypt`, вне Git. Учётная запись центра сертификации создаётся без электронной почты: контролируйте состояние службы и срок сертификата.

Первая настройка выполняется от root после обычного запуска приложения:

```bash
cd /opt/vsm-hackathon
install -d -m 700 /opt/vsm-backups
cp -p .env "/opt/vsm-backups/before-https-$(date -u +%Y%m%dT%H%M%S).env"
mkdir -p runtime/acme
docker compose -p vsm-hackathon-demo -f compose.yaml -f compose.server.yaml -f compose.acme.yaml up -d --no-deps --wait web
bash scripts/certificates.sh issue
# Продолжайте только после успешного выпуска сертификата.
sed -i 's|^APP_URL=.*|APP_URL=https://185.173.147.205|' .env
sed -i 's|^SESSION_SECURE_COOKIE=.*|SESSION_SECURE_COOKIE=true|' .env
touch runtime/tls.enabled
docker compose -p vsm-hackathon-demo -f compose.yaml -f compose.server.yaml -f compose.tls.yaml up -d --no-deps --wait api worker web
install -m 644 infra/vsm-certificates.service infra/vsm-certificates.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now vsm-certificates.timer
bash scripts/certificates.sh test
curl --fail https://185.173.147.205/api/health/ready
```

`certificates.sh test` проверяет продление через испытательный центр сертификации, не заменяя рабочий сертификат. Затем проверяет конфигурацию Nginx и перечитывает действующий сертификат. Обычное продление также проверяет конфигурацию перед перечитыванием. При ошибке Nginx продолжает обслуживать подключения со старым сертификатом; служба завершается с ошибкой, следующий запуск повторит попытку. Это не заменяет внешний контроль доступности.

```bash
systemctl list-timers vsm-certificates.timer
systemctl status vsm-certificates.service
journalctl -u vsm-certificates.service --since today
bash scripts/server.sh status
```

Откат только HTTPS: остановите таймер `systemctl disable --now vsm-certificates.timer`, восстановите `.env` из копии перед настройкой, удалите только файл-маркер `runtime/tls.enabled`, затем пересоздайте `api worker web` с двумя исходными Compose-файлами. Сертификаты, базу и тома не удаляйте. Сайт вернётся на HTTP. Из-за защищённых cookie браузеру после такого отката может понадобиться новый профиль; сохранённые результаты остаются в базе.

## Обновление и сохранение данных

Перед обновлением сохраните `.env` в защищённое хранилище и сделайте резервную копию базы:

```bash
umask 077
docker compose -p vsm-hackathon-demo -f compose.yaml -f compose.server.yaml exec -T db pg_dump -U vsm -Fc vsm > ../vsm-backup.dump
git rev-parse HEAD
git pull --ff-only
bash scripts/server.sh start
```

Копию базы нужно вынести с сервера. Этот документ не означает, что регулярное внешнее резервное копирование настроено. Остановка `bash scripts/server.sh stop` сохраняет данные. Не удаляйте том PostgreSQL и `.env`.

При неуспешной миграции `init` завершится с ошибкой и не разрешит запуск зависимых служб. Сначала изучите журнал `init`; не применяйте откат миграций вслепую. Возвращаемая версия приложения должна понимать сохранённые упражнения и исключать их из обычных результатов. Подробности — в [описании упражнений](practice.md). Перед возвратом предыдущего кода сохраните актуальную базу и образы.

Проверка готовности: `/api/health/ready`. Состояние обработчика сроков: `bash scripts/server.sh status`. Результаты фактического развёртывания записываются отдельно в `docs/evidence/deployment.txt`.

## Проверенное развёртывание

25 сентября 2026 года демо запущено на http://185.173.147.205/. Все четыре рабочие службы здоровы, миграции завершены. Через публичный адрес пройдены две браузерные цепочки: две смены с наградами и рейтингами; ошибка, упражнение и самостоятельная проверка. [Подтверждения](evidence/deployment.txt), [журнал браузерных проверок](evidence/aeza-browser-tests.txt).

26 сентября 2026 года добавлен браузерный редактор и исправлено восстановление связи. Код приложения собран из `74229343dbbaf1a353caa1d9ae982a7f927d2027`; последующие изменения документации не требуют пересборки. [Отчёт](editor-verification.md), [публичные браузерные проверки](evidence/editor-aeza-tests.txt). Адрес редактора: http://185.173.147.205/#editor. Код доступа хранится в `.env` и не публикуется.
