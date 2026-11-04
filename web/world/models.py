"""«Мир SkyBook» — многопользовательский мир путешествий.

У каждого игрока есть персонаж (никнейм, аватар, монеты, достижения). Самолёты
летают по общему расписанию в реальном времени: все, кто купил билет на один
вылет, оказываются в одном салоне. После прилёта можно гулять по территории
аэропорта, собирать монеты, фотографировать достопримечательности и общаться.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from booking.models import Airport


def default_avatar():
    return {"skin": 1, "hair": "short", "hair_color": 0, "top": 0, "bottom": 0}


class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    nickname = models.CharField("никнейм", max_length=20, unique=True)
    avatar = models.JSONField("аватар", default=default_avatar)
    coins = models.PositiveIntegerField("монеты", default=200)
    home = models.ForeignKey(Airport, on_delete=models.PROTECT, related_name="+", verbose_name="родной аэропорт")
    airport = models.ForeignKey(Airport, on_delete=models.PROTECT, related_name="+", verbose_name="где сейчас")
    # Положение на карте территории аэропорта
    x = models.FloatField(default=0)
    y = models.FloatField(default=0)
    facing = models.SmallIntegerField(default=1)  # 1 — вправо, -1 — влево
    moving = models.BooleanField(default=False)
    emote = models.CharField("эмоция", max_length=8, blank=True)
    emote_at = models.DateTimeField(null=True, blank=True)
    last_seen = models.DateTimeField("был в сети", null=True, blank=True, db_index=True)
    # Статистика для достижений
    flights_count = models.PositiveIntegerField("полётов", default=0)
    km_flown = models.PositiveIntegerField("км налёта", default=0)
    coins_collected = models.PositiveIntegerField("монет собрано", default=0)
    messages_sent = models.PositiveIntegerField("сообщений", default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["nickname"]
        verbose_name = "персонаж"
        verbose_name_plural = "персонажи"

    def __str__(self):
        return self.nickname


class Route(models.Model):
    """Регулярный маршрут. Вылеты повторяются каждые period_s секунд реального времени."""

    number = models.CharField("номер", max_length=8)
    origin = models.ForeignKey(Airport, on_delete=models.CASCADE, related_name="world_routes_out")
    destination = models.ForeignKey(Airport, on_delete=models.CASCADE, related_name="world_routes_in")
    distance_km = models.PositiveIntegerField("расстояние, км")
    duration_s = models.PositiveSmallIntegerField("полёт, сек")
    period_s = models.PositiveSmallIntegerField("интервал вылетов, сек")
    offset_s = models.PositiveSmallIntegerField("сдвиг расписания, сек")
    price = models.PositiveSmallIntegerField("цена, монет")

    class Meta:
        ordering = ["origin", "destination"]
        verbose_name = "маршрут"
        verbose_name_plural = "маршруты"
        constraints = [
            models.UniqueConstraint(fields=["origin", "destination"], name="world_unique_route"),
            models.CheckConstraint(condition=~Q(origin=models.F("destination")), name="world_route_distinct"),
        ]

    def __str__(self):
        return f"{self.number} {self.origin_id}→{self.destination_id}"


class Trip(models.Model):
    """Билет игрока на конкретный вылет маршрута (маршрут + время вылета = один самолёт)."""

    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="trips")
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name="trips")
    departure_at = models.DateTimeField("вылет")
    arrival_at = models.DateTimeField("прилёт")
    seat = models.PositiveSmallIntegerField("место")
    price = models.PositiveSmallIntegerField("цена")
    landed = models.BooleanField("прилёт обработан", default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-departure_at"]
        verbose_name = "поездка"
        verbose_name_plural = "поездки"
        constraints = [
            models.UniqueConstraint(fields=["route", "departure_at", "seat"], name="world_unique_seat"),
            models.UniqueConstraint(fields=["profile"], condition=Q(landed=False), name="world_one_active_trip"),
        ]

    def __str__(self):
        return f"{self.profile} {self.route} {self.departure_at:%H:%M:%S}"


class Visit(models.Model):
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="visits")
    airport = models.ForeignKey(Airport, on_delete=models.CASCADE, related_name="+")
    first_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "посещение"
        verbose_name_plural = "посещения"
        constraints = [models.UniqueConstraint(fields=["profile", "airport"], name="world_unique_visit")]


class Landmark(models.Model):
    airport = models.OneToOneField(Airport, on_delete=models.CASCADE, related_name="landmark")
    name = models.CharField("название", max_length=80)
    kind = models.CharField("вид рисунка", max_length=20)
    fact = models.CharField("факт", max_length=200, blank=True)

    class Meta:
        verbose_name = "достопримечательность"
        verbose_name_plural = "достопримечательности"

    def __str__(self):
        return f"{self.name} ({self.airport_id})"


class Stamp(models.Model):
    """Штамп в паспорте: игрок дошёл до достопримечательности."""

    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="stamps")
    landmark = models.ForeignKey(Landmark, on_delete=models.CASCADE, related_name="stamps")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "штамп"
        verbose_name_plural = "штампы"
        constraints = [models.UniqueConstraint(fields=["profile", "landmark"], name="world_unique_stamp")]


class Achievement(models.Model):
    code = models.SlugField("код", max_length=30, primary_key=True)
    title = models.CharField("название", max_length=60)
    description = models.CharField("условие", max_length=150)
    icon = models.CharField("значок", max_length=8)
    reward = models.PositiveSmallIntegerField("награда, монет")
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order"]
        verbose_name = "достижение"
        verbose_name_plural = "достижения"

    def __str__(self):
        return self.title


class EarnedAchievement(models.Model):
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="achievements")
    achievement = models.ForeignKey(Achievement, on_delete=models.CASCADE, related_name="+")
    earned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-earned_at"]
        verbose_name = "полученное достижение"
        verbose_name_plural = "полученные достижения"
        constraints = [models.UniqueConstraint(fields=["profile", "achievement"], name="world_unique_achievement")]


class ShopItem(models.Model):
    class Slot(models.TextChoices):
        HAT = "hat", "Головной убор"
        GLASSES = "glasses", "Очки"
        OUTFIT = "outfit", "Одежда"
        EXTRA = "extra", "Аксессуар"

    code = models.SlugField("код", max_length=30, primary_key=True)
    name = models.CharField("название", max_length=60)
    slot = models.CharField("слот", max_length=10, choices=Slot.choices)
    price = models.PositiveSmallIntegerField("цена, монет")
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order"]
        verbose_name = "вещь"
        verbose_name_plural = "магазин"

    def __str__(self):
        return self.name


class OwnedItem(models.Model):
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="items")
    item = models.ForeignKey(ShopItem, on_delete=models.CASCADE, related_name="+")
    bought_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "купленная вещь"
        verbose_name_plural = "купленные вещи"
        constraints = [models.UniqueConstraint(fields=["profile", "item"], name="world_unique_owned")]


class CoinPickup(models.Model):
    """Подобранная монета. Монеты на карте появляются заново каждые 10 минут."""

    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="+")
    airport = models.ForeignKey(Airport, on_delete=models.CASCADE, related_name="+")
    window = models.PositiveIntegerField("окно времени")
    index = models.PositiveSmallIntegerField("номер монеты")

    class Meta:
        verbose_name = "подобранная монета"
        verbose_name_plural = "подобранные монеты"
        constraints = [
            models.UniqueConstraint(fields=["profile", "airport", "window", "index"], name="world_unique_coin")
        ]


class ChatMessage(models.Model):
    """Сообщение в чате. place — где сказано: 'AP:FRA' (аэропорт) или 'FL:<маршрут>:<время>' (самолёт)."""

    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="+")
    place = models.CharField("где", max_length=40, db_index=True)
    text = models.CharField("текст", max_length=120)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "сообщение"
        verbose_name_plural = "чат"
