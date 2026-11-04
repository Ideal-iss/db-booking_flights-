"""«Кругосветка» — игра, где пассажиры соревнуются, кто посетит больше аэропортов.

Игровое время ускорено: часы идут сами, рейсы улетают по расписанию. Места на
рейсах ограничены — игроки в одной комнате борются за одни и те же билеты.
Игровые брони хранятся отдельно от настоящих, чтобы не занимать реальные места.
"""

import secrets
import string

from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from booking.models import Airport

PLAYER_COLORS = ["#ff5a1f", "#3ecf8e", "#4da3ff", "#ffd23f", "#c77dff", "#ff6b9e", "#2ec4d6", "#a3e635"]


def generate_room_code():
    alphabet = string.ascii_uppercase.replace("O", "").replace("I", "") + "23456789"
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(5))
        if not GameRoom.objects.filter(code=code).exists():
            return code


class GameRoom(models.Model):
    class Status(models.TextChoices):
        LOBBY = "lobby", "Ожидание игроков"
        RUNNING = "running", "Идёт игра"
        FINISHED = "finished", "Завершена"

    code = models.CharField("код комнаты", max_length=5, unique=True, default=generate_room_code)
    status = models.CharField("статус", max_length=10, choices=Status.choices, default=Status.LOBBY)
    start_airport = models.ForeignKey(
        Airport, on_delete=models.PROTECT, related_name="+", verbose_name="старт"
    )
    budget = models.PositiveIntegerField("бюджет, $", default=3000)
    duration_h = models.PositiveSmallIntegerField("длина игры, игровых часов", default=168)
    speed = models.FloatField("игровых часов в реальную минуту", default=12)
    seats_per_flight = models.PositiveSmallIntegerField("мест на рейсе", default=2)
    created_at = models.DateTimeField("создана", auto_now_add=True)
    started_at = models.DateTimeField("начата", null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "игровая комната"
        verbose_name_plural = "игровые комнаты"

    def __str__(self):
        return f"Комната {self.code} ({self.get_status_display()})"

    def clock_h(self, now=None):
        """Сколько игровых часов прошло с начала игры."""
        if not self.started_at:
            return 0.0
        now = now or timezone.now()
        elapsed_min = (now - self.started_at).total_seconds() / 60
        return min(self.duration_h, elapsed_min * self.speed)

    def refresh_status(self, now=None):
        if self.status == self.Status.RUNNING and self.clock_h(now) >= self.duration_h:
            self.status = self.Status.FINISHED
            self.save(update_fields=["status"])
        return self.status


class GamePlayer(models.Model):
    room = models.ForeignKey(GameRoom, on_delete=models.CASCADE, related_name="players", verbose_name="комната")
    name = models.CharField("имя", max_length=24)
    color = models.CharField("цвет", max_length=7)
    is_host = models.BooleanField("создатель", default=False)
    money = models.IntegerField("деньги, $")
    joined_at = models.DateTimeField(auto_now_add=True)
    # Итог фиксируется, когда партия заканчивается, — для общей таблицы рекордов.
    final_score = models.IntegerField("итоговые очки", null=True, blank=True)
    final_airports = models.PositiveSmallIntegerField("аэропортов посещено", null=True, blank=True)

    class Meta:
        ordering = ["joined_at"]
        verbose_name = "игрок"
        verbose_name_plural = "игроки"
        constraints = [
            models.UniqueConstraint(fields=["room", "name"], name="game_unique_player_name"),
            models.CheckConstraint(condition=Q(money__gte=0), name="game_money_not_negative"),
        ]

    def __str__(self):
        return f"{self.name} ({self.room.code})"


class GameFlight(models.Model):
    """Рейс игрового расписания. Время — в игровых часах от начала партии."""

    room = models.ForeignKey(GameRoom, on_delete=models.CASCADE, related_name="flights")
    number = models.CharField("номер", max_length=8)
    origin = models.ForeignKey(Airport, on_delete=models.PROTECT, related_name="+")
    destination = models.ForeignKey(Airport, on_delete=models.PROTECT, related_name="+")
    departure_h = models.FloatField("вылет, ч")
    arrival_h = models.FloatField("прилёт, ч")
    base_price = models.PositiveIntegerField("базовая цена, $")
    seats = models.PositiveSmallIntegerField("мест")

    class Meta:
        ordering = ["departure_h"]
        verbose_name = "игровой рейс"
        verbose_name_plural = "игровые рейсы"
        indexes = [models.Index(fields=["room", "origin", "departure_h"])]
        constraints = [
            models.CheckConstraint(condition=Q(arrival_h__gt=F("departure_h")), name="game_flight_arrival_after_departure"),
            models.CheckConstraint(condition=~Q(origin=F("destination")), name="game_flight_distinct_airports"),
        ]

    def __str__(self):
        return f"{self.number} {self.origin_id}→{self.destination_id} @{self.departure_h:.1f}ч"

    def price_for(self, sold):
        """Цена растёт по мере продажи мест: кто раньше купил — тот сэкономил."""
        return round(self.base_price * (1 + 0.35 * sold))


class GameTicket(models.Model):
    player = models.ForeignKey(GamePlayer, on_delete=models.CASCADE, related_name="tickets")
    flight = models.ForeignKey(GameFlight, on_delete=models.CASCADE, related_name="tickets")
    price = models.PositiveIntegerField("цена, $")
    bought_at_h = models.FloatField("куплен в, ч")

    class Meta:
        ordering = ["flight__departure_h"]
        verbose_name = "игровой билет"
        verbose_name_plural = "игровые билеты"
        constraints = [
            models.UniqueConstraint(fields=["player", "flight"], name="game_unique_ticket"),
        ]


class GameEvent(models.Model):
    room = models.ForeignKey(GameRoom, on_delete=models.CASCADE, related_name="events")
    at_h = models.FloatField("время, ч")
    text = models.CharField("текст", max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]
        verbose_name = "событие"
        verbose_name_plural = "события"
