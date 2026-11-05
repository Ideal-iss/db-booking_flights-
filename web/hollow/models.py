import uuid

from django.conf import settings
from django.db import models


class HollowCharacter(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="hollow_characters")
    name = models.CharField("Имя", max_length=20, unique=True)
    # SQLite не умеет сравнивать кириллицу без учёта регистра — храним нормализованное имя
    name_key = models.CharField(max_length=20, unique=True, null=True, editable=False)
    cls = models.CharField("Класс", max_length=16)
    data = models.JSONField(default=dict)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created"]
        verbose_name = "Персонаж"
        verbose_name_plural = "Персонажи"

    def save(self, *args, **kwargs):
        self.name_key = self.name.casefold()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.cls}, ур. {self.data.get('level', 1)})"


class HollowRun(models.Model):
    """Один спуск в подземелье. Сид выдаёт сервер, итоги проверяются при завершении."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    character = models.ForeignKey(HollowCharacter, on_delete=models.CASCADE, related_name="runs")
    dungeon = models.CharField(max_length=24)
    seed = models.BigIntegerField()
    level = models.PositiveSmallIntegerField()
    coop = models.BooleanField(default=False)
    picked = models.PositiveSmallIntegerField(default=0)
    started = models.DateTimeField(auto_now_add=True)
    finished = models.DateTimeField(null=True, blank=True)
    success = models.BooleanField(null=True)
    result = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-started"]
        verbose_name = "Забег"
        verbose_name_plural = "Забеги"
