# SkyBook — сайт бронирования авиабилетов на Django

Интерактивная версия базы данных из этого репозитория (исходный вариант на Laravel лежит в корне).

## Что умеет

- **Поиск рейсов** по аэропорту вылета, прилёта и дате. Если в выбранный день рейсов нет, сайт предложит ближайшие.
- **Бронирование с выбором места** на схеме салона: занятые места серые, своё подсвечивается.
- **Посадочный талон** с кодом брони, условной оплатой и отменой (отмена освобождает место).
- **Мои брони**: поиск по коду брони или по email и номеру паспорта.
- **Интерактивный глобус**: самолёт летит по маршруту рейса, на главной — все направления.
- **Мир SkyBook** (`/world/`) — многопользовательская 3D-игра-путешествие (Three.js, всё нарисовано кодом, без загрузки моделей):
  - регистрация с логином и паролем, конструктор персонажа, личный кабинет с паспортом, достижениями и картой посещённых аэропортов;
  - самолёты летают по общему расписанию в реальном времени (вылет примерно раз в 2–3 минуты, полёт 1–2 минуты): все, кто купил билет на один вылет, сидят в одном салоне;
  - во время полёта — 3D-салон с пассажирами в креслах или вид снаружи на самолёт над облаками, мини-глобус с положением самолёта;
  - после прилёта можно гулять по 3D-территории аэропорта (камера от третьего лица: WASD/стрелки, мышь — поворот камеры, колесо — приближение; на телефоне — джойстик), собирать монеты, фотографировать достопримечательности (штампы в паспорт), общаться в чате и эмоциями;
  - магазин вещей для персонажа; на карте мира отмечены посещённые и ещё не открытые аэропорты.
- **Админ-панель** (`/admin/`) для аэропортов, рейсов, пассажиров и броней, с заполняемостью рейсов.

## Запуск

Нужен Python 3.10+.

```bash
cd web
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed --with-admin # тестовые данные + админ admin / admin12345
python manage.py seed_world         # маршруты, достопримечательности, достижения, магазин
python manage.py runserver
```

Сайт: http://127.0.0.1:8000, админка: http://127.0.0.1:8000/admin/

Пароль `admin12345` годится только для своего компьютера. Для настоящего администратора используйте `python manage.py createsuperuser`.

Тесты: `python manage.py test booking`

### PostgreSQL вместо SQLite

```bash
export DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/booking
python manage.py migrate
```

## Публикация на PythonAnywhere (бесплатно)

В консоли **Bash** на PythonAnywhere:

```bash
git clone -b django-site https://github.com/Ideal-iss/db-booking_flights-.git
cd db-booking_flights-/web
python3.12 -m venv ~/venv && source ~/venv/bin/activate
pip install -r requirements.txt
cp .env.example .env && nano .env      # вписать свой логин и секретный ключ
python manage.py migrate
python manage.py seed
python manage.py seed_world
python manage.py collectstatic --noinput
python manage.py createsuperuser
```

Во вкладке **Web**: **Add a new web app → Manual configuration → Python 3.12**, затем:
- **Virtualenv**: `/home/ЛОГИН/venv`
- **WSGI configuration file** — заменить содержимое на:

  ```python
  import os, sys
  sys.path.insert(0, "/home/ЛОГИН/db-booking_flights-/web")
  os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
  from django.core.wsgi import get_wsgi_application
  application = get_wsgi_application()
  ```
- включить **Force HTTPS**, нажать **Reload**.

Сайт: `https://ЛОГИН.pythonanywhere.com`.

Обновление после новых коммитов (в консоли Bash), затем кнопка **Reload** во вкладке **Web**:

```bash
cd ~/db-booking_flights-/web && source ~/venv/bin/activate && git pull && python manage.py migrate && python manage.py seed && python manage.py seed_world && python manage.py collectstatic --noinput
``` Раз в месяц нажимайте во вкладке **Web** кнопку продления, иначе бесплатный сайт отключится. Чтобы обновить тестовые рейсы, раз в несколько недель запускайте `python manage.py seed` в консоли.

## Публикация на Railway

1. На [railway.com](https://railway.com) войдите через GitHub и создайте проект: **New Project → Deploy from GitHub repo →** `db-booking_flights-`.
2. В настройках сервиса (**Settings**):
   - **Source → Branch**: ветка с сайтом (`django-site` или `main`, если уже слили);
   - **Source → Root Directory**: `web`;
   - **Deploy → Custom Start Command**: `sh start.sh`.
3. Добавьте базу: на схеме проекта **+ Create → Database → PostgreSQL**.
4. В сервисе сайта, вкладка **Variables**, добавьте:

   | Переменная | Значение |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `DJANGO_SECRET_KEY` | длинная случайная строка |
   | `DJANGO_SUPERUSER_USERNAME` | логин администратора |
   | `DJANGO_SUPERUSER_EMAIL` | email администратора |
   | `DJANGO_SUPERUSER_PASSWORD` | надёжный пароль администратора |

5. **Settings → Networking → Generate Domain** — получите адрес вида `xxx.up.railway.app`.

При каждом запуске `start.sh` применяет миграции, собирает статику, добавляет тестовые рейсы на ближайший месяц (отключается переменной `SEED_DEMO_DATA=0`) и создаёт администратора, если его ещё нет. Для своего домена добавьте его в `DJANGO_ALLOWED_HOSTS` и `DJANGO_CSRF_HOSTS`.

## Схема базы данных

| Таблица | Поля | Ограничения |
|---|---|---|
| `Airport` | `code` (PK, IATA), `name`, `location` | код — три заглавные буквы |
| `Flight` | `flight_number`, `origin` → Airport, `destination` → Airport, `departure`, `arrival`, `rows`, `price` | откуда ≠ куда; прилёт позже вылета; номер + время вылета уникальны |
| `Passenger` | `first_name`, `last_name`, `email`, `passport_number` | паспорт уникален |
| `Booking` | `code`, `flight` → Flight, `passenger` → Passenger, `seat`, `price`, `payment_status`, `created_at` | одно место на рейсе — одна активная бронь; пассажир не может дважды забронировать один рейс |

Количество свободных мест не хранится отдельно, а считается по активным броням, поэтому не может разойтись с реальностью. При бронировании рейс блокируется (`select_for_update`), чтобы два человека не заняли одно место одновременно. Удалить рейс или пассажира, у которых есть брони, нельзя (`on_delete=PROTECT`).

### Отличия от версии на Laravel

- Исправлена связь рейса с аэропортами (в Laravel она ссылалась на несуществующий столбец `id`).
- В бронирование добавлены место, цена и код брони; статус оплаты — фиксированный набор значений.
- Добавлены проверки данных и уникальность паспорта.
- В тестовых данных реалистичная длительность перелётов, рейсы создаются на ближайший месяц от текущей даты.
