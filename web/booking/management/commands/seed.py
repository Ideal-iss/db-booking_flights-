"""Заполняет базу тестовыми данными (перенесено из Laravel DatabaseSeeder).

Рейсы создаются на ближайшие недели от сегодняшней даты, чтобы на сайте
всегда было что забронировать. Длительность перелётов приближена к реальной.
"""

import random
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from booking.models import SEAT_LETTERS, Airport, Booking, Flight, Passenger

# код, название, город, широта, долгота, континент
AIRPORTS = [
    ("JFK", "John F. Kennedy International Airport", "Нью-Йорк, США", 40.6413, -73.7781, "NA"),
    ("LAX", "Los Angeles International Airport", "Лос-Анджелес, США", 33.9416, -118.4085, "NA"),
    ("HND", "Tokyo Haneda Airport", "Токио, Япония", 35.5494, 139.7798, "AS"),
    ("CDG", "Charles de Gaulle Airport", "Париж, Франция", 49.0097, 2.5479, "EU"),
    ("DXB", "Dubai International Airport", "Дубай, ОАЭ", 25.2532, 55.3657, "AS"),
    ("SIN", "Singapore Changi Airport", "Сингапур, Сингапур", 1.3644, 103.9915, "AS"),
    ("SYD", "Sydney Kingsford Smith Airport", "Сидней, Австралия", -33.9399, 151.1753, "OC"),
    ("LHR", "London Heathrow Airport", "Лондон, Великобритания", 51.4700, -0.4543, "EU"),
    ("FRA", "Frankfurt Airport", "Франкфурт, Германия", 50.0379, 8.5622, "EU"),
    ("AMS", "Amsterdam Schiphol Airport", "Амстердам, Нидерланды", 52.3105, 4.7683, "EU"),
    # Аэропорты для игры «Кругосветка» — по всем континентам.
    ("PEK", "Beijing Capital International Airport", "Пекин, Китай", 40.0799, 116.6031, "AS"),
    ("HKG", "Hong Kong International Airport", "Гонконг, Китай", 22.3080, 113.9185, "AS"),
    ("ICN", "Incheon International Airport", "Сеул, Южная Корея", 37.4602, 126.4407, "AS"),
    ("BKK", "Suvarnabhumi Airport", "Бангкок, Таиланд", 13.6900, 100.7501, "AS"),
    ("DEL", "Indira Gandhi International Airport", "Дели, Индия", 28.5562, 77.1000, "AS"),
    ("SVO", "Sheremetyevo International Airport", "Москва, Россия", 55.9726, 37.4146, "EU"),
    ("IST", "Istanbul Airport", "Стамбул, Турция", 41.2753, 28.7519, "EU"),
    ("CAI", "Cairo International Airport", "Каир, Египет", 30.1219, 31.4056, "AF"),
    ("NBO", "Jomo Kenyatta International Airport", "Найроби, Кения", -1.3192, 36.9278, "AF"),
    ("JNB", "O. R. Tambo International Airport", "Йоханнесбург, ЮАР", -26.1337, 28.2420, "AF"),
    ("GRU", "São Paulo/Guarulhos International Airport", "Сан-Паулу, Бразилия", -23.4356, -46.4731, "SA"),
    ("EZE", "Ministro Pistarini International Airport", "Буэнос-Айрес, Аргентина", -34.8222, -58.5358, "SA"),
    ("BOG", "El Dorado International Airport", "Богота, Колумбия", 4.7016, -74.1469, "SA"),
    ("MEX", "Mexico City International Airport", "Мехико, Мексика", 19.4361, -99.0719, "NA"),
    ("YYZ", "Toronto Pearson International Airport", "Торонто, Канада", 43.6777, -79.6248, "NA"),
    ("AKL", "Auckland Airport", "Окленд, Новая Зеландия", -37.0082, 174.7850, "OC"),
]

# номер, откуда, куда, час вылета, длительность (мин), рядов, цена
ROUTES = [
    ("AA123", "JFK", "LAX", 8, 6 * 60 + 20, 25, 289),
    ("JL456", "HND", "JFK", 9, 12 * 60 + 50, 33, 1240),
    ("AF789", "CDG", "DXB", 10, 6 * 60 + 40, 30, 610),
    ("EK101", "DXB", "SIN", 11, 7 * 60 + 25, 36, 540),
    ("SQ202", "SIN", "SYD", 12, 7 * 60 + 50, 28, 720),
    ("QF303", "SYD", "LHR", 13, 23 * 60 + 40, 32, 1580),
    ("BA404", "LHR", "FRA", 14, 1 * 60 + 35, 26, 145),
    ("LH505", "FRA", "AMS", 15, 1 * 60 + 10, 23, 119),
    ("KL606", "AMS", "JFK", 16, 8 * 60 + 25, 35, 690),
    ("DL707", "JFK", "HND", 17, 14 * 60 + 15, 38, 1310),
]

PASSENGERS = [
    ("John", "Doe", "john.doe@example.com", "A12345678"),
    ("Jane", "Smith", "jane.smith@example.com", "B87654321"),
    ("Alice", "Johnson", "alice.johnson@example.com", "C23456789"),
    ("Bob", "Brown", "bob.brown@example.com", "D34567890"),
    ("Charlie", "Davis", "charlie.davis@example.com", "E45678901"),
    ("David", "Wilson", "david.wilson@example.com", "F56789012"),
    ("Eve", "Taylor", "eve.taylor@example.com", "G67890123"),
    ("Frank", "Anderson", "frank.anderson@example.com", "H78901234"),
    ("Grace", "Thomas", "grace.thomas@example.com", "I89012345"),
    ("Hank", "Moore", "hank.moore@example.com", "J90123456"),
]


def reverse_number(number):
    prefix, digits = number[:2], number[2:]
    return f"{prefix}{int(digits) + 1}"


class Command(BaseCommand):
    help = "Заполняет базу тестовыми аэропортами, рейсами, пассажирами и бронями"

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=30, help="На сколько дней вперёд создать рейсы")
        parser.add_argument("--fresh", action="store_true", help="Удалить существующие данные перед заполнением")
        parser.add_argument(
            "--with-admin",
            action="store_true",
            help="Создать локального администратора admin / admin12345 (только для разработки!)",
        )

    @transaction.atomic
    def handle(self, *args, days, fresh, with_admin, **options):
        rnd = random.Random(42)

        if fresh:
            Booking.objects.all().delete()
            Flight.objects.all().delete()
            Passenger.objects.all().delete()
            Airport.objects.all().delete()

        for code, name, location, lat, lon, continent in AIRPORTS:
            Airport.objects.update_or_create(
                code=code,
                defaults={
                    "name": name, "location": location,
                    "latitude": lat, "longitude": lon, "continent": continent,
                },
            )

        today = timezone.localdate()
        flights_created = 0
        first_flights = []
        for i, (number, origin, dest, hour, minutes, rows, price) in enumerate(ROUTES):
            for direction, (num, a, b) in enumerate([(number, origin, dest), (reverse_number(number), dest, origin)]):
                start_offset = 1 + (i + direction) % 2
                for day in range(start_offset, days + 1, 2):
                    dep_hour = (hour + direction * 5) % 24
                    departure = timezone.make_aware(
                        datetime.combine(today + timedelta(days=day), time(dep_hour, rnd.choice([0, 15, 30, 45])))
                    )
                    flight, created = Flight.objects.get_or_create(
                        flight_number=num,
                        departure=departure,
                        defaults={
                            "origin_id": a,
                            "destination_id": b,
                            "arrival": departure + timedelta(minutes=minutes),
                            "rows": rows,
                            "price": Decimal(price + rnd.randint(-40, 60)),
                        },
                    )
                    flights_created += created
                    if direction == 0 and len(first_flights) == i:
                        first_flights.append(flight)

        passengers = []
        for first, last, email, passport in PASSENGERS:
            p, _ = Passenger.objects.update_or_create(
                passport_number=passport, defaults={"first_name": first, "last_name": last, "email": email}
            )
            passengers.append(p)

        # Брони из исходного сидера: пассажир N летит рейсом N, чётные — оплачены.
        bookings_created = 0
        for i, (flight, passenger) in enumerate(zip(first_flights, passengers)):
            if flight.bookings.active().filter(passenger=passenger).exists():
                continue
            seat = f"{rnd.randint(1, flight.rows)}{rnd.choice(SEAT_LETTERS)}"
            while seat in flight.taken_seats():
                seat = f"{rnd.randint(1, flight.rows)}{rnd.choice(SEAT_LETTERS)}"
            Booking.objects.create(
                flight=flight,
                passenger=passenger,
                seat=seat,
                price=flight.price,
                payment_status=Booking.Status.PAID if i % 2 == 0 else Booking.Status.PENDING,
            )
            bookings_created += 1

        # Немного «чужих» занятых мест, чтобы схема салона выглядела живой.
        # Пул вымышленных пассажиров: каждый летит каждым рейсом не больше одного раза.
        pool = [
            Passenger.objects.get_or_create(
                passport_number=f"S{n:08d}",
                defaults={"first_name": "Пассажир", "last_name": f"№{n}", "email": f"seed{n}@example.com"},
            )[0]
            for n in range(1, 81)
        ]
        pool_ids = {p.pk for p in pool}
        filler_bookings = []
        for flight in Flight.objects.filter(departure__gt=timezone.now()).prefetch_related("bookings"):
            existing = flight.bookings.all()
            if any(b.passenger_id in pool_ids for b in existing):
                continue  # уже заполнен при прошлом запуске
            taken = {b.seat for b in existing}
            wanted = rnd.randint(8, min(len(pool), flight.total_seats // 3))
            for p in rnd.sample(pool, wanted):
                seat = f"{rnd.randint(1, flight.rows)}{rnd.choice(SEAT_LETTERS)}"
                if seat in taken:
                    continue
                taken.add(seat)
                filler_bookings.append(
                    Booking(flight=flight, passenger=p, seat=seat, price=flight.price, payment_status=Booking.Status.PAID)
                )
        Booking.objects.bulk_create(filler_bookings)

        if with_admin:
            User = get_user_model()
            if not User.objects.filter(username="admin").exists():
                User.objects.create_superuser("admin", "admin@example.com", "admin12345")
                self.stdout.write(self.style.WARNING("Создан администратор admin / admin12345 — только для локальной разработки."))

        self.stdout.write(
            self.style.SUCCESS(
                f"Готово: аэропортов {Airport.objects.count()}, новых рейсов {flights_created}, "
                f"броней из сидера {bookings_created}."
            )
        )
