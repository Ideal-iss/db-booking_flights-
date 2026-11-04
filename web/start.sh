#!/bin/sh
# Запуск сайта на сервере (Railway): миграции, статика, тестовые данные, веб-сервер.
set -e

python manage.py migrate --noinput
python manage.py collectstatic --noinput

# Тестовые рейсы на ближайший месяц. Команда безопасна для повторного запуска:
# при каждом перезапуске она лишь добавляет недостающие будущие рейсы.
if [ "${SEED_DEMO_DATA:-1}" = "1" ]; then
  python manage.py seed
fi

# Администратор создаётся из переменных DJANGO_SUPERUSER_USERNAME / _EMAIL / _PASSWORD.
if [ -n "$DJANGO_SUPERUSER_PASSWORD" ]; then
  python manage.py createsuperuser --noinput || echo "Администратор не создан (возможно, он уже есть) — см. сообщение выше."
fi

exec gunicorn config.wsgi --bind "0.0.0.0:${PORT:-8000}" --workers "${WEB_CONCURRENCY:-2}" --access-logfile -
