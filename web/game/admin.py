from django.contrib import admin

from .models import GameEvent, GameFlight, GamePlayer, GameRoom, GameTicket


class PlayerInline(admin.TabularInline):
    model = GamePlayer
    extra = 0
    fields = ["name", "color", "is_host", "money", "final_score", "final_airports"]


@admin.register(GameRoom)
class GameRoomAdmin(admin.ModelAdmin):
    list_display = ["code", "status", "start_airport", "seats_per_flight", "created_at", "started_at"]
    list_filter = ["status"]
    search_fields = ["code"]
    inlines = [PlayerInline]


@admin.register(GamePlayer)
class GamePlayerAdmin(admin.ModelAdmin):
    list_display = ["name", "room", "money", "final_score", "final_airports"]
    search_fields = ["name", "room__code"]


@admin.register(GameFlight)
class GameFlightAdmin(admin.ModelAdmin):
    list_display = ["number", "room", "origin", "destination", "departure_h", "arrival_h", "base_price", "seats"]
    list_filter = ["room"]


@admin.register(GameTicket)
class GameTicketAdmin(admin.ModelAdmin):
    list_display = ["player", "flight", "price", "bought_at_h"]


@admin.register(GameEvent)
class GameEventAdmin(admin.ModelAdmin):
    list_display = ["room", "at_h", "text"]
