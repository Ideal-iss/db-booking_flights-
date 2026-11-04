import math
import secrets
import string

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models
from django.db.models import F, Q

SEAT_LETTERS = "ABCDEF"


class Airport(models.Model):
    """Аэропорт. Первичный ключ — трёхбуквенный код IATA (JFK, LHR...)."""

    class Continent(models.TextChoices):
        EUROPE = "EU", "Европа"
        ASIA = "AS", "Азия"
        AFRICA = "AF", "Африка"
        NORTH_AMERICA = "NA", "Северная Америка"
        SOUTH_AMERICA = "SA", "Южная Америка"
        OCEANIA = "OC", "Океания"

    code = models.CharField(
        "код IATA",
        max_length=3,
        primary_key=True,
        validators=[RegexValidator(r"^[A-Z]{3}$", "Три заглавные латинские буквы")],
    )
    name = models.CharField("название", max_length=100)
    location = models.CharField("город, страна", max_length=255)
    latitude = models.FloatField("широта", null=True, blank=True)
    longitude = models.FloatField("долгота", null=True, blank=True)
    continent = models.CharField("континент", max_length=2, choices=Continent.choices, blank=True)

    class Meta:
        ordering = ["location"]
        verbose_name = "аэропорт"
        verbose_name_plural = "аэропорты"

    def __str__(self):
        return f"{self.location} ({self.code})"

    @property
    def city(self):
        return self.location.split(",")[0]


class Flight(models.Model):
    flight_number = models.CharField("номер рейса", max_length=20)
    origin = models.ForeignKey(
        Airport, on_delete=models.PROTECT, related_name="departures", verbose_name="откуда"
    )
    destination = models.ForeignKey(
        Airport, on_delete=models.PROTECT, related_name="arrivals", verbose_name="куда"
    )
    departure = models.DateTimeField("вылет")
    arrival = models.DateTimeField("прилёт")
    rows = models.PositiveSmallIntegerField(
        "рядов в салоне", validators=[MinValueValidator(1)]
    )
    price = models.DecimalField(
        "цена, $", max_digits=8, decimal_places=2, validators=[MinValueValidator(0)]
    )

    class Meta:
        ordering = ["departure"]
        verbose_name = "рейс"
        verbose_name_plural = "рейсы"
        constraints = [
            models.CheckConstraint(
                condition=~Q(origin=F("destination")),
                name="flight_origin_not_destination",
                violation_error_message="Аэропорты вылета и прилёта должны различаться.",
            ),
            models.CheckConstraint(
                condition=Q(arrival__gt=F("departure")),
                name="flight_arrival_after_departure",
                violation_error_message="Прилёт должен быть позже вылета.",
            ),
            models.UniqueConstraint(
                fields=["flight_number", "departure"], name="flight_unique_number_departure"
            ),
        ]

    def __str__(self):
        return f"{self.flight_number} {self.origin_id}→{self.destination_id} {self.departure:%d.%m.%Y %H:%M}"

    @property
    def total_seats(self):
        return self.rows * len(SEAT_LETTERS)

    def taken_seats(self):
        return set(self.bookings.active().values_list("seat", flat=True))

    @property
    def available_seats(self):
        return self.total_seats - self.bookings.active().count()

    @property
    def duration(self):
        return self.arrival - self.departure

    @property
    def distance_km(self):
        """Расстояние по дуге большого круга (как летят самолёты), в километрах."""
        a, b = self.origin, self.destination
        if None in (a.latitude, a.longitude, b.latitude, b.longitude):
            return None
        lat1, lon1, lat2, lon2 = map(math.radians, (a.latitude, a.longitude, b.latitude, b.longitude))
        h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
        return round(2 * 6371 * math.asin(math.sqrt(h)))

    def progress_at(self, moment):
        """Доля пройденного пути (0..1), если рейс в воздухе в этот момент, иначе None."""
        if self.departure < moment < self.arrival:
            return (moment - self.departure) / (self.arrival - self.departure)
        return None

    def duration_display(self):
        minutes = int(self.duration.total_seconds() // 60)
        return f"{minutes // 60} ч {minutes % 60:02d} мин"

    def seat_map(self):
        """Ряды мест для схемы салона: [(номер_ряда, [(место, занято), ...]), ...]."""
        taken = self.taken_seats()
        return [
            (row, [(f"{row}{l}", f"{row}{l}" in taken) for l in SEAT_LETTERS])
            for row in range(1, self.rows + 1)
        ]

    def is_valid_seat(self, seat):
        if len(seat) < 2 or seat[-1] not in SEAT_LETTERS or not seat[:-1].isdigit():
            return False
        return 1 <= int(seat[:-1]) <= self.rows


class Passenger(models.Model):
    first_name = models.CharField("имя", max_length=100)
    last_name = models.CharField("фамилия", max_length=100)
    email = models.EmailField("email")
    passport_number = models.CharField("номер паспорта", max_length=20, unique=True)

    class Meta:
        ordering = ["last_name", "first_name"]
        verbose_name = "пассажир"
        verbose_name_plural = "пассажиры"

    def __str__(self):
        return f"{self.first_name} {self.last_name}"


class BookingQuerySet(models.QuerySet):
    def active(self):
        return self.exclude(payment_status=Booking.Status.CANCELLED)


def generate_booking_code():
    alphabet = string.ascii_uppercase + string.digits
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(6))
        if not Booking.objects.filter(code=code).exists():
            return code


class Booking(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Ожидает оплаты"
        PAID = "paid", "Оплачено"
        CANCELLED = "cancelled", "Отменено"

    code = models.CharField(
        "код бронирования", max_length=6, unique=True, default=generate_booking_code, editable=False
    )
    flight = models.ForeignKey(
        Flight, on_delete=models.PROTECT, related_name="bookings", verbose_name="рейс"
    )
    passenger = models.ForeignKey(
        Passenger, on_delete=models.PROTECT, related_name="bookings", verbose_name="пассажир"
    )
    seat = models.CharField("место", max_length=4)
    price = models.DecimalField("цена, $", max_digits=8, decimal_places=2)
    payment_status = models.CharField(
        "статус", max_length=10, choices=Status.choices, default=Status.PENDING
    )
    created_at = models.DateTimeField("создано", auto_now_add=True)

    objects = BookingQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "бронирование"
        verbose_name_plural = "бронирования"
        constraints = [
            # Одно место — одна активная бронь. Отменённые брони место освобождают.
            models.UniqueConstraint(
                fields=["flight", "seat"],
                condition=~Q(payment_status="cancelled"),
                name="booking_unique_active_seat",
                violation_error_message="Это место уже занято.",
            ),
            # Пассажир не может дважды забронировать один и тот же рейс.
            models.UniqueConstraint(
                fields=["flight", "passenger"],
                condition=~Q(payment_status="cancelled"),
                name="booking_unique_active_passenger",
                violation_error_message="У этого пассажира уже есть бронь на этот рейс.",
            ),
        ]

    def __str__(self):
        return f"{self.code} — {self.passenger} — {self.flight.flight_number}, место {self.seat}"

    def clean(self):
        if self.flight_id and self.seat and not self.flight.is_valid_seat(self.seat):
            raise ValidationError({"seat": "Такого места нет в салоне."})

    @property
    def is_active(self):
        return self.payment_status != self.Status.CANCELLED
