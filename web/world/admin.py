from django.contrib import admin

from .models import (
    Achievement, ChatMessage, EarnedAchievement, Landmark, OwnedItem, Profile, Route, ShopItem, Stamp, Trip, Visit,
)


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ["nickname", "user", "airport", "coins", "flights_count", "km_flown", "last_seen"]
    search_fields = ["nickname", "user__username"]
    list_filter = ["airport__continent"]


@admin.register(Route)
class RouteAdmin(admin.ModelAdmin):
    list_display = ["number", "origin", "destination", "distance_km", "duration_s", "period_s", "price"]
    list_filter = ["origin"]


@admin.register(Trip)
class TripAdmin(admin.ModelAdmin):
    list_display = ["profile", "route", "departure_at", "arrival_at", "seat", "price", "landed"]
    list_filter = ["landed"]


@admin.register(Landmark)
class LandmarkAdmin(admin.ModelAdmin):
    list_display = ["name", "airport", "kind"]


@admin.register(Achievement)
class AchievementAdmin(admin.ModelAdmin):
    list_display = ["icon", "title", "description", "reward"]


@admin.register(ShopItem)
class ShopItemAdmin(admin.ModelAdmin):
    list_display = ["name", "slot", "price"]


admin.site.register([Visit, Stamp, EarnedAchievement, OwnedItem])


@admin.register(ChatMessage)
class ChatAdmin(admin.ModelAdmin):
    list_display = ["profile", "place", "text", "created_at"]
