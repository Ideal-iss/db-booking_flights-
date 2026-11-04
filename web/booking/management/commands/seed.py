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

# код, название, город, широта, долгота
AIRPORTS = [
    ("JFK", "John F. Kennedy International Airport", "Нью-Йорк, США", 40.6413, -73.7781),
    ("LAX", "Los Angeles International Airport", "Лос-Анджелес, США", 33.9416, -118.4085),
    ("HND", "Tokyo Haneda Airport", "Токио, Япония", 35.5494, 139.7798),
    ("CDG", "Charles de Gaulle Airport", "Париж, Франция", 49.0097, 2.5479),
    ("DXB", "Dubai International Airport", "Дубай, ОАЭ", 25.2532, 55.3657),
    ("SIN", "Singapore Changi Airport", "Сингапур, Сингапур", 1.3644, 103.9915),
    ("SYD", "Sydney Kingsford Smith Airport", "Сидней, Австралия", -33.9399, 151.1753),
    ("LHR", "London Heathrow Airport", "Лондон, Великобритания", 51.4700, -0.4543),
    ("FRA", "Frankfurt Airport", "Франкфурт, Германия", 50.0379, 8.5622),
    ("AMS", "Amsterdam Schiphol Airport", "Амстердам, Нидерланды", 52.3105, 4.7683),
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

        for code, name, location, lat, lon in AIRPORTS:
            Airport.objects.update_or_create(
                code=code, defaults={"name": name, "location": location, "latitude": lat, "longitude": lon}
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
