from django.contrib import admin

from .models import HollowCharacter, HollowRun


@admin.register(HollowCharacter)
class HollowCharacterAdmin(admin.ModelAdmin):
    list_display = ("name", "cls", "user", "updated")
    search_fields = ("name", "user__username")


@admin.register(HollowRun)
class HollowRunAdmin(admin.ModelAdmin):
    list_display = ("character", "dungeon", "level", "coop", "success", "started", "finished")
    list_filter = ("dungeon", "coop", "success")
